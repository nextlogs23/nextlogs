import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "./firebase-admin";
import { vtuProvider } from "./providers";
import { finalizePurchaseRefund } from "./wallet";

export async function reconcileVtu(reference: string, expectedUid?: string) {
  const db = adminDb();
  const transactionRef = db.collection("transactions").doc(reference);
  const snapshot = await transactionRef.get();
  if (!snapshot.exists) throw Object.assign(new Error("Transaction not found"), { status: 404 });
  const transaction = snapshot.data()!;
  if (expectedUid && transaction.userId !== expectedUid) throw Object.assign(new Error("Transaction not found"), { status: 404 });
  if (!(["airtime", "data", "electricity", "cable"].includes(transaction.serviceType)) || transaction.provider !== "vtugate") throw Object.assign(new Error("Not a VTUGATE transaction"), { status: 400 });
  if (["successful", "refunded"].includes(transaction.status)) return { reference, status: transaction.status, token: transaction.token || undefined, units: transaction.units || undefined, providerStatus: transaction.providerStatus };

  const result = await vtuProvider().requery(reference, transaction.providerReference);
  const collection = `${transaction.serviceType}Orders`;
  const updates = { status: result.status, providerReference: result.providerReference, providerExternalReference: result.externalReference || null, providerStatus: result.rawStatus, providerCode: result.rawCode || null, ...(result.token ? { token: result.token } : {}), ...(result.units ? { units: result.units } : {}), ...(result.customerName ? { customerName: result.customerName } : {}), ...(result.customerAddress ? { customerAddress: result.customerAddress } : {}), ...(result.paymentUsedFor ? { paymentUsedFor: result.paymentUsedFor } : {}), ...(result.debtBefore !== undefined ? { debtBefore: result.debtBefore } : {}), ...(result.debtRemaining !== undefined ? { debtRemaining: result.debtRemaining } : {}), updatedAt: FieldValue.serverTimestamp() };
  await Promise.all([transactionRef.set(updates, { merge: true }), db.collection(collection).doc(reference).set(updates, { merge: true })]);
  if (result.status === "failed") await finalizePurchaseRefund({ uid: transaction.userId, purchaseReference: reference, refundReference: `refund_${reference}`, amountMinor: transaction.retailPriceMinor || transaction.amountMinor, description: `Refund for confirmed failed ${transaction.serviceType}`, providerReference: result.providerReference, providerOrderCollection: collection, providerOrderStatus: "refunded", providerOrderUpdates: updates });
  return { reference, status: result.status === "failed" ? "refunded" : result.status, token: result.token, units: result.units, providerStatus: result.rawStatus };
}
