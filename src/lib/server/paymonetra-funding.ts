import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "./firebase-admin";
import { getPaymonetraPayment, paymonetraMode } from "./paymonetra";
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

export async function settlePaymonetraFunding(input: {
  providerReference: string;
  eventAmountMinor?: number;
  eventCurrency?: string;
  eventMode?: string;
  expectedUserId?: string;
}) {
  const db = adminDb();
  const match = await db.collection("walletFundingIntents").where("providerReference", "==", input.providerReference).limit(1).get();
  if (match.empty) throw Object.assign(new Error("Unknown payment reference"), { status: 404 });

  const intentRef = match.docs[0].ref;
  const intent = match.docs[0].data() as FundingIntent;
  if (input.expectedUserId && intent.userId !== input.expectedUserId) throw Object.assign(new Error("Payment not found"), { status: 404 });
  if (intent.status === "successful") return { status: "successful" as const, reference: intent.reference, idempotent: true };

  const payment = await getPaymonetraPayment(input.providerReference);
  const amountRequested = nairaAsMinor(payment.amount_requested ?? payment.amount);
  const actualAmount = nairaAsMinor(payment.amount);
  const currency = String(payment.currency || input.eventCurrency || "NGN").toUpperCase();
  const mode = String(payment.mode || input.eventMode || paymonetraMode()).toLowerCase();
  const providerStatus = String(payment.status || "pending").toLowerCase();
  const eventAmountMatchesProvider = input.eventAmountMinor === undefined
    || (actualAmount !== null && input.eventAmountMinor === actualAmount);
  const valid = payment.reference === input.providerReference
    && payment.merchant_reference === intent.reference
    && providerStatus === "paid"
    && amountRequested === intent.amountMinor
    && actualAmount !== null
    && eventAmountMatchesProvider
    && currency === "NGN"
    && mode === paymonetraMode();

  if (!valid) {
    await intentRef.set({
      status: providerStatus === "paid" ? "review_required" : providerStatus,
      verificationFailure: providerStatus === "paid" ? "Payment details did not match the wallet funding intent" : null,
      providerStatus,
      providerAmountMinor: actualAmount,
      providerAmountRequestedMinor: amountRequested,
      verifiedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    if (providerStatus === "paid") throw Object.assign(new Error("Payment requires manual review before wallet credit"), { status: 409 });
    return { status: providerStatus, reference: intent.reference, idempotent: false };
  }

  const result = await applyWalletEntry({
    uid: intent.userId,
    reference: `credit_${intent.reference}`,
    amountMinor: intent.amountMinor,
    kind: "deposit",
    description: "Paymonetra wallet funding",
    providerReference: input.providerReference,
  });
  await intentRef.set({
    status: "successful",
    providerStatus,
    providerAmountMinor: actualAmount,
    providerAmountRequestedMinor: amountRequested,
    verificationFailure: FieldValue.delete(),
    verifiedAt: FieldValue.serverTimestamp(),
  }, { merge: true });
  return { status: "successful" as const, reference: intent.reference, idempotent: result.idempotent };
}

export async function reconcilePaymonetraFundingsForUser(uid: string) {
  const snapshot = await adminDb().collection("walletFundingIntents").where("userId", "==", uid).limit(100).get();
  const candidates = snapshot.docs
    .map((doc) => doc.data() as FundingIntent)
    .filter((intent) => intent.provider === "paymonetra" && intent.providerReference && intent.status !== "successful")
    .sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0))
    .slice(0, 5);

  const outcomes = await Promise.all(candidates.map(async (intent) => {
    try {
      const result = await settlePaymonetraFunding({ providerReference: intent.providerReference!, expectedUserId: uid });
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
