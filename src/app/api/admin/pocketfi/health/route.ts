import { NextRequest } from "next/server";
import { requireAdmin, routeError } from "@/lib/server/auth";
import { pocketFiBaseUrl, pocketFiMode } from "@/lib/server/pocketfi";

export async function GET(request: NextRequest) {
  try {
    await requireAdmin(request);
    const configured = Boolean(process.env.POCKETFI_API_TOKEN?.trim() && process.env.POCKETFI_BUSINESS_ID?.trim());
    return Response.json({ connection: configured ? "configured" : "not_configured", mode: pocketFiMode(), currency: "NGN", baseUrl: pocketFiBaseUrl() });
  } catch (error) {
    return routeError(error);
  }
}
