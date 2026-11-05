import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { NextRequest } from "next/server";
import { z } from "zod";
import { requireUser, routeError } from "@/lib/server/auth";
import { BloomSmsError, bloomSmsPurchasesEnabled, purchaseBloomRental, stableBloomReference } from "@/lib/server/bloomsms";
import { adminDb } from "@/lib/server/firebase-admin";
import { enforceRateLimit } from "@/lib/server/rate-limit";
import { finalizePurchaseRefund, reservePurchase } from "@/lib/server/wallet";

const schema = z.object({ offerId: z.string().uuid(), idempotencyKey: z.string().min(16).max(100) });
const iso = (value: unknown) => value instanceof Timestamp ? value.toDate().toISOString() : value && typeof value === "object" && "toDate" in value ? (value as { toDate(): Date }).toDate().toISOString() : null;

export async function GET(request: NextRequest) {
  try {
    const user = await requireUser(request); const snapshot = await adminDb().collection("bloomSmsRentals").where("userId", "==", user.uid).orderBy("createdAt", "desc").limit(50).get();
    return Response.json({ rentals: snapshot.docs.map((doc) => { const data = doc.data(); return { id: doc.id, reference: data.reference, phoneNumber: data.phoneNumber || null, name: data.name, days: data.days, status: data.status, retailPriceMinor: data.retailPriceMinor, expiresAt: iso(data.expiresAt), createdAt: iso(data.createdAt) }; }) });
  } catch (error) { return routeError(error); }
}

export async function POST(request: NextRequest) {
  let reference = ""; let userId = ""; let retailPriceMinor = 0;
  try {
    const user = await requireUser(request); userId = user.uid; await enforceRateLimit(`bloomsms_rental_buy_${user.uid}`, 3, 24 * 60 * 60 * 1000);
    const input = schema.parse(await request.json()); reference = stableBloomReference(user.uid, input.idempotencyKey, "NXL-BLR"); const db = adminDb();
    const existing = await db.collection("bloomSmsRentals").doc(reference).get();
    if (existing.exists) { const data = existing.data()!; return Response.json({ reference, number: data.phoneNumber || null, status: data.status, idempotent: true }); }
    if (!bloomSmsPurchasesEnabled()) throw Object.assign(new Error("Number rentals are disabled while provider testing is in progress."), { status: 503 });
    const offerSnapshot = await db.collection("bloomSmsRentalOffers").doc(input.offerId).get(); const offer = offerSnapshot.data();
    if (!offerSnapshot.exists || offer?.userId !== user.uid) throw Object.assign(new Error("This rental offer is unavailable"), { status: 404 });
    if ((offer.expiresAt?.toMillis?.() || 0) <= Date.now()) throw Object.assign(new Error("This rental offer expired. Refresh pricing."), { status: 409 });
    retailPriceMinor = offer.retailPriceMinor;
    const reservation = await reservePurchase({ uid: user.uid, reference, amountMinor: retailPriceMinor, service: "sms_rental", metadata: { offerId: input.offerId, serviceId: offer.rentalId, period: offer.period, provider: "bloomsms" }, providerOrder: { collection: "bloomSmsRentals", data: { userId: user.uid, offerId: input.offerId, rentalId: offer.rentalId, name: offer.name, period: offer.period, days: offer.days, refundable: false, retailPriceMinor, providerCostMinor: offer.providerCostMinor, status: "processing", createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() } } });
    if (reservation.idempotent) { const rental = (await db.collection("bloomSmsRentals").doc(reference).get()).data(); return Response.json({ reference, number: rental?.phoneNumber || null, status: rental?.status || "processing", idempotent: true }); }
    const result = await purchaseBloomRental({ serviceId: offer.rentalId, period: offer.period });
    if (result.id === undefined || !result.phone_number) throw new BloomSmsError("The number provider returned an incomplete rental. It remains pending for reconciliation.", 502, 200, "INCOMPLETE_RESPONSE", false);
    const expiresAt = Timestamp.fromMillis(Date.now() + offer.days * 86_400_000); const status = result.status === "active" ? "active" : "processing";
    await Promise.all([
      db.collection("bloomSmsRentals").doc(reference).set({ providerReference: String(result.id), phoneNumber: result.phone_number, status, expiresAt, updatedAt: FieldValue.serverTimestamp() }, { merge: true }),
      db.collection("transactions").doc(reference).set({ status: status === "active" ? "successful" : "processing", providerReference: String(result.id), providerCostMinor: offer.providerCostMinor, updatedAt: FieldValue.serverTimestamp() }, { merge: true }),
    ]);
    return Response.json({ reference, number: result.phone_number, status, expiresAt: expiresAt.toDate().toISOString() });
  } catch (error) {
    if (error instanceof z.ZodError) return routeError(Object.assign(new Error("Invalid rental purchase request"), { status: 400 }));
    if (reference && userId && retailPriceMinor && error instanceof BloomSmsError && error.outcomeKnown) await finalizePurchaseRefund({ uid: userId, purchaseReference: reference, refundReference: `${reference}-REFUND`, amountMinor: retailPriceMinor, description: "Confirmed rental failure refund", providerReference: reference, providerOrderCollection: "bloomSmsRentals", providerOrderStatus: "failed", providerOrderUpdates: { providerErrorCode: error.providerCode || null } });
    return routeError(error);
  }
}
