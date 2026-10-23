import { NextRequest } from "next/server";
import { z } from "zod";
import { requireUser, routeError } from "@/lib/server/auth";
import { enforceRateLimit } from "@/lib/server/rate-limit";
import { smsPoolCountries, smsPoolServices } from "@/lib/server/smspool";

export async function GET(request: NextRequest) {
  try {
    const user = await requireUser(request); await enforceRateLimit(`smspool_catalog_${user.uid}`, 60, 60 * 60 * 1000);
    const country = request.nextUrl.searchParams.get("country");
    if (!country) return Response.json({ countries: await smsPoolCountries() });
    const countryId = z.coerce.number().int().positive().parse(country);
    return Response.json({ services: await smsPoolServices(countryId) });
  } catch (error) { return routeError(error instanceof z.ZodError ? Object.assign(new Error("Invalid SMSPool country"), { status: 400 }) : error); }
}
