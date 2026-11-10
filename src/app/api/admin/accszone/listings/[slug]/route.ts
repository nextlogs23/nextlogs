import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/server/auth";
import { accsZoneError, getAccsZoneListing, parseSlug, projectListing } from "@/lib/server/accszone";
const headers = { "Cache-Control": "private, no-store, max-age=0" };
export async function GET(request: NextRequest, { params }: { params: Promise<{ slug: string }> }) { try { await requireAdmin(request); const { slug } = await params; const listing = projectListing(await getAccsZoneListing(parseSlug(slug))); if (!listing) return Response.json({ error: "AccsZone listing detail could not be validated", code: "ACCSZONE_INVALID_RESPONSE" }, { status: 502, headers }); return Response.json({ listing }, { headers }); } catch (error) { const value = accsZoneError(error); return Response.json({ error: value.message, code: value.code }, { status: value.status || 502, headers }); } }
