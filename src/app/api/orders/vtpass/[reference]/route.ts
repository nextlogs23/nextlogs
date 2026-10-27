import { NextRequest } from "next/server";
import { requireUser, routeError } from "@/lib/server/auth";
import { reconcileVtpass } from "@/lib/server/vtpass-reconcile";
export async function POST(req: NextRequest, { params }: { params: Promise<{ reference: string }> }) { try { const user = await requireUser(req); return Response.json(await reconcileVtpass((await params).reference, user.uid)); } catch (error) { return routeError(error); } }
