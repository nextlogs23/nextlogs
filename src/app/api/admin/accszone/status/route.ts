import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/server/auth";
import { accsZoneError, getAccsZoneBalance, getAccsZoneStatus, projectBalance, projectStatus } from "@/lib/server/accszone";

const headers = { "Cache-Control": "private, no-store, max-age=0" };
export async function GET(request: NextRequest) {
  try { await requireAdmin(request); const [status, balance] = await Promise.all([getAccsZoneStatus(), getAccsZoneBalance()]); return Response.json({ status: projectStatus(status), balance: projectBalance(balance), readOnly: true, purchasesEnabled: false }, { headers }); }
  catch (error) { const value = accsZoneError(error); return Response.json({ error: value.message, code: value.code }, { status: value.status || 502, headers }); }
}
