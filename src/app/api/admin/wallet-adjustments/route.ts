import { NextRequest } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { z } from "zod";
import { requireAdmin, routeError } from "@/lib/server/auth";
import { adminDb } from "@/lib/server/firebase-admin";
import { applyWalletEntry } from "@/lib/server/wallet";
import { reference } from "@/lib/server/references";
const schema=z.object({userId:z.string().min(10),amountMinor:z.number().int().refine(v=>v!==0),reason:z.string().trim().min(15).max(500),authorizationTicket:z.string().trim().min(5).max(100)});
export async function POST(req:NextRequest){try{const admin=await requireAdmin(req),body=schema.parse(await req.json()),ref=reference('NVR-ADJ');const result=await applyWalletEntry({uid:body.userId,reference:ref,amountMinor:body.amountMinor,kind:'adjustment',description:'Administrative wallet adjustment',actorUid:admin.uid,reason:body.reason});await adminDb().collection('adminAuditLogs').doc(ref).create({actorUid:admin.uid,action:'wallet_adjustment',targetUserId:body.userId,amountMinor:body.amountMinor,reason:body.reason,authorizationTicket:body.authorizationTicket,reference:ref,createdAt:FieldValue.serverTimestamp()});return Response.json({reference:ref,balanceMinor:result.balanceMinor})}catch(e){return routeError(e)}}
