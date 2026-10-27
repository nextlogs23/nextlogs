import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "./firebase-admin";
import { vtuProvider } from "./providers";
import { finalizePurchaseRefund } from "./wallet";

export async function reconcileVtpass(reference: string, expectedUid?: string) {
  const db = adminDb(); const transactionRef = db.collection("transactions").doc(reference); const snapshot = await transactionRef.get();
  if (!snapshot.exists) throw Object.assign(new Error("Transaction not found"), { status: 404 });
  const transaction = snapshot.data()!; if (expectedUid && transaction.userId !== expectedUid) throw Object.assign(new Error("Transaction not found"), { status: 404 });
  if (!["airtime", "data", "electricity"].includes(transaction.serviceType)) throw Object.assign(new Error("Not a VTpass transaction"), { status: 400 });
  if (["successful", "refunded"].includes(transaction.status)) return { reference, status: transaction.status, token: transaction.token || undefined, providerStatus: transaction.providerStatus };
  const result = await vtuProvider().requery(reference); const collection = `${transaction.serviceType}Orders`; const updates = { status: result.status, providerReference: result.providerReference, providerStatus: result.rawStatus, providerCode: result.rawCode || null, ...(result.token ? { token: result.token } : {}), updatedAt: FieldValue.serverTimestamp() };
  await Promise.all([transactionRef.set(updates, { merge: true }), db.collection(collection).doc(reference).set(updates, { merge: true })]);
  if (result.status === "failed") await finalizePurchaseRefund({ uid: transaction.userId, purchaseReference: reference, refundReference: `refund_${reference}`, amountMinor: transaction.retailPriceMinor || transaction.amountMinor, description: `Refund for confirmed failed ${transaction.serviceType}`, providerReference: result.providerReference, providerOrderCollection: collection, providerOrderStatus: "refunded", providerOrderUpdates: updates });
  return { reference, status: result.status === "failed" ? "refunded" : result.status, token: result.token, providerStatus: result.rawStatus };
}
