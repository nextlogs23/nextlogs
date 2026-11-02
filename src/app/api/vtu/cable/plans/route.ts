import { NextRequest } from "next/server";
import { z } from "zod";
import { requireUser, routeError } from "@/lib/server/auth";
import { vtuProvider } from "@/lib/server/providers";
export async function GET(req: NextRequest) { try { await requireUser(req); const provider = z.string().min(1).max(80).parse(req.nextUrl.searchParams.get("provider")); return Response.json({ plans: await vtuProvider().cablePlans(provider) }); } catch (error) { return routeError(error); } }
