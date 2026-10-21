import { NextRequest } from "next/server";
import { requireUser, routeError } from "@/lib/server/auth";
import { adminDb } from "@/lib/server/firebase-admin";
export async function GET(req:NextRequest){try{const u=await requireUser(req);const snap=await adminDb().collection('transactions').where('userId','==',u.uid).orderBy('createdAt','desc').limit(50).get();return Response.json({transactions:snap.docs.map(d=>({id:d.id,...d.data()}))})}catch(e){return routeError(e)}}
