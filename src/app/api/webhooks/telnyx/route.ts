import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { adminDb } from "@/lib/server/firebase-admin";
import { telnyxClient } from "@/lib/server/telnyx";
import { applyWalletEntry } from "@/lib/server/wallet";

type TelnyxEvent = { data?: { id?: string; event_type?: string; occurred_at?: string; payload?: Record<string, unknown> } };
const textValue = (value: unknown) => typeof value === "string" ? value : "";

export async function POST(request: Request) {
  const rawBody = await request.text();
  let event: TelnyxEvent;
  try {
    const verified = await telnyxClient({ webhook: true }).webhooks.unwrap(rawBody, { headers: Object.fromEntries(request.headers.entries()) });
    event = verified as unknown as TelnyxEvent;
  } catch {
    return Response.json({ error: "Invalid Telnyx webhook signature" }, { status: 401 });
  }
  const data = event.data; const eventId = data?.id; const eventType = data?.event_type;
  if (!eventId || !eventType) return Response.json({ error: "Invalid Telnyx webhook payload" }, { status: 400 });
  const db = adminDb(); const eventRef = db.collection("telnyxWebhookEvents").doc(eventId);
  if ((await eventRef.get()).exists) return Response.json({ received: true, duplicate: true });

  if (eventType === "message.received") {
    const payload = data.payload || {}; const recipients = payload.to;
    const firstRecipient = Array.isArray(recipients) ? recipients[0] : recipients;
    const destination = typeof firstRecipient === "string" ? firstRecipient : textValue((firstRecipient as Record<string, unknown> | undefined)?.phone_number);
    const senderValue = payload.from; const sender = typeof senderValue === "string" ? senderValue : textValue((senderValue as Record<string, unknown> | undefined)?.phone_number);
    const numberQuery = destination ? await db.collection("purchasedNumbers").where("phoneNumber", "==", destination).limit(1).get() : null;
    const numberDoc = numberQuery?.docs[0]; const number = numberDoc?.data();
    if (!numberDoc || !number || !["active", "processing"].includes(number.status)) {
      await eventRef.set({ eventId, eventType, destination, status: "unmatched", occurredAt: data.occurred_at || null, receivedAt: FieldValue.serverTimestamp() }, { merge: false });
      return Response.json({ received: true });
    }
    const receivedAt = payload.received_at || data.occurred_at;
    await db.runTransaction(async (transaction) => {
      const duplicate = await transaction.get(eventRef); if (duplicate.exists) return;
      transaction.create(eventRef, { eventId, eventType, destination, purchasedNumberId: numberDoc.id, userId: number.userId, status: "stored", occurredAt: data.occurred_at || null, receivedAt: FieldValue.serverTimestamp() });
      transaction.create(db.collection("inboundMessages").doc(eventId), { userId: number.userId, purchasedNumberId: numberDoc.id, phoneNumber: destination, from: sender, text: textValue(payload.text), providerMessageId: textValue(payload.id) || eventId, type: textValue(payload.type) || "SMS", mediaCount: Array.isArray(payload.media) ? payload.media.length : 0, occurredAt: data.occurred_at || null, receivedAt: receivedAt ? Timestamp.fromDate(new Date(String(receivedAt))) : FieldValue.serverTimestamp(), createdAt: FieldValue.serverTimestamp() });
    });
    return Response.json({ received: true });
  }

  if (eventType === "number_order.complete") {
    const payload = data.payload || {}; const reference = textValue(payload.customer_reference); const providerStatus = textValue(payload.status);
    const status = providerStatus === "success" ? "active" : providerStatus === "failure" ? "failed" : "processing";
    if (reference) {
      const orderSnapshot = await db.collection("telnyxOrders").doc(reference).get(); const order = orderSnapshot.data();
      if (status === "failed" && order?.userId && Number.isSafeInteger(order.retailPriceMinor) && order.retailPriceMinor > 0) {
        await applyWalletEntry({ uid: order.userId, reference: `${reference}-REFUND`, amountMinor: order.retailPriceMinor, kind: "refund", description: "Telnyx order failure refund", providerReference: textValue(payload.id) || reference });
      }
      await Promise.all([
        db.collection("telnyxOrders").doc(reference).set({ status, providerStatus, updatedAt: FieldValue.serverTimestamp() }, { merge: true }),
        db.collection("purchasedNumbers").doc(reference).set({ status, updatedAt: FieldValue.serverTimestamp() }, { merge: true }),
        db.collection("transactions").doc(reference).set({ status: status === "active" ? "successful" : status === "failed" ? "refunded" : "processing", updatedAt: FieldValue.serverTimestamp() }, { merge: true }),
      ]);
    }
  }
  await eventRef.set({ eventId, eventType, status: "acknowledged", occurredAt: data.occurred_at || null, receivedAt: FieldValue.serverTimestamp() }, { merge: false });
  return Response.json({ received: true });
}
