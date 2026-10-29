import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { NextRequest } from "next/server";
import { z } from "zod";
import { requireUser, routeError } from "@/lib/server/auth";
import { adminDb } from "@/lib/server/firebase-admin";
import { enforceRateLimit } from "@/lib/server/rate-limit";
import { purchaseSmsPoolRental, smsPoolPurchasesEnabled, stableSmsPoolReference, SmsPoolError } from "@/lib/server/smspool";
import { finalizePurchaseRefund, reservePurchase } from "@/lib/server/wallet";

const schema = z.object({ offerId: z.string().uuid(), idempotencyKey: z.string().min(16).max(100) });
const iso = (value: unknown) => value instanceof Timestamp ? value.toDate().toISOString() : value && typeof value === "object" && "toDate" in value ? (value as { toDate(): Date }).toDate().toISOString() : null;
export async function GET(request: NextRequest) { try { const user = await requireUser(request); const snapshot = await adminDb().collection("smsPoolRentals").where("userId", "==", user.uid).orderBy("createdAt", "desc").limit(50).get(); return Response.json({ rentals: snapshot.docs.map((doc) => { const data = doc.data(); return { id: doc.id, reference: data.reference, phoneNumber: data.phoneNumber || null, name: data.name, days: data.days, status: data.status, retailPriceMinor: data.retailPriceMinor, expiresAt: iso(data.expiresAt) }; }) }); } catch (error) { return routeError(error); } }
export async function POST(request: NextRequest) {
  let reference = ""; let userId = ""; let retailPriceMinor = 0;
  try {
    const user = await requireUser(request); userId = user.uid; await enforceRateLimit(`smspool_rental_buy_${user.uid}`, 3, 24 * 60 * 60 * 1000); const input = schema.parse(await request.json()); reference = stableSmsPoolReference(user.uid, input.idempotencyKey, "NXL-SPR"); const db = adminDb();
    const existing = await db.collection("smsPoolRentals").doc(reference).get(); if (existing.exists) { const data = existing.data()!; return Response.json({ reference, number: data.phoneNumber || null, status: data.status, idempotent: true }); }
    if (!smsPoolPurchasesEnabled()) throw Object.assign(new Error("Live SMSPool rental purchases are disabled during testing."), { status: 503 });
    const offerSnapshot = await db.collection("smsPoolRentalOffers").doc(input.offerId).get(); const offer = offerSnapshot.data(); if (!offerSnapshot.exists || offer?.userId !== user.uid) throw Object.assign(new Error("This rental offer is unavailable"), { status: 404 }); if ((offer.expiresAt?.toMillis?.() || 0) <= Date.now()) throw Object.assign(new Error("This rental offer expired. Refresh pricing."), { status: 409 }); retailPriceMinor = offer.retailPriceMinor;
    const reservation = await reservePurchase({ uid: user.uid, reference, amountMinor: retailPriceMinor, service: "smspool_rental", metadata: { offerId: input.offerId, rentalId: offer.rentalId, days: offer.days }, providerOrder: { collection: "smsPoolRentals", data: { userId: user.uid, offerId: input.offerId, rentalId: offer.rentalId, name: offer.name, days: offer.days, refundable: offer.refundable, refundWithinHours: offer.refundWithinHours, retailPriceMinor, providerCostMinor: offer.providerCostMinor, status: "processing", createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() } } });
    if (reservation.idempotent) { const rental = (await db.collection("smsPoolRentals").doc(reference).get()).data(); return Response.json({ reference, number: rental?.phoneNumber || null, status: rental?.status || "processing", idempotent: true }); }
    const result = await purchaseSmsPoolRental({ rentalId: offer.rentalId, days: offer.days }); if (!result.rental_code) throw new SmsPoolError("SMSPool returned an incomplete rental", 502, 200, "INCOMPLETE_RESPONSE", false);
    const expiresAt = result.expiry ? Timestamp.fromMillis(result.expiry * 1000) : Timestamp.fromMillis(Date.now() + offer.days * 86400000);
    const status = result.phonenumber ? "active" : "processing";
    await Promise.all([db.collection("smsPoolRentals").doc(reference).set({ providerReference: result.rental_code, phoneNumber: result.phonenumber || null, status, expiresAt, updatedAt: FieldValue.serverTimestamp() }, { merge: true }), db.collection("transactions").doc(reference).set({ status: status === "active" ? "successful" : "processing", providerReference: result.rental_code, providerCostMinor: offer.providerCostMinor, updatedAt: FieldValue.serverTimestamp() }, { merge: true })]);
    return Response.json({ reference, number: result.phonenumber || null, status, expiresAt: expiresAt.toDate().toISOString() });
  } catch (error) {
    if (error instanceof z.ZodError) return routeError(Object.assign(new Error("Invalid rental purchase request"), { status: 400 }));
    if (reference && userId && retailPriceMinor && error instanceof SmsPoolError && error.outcomeKnown) await finalizePurchaseRefund({ uid: userId, purchaseReference: reference, refundReference: `${reference}-REFUND`, amountMinor: retailPriceMinor, description: "SMSPool rental failure refund", providerReference: reference, providerOrderCollection: "smsPoolRentals", providerOrderStatus: "failed", providerOrderUpdates: { providerErrorType: error.providerType || null } });
    return routeError(error);
  }
}
