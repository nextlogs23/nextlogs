import { NextRequest } from "next/server";
import { requireAdmin, routeError } from "@/lib/server/auth";
import { normalizeTelnyxError, telnyxClient } from "@/lib/server/telnyx";

export async function GET(request: NextRequest) {
  try {
    await requireAdmin(request);
    const configuration = {
      apiKeyConfigured: Boolean(process.env.TELNYX_API_KEY?.trim()),
      webhookVerificationConfigured: Boolean(process.env.TELNYX_PUBLIC_KEY?.trim()),
      messagingProfileConfigured: Boolean(process.env.TELNYX_MESSAGING_PROFILE_ID?.trim()),
      pricingRateConfigured: Boolean(process.env.TELNYX_USD_NGN_RATE?.trim()),
      purchasesEnabled: process.env.TELNYX_PURCHASES_ENABLED === "true",
    };
    if (request.nextUrl.searchParams.get("live") !== "1") return Response.json({ provider: "Telnyx", ...configuration });
    if (!configuration.apiKeyConfigured) return Response.json({ provider: "Telnyx", ...configuration, connection: "not_configured", inventorySearch: "not_tested" });

    const client = telnyxClient();
    try {
      await client.balance.retrieve();
    } catch (error) {
      const normalized = normalizeTelnyxError(error);
      return Response.json({ provider: "Telnyx", ...configuration, connection: "failed", inventorySearch: "not_tested", error: normalized.message });
    }

    let inventorySearch: "available" | "empty" | "failed" = "failed";
    let inventoryError: string | null = null;
    try {
      const inventory = await client.availablePhoneNumbers.list({ filter: { country_code: "US", features: ["sms"], limit: 1, best_effort: false, exclude_held_numbers: true } });
      inventorySearch = inventory.data?.length ? "available" : "empty";
    } catch (error) {
      inventoryError = normalizeTelnyxError(error).message;
    }

    let messagingProfile: "available" | "not_configured" | "failed" = "not_configured";
    if (configuration.messagingProfileConfigured) {
      try {
        await client.messagingProfiles.retrieve(process.env.TELNYX_MESSAGING_PROFILE_ID!.trim());
        messagingProfile = "available";
      } catch {
        messagingProfile = "failed";
      }
    }
    return Response.json({ provider: "Telnyx", ...configuration, connection: "connected", inventorySearch, inventoryError, messagingProfile });
  } catch (error) { return routeError(error); }
}
