import { NextRequest } from "next/server";
import { requireAdmin, routeError } from "@/lib/server/auth";
export async function GET(request: NextRequest) {
  try {
    await requireAdmin(request);
    return Response.json({ provider: "Telnyx", configured: Boolean(process.env.TELNYX_API_KEY), webhookVerificationConfigured: Boolean(process.env.TELNYX_PUBLIC_KEY), messagingProfileConfigured: Boolean(process.env.TELNYX_MESSAGING_PROFILE_ID), pricingRateConfigured: Boolean(process.env.TELNYX_USD_NGN_RATE), purchasesEnabled: process.env.TELNYX_PURCHASES_ENABLED === "true" });
  } catch (error) { return routeError(error); }
}
