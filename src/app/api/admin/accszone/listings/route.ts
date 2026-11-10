import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/server/auth";
import { accsZoneError, getAccsZoneListings, listingItems, pageMetadata, parseListingsQuery, projectListing } from "@/lib/server/accszone";
const headers = { "Cache-Control": "private, no-store, max-age=0" };
export async function GET(request: NextRequest) { try { await requireAdmin(request); const payload = await getAccsZoneListings(parseListingsQuery(request.nextUrl.searchParams)); return Response.json({ listings: listingItems(payload).map(projectListing).filter((item): item is NonNullable<typeof item> => item !== null), pagination: pageMetadata(payload) }, { headers }); } catch (error) { const value = accsZoneError(error); return Response.json({ error: value.message, code: value.code }, { status: value.status || 502, headers }); } }
