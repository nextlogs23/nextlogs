import { NextRequest } from "next/server";
import { requireUser, routeError } from "@/lib/server/auth";
import { vtuProvider } from "@/lib/server/providers";
export async function GET(req: NextRequest) { try { await requireUser(req); return Response.json({ providers: await vtuProvider().electricityProviders() }); } catch (error) { return routeError(error); } }
