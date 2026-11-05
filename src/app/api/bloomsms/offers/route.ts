import { randomUUID } from "node:crypto";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { NextRequest } from "next/server";
import { z } from "zod";
import { requireUser, routeError } from "@/lib/server/auth";
import { bloomOffer } from "@/lib/server/bloomsms";
import { adminDb } from "@/lib/server/firebase-admin";
import { enforceRateLimit } from "@/lib/server/rate-limit";

const schema = z.object({ country: z.string().min(1).max(20), service: z.string().min(1).max(80), countryName: z.string().min(1).max(100).optional() });

export async function GET(request: NextRequest) {
  try {
    const user = await requireUser(request);
    await enforceRateLimit(`bloomsms_offers_${user.uid}`, 30, 60 * 60 * 1000);
    const input = schema.parse(Object.fromEntries(request.nextUrl.searchParams));
    const offers = await bloomOffer(input.country, input.service, input.countryName);
    const db = adminDb();
    const expiresAt = Timestamp.fromMillis(Date.now() + 3 * 60 * 1000);
    const batch = db.batch();
    const result = offers.map((offer) => {
      const id = randomUUID();
      batch.create(db.collection("bloomSmsOffers").doc(id), { ...offer, userId: user.uid, expiresAt, createdAt: FieldValue.serverTimestamp() });
      return { id, poolId: 0, poolName: "Available number", stock: offer.stock, retailPriceMinor: offer.retailPriceMinor, expiresAt: expiresAt.toDate().toISOString() };
    });
    if (result.length) await batch.commit();
    return Response.json({ offers: result, exactNumberSelectionSupported: false });
  } catch (error) {
    return routeError(error instanceof z.ZodError ? Object.assign(new Error("Invalid availability request"), { status: 400 }) : error);
  }
}
