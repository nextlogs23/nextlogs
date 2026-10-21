import { NextRequest } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { z } from "zod";
import { requireAdmin, routeError } from "@/lib/server/auth";
import { adminDb } from "@/lib/server/firebase-admin";
const schema=z.object({status:z.enum(['active','suspended']),reason:z.string().trim().min(10).max(500)});
export async function POST(req:NextRequest,{params}:{params:Promise<{uid:string}>}){try{const admin=await requireAdmin(req);const {uid}=await params;const body=schema.parse(await req.json());const batch=adminDb().batch();batch.update(adminDb().collection('users').doc(uid),{status:body.status,updatedAt:FieldValue.serverTimestamp()});batch.create(adminDb().collection('adminAuditLogs').doc(),{actorUid:admin.uid,action:`user_${body.status}`,targetUserId:uid,reason:body.reason,createdAt:FieldValue.serverTimestamp()});await batch.commit();return Response.json({ok:true})}catch(e){return routeError(e)}}
