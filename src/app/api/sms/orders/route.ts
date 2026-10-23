import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { NextRequest } from "next/server";
import { z } from "zod";
import { requireUser, routeError } from "@/lib/server/auth";
import { adminDb } from "@/lib/server/firebase-admin";
import { enforceRateLimit } from "@/lib/server/rate-limit";
import { normalizeTelnyxError, stableTelnyxReference, telnyxClient, telnyxMessagingProfileId, telnyxPurchasesEnabled } from "@/lib/server/telnyx";
import { applyWalletEntry, reservePurchase } from "@/lib/server/wallet";

const purchaseSchema = z.object({ offerId: z.string().uuid(), idempotencyKey: z.string().min(16).max(100) });
function asIso(value: unknown) { if (value instanceof Timestamp) return value.toDate().toISOString(); if (value && typeof value === "object" && "toDate" in value) return (value as { toDate(): Date }).toDate().toISOString(); return typeof value === "string" ? value : null; }

export async function GET(request: NextRequest) {
  try {
    const user = await requireUser(request);
    const snapshot = await adminDb().collection("telnyxOrders").where("userId", "==", user.uid).orderBy("createdAt", "desc").limit(50).get();
    return Response.json({ orders: snapshot.docs.map((doc) => { const data = doc.data(); return { id: doc.id, reference: data.reference, phoneNumber: data.phoneNumber, countryCode: data.countryCode, status: data.status, retailPriceMinor: data.retailPriceMinor, providerReference: data.providerReference || null, createdAt: asIso(data.createdAt) }; }) });
  } catch (error) { return routeError(error); }
}

export async function POST(request: NextRequest) {
  let reference = ""; let userId = ""; let retailPriceMinor = 0;
  try {
    const user = await requireUser(request); userId = user.uid;
    await enforceRateLimit(`telnyx_buy_${user.uid}`, Number(process.env.SMS_DAILY_PURCHASE_LIMIT || 5), 24 * 60 * 60 * 1000);
    const body = purchaseSchema.parse(await request.json());
    reference = stableTelnyxReference(user.uid, body.idempotencyKey);
    const db = adminDb();
    const existing = await db.collection("telnyxOrders").doc(reference).get();
    if (existing.exists) { const data = existing.data()!; return Response.json({ reference, number: data.phoneNumber, status: data.status, providerReference: data.providerReference || null, idempotent: true }); }
    if (!telnyxPurchasesEnabled()) throw Object.assign(new Error("Live Telnyx purchases are disabled. Enable them only after completing sandbox and webhook tests."), { status: 503 });
    const profileId = telnyxMessagingProfileId();
    const client = telnyxClient();
    const offerSnapshot = await db.collection("telnyxSearchOffers").doc(body.offerId).get();
    const offer = offerSnapshot.data();
    if (!offerSnapshot.exists || offer?.userId !== user.uid) throw Object.assign(new Error("This number offer is not available to your account"), { status: 404 });
    if ((offer.expiresAt?.toMillis?.() || 0) <= Date.now()) throw Object.assign(new Error("This number offer has expired. Search again for current availability."), { status: 409 });
    if (!Number.isSafeInteger(offer.retailPriceMinor) || offer.retailPriceMinor <= 0) throw Object.assign(new Error("This offer has invalid pricing"), { status: 503 });
    retailPriceMinor = offer.retailPriceMinor;
    await reservePurchase({ uid: user.uid, reference, amountMinor: retailPriceMinor, service: "telnyx_number", metadata: { offerId: body.offerId, countryCode: offer.countryCode, phoneNumber: offer.phoneNumber } });
    await db.collection("telnyxOrders").doc(reference).create({ reference, userId: user.uid, phoneNumber: offer.phoneNumber, countryCode: offer.countryCode, status: "processing", retailPriceMinor, providerCostMinor: offer.providerCostMinor, offerId: body.offerId, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
    const result = await client.numberOrders.create({ customer_reference: reference, messaging_profile_id: profileId, phone_numbers: [{ phone_number: offer.phoneNumber }] }, { headers: { "Idempotency-Key": reference } });
    const provider = result.data; const number = provider?.phone_numbers?.[0];
    const status = provider?.status === "success" ? "active" : provider?.status === "failure" ? "failed" : "processing";
    await db.runTransaction(async (transaction) => {
      transaction.set(db.collection("telnyxOrders").doc(reference), { status, providerReference: provider?.id || null, providerStatus: provider?.status || "pending", requirementsMet: provider?.requirements_met ?? null, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      transaction.set(db.collection("transactions").doc(reference), { status: status === "active" ? "successful" : status === "failed" ? "failed" : "processing", providerReference: provider?.id || null, providerCostMinor: offer.providerCostMinor, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      transaction.set(db.collection("purchasedNumbers").doc(reference), { userId: user.uid, orderReference: reference, providerReference: provider?.id || null, providerNumberId: number?.id || null, phoneNumber: offer.phoneNumber, countryCode: offer.countryCode, status, messagingProfileId: profileId, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    });
    if (status === "failed") {
      await applyWalletEntry({ uid: user.uid, reference: `${reference}-REFUND`, amountMinor: retailPriceMinor, kind: "refund", description: "Telnyx order failure refund", providerReference: provider?.id || reference });
      await db.collection("transactions").doc(reference).set({ status: "refunded", updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    }
    return Response.json({ reference, number: offer.phoneNumber, status, providerReference: provider?.id || null });
  } catch (error) {
    if (error instanceof z.ZodError) return routeError(Object.assign(new Error("Invalid purchase request"), { status: 400 }));
    const status = (error as { status?: number }).status;
    const providerError = status ? error as Error & { status?: number } : normalizeTelnyxError(error);
    if (reference && userId && retailPriceMinor && providerError.status === 409) {
      const db = adminDb();
      await applyWalletEntry({ uid: userId, reference: `${reference}-REFUND`, amountMinor: retailPriceMinor, kind: "refund", description: "Telnyx number unavailable refund", providerReference: reference });
      await Promise.all([db.collection("telnyxOrders").doc(reference).set({ status: "failed", failureReason: providerError.message, updatedAt: FieldValue.serverTimestamp() }, { merge: true }), db.collection("transactions").doc(reference).set({ status: "refunded", updatedAt: FieldValue.serverTimestamp() }, { merge: true })]);
    }
    return routeError(providerError);
  }
}
