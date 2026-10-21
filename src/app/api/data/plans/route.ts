import { NextRequest } from "next/server";
import { z } from "zod";
import { requireUser, routeError } from "@/lib/server/auth";
import { vtuProvider } from "@/lib/server/providers";
export async function GET(req:NextRequest){try{await requireUser(req);const network=z.enum(['mtn','airtel','glo','9mobile']).parse(req.nextUrl.searchParams.get('network'));const plans=await vtuProvider().dataPlans(network);return Response.json({plans})}catch(e){return routeError(e)}}
