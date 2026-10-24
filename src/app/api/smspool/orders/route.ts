import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { NextRequest } from "next/server";
import { z } from "zod";
import { requireUser, routeError } from "@/lib/server/auth";
import { adminDb } from "@/lib/server/firebase-admin";
import { enforceRateLimit } from "@/lib/server/rate-limit";
import { purchaseSmsPoolNumber, smsPoolPurchasesEnabled, stableSmsPoolReference, SmsPoolError } from "@/lib/server/smspool";
import { finalizePurchaseRefund, reservePurchase } from "@/lib/server/wallet";

const schema = z.object({ offerId: z.string().uuid(), idempotencyKey: z.string().min(16).max(100) });
const iso = (value: unknown) => value instanceof Timestamp ? value.toDate().toISOString() : value && typeof value === "object" && "toDate" in value ? (value as { toDate(): Date }).toDate().toISOString() : typeof value === "string" ? value : null;

export async function GET(request: NextRequest) {
  try {
    const user = await requireUser(request); const snapshot = await adminDb().collection("smsPoolOrders").where("userId", "==", user.uid).orderBy("createdAt", "desc").limit(50).get();
    return Response.json({ orders: snapshot.docs.map((doc) => { const data = doc.data(); return { id: doc.id, reference: data.reference, phoneNumber: data.phoneNumber || null, countryName: data.countryName || null, serviceName: data.serviceName || null, status: data.status, retailPriceMinor: data.retailPriceMinor, expiresAt: iso(data.expiresAt), createdAt: iso(data.createdAt) }; }) });
  } catch (error) { return routeError(error); }
}

export async function POST(request: NextRequest) {
  let reference = ""; let userId = ""; let retailPriceMinor = 0;
  try {
    const user = await requireUser(request); userId = user.uid; await enforceRateLimit(`smspool_buy_${user.uid}`, Number(process.env.SMS_DAILY_PURCHASE_LIMIT || 5), 24 * 60 * 60 * 1000);
    const input = schema.parse(await request.json()); reference = stableSmsPoolReference(user.uid, input.idempotencyKey); const db = adminDb();
    const existing = await db.collection("smsPoolOrders").doc(reference).get(); if (existing.exists) { const data = existing.data()!; return Response.json({ reference, number: data.phoneNumber || null, status: data.status, idempotent: true }); }
    if (!smsPoolPurchasesEnabled()) throw Object.assign(new Error("Live SMSPool purchases are disabled during testing."), { status: 503 });
    const offerSnapshot = await db.collection("smsPoolOffers").doc(input.offerId).get(); const offer = offerSnapshot.data();
    if (!offerSnapshot.exists || offer?.userId !== user.uid) throw Object.assign(new Error("This SMSPool offer is not available to your account"), { status: 404 });
    if ((offer.expiresAt?.toMillis?.() || 0) <= Date.now()) throw Object.assign(new Error("This SMSPool offer expired. Refresh pricing and availability."), { status: 409 });
    retailPriceMinor = offer.retailPriceMinor;
    const reservation = await reservePurchase({ uid: user.uid, reference, amountMinor: retailPriceMinor, service: "smspool_sms", metadata: { offerId: input.offerId, countryId: offer.countryId, serviceId: offer.serviceId, poolId: offer.poolId }, providerOrder: { collection: "smsPoolOrders", data: { userId: user.uid, offerId: input.offerId, countryId: offer.countryId, serviceId: offer.serviceId, poolId: offer.poolId, poolName: offer.poolName, status: "processing", retailPriceMinor, providerCostMinor: offer.providerCostMinor, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() } } });
    if (reservation.idempotent) { const order = (await db.collection("smsPoolOrders").doc(reference).get()).data(); return Response.json({ reference, number: order?.phoneNumber || null, status: order?.status || "processing", idempotent: true }); }
    const result = await purchaseSmsPoolNumber({ countryId: offer.countryId, serviceId: offer.serviceId, poolId: offer.poolId, maxPriceUsd: offer.providerPriceUsd });
    if (!result.order_id || !result.phonenumber) throw new SmsPoolError("SMSPool returned an incomplete order", 502, 200, "INCOMPLETE_RESPONSE", false);
    const expiresAt = result.expiration ? Timestamp.fromMillis(result.expiration * 1000) : Timestamp.fromMillis(Date.now() + Number(result.expires_in || 1200) * 1000);
    await Promise.all([
      db.collection("smsPoolOrders").doc(reference).set({ providerReference: result.order_id, phoneNumber: result.cc ? `+${result.cc}${result.phonenumber}` : result.phonenumber, countryName: result.country || null, serviceName: result.service || null, status: "waiting", expiresAt, providerCostUsd: result.cost || null, updatedAt: FieldValue.serverTimestamp() }, { merge: true }),
      db.collection("transactions").doc(reference).set({ status: "processing", providerReference: result.order_id, providerCostMinor: offer.providerCostMinor, updatedAt: FieldValue.serverTimestamp() }, { merge: true }),
    ]);
    return Response.json({ reference, number: result.cc ? `+${result.cc}${result.phonenumber}` : result.phonenumber, status: "waiting", expiresAt: expiresAt.toDate().toISOString() });
  } catch (error) {
    if (error instanceof z.ZodError) return routeError(Object.assign(new Error("Invalid SMSPool purchase request"), { status: 400 }));
    if (reference && userId && retailPriceMinor && error instanceof SmsPoolError && error.outcomeKnown) {
      await finalizePurchaseRefund({ uid: userId, purchaseReference: reference, refundReference: `${reference}-REFUND`, amountMinor: retailPriceMinor, description: "SMSPool order failure refund", providerReference: reference, providerOrderCollection: "smsPoolOrders", providerOrderStatus: "failed", providerOrderUpdates: { providerErrorType: error.providerType || null } });
    }
    return routeError(error);
  }
}
