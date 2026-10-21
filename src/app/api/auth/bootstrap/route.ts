import { FieldValue } from "firebase-admin/firestore";
import { NextRequest } from "next/server";
import { z } from "zod";
import { requireUser, routeError } from "@/lib/server/auth";
import { adminDb } from "@/lib/server/firebase-admin";

const schema=z.object({displayName:z.string().trim().min(2).max(100),phone:z.string().trim().min(7).max(20)});
export async function POST(req:NextRequest){try{const user=await requireUser(req);const body=schema.parse(await req.json());const db=adminDb();await db.runTransaction(async tx=>{const profile=db.collection('users').doc(user.uid),wallet=db.collection('wallets').doc(user.uid);const existing=await tx.get(profile);if(existing.exists)return;tx.create(profile,{uid:user.uid,email:user.email,...body,role:'customer',status:'active',totalTransactions:0,totalSpentMinor:0,createdAt:FieldValue.serverTimestamp(),updatedAt:FieldValue.serverTimestamp()});tx.create(wallet,{userId:user.uid,balanceMinor:0,createdAt:FieldValue.serverTimestamp(),updatedAt:FieldValue.serverTimestamp()})});return Response.json({ok:true})}catch(e){return routeError(e)}}
