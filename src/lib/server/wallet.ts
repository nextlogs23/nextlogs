import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "./firebase-admin";

export type LedgerKind = "deposit" | "purchase" | "refund" | "adjustment";

type ProviderOrderReservation = {
  collection: string;
  data: Record<string, unknown>;
};

function assertPositiveMinorUnits(value: number) {
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error("Invalid wallet amount");
}

export async function applyWalletEntry(input: {
  uid: string;
  reference: string;
  amountMinor: number;
  kind: LedgerKind;
  description: string;
  providerReference?: string;
  actorUid?: string;
  reason?: string;
}) {
  if (!Number.isSafeInteger(input.amountMinor) || input.amountMinor === 0) throw new Error("Invalid wallet amount");
  const db = adminDb();
  const wallet = db.collection("wallets").doc(input.uid);
  const entry = db.collection("walletTransactions").doc(input.reference);
  return db.runTransaction(async (tx) => {
    const [walletSnapshot, entrySnapshot] = await Promise.all([tx.get(wallet), tx.get(entry)]);
    if (entrySnapshot.exists) return { idempotent: true, balanceMinor: walletSnapshot.data()?.balanceMinor ?? 0 };
    const current = walletSnapshot.data()?.balanceMinor ?? 0;
    const next = current + input.amountMinor;
    if (next < 0) throw Object.assign(new Error("Insufficient wallet balance"), { status: 409 });
    tx.set(wallet, { userId: input.uid, balanceMinor: next, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    tx.create(entry, { ...input, balanceAfterMinor: next, status: "successful", createdAt: FieldValue.serverTimestamp() });
    return { idempotent: false, balanceMinor: next };
  });
}

export async function reservePurchase(input: {
  uid: string;
  reference: string;
  amountMinor: number;
  service: string;
  metadata: Record<string, unknown>;
  providerOrder?: ProviderOrderReservation;
}) {
  assertPositiveMinorUnits(input.amountMinor);
  const db = adminDb();
  const wallet = db.collection("wallets").doc(input.uid);
  const entry = db.collection("walletTransactions").doc(input.reference);
  const order = db.collection("transactions").doc(input.reference);
  const providerOrder = input.providerOrder ? db.collection(input.providerOrder.collection).doc(input.reference) : null;
  return db.runTransaction(async (tx) => {
    const [walletSnapshot, entrySnapshot] = await Promise.all([tx.get(wallet), tx.get(entry)]);
    const providerOrderSnapshot = providerOrder ? await tx.get(providerOrder) : null;
    if (entrySnapshot.exists) {
      if (providerOrder && providerOrderSnapshot && !providerOrderSnapshot.exists) tx.create(providerOrder, { ...input.providerOrder!.data, reference: input.reference });
      return { idempotent: true, balanceMinor: walletSnapshot.data()?.balanceMinor ?? 0 };
    }
    const current = walletSnapshot.data()?.balanceMinor ?? 0;
    if (!Number.isSafeInteger(current) || current < input.amountMinor) throw Object.assign(new Error("Insufficient wallet balance"), { status: 409 });
    const next = current - input.amountMinor;
    tx.set(wallet, { userId: input.uid, balanceMinor: next, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    tx.create(entry, { userId: input.uid, reference: input.reference, amountMinor: -input.amountMinor, kind: "purchase", description: `${input.service} purchase`, balanceAfterMinor: next, status: "successful", createdAt: FieldValue.serverTimestamp() });
    tx.create(order, { reference: input.reference, userId: input.uid, serviceType: input.service, amountMinor: input.amountMinor, retailPriceMinor: input.amountMinor, providerCostMinor: null, status: "processing", metadata: input.metadata, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
    if (providerOrder) tx.create(providerOrder, { ...input.providerOrder!.data, reference: input.reference });
    return { idempotent: false, balanceMinor: next };
  });
}

export async function finalizePurchaseRefund(input: {
  uid: string;
  purchaseReference: string;
  refundReference: string;
  amountMinor: number;
  description: string;
  providerReference?: string;
  providerOrderCollection: string;
  providerOrderStatus: "failed" | "cancelled" | "refunded";
  providerOrderUpdates?: Record<string, unknown>;
}) {
  assertPositiveMinorUnits(input.amountMinor);
  const db = adminDb();
  const wallet = db.collection("wallets").doc(input.uid);
  const purchaseEntry = db.collection("walletTransactions").doc(input.purchaseReference);
  const refundEntry = db.collection("walletTransactions").doc(input.refundReference);
  const transaction = db.collection("transactions").doc(input.purchaseReference);
  const providerOrder = db.collection(input.providerOrderCollection).doc(input.purchaseReference);
  return db.runTransaction(async (tx) => {
    const [walletSnapshot, purchaseSnapshot, refundSnapshot] = await Promise.all([tx.get(wallet), tx.get(purchaseEntry), tx.get(refundEntry)]);
    const purchase = purchaseSnapshot.data();
    if (!purchaseSnapshot.exists || purchase?.userId !== input.uid || purchase?.amountMinor !== -input.amountMinor) throw Object.assign(new Error("Purchase reservation could not be verified"), { status: 409 });
    const current = walletSnapshot.data()?.balanceMinor ?? 0;
    let balanceMinor = current;
    if (!refundSnapshot.exists) {
      if (!Number.isSafeInteger(current)) throw new Error("Invalid wallet balance");
      balanceMinor = current + input.amountMinor;
      if (!Number.isSafeInteger(balanceMinor)) throw new Error("Invalid wallet balance");
      tx.set(wallet, { userId: input.uid, balanceMinor, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      tx.create(refundEntry, { userId: input.uid, reference: input.refundReference, amountMinor: input.amountMinor, kind: "refund", description: input.description, providerReference: input.providerReference || null, balanceAfterMinor: balanceMinor, status: "successful", createdAt: FieldValue.serverTimestamp() });
    }
    tx.set(providerOrder, { status: input.providerOrderStatus, ...(input.providerOrderUpdates || {}), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    tx.set(transaction, { status: "refunded", providerReference: input.providerReference || null, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    return { idempotent: refundSnapshot.exists, balanceMinor };
  });
}
