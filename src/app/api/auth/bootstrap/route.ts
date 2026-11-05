import { FieldValue } from "firebase-admin/firestore";
import { NextRequest } from "next/server";
import { z } from "zod";
import { requireFirebaseUser, routeError } from "@/lib/server/auth";
import { adminDb } from "@/lib/server/firebase-admin";

const schema = z.object({
  displayName: z.string().trim().min(2).max(100),
  phone: z.string().trim().min(7).max(20),
});

function normalizedCustomerRole(value: unknown) {
  return typeof value !== "string" || value.trim().toLowerCase() === "customer";
}

export async function POST(req: NextRequest) {
  try {
    // Registration must authenticate the Firebase token before a Firestore
    // profile exists. Requiring a profile here would create a circular check.
    const user = await requireFirebaseUser(req);
    const body = schema.parse(await req.json());
    const db = adminDb();

    await db.runTransaction(async (transaction) => {
      const profileRef = db.collection("users").doc(user.uid);
      const walletRef = db.collection("wallets").doc(user.uid);
      const profileSnapshot = await transaction.get(profileRef);
      const walletSnapshot = await transaction.get(walletRef);

      if (!profileSnapshot.exists) {
        transaction.create(profileRef, {
          uid: user.uid,
          email: user.email,
          ...body,
          role: "customer",
          status: "active",
          totalTransactions: 0,
          totalSpentMinor: 0,
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        });
      } else if (normalizedCustomerRole(profileSnapshot.data()?.role)) {
        transaction.set(profileRef, { displayName: body.displayName, phone: body.phone, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      }

      if (!walletSnapshot.exists) {
        transaction.create(walletRef, {
          userId: user.uid,
          balanceMinor: 0,
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        });
      }
    });

    return Response.json({ ok: true });
  } catch (error) {
    return routeError(error);
  }
}
