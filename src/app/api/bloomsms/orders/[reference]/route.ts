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
  if (status === "cancelled" || status === "canceled" || status === "refunded") return "cancelled";
  if (status === "expired") return "expired";
  return "waiting";
}

function timestampMillis(value: unknown) {
  if (value instanceof Timestamp) return value.toMillis();
  if (value && typeof value === "object" && "toMillis" in value && typeof (value as { toMillis?: unknown }).toMillis === "function") return (value as { toMillis(): number }).toMillis();
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? 0 : parsed;
  }
  return 0;
}

function providerConfirmedCancellation(value: { activation_status?: string; status?: string; refund_amount?: string | number }) {
  const providerStatus = `${value.activation_status || value.status || ""}`.toLowerCase();
  const refundAmount = Number(value.refund_amount);
  return ["cancelled", "canceled", "refunded"].includes(providerStatus) || (Number.isFinite(refundAmount) && refundAmount > 0);
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ reference: string }> }) {
  try {
    const user = await requireUser(request); await enforceRateLimit(`bloomsms_status_${user.uid}`, 45, 60 * 1000);
    const { reference } = await params; const db = adminDb(); const ref = db.collection("bloomSmsOrders").doc(reference); const snapshot = await ref.get();
    if (!snapshot.exists || snapshot.data()?.userId !== user.uid) return Response.json({ error: "Order not found" }, { status: 404 });
    const order = snapshot.data()!;
    if (!order.providerReference) return Response.json({ reference, number: order.phoneNumber || null, status: order.status, expiresAt: order.expiresAt?.toDate?.().toISOString?.() || null, refundStatus: order.refundStatus || null, messages: [] });
    const live = await checkBloomActivation(order.providerReference); const status = mapStatus(live.activation_status);
    const text = live.sms?.full_text || live.sms?.code || "";
    const messages = text ? [{ id: `${order.providerReference}-sms`, text, from: order.serviceName || "Verification service", receivedAt: new Date().toISOString() }] : [];
    if (status === "cancelled" && Number.isSafeInteger(order.retailPriceMinor)) {
      await finalizePurchaseRefund({ uid: user.uid, purchaseReference: reference, refundReference: `${reference}-REFUND`, amountMinor: order.retailPriceMinor, description: "Confirmed number cancellation refund", providerReference: order.providerReference, providerOrderCollection: "bloomSmsOrders", providerOrderStatus: "cancelled" });
      await ref.set({ refundStatus: "approved", refundResolvedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    }
    const expiresAt = live.expires_at ? Timestamp.fromDate(new Date(live.expires_at)) : order.expiresAt;
    await Promise.all([
      ref.set({ status, phoneNumber: live.phone_number || order.phoneNumber, messages, expiresAt, updatedAt: FieldValue.serverTimestamp() }, { merge: true }),
      db.collection("transactions").doc(reference).set({ status: status === "completed" || status === "received" ? "successful" : status === "cancelled" ? "refunded" : status === "expired" ? "failed" : "processing", updatedAt: FieldValue.serverTimestamp() }, { merge: true }),
    ]);
    return Response.json({ reference, number: live.phone_number || order.phoneNumber, status, expiresAt: expiresAt?.toDate?.().toISOString?.() || null, refundStatus: status === "cancelled" ? "approved" : order.refundStatus || null, messages });
  } catch (error) { return routeError(error); }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ reference: string }> }) {
  try {
    const user = await requireUser(request); await enforceRateLimit(`bloomsms_refund_${user.uid}`, 10, 60 * 60 * 1000);
    const { reference } = await params; const db = adminDb(); const ref = db.collection("bloomSmsOrders").doc(reference); const snapshot = await ref.get(); const order = snapshot.data();
    if (!snapshot.exists || order?.userId !== user.uid) return Response.json({ error: "Order not found" }, { status: 404 });
    if (order.refundStatus === "approved" || ["cancelled", "refunded"].includes(order.status)) return Response.json({ reference, status: "refunded", refundStatus: "approved", idempotent: true });
    if (["pending_provider", "requested"].includes(order.refundStatus)) return Response.json({ reference, status: order.status, refundStatus: order.refundStatus, message: "Your refund request is awaiting provider confirmation.", idempotent: true }, { status: 202 });
    if (!order.providerReference || !Number.isSafeInteger(order.retailPriceMinor)) throw Object.assign(new Error("This order is not ready for a refund request"), { status: 409 });
    const expiresAtMillis = timestampMillis(order.expiresAt);
    if (!expiresAtMillis) throw Object.assign(new Error("Refresh this order before requesting a refund"), { status: 409 });
    if (Date.now() < expiresAtMillis) throw Object.assign(new Error("The SMS waiting period has not ended yet"), { status: 409, code: "REFUND_COUNTDOWN_ACTIVE" });

    let live;
    try {
      live = await checkBloomActivation(order.providerReference);
    } catch {
      await ref.set({ refundStatus: "pending_provider", refundRequestedAt: FieldValue.serverTimestamp(), refundReason: "No SMS received before expiry", updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      return Response.json({ reference, status: order.status, refundStatus: "pending_provider", message: "Refund request submitted and awaiting provider confirmation." }, { status: 202 });
    }
    const liveStatus = mapStatus(live.activation_status);
    const receivedText = live.sms?.full_text || live.sms?.code || "";
    if (receivedText || ["received", "completed"].includes(liveStatus)) throw Object.assign(new Error("A verification message was received, so this order is not refundable"), { status: 409, code: "SMS_ALREADY_RECEIVED" });

    let cancellationConfirmed = liveStatus === "cancelled";
    if (!cancellationConfirmed) {
      try {
        const cancellation = await updateBloomActivation(order.providerReference, "cancel");
        cancellationConfirmed = providerConfirmedCancellation(cancellation);
      } catch {
        cancellationConfirmed = false;
      }
    }
    if (!cancellationConfirmed) {
      await ref.set({ refundStatus: "pending_provider", refundRequestedAt: FieldValue.serverTimestamp(), refundReason: "No SMS received before expiry", providerStatusAtRefundRequest: live.activation_status || null, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      return Response.json({ reference, status: liveStatus, refundStatus: "pending_provider", message: "Refund request submitted and awaiting provider confirmation." }, { status: 202 });
    }

    await finalizePurchaseRefund({ uid: user.uid, purchaseReference: reference, refundReference: `${reference}-REFUND`, amountMinor: order.retailPriceMinor, description: "Confirmed number cancellation refund", providerReference: order.providerReference, providerOrderCollection: "bloomSmsOrders", providerOrderStatus: "cancelled" });
    await ref.set({ refundStatus: "approved", refundRequestedAt: order.refundRequestedAt || FieldValue.serverTimestamp(), refundResolvedAt: FieldValue.serverTimestamp(), refundReason: "No SMS received before expiry", updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    return Response.json({ reference, status: "refunded", refundStatus: "approved" });
  } catch (error) { return routeError(error); }
}
