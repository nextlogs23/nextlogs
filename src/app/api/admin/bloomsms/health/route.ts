import { NextRequest } from "next/server";
import { requireAdmin, routeError } from "@/lib/server/auth";
import { bloomBalance, bloomCountries, bloomServices, bloomSmsPurchasesEnabled } from "@/lib/server/bloomsms";

export async function GET(request: NextRequest) {
  try {
    await requireAdmin(request);
    const balance = await bloomBalance(); const countries = await bloomCountries();
    const first = countries[0]; const services = first ? await bloomServices(first.id) : [];
    return Response.json({ connection: "connected", currency: balance.currency, countries: countries.length, sampleServices: services.length, purchasesEnabled: bloomSmsPurchasesEnabled() });
  } catch (error) { return routeError(error); }
}
