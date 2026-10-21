import { getApps, initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";

const config = {
  // Syntactically valid inert values keep static builds deterministic. The UI
  // remains disabled unless the real public configuration is present.
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "demo-api-key",
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || "demo.invalid",
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "nevora-demo",
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || "1:000000000000:web:0000000000000000",
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
};
export const firebaseConfigured = Boolean(process.env.NEXT_PUBLIC_FIREBASE_API_KEY && process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID);
export const firebaseApp = getApps()[0] ?? initializeApp(config);
export const auth = getAuth(firebaseApp);
