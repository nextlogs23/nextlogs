import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "./firebase-admin";

export type LedgerKind='deposit'|'purchase'|'refund'|'adjustment';
export async function applyWalletEntry(input:{uid:string;reference:string;amountMinor:number;kind:LedgerKind;description:string;providerReference?:string;actorUid?:string;reason?:string}){
 if(!Number.isSafeInteger(input.amountMinor)||input.amountMinor===0)throw new Error('Invalid wallet amount');
 const db=adminDb(), wallet=db.collection('wallets').doc(input.uid), entry=db.collection('walletTransactions').doc(input.reference);
 return db.runTransaction(async tx=>{const [w,e]=await Promise.all([tx.get(wallet),tx.get(entry)]);if(e.exists)return {idempotent:true,balanceMinor:w.data()?.balanceMinor??0};const current=w.data()?.balanceMinor??0;const next=current+input.amountMinor;if(next<0)throw Object.assign(new Error('Insufficient wallet balance'),{status:409});tx.set(wallet,{userId:input.uid,balanceMinor:next,updatedAt:FieldValue.serverTimestamp()},{merge:true});tx.create(entry,{...input,balanceAfterMinor:next,status:'successful',createdAt:FieldValue.serverTimestamp()});return {idempotent:false,balanceMinor:next}})
}
export async function reservePurchase(input:{uid:string;reference:string;amountMinor:number;service:string;metadata:Record<string,unknown>}){
 const db=adminDb(),wallet=db.collection('wallets').doc(input.uid),entry=db.collection('walletTransactions').doc(input.reference),order=db.collection('transactions').doc(input.reference);
 return db.runTransaction(async tx=>{const [w,e]=await Promise.all([tx.get(wallet),tx.get(entry)]);if(e.exists)return {idempotent:true,balanceMinor:w.data()?.balanceMinor??0};const current=w.data()?.balanceMinor??0;if(current<input.amountMinor)throw Object.assign(new Error('Insufficient wallet balance'),{status:409});const next=current-input.amountMinor;tx.set(wallet,{userId:input.uid,balanceMinor:next,updatedAt:FieldValue.serverTimestamp()},{merge:true});tx.create(entry,{userId:input.uid,reference:input.reference,amountMinor:-input.amountMinor,kind:'purchase',description:`${input.service} purchase`,balanceAfterMinor:next,status:'successful',createdAt:FieldValue.serverTimestamp()});tx.create(order,{reference:input.reference,userId:input.uid,serviceType:input.service,amountMinor:input.amountMinor,retailPriceMinor:input.amountMinor,providerCostMinor:null,status:'processing',metadata:input.metadata,createdAt:FieldValue.serverTimestamp(),updatedAt:FieldValue.serverTimestamp()});return {idempotent:false,balanceMinor:next}})
}
