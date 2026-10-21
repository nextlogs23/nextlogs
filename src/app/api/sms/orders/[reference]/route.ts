import { NextRequest } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { requireUser, routeError } from "@/lib/server/auth";
import { adminDb } from "@/lib/server/firebase-admin";
import { smsProvider } from "@/lib/server/providers";
export async function GET(req:NextRequest,{params}:{params:Promise<{reference:string}>}){try{const u=await requireUser(req);const {reference}=await params;const ref=adminDb().collection('smsOrders').doc(reference),snap=await ref.get();if(!snap.exists||snap.data()?.userId!==u.uid)return Response.json({error:'Order not found'},{status:404});const order=snap.data()!;const live=await smsProvider().status(order.providerReference);await ref.update({status:live.status,messages:live.messages,updatedAt:FieldValue.serverTimestamp()});return Response.json({reference,number:order.number,...live})}catch(e){return routeError(e)}}
