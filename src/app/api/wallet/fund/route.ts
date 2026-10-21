import { NextRequest } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { z } from "zod";
import { requireUser, routeError } from "@/lib/server/auth";
import { adminDb } from "@/lib/server/firebase-admin";
import { reference } from "@/lib/server/references";
import { enforceRateLimit } from "@/lib/server/rate-limit";

const schema=z.object({amountMinor:z.number().int().min(10000).max(100000000)});
export async function POST(req:NextRequest){try{const u=await requireUser(req);await enforceRateLimit(`fund_${u.uid}`,8,60*60*1000);const {amountMinor}=schema.parse(await req.json());const secret=process.env.PAYSTACK_SECRET_KEY;if(!secret)throw Object.assign(new Error('Paystack is not configured'),{status:503});const ref=reference('NVR-FUND');await adminDb().collection('walletFundingIntents').doc(ref).create({reference:ref,userId:u.uid,email:u.email,amountMinor,status:'pending',createdAt:FieldValue.serverTimestamp()});const response=await fetch('https://api.paystack.co/transaction/initialize',{method:'POST',headers:{Authorization:`Bearer ${secret}`,'Content-Type':'application/json'},body:JSON.stringify({email:u.email,amount:amountMinor,reference:ref,callback_url:`${process.env.NEXT_PUBLIC_APP_URL}/dashboard/wallet`,metadata:{purpose:'wallet_topup',userId:u.uid}})});const result=await response.json();if(!response.ok||!result.status)throw Object.assign(new Error('Unable to initialize Paystack payment'),{status:502});return Response.json({reference:ref,authorizationUrl:result.data.authorization_url})}catch(e){return routeError(e)}}
