import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { NextRequest } from "next/server";
import { requireUser, routeError } from "@/lib/server/auth";
import { checkBloomActivation, updateBloomActivation } from "@/lib/server/bloomsms";
import { adminDb } from "@/lib/server/firebase-admin";
import { enforceRateLimit } from "@/lib/server/rate-limit";
import { finalizePurchaseRefund } from "@/lib/server/wallet";

function mapStatus(value?: string) {
  const status = value?.toLowerCase();
  if (status === "code_received") return "received";
  if (status === "completed") return "completed";
  if (status === "cancelled" || status === "canceled") return "cancelled";
  if (status === "expired") return "expired";
  return "waiting";
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ reference: string }> }) {
  try {
    const user = await requireUser(request); await enforceRateLimit(`bloomsms_status_${user.uid}`, 45, 60 * 1000);
    const { reference } = await params; const db = adminDb(); const ref = db.collection("bloomSmsOrders").doc(reference); const snapshot = await ref.get();
    if (!snapshot.exists || snapshot.data()?.userId !== user.uid) return Response.json({ error: "Order not found" }, { status: 404 });
    const order = snapshot.data()!;
    if (!order.providerReference) return Response.json({ reference, number: order.phoneNumber || null, status: order.status, messages: [] });
    const live = await checkBloomActivation(order.providerReference); const status = mapStatus(live.activation_status);
    const text = live.sms?.full_text || live.sms?.code || "";
    const messages = text ? [{ id: `${order.providerReference}-sms`, text, from: order.serviceName || "Verification service", receivedAt: new Date().toISOString() }] : [];
    if (status === "cancelled" && Number.isSafeInteger(order.retailPriceMinor)) await finalizePurchaseRefund({ uid: user.uid, purchaseReference: reference, refundReference: `${reference}-REFUND`, amountMinor: order.retailPriceMinor, description: "Confirmed number cancellation refund", providerReference: order.providerReference, providerOrderCollection: "bloomSmsOrders", providerOrderStatus: "cancelled" });
    const expiresAt = live.expires_at ? Timestamp.fromDate(new Date(live.expires_at)) : order.expiresAt;
    await Promise.all([
      ref.set({ status, phoneNumber: live.phone_number || order.phoneNumber, messages, expiresAt, updatedAt: FieldValue.serverTimestamp() }, { merge: true }),
      db.collection("transactions").doc(reference).set({ status: status === "completed" || status === "received" ? "successful" : status === "cancelled" ? "refunded" : status === "expired" ? "failed" : "processing", updatedAt: FieldValue.serverTimestamp() }, { merge: true }),
    ]);
    return Response.json({ reference, number: live.phone_number || order.phoneNumber, status, expiresAt: expiresAt?.toDate?.().toISOString?.() || null, messages });
  } catch (error) { return routeError(error); }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ reference: string }> }) {
  try {
    const user = await requireUser(request); const { reference } = await params; const db = adminDb(); const ref = db.collection("bloomSmsOrders").doc(reference); const snapshot = await ref.get(); const order = snapshot.data();
    if (!snapshot.exists || order?.userId !== user.uid) return Response.json({ error: "Order not found" }, { status: 404 });
    if (!order.providerReference || !["waiting", "processing"].includes(order.status)) throw Object.assign(new Error("This order cannot be cancelled"), { status: 409 });
    await updateBloomActivation(order.providerReference, "cancel");
    await finalizePurchaseRefund({ uid: user.uid, purchaseReference: reference, refundReference: `${reference}-REFUND`, amountMinor: order.retailPriceMinor, description: "Confirmed number cancellation refund", providerReference: order.providerReference, providerOrderCollection: "bloomSmsOrders", providerOrderStatus: "cancelled" });
    return Response.json({ reference, status: "cancelled" });
  } catch (error) { return routeError(error); }
}
