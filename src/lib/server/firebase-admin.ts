import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";

function app(){
  if(getApps()[0]) return getApps()[0];
  const projectId=process.env.FIREBASE_ADMIN_PROJECT_ID;
  const clientEmail=process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
  const privateKey=process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g,'\n');
  if(!projectId||!clientEmail||!privateKey) throw new Error('Firebase Admin is not configured');
  const storageBucket = process.env.FIREBASE_STORAGE_BUCKET || process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;
  return initializeApp({credential:cert({projectId,clientEmail,privateKey}),storageBucket});
}
export const adminDb=()=>getFirestore(app());
export const adminAuth=()=>getAuth(app());
export const adminStorage=()=>getStorage(app());
