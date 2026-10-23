import { NextRequest } from "next/server";
import { requireAdmin, routeError } from "@/lib/server/auth";
export async function GET(request: NextRequest) { try { await requireAdmin(request); return Response.json({ provider: "SMSPool", configured: Boolean(process.env.SMSPOOL_API_KEY), pricingRateConfigured: Boolean(process.env.SMSPOOL_USD_NGN_RATE), markupConfigured: Boolean(process.env.SMSPOOL_MARKUP_PERCENT), purchasesEnabled: process.env.SMSPOOL_PURCHASES_ENABLED === "true", exactNumberSelectionSupported: false }); } catch (error) { return routeError(error); } }
