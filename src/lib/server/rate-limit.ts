import { Timestamp } from "firebase-admin/firestore";
import { adminDb } from "./firebase-admin";

export async function enforceRateLimit(key:string,limit:number,windowMs:number){
 const ref=adminDb().collection('rateLimits').doc(key.replace(/[^a-zA-Z0-9_-]/g,'_'));
 await adminDb().runTransaction(async tx=>{const snap=await tx.get(ref);const now=Date.now();const data=snap.data();const resetAt=data?.resetAt?.toMillis?.()??0;if(!data||resetAt<=now){tx.set(ref,{count:1,resetAt:Timestamp.fromMillis(now+windowMs)});return}if(data.count>=limit)throw Object.assign(new Error('Too many requests. Please try again later.'),{status:429});tx.update(ref,{count:data.count+1})});
}
