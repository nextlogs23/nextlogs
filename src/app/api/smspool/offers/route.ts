import { randomUUID } from "node:crypto";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { NextRequest } from "next/server";
import { z } from "zod";
import { requireUser, routeError } from "@/lib/server/auth";
import { adminDb } from "@/lib/server/firebase-admin";
import { enforceRateLimit } from "@/lib/server/rate-limit";
import { smsPoolOffers } from "@/lib/server/smspool";

const schema = z.object({ country: z.coerce.number().int().positive(), service: z.coerce.number().int().positive() });
export async function GET(request: NextRequest) {
  try {
    const user = await requireUser(request); await enforceRateLimit(`smspool_offers_${user.uid}`, 40, 60 * 60 * 1000);
    const input = schema.parse(Object.fromEntries(request.nextUrl.searchParams)); const offers = await smsPoolOffers(input.country, input.service);
    const db = adminDb(); const expiresAt = Timestamp.fromMillis(Date.now() + 5 * 60 * 1000); const batch = db.batch();
    const result = offers.map((offer) => { const id = randomUUID(); batch.create(db.collection("smsPoolOffers").doc(id), { ...offer, userId: user.uid, expiresAt, createdAt: FieldValue.serverTimestamp() }); return { id, poolId: offer.poolId, poolName: offer.poolName, stock: offer.stock, retailPriceMinor: offer.retailPriceMinor, expiresAt: expiresAt.toDate().toISOString() }; });
    if (result.length) await batch.commit(); return Response.json({ offers: result, exactNumberSelectionSupported: false });
  } catch (error) { return routeError(error instanceof z.ZodError ? Object.assign(new Error("Invalid SMSPool offer request"), { status: 400 }) : error); }
}
