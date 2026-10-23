import { NextRequest } from "next/server";
import { adminAuth, adminDb } from "./firebase-admin";

export type Principal={uid:string;email:string;role:'customer'|'admin'};
export async function requireUser(req:NextRequest):Promise<Principal>{
 const header=req.headers.get('authorization');
 if(!header?.startsWith('Bearer ')) throw Object.assign(new Error('Authentication required'),{status:401});
 const decoded=await adminAuth().verifyIdToken(header.slice(7),true);
 const profile=await adminDb().collection('users').doc(decoded.uid).get();
 if(!profile.exists) throw Object.assign(new Error('User profile not found'),{status:403});
 if(profile.data()?.status==='suspended') throw Object.assign(new Error('Account suspended'),{status:403});
 return {uid:decoded.uid,email:decoded.email||'',role:profile.data()?.role==='admin'?'admin':'customer'};
}
export async function requireAdmin(req:NextRequest){const user=await requireUser(req);if(user.role!=='admin')throw Object.assign(new Error('Administrator access required'),{status:403});return user}
export function routeError(error:unknown){const e=error as {message?:string;status?:number};return Response.json({error:e.message||'Unexpected server error'},{status:e.status||500})}
