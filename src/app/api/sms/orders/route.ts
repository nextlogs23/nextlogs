import { NextRequest } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { z } from "zod";
import { requireUser, routeError } from "@/lib/server/auth";
import { adminDb } from "@/lib/server/firebase-admin";
import { smsProvider } from "@/lib/server/providers";
import { reservePurchase } from "@/lib/server/wallet";
import { enforceRateLimit } from "@/lib/server/rate-limit";
import { reference } from "@/lib/server/references";
const schema=z.object({country:z.string().length(2).transform(v=>v.toUpperCase()),service:z.string().min(1).max(100),priceMinor:z.number().int().positive()});
export async function POST(req:NextRequest){try{const u=await requireUser(req);await enforceRateLimit(`sms_buy_${u.uid}`,5,24*60*60*1000);const body=schema.parse(await req.json());const live=await smsProvider().listServices(body.country);const offer=live.find(x=>x.id===body.service);if(!offer)throw Object.assign(new Error('Service is unavailable'),{status:409});const pricing=await adminDb().collection('servicePricing').doc(`sms_${body.country}_${body.service}`).get();const retail=pricing.data()?.retailPriceMinor;if(!Number.isSafeInteger(retail)||retail<=0)throw Object.assign(new Error('Retail price is not configured'),{status:503});if(body.priceMinor!==retail)throw Object.assign(new Error('Price changed. Please refresh and confirm again.'),{status:409});const ref=reference('NVR-SMS');await reservePurchase({uid:u.uid,reference:ref,amountMinor:retail,service:'sms',metadata:{country:body.country,service:body.service}});const result=await smsProvider().purchase({country:body.country,service:body.service,reference:ref});await adminDb().collection('smsOrders').doc(ref).create({reference:ref,userId:u.uid,country:body.country,service:body.service,number:result.number,providerReference:result.providerReference,status:'waiting',expiresAt:result.expiresAt,retailPriceMinor:retail,providerCostMinor:offer.costMinor,createdAt:FieldValue.serverTimestamp()});return Response.json({reference:ref,number:result.number,status:'waiting',expiresAt:result.expiresAt})}catch(e){return routeError(e)}}
