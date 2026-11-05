import { FieldValue } from "firebase-admin/firestore";
import { NextRequest } from "next/server";
import { adminAuth, adminDb } from "./firebase-admin";

export type FirebasePrincipal = { uid: string; email: string; displayName: string };
export type Principal = FirebasePrincipal & { role: "customer" | "admin" };

function normalizedRole(value: unknown) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

export async function requireFirebaseUser(req: NextRequest): Promise<FirebasePrincipal> {
  const header = req.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) throw Object.assign(new Error("Authentication required"), { status: 401 });
  const decoded = await adminAuth().verifyIdToken(header.slice(7), true);
  return {
    uid: decoded.uid,
    email: decoded.email || "",
    displayName: typeof decoded.name === "string" ? decoded.name.trim() : "",
  };
}

async function ensureCustomerAccount(identity: FirebasePrincipal) {
  const db = adminDb();
  const profileRef = db.collection("users").doc(identity.uid);
  const walletRef = db.collection("wallets").doc(identity.uid);
  const [currentProfile, currentWallet] = await Promise.all([profileRef.get(), walletRef.get()]);

  // Existing accounts stay on the fast path. The transaction below is only
  // used to repair registration records that were never fully bootstrapped.
  if (currentProfile.exists && currentWallet.exists) return currentProfile.data();

  return db.runTransaction(async (transaction) => {
    const profileSnapshot = await transaction.get(profileRef);
    const walletSnapshot = await transaction.get(walletRef);

    if (!profileSnapshot.exists) {
      transaction.create(profileRef, {
        uid: identity.uid,
        email: identity.email,
        displayName: identity.displayName || identity.email.split("@")[0] || "Nextlogs user",
        phone: "",
        role: "customer",
        status: "active",
        totalTransactions: 0,
        totalSpentMinor: 0,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
    }
    if (!walletSnapshot.exists) {
      transaction.create(walletRef, {
        userId: identity.uid,
        balanceMinor: 0,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
    }

    return profileSnapshot.exists ? profileSnapshot.data() : { role: "customer", status: "active" };
  });
}

export async function requireUser(req: NextRequest): Promise<Principal> {
  const identity = await requireFirebaseUser(req);
  const profile = await ensureCustomerAccount(identity);
  if (profile?.status === "suspended") throw Object.assign(new Error("Account suspended"), { status: 403 });
  return { ...identity, role: normalizedRole(profile?.role) === "admin" ? "admin" : "customer" };
}

export async function requireAdmin(req: NextRequest) {
  const user = await requireUser(req);
  if (user.role !== "admin") throw Object.assign(new Error(`Administrator access required. In Firestore, set the role field on users/${user.uid} to the string value admin.`), { status: 403 });
  return user;
}

export function routeError(error: unknown) {
  const value = error as { message?: string; status?: number };
  return Response.json({ error: value.message || "Unexpected server error" }, { status: value.status || 500 });
}
