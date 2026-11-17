import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "./firebase-admin";
import { confirmPocketFiPayment } from "./pocketfi";
import { applyWalletEntry } from "./wallet";

type FundingIntent = {
  reference: string;
  userId: string;
  amountMinor: number;
  provider?: string;
  providerReference?: string | null;
  status?: string;
  createdAt?: { toMillis?: () => number } | null;
};

function nairaAsMinor(value: unknown) {
  const amount = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(amount) || amount < 0) return null;
  const minor = Math.round(amount * 100);
  return Number.isSafeInteger(minor) ? minor : null;
}

function payloadOf(payment: Record<string, unknown>) {
  const data = payment.data;
  return data && typeof data === "object" ? { ...payment, ...(data as Record<string, unknown>) } : payment;
}

function statusOf(payment: Record<string, unknown>) {
  return String(payment.status || payment.payment_status || payment.transaction_status || "pending").toLowerCase();
}

function isSuccessful(status: string) {
  return ["success", "successful", "paid", "completed", "complete"].includes(status);
}

export async function settlePocketFiFunding(input: { providerReference: string; expectedUserId?: string }) {
  const db = adminDb();
  const match = await db.collection("walletFundingIntents").where("providerReference", "==", input.providerReference).limit(1).get();
  if (match.empty) throw Object.assign(new Error("Unknown payment reference"), { status: 404 });

  const intentRef = match.docs[0].ref;
  const intent = match.docs[0].data() as FundingIntent;
  if (input.expectedUserId && intent.userId !== input.expectedUserId) throw Object.assign(new Error("Payment not found"), { status: 404 });
  if (intent.provider !== "pocketfi") throw Object.assign(new Error("Payment belongs to a legacy provider"), { status: 409 });
  if (intent.status === "successful") return { status: "successful" as const, reference: intent.reference, idempotent: true };

  const raw = await confirmPocketFiPayment(input.providerReference) as Record<string, unknown>;
  const payment = payloadOf(raw);
  const providerStatus = statusOf(payment);
  const providerPaymentId = String(payment.payment_id || payment.id || input.providerReference);
  const actualAmount = nairaAsMinor(payment.amount || payment.amount_paid || payment.paid_amount || payment.total);
  const currency = String(payment.currency || "NGN").toUpperCase();
  const valid = providerPaymentId === input.providerReference
    && isSuccessful(providerStatus)
    && actualAmount !== null
    && actualAmount === intent.amountMinor
    && currency === "NGN";

  if (!valid) {
    await intentRef.set({
      status: isSuccessful(providerStatus) ? "review_required" : providerStatus,
      verificationFailure: isSuccessful(providerStatus) ? "Payment details did not match the wallet funding intent" : null,
      providerStatus,
      providerAmountMinor: actualAmount,
      providerCurrency: currency,
      verifiedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    if (isSuccessful(providerStatus)) throw Object.assign(new Error("Payment requires manual review before wallet credit"), { status: 409 });
    return { status: providerStatus, reference: intent.reference, idempotent: false };
  }

  const result = await applyWalletEntry({
    uid: intent.userId,
    reference: `credit_${intent.reference}`,
    amountMinor: intent.amountMinor,
    kind: "deposit",
    description: "PocketFi wallet funding",
    providerReference: input.providerReference,
  });
  await intentRef.set({
    status: "successful",
    providerStatus,
    providerAmountMinor: actualAmount,
    providerCurrency: currency,
    verificationFailure: FieldValue.delete(),
    verifiedAt: FieldValue.serverTimestamp(),
  }, { merge: true });
  return { status: "successful" as const, reference: intent.reference, idempotent: result.idempotent };
}

export async function reconcilePocketFiFundingsForUser(uid: string) {
  const snapshot = await adminDb().collection("walletFundingIntents").where("userId", "==", uid).limit(100).get();
  const candidates = snapshot.docs
    .map((doc) => doc.data() as FundingIntent)
    .filter((intent) => intent.provider === "pocketfi" && intent.providerReference && intent.status !== "successful")
    .sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0))
    .slice(0, 5);
  const outcomes = await Promise.all(candidates.map(async (intent) => {
    try {
      const result = await settlePocketFiFunding({ providerReference: intent.providerReference!, expectedUserId: uid });
      if (result.status === "successful" && !result.idempotent) return "credited" as const;
      if (result.status !== "successful") return "pending" as const;
      return "unchanged" as const;
    } catch (error) {
      return (error as { status?: number }).status === 409 ? "review_required" as const : "pending" as const;
    }
  }));
  return {
    checked: candidates.length,
    credited: outcomes.filter((outcome) => outcome === "credited").length,
    pending: outcomes.filter((outcome) => outcome === "pending").length,
    reviewRequired: outcomes.filter((outcome) => outcome === "review_required").length,
  };
}
