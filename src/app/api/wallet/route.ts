import { NextRequest } from "next/server";
import { requireUser, routeError } from "@/lib/server/auth";
import { adminDb } from "@/lib/server/firebase-admin";
export async function GET(req:NextRequest){try{const u=await requireUser(req);const snap=await adminDb().collection('wallets').doc(u.uid).get();return Response.json({balanceMinor:snap.data()?.balanceMinor??0})}catch(e){return routeError(e)}}
