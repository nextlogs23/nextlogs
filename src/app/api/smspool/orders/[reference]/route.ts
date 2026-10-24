import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { NextRequest } from "next/server";
import { requireUser, routeError } from "@/lib/server/auth";
import { adminDb } from "@/lib/server/firebase-admin";
import { cancelSmsPoolOrder, checkSmsPoolOrder } from "@/lib/server/smspool";
import { finalizePurchaseRefund } from "@/lib/server/wallet";

function mapStatus(value: number | undefined, expiration: number | undefined) { if (value === 3) return "completed"; if (value === 6) return "refunded"; if (expiration && expiration * 1000 <= Date.now()) return "expired"; return "waiting"; }
export async function GET(request: NextRequest, { params }: { params: Promise<{ reference: string }> }) {
  try {
    const user = await requireUser(request); const { reference } = await params; const db = adminDb(); const ref = db.collection("smsPoolOrders").doc(reference); const snapshot = await ref.get();
    if (!snapshot.exists || snapshot.data()?.userId !== user.uid) return Response.json({ error: "Order not found" }, { status: 404 });
    const order = snapshot.data()!; if (!order.providerReference) return Response.json({ reference, number: order.phoneNumber || null, status: order.status, messages: [] });
    const live = await checkSmsPoolOrder(order.providerReference); const status = mapStatus(live.status, live.expiration); const messages = live.full_sms || live.sms ? [{ id: `${order.providerReference}-sms`, text: live.full_sms || live.sms || "", receivedAt: new Date().toISOString() }] : [];
    if (status === "refunded" && Number.isSafeInteger(order.retailPriceMinor)) await finalizePurchaseRefund({ uid: user.uid, purchaseReference: reference, refundReference: `${reference}-REFUND`, amountMinor: order.retailPriceMinor, description: "SMSPool confirmed refund", providerReference: order.providerReference, providerOrderCollection: "smsPoolOrders", providerOrderStatus: "refunded" });
    await Promise.all([ref.set({ status, messages, expiresAt: live.expiration ? Timestamp.fromMillis(live.expiration * 1000) : order.expiresAt, updatedAt: FieldValue.serverTimestamp() }, { merge: true }), db.collection("transactions").doc(reference).set({ status: status === "completed" ? "successful" : status === "refunded" ? "refunded" : status === "expired" ? "failed" : "processing", updatedAt: FieldValue.serverTimestamp() }, { merge: true })]);
    return Response.json({ reference, number: order.phoneNumber, status, expiresAt: live.expiration ? new Date(live.expiration * 1000).toISOString() : null, messages });
  } catch (error) { return routeError(error); }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ reference: string }> }) {
  try {
    const user = await requireUser(request); const { reference } = await params; const db = adminDb(); const ref = db.collection("smsPoolOrders").doc(reference); const snapshot = await ref.get(); const order = snapshot.data();
    if (!snapshot.exists || order?.userId !== user.uid) return Response.json({ error: "Order not found" }, { status: 404 });
    if (!order.providerReference || !["waiting", "processing"].includes(order.status)) throw Object.assign(new Error("This order cannot be cancelled"), { status: 409 });
    const result = await cancelSmsPoolOrder(order.providerReference); if (result.success !== 1) throw Object.assign(new Error("SMSPool did not confirm this cancellation"), { status: 409 });
    await finalizePurchaseRefund({ uid: user.uid, purchaseReference: reference, refundReference: `${reference}-REFUND`, amountMinor: order.retailPriceMinor, description: "SMSPool cancellation refund", providerReference: order.providerReference, providerOrderCollection: "smsPoolOrders", providerOrderStatus: "cancelled" });
    return Response.json({ reference, status: "cancelled" });
  } catch (error) { return routeError(error); }
}
