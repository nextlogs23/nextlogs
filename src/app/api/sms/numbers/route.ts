import { randomUUID } from "node:crypto";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { NextRequest } from "next/server";
import { z } from "zod";
import { requireUser, routeError } from "@/lib/server/auth";
import { adminDb } from "@/lib/server/firebase-admin";
import { enforceRateLimit } from "@/lib/server/rate-limit";
import { normalizeTelnyxError, searchTelnyxNumbers } from "@/lib/server/telnyx";

const querySchema = z.object({ country: z.string().length(2).regex(/^[a-z]{2}$/i).transform((value) => value.toUpperCase()), limit: z.coerce.number().int().min(1).max(50).default(20) });

export async function GET(request: NextRequest) {
  try {
    const user = await requireUser(request);
    await enforceRateLimit(`telnyx_search_${user.uid}`, 30, 60 * 60 * 1000);
    const input = querySchema.parse(Object.fromEntries(request.nextUrl.searchParams));
    const offers = await searchTelnyxNumbers(input.country, input.limit);
    const db = adminDb();
    const expiresAt = Timestamp.fromMillis(Date.now() + 10 * 60 * 1000);
    const batch = db.batch();
    const response = offers.map((offer) => {
      const id = randomUUID();
      batch.create(db.collection("telnyxSearchOffers").doc(id), { ...offer, userId: user.uid, expiresAt, createdAt: FieldValue.serverTimestamp() });
      return { id, phoneNumber: offer.phoneNumber, countryCode: offer.countryCode, phoneNumberType: offer.phoneNumberType, features: offer.features, retailPriceMinor: offer.retailPriceMinor, expiresAt: expiresAt.toDate().toISOString() };
    });
    if (response.length) await batch.commit();
    return Response.json({ numbers: response });
  } catch (error) {
    if (error instanceof z.ZodError) return routeError(Object.assign(new Error("Choose a valid country"), { status: 400 }));
    const status = (error as { status?: number }).status;
    return routeError(status ? error : normalizeTelnyxError(error));
  }
}
