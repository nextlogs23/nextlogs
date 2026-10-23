import { randomUUID } from "node:crypto";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { NextRequest } from "next/server";
import { requireUser, routeError } from "@/lib/server/auth";
import { adminDb } from "@/lib/server/firebase-admin";
import { enforceRateLimit } from "@/lib/server/rate-limit";
import { smsPoolRentalOffers } from "@/lib/server/smspool";

export async function GET(request: NextRequest) {
  try {
    const user = await requireUser(request); await enforceRateLimit(`smspool_rentals_${user.uid}`, 20, 60 * 60 * 1000);
    const offers = await smsPoolRentalOffers(); const db = adminDb(); const expiresAt = Timestamp.fromMillis(Date.now() + 10 * 60 * 1000); const batch = db.batch();
    const result = offers.map((offer) => { const id = randomUUID(); batch.create(db.collection("smsPoolRentalOffers").doc(id), { ...offer, userId: user.uid, expiresAt, createdAt: FieldValue.serverTimestamp() }); return { id, rentalId: offer.rentalId, name: offer.name, region: offer.region, days: offer.days, refundable: offer.refundable, refundWithinHours: offer.refundWithinHours, retailPriceMinor: offer.retailPriceMinor, expiresAt: expiresAt.toDate().toISOString() }; });
    if (result.length) await batch.commit(); return Response.json({ offers: result });
  } catch (error) { return routeError(error); }
}
