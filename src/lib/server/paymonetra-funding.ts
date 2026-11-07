import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "./firebase-admin";
import { getPaymonetraPayment, paymonetraMode } from "./paymonetra";
import { applyWalletEntry } from "./wallet";

type FundingIntent = {
  reference: string;
  userId: string;
  amountMinor: number;
  providerReference?: string | null;
  status?: string;
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
  const valid = payment.reference === input.providerReference
    && payment.merchant_reference === intent.reference
    && payment.status === "paid"
    && amountRequested === intent.amountMinor
    && actualAmount === intent.amountMinor
    && (input.eventAmountMinor === undefined || input.eventAmountMinor === intent.amountMinor)
    && currency === "NGN"
    && mode === paymonetraMode();

  if (!valid) {
    await intentRef.set({
      status: payment.status === "paid" ? "review_required" : payment.status || "pending",
      verificationFailure: payment.status === "paid" ? "Payment details did not match the wallet funding intent" : null,
      providerStatus: payment.status || null,
      providerAmountMinor: actualAmount,
      verifiedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    if (payment.status === "paid") throw Object.assign(new Error("Payment requires manual review before wallet credit"), { status: 409 });
    return { status: payment.status || "pending", reference: intent.reference, idempotent: false };
  }

  const result = await applyWalletEntry({
    uid: intent.userId,
    reference: `credit_${intent.reference}`,
    amountMinor: intent.amountMinor,
    kind: "deposit",
    description: "Paymonetra wallet funding",
    providerReference: input.providerReference,
  });
  await intentRef.set({ status: "successful", providerStatus: payment.status, verifiedAt: FieldValue.serverTimestamp() }, { merge: true });
  return { status: "successful" as const, reference: intent.reference, idempotent: result.idempotent };
}
