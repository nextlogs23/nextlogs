import { NextRequest } from "next/server";
import { requireAdmin, routeError } from "@/lib/server/auth";
import { checkVtugateConnection, vtugateConfig } from "@/lib/server/vtugate";

export async function GET(req: NextRequest) {
  try {
    await requireAdmin(req);
    const config = vtugateConfig();
    const output: Record<string, unknown> = { provider: "VTUGATE", environment: config.environment, configured: Boolean(config.token), purchasesEnabled: config.purchasesEnabled, liveReady: config.environment === "production" && config.baseUrl === "https://api.vtugate.com" };
    if (req.nextUrl.searchParams.get("live") === "1" && output.configured) {
      try { Object.assign(output, await checkVtugateConnection()); }
      catch (error) { output.connection = "failed"; output.error = error instanceof Error ? error.message : "Connection failed"; }
    }
    return Response.json(output);
  } catch (error) { return routeError(error); }
}
