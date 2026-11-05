import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { NextRequest } from "next/server";
import { z } from "zod";
import { requireUser, routeError } from "@/lib/server/auth";
import { BloomSmsError, bloomSmsPurchasesEnabled, purchaseBloomNumber, stableBloomReference } from "@/lib/server/bloomsms";
import { adminDb } from "@/lib/server/firebase-admin";
import { enforceRateLimit } from "@/lib/server/rate-limit";
import { finalizePurchaseRefund, reservePurchase } from "@/lib/server/wallet";

const schema = z.object({ offerId: z.string().uuid(), idempotencyKey: z.string().min(16).max(100) });
const iso = (value: unknown) => value instanceof Timestamp ? value.toDate().toISOString() : value && typeof value === "object" && "toDate" in value ? (value as { toDate(): Date }).toDate().toISOString() : typeof value === "string" ? value : null;

export async function GET(request: NextRequest) {
  try {
    const user = await requireUser(request);
    const snapshot = await adminDb().collection("bloomSmsOrders").where("userId", "==", user.uid).orderBy("createdAt", "desc").limit(50).get();
    return Response.json({ orders: snapshot.docs.map((doc) => { const data = doc.data(); return { id: doc.id, reference: data.reference, phoneNumber: data.phoneNumber || null, countryName: data.countryName || null, serviceName: data.serviceName || null, status: data.status, retailPriceMinor: data.retailPriceMinor, expiresAt: iso(data.expiresAt), createdAt: iso(data.createdAt) }; }) });
  } catch (error) { return routeError(error); }
}

export async function POST(request: NextRequest) {
  let reference = ""; let userId = ""; let retailPriceMinor = 0;
  try {
    const user = await requireUser(request); userId = user.uid;
    await enforceRateLimit(`bloomsms_buy_${user.uid}`, Number(process.env.SMS_DAILY_PURCHASE_LIMIT || 5), 24 * 60 * 60 * 1000);
    const input = schema.parse(await request.json());
    reference = stableBloomReference(user.uid, input.idempotencyKey);
    const db = adminDb();
    const existing = await db.collection("bloomSmsOrders").doc(reference).get();
    if (existing.exists) { const data = existing.data()!; return Response.json({ reference, number: data.phoneNumber || null, status: data.status, idempotent: true }); }
    if (!bloomSmsPurchasesEnabled()) throw Object.assign(new Error("Number purchases are disabled while provider testing is in progress."), { status: 503 });
    const offerSnapshot = await db.collection("bloomSmsOffers").doc(input.offerId).get();
    const offer = offerSnapshot.data();
    if (!offerSnapshot.exists || offer?.userId !== user.uid) throw Object.assign(new Error("This number offer is unavailable"), { status: 404 });
    if ((offer.expiresAt?.toMillis?.() || 0) <= Date.now()) throw Object.assign(new Error("This offer expired. Refresh live pricing and availability."), { status: 409 });
    retailPriceMinor = offer.retailPriceMinor;
    const reservation = await reservePurchase({
      uid: user.uid, reference, amountMinor: retailPriceMinor, service: "sms_verification",
      metadata: { offerId: input.offerId, countryId: offer.countryId, serviceId: offer.serviceId, provider: "bloomsms" },
      providerOrder: { collection: "bloomSmsOrders", data: { userId: user.uid, offerId: input.offerId, countryId: offer.countryId, countryName: offer.countryName, serviceId: offer.serviceId, serviceName: offer.serviceName, status: "processing", retailPriceMinor, providerCostMinor: offer.providerCostMinor, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() } },
    });
    if (reservation.idempotent) { const order = (await db.collection("bloomSmsOrders").doc(reference).get()).data(); return Response.json({ reference, number: order?.phoneNumber || null, status: order?.status || "processing", idempotent: true }); }
    const result = await purchaseBloomNumber({ countryId: offer.countryId, serviceId: offer.serviceId, maxPriceUsd: offer.providerPriceUsd });
    if (!result.activation_id || !result.phone_number) throw new BloomSmsError("The number provider returned an incomplete order. It remains pending for reconciliation.", 502, 200, "INCOMPLETE_RESPONSE", false);
    const expiresAt = result.expires_at ? Timestamp.fromDate(new Date(result.expires_at)) : Timestamp.fromMillis(Date.now() + 20 * 60 * 1000);
    await Promise.all([
      db.collection("bloomSmsOrders").doc(reference).set({ providerReference: String(result.activation_id), phoneNumber: result.phone_number, status: "waiting", expiresAt, providerCostUsd: result.price || null, updatedAt: FieldValue.serverTimestamp() }, { merge: true }),
      db.collection("transactions").doc(reference).set({ status: "processing", providerReference: String(result.activation_id), providerCostMinor: offer.providerCostMinor, updatedAt: FieldValue.serverTimestamp() }, { merge: true }),
    ]);
    return Response.json({ reference, number: result.phone_number, status: "waiting", expiresAt: expiresAt.toDate().toISOString() });
  } catch (error) {
    if (error instanceof z.ZodError) return routeError(Object.assign(new Error("Invalid number purchase request"), { status: 400 }));
    if (reference && userId && retailPriceMinor && error instanceof BloomSmsError && error.outcomeKnown) {
      await finalizePurchaseRefund({ uid: userId, purchaseReference: reference, refundReference: `${reference}-REFUND`, amountMinor: retailPriceMinor, description: "Confirmed number-order failure refund", providerReference: reference, providerOrderCollection: "bloomSmsOrders", providerOrderStatus: "failed", providerOrderUpdates: { providerErrorCode: error.providerCode || null } });
    }
    return routeError(error);
  }
}
