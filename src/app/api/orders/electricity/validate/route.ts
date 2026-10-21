import { NextRequest } from "next/server";
import { z } from "zod";
import { requireUser, routeError } from "@/lib/server/auth";
import { vtuProvider } from "@/lib/server/providers";
const schema=z.object({provider:z.string().min(2).max(80),meterType:z.enum(['prepaid','postpaid']),meterNumber:z.string().regex(/^[0-9]{5,20}$/)});
export async function POST(req:NextRequest){try{await requireUser(req);return Response.json(await vtuProvider().validateMeter(schema.parse(await req.json())))}catch(e){return routeError(e)}}
