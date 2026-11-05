import { NextRequest } from "next/server";
import { z } from "zod";
import { requireUser, routeError } from "@/lib/server/auth";
import { bloomCountries, bloomServices } from "@/lib/server/bloomsms";
import { enforceRateLimit } from "@/lib/server/rate-limit";

export async function GET(request: NextRequest) {
  try {
    const user = await requireUser(request);
    await enforceRateLimit(`bloomsms_catalog_${user.uid}`, 40, 60 * 60 * 1000);
    const country = request.nextUrl.searchParams.get("country");
    if (!country) return Response.json({ countries: await bloomCountries() });
    return Response.json({ services: await bloomServices(z.string().min(1).max(20).parse(country)) });
  } catch (error) {
    return routeError(error instanceof z.ZodError ? Object.assign(new Error("Invalid country selection"), { status: 400 }) : error);
  }
}
