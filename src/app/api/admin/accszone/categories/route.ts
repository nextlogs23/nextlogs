import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/server/auth";
import { accsZoneError, getAccsZoneCategories, projectCategories } from "@/lib/server/accszone";
const headers = { "Cache-Control": "private, no-store, max-age=0" };
export async function GET(request: NextRequest) { try { await requireAdmin(request); return Response.json({ categories: projectCategories(await getAccsZoneCategories()) }, { headers }); } catch (error) { const value = accsZoneError(error); return Response.json({ error: value.message, code: value.code }, { status: value.status || 502, headers }); } }
