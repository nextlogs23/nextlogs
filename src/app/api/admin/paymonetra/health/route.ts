import { NextRequest } from "next/server";
import { requireAdmin, routeError } from "@/lib/server/auth";
import { getPaymonetraBalance, paymonetraMode } from "@/lib/server/paymonetra";

export async function GET(request: NextRequest) {
  try {
    await requireAdmin(request);
    const balance = await getPaymonetraBalance();
    return Response.json({ connection: "connected", mode: balance.mode || paymonetraMode(), currency: balance.currency || "NGN" });
  } catch (error) {
    return routeError(error);
  }
}
