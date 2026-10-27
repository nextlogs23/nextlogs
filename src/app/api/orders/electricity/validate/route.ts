import { NextRequest } from "next/server";
import { z } from "zod";
import { requireUser, routeError } from "@/lib/server/auth";
import { vtuProvider } from "@/lib/server/providers";
import { adminDb } from "@/lib/server/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import { randomUUID } from "crypto";
const schema=z.object({provider:z.string().min(2).max(80),meterType:z.enum(['prepaid','postpaid']),meterNumber:z.string().regex(/^[0-9]{5,20}$/)});
export async function POST(req:NextRequest){try{const user=await requireUser(req);const input=schema.parse(await req.json());const result=await vtuProvider().validateMeter(input);const validationId=randomUUID();await adminDb().collection('vtuMeterVerifications').doc(validationId).create({uid:user.uid,...input,...result,expiresAtMs:Date.now()+10*60*1000,createdAt:FieldValue.serverTimestamp()});return Response.json({...result,validationId})}catch(e){return routeError(e)}}
