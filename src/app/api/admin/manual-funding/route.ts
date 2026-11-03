import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { NextRequest } from "next/server";
import { z } from "zod";
import { requireAdmin, routeError } from "@/lib/server/auth";
import { adminDb } from "@/lib/server/firebase-admin";
import { getManualFundingSettings } from "@/lib/server/manual-funding";

const settingsSchema = z.object({
  action: z.literal("settings"), enabled: z.boolean(), bankName: z.string().trim().min(2).max(80),
  accountName: z.string().trim().min(2).max(100), accountNumber: z.string().trim().regex(/^\d{6,20}$/, "Enter a valid account number"),
  instructions: z.string().trim().min(10).max(500), minimumAmountMinor: z.number().int().min(10000).max(100_000_000_00),
});
const reviewSchema = z.object({
  action: z.enum(["approve", "reject"]), reference: z.string().regex(/^NXL-BANK-[A-F0-9]{24}$/), reason: z.string().trim().min(8).max(300),
});
const actionSchema = z.discriminatedUnion("action", [settingsSchema, reviewSchema]);
const iso = (value: unknown) => value instanceof Timestamp ? value.toDate().toISOString() : null;

export async function GET(request: NextRequest) {
  try {
    await requireAdmin(request); const db = adminDb();
    const [settings, requests] = await Promise.all([getManualFundingSettings(), db.collection("manualFundingRequests").orderBy("createdAt", "desc").limit(100).get()]);
    return Response.json({
      settings,
      requests: requests.docs.map((doc) => { const data = doc.data(); return { reference: doc.id, userId: data.userId, userEmail: data.userEmail || null, amountMinor: data.amountMinor, depositorName: data.depositorName, transferReference: data.transferReference || null, proofFileName: data.proof?.fileName || "Payment proof", status: data.status, createdAt: iso(data.createdAt), reviewedAt: iso(data.reviewedAt), reviewReason: data.reviewReason || null }; }),
    });
  } catch (error) { return routeError(error); }
}

export async function PATCH(request: NextRequest) {
  try {
    const admin = await requireAdmin(request); const input = actionSchema.parse(await request.json()); const db = adminDb();
    if (input.action === "settings") {
      const settings = { enabled: input.enabled, bankName: input.bankName, accountName: input.accountName, accountNumber: input.accountNumber, instructions: input.instructions, minimumAmountMinor: input.minimumAmountMinor };
      const batch = db.batch();
      batch.set(db.collection("platformSettings").doc("manualFunding"), { ...settings, updatedBy: admin.uid, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      batch.create(db.collection("adminAuditLogs").doc(), { actorUid: admin.uid, action: "manual_funding_settings_update", target: "platformSettings/manualFunding", reason: "Bank-transfer account details updated", changes: { ...settings, accountNumber: `••••${settings.accountNumber.slice(-4)}` }, createdAt: FieldValue.serverTimestamp() });
      await batch.commit(); return Response.json({ updated: true, settings });
    }

    const requestRef = db.collection("manualFundingRequests").doc(input.reference); const auditRef = db.collection("adminAuditLogs").doc();
    if (input.action === "reject") {
      await db.runTransaction(async (transaction) => {
        const snapshot = await transaction.get(requestRef);
        if (!snapshot.exists) throw Object.assign(new Error("Funding request not found"), { status: 404 });
        if (snapshot.data()?.status !== "pending") throw Object.assign(new Error("Only pending requests can be rejected"), { status: 409 });
        transaction.update(requestRef, { status: "rejected", reviewReason: input.reason, reviewedBy: admin.uid, reviewedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
        transaction.create(auditRef, { actorUid: admin.uid, action: "manual_funding_rejected", target: input.reference, reason: input.reason, userId: snapshot.data()?.userId, amountMinor: snapshot.data()?.amountMinor, createdAt: FieldValue.serverTimestamp() });
      });
      return Response.json({ updated: true, status: "rejected" });
    }

    await db.runTransaction(async (transaction) => {
      const requestSnapshot = await transaction.get(requestRef); const funding = requestSnapshot.data();
      if (!requestSnapshot.exists) throw Object.assign(new Error("Funding request not found"), { status: 404 });
      if (!funding?.userId || !Number.isSafeInteger(funding.amountMinor) || funding.amountMinor <= 0) throw new Error("Funding request is invalid");
      const walletRef = db.collection("wallets").doc(funding.userId); const ledgerRef = db.collection("walletTransactions").doc(`credit_${input.reference}`);
      const [walletSnapshot, ledgerSnapshot] = await Promise.all([transaction.get(walletRef), transaction.get(ledgerRef)]);
      if (funding.status === "approved" && ledgerSnapshot.exists) return;
      if (funding.status !== "pending") throw Object.assign(new Error("Only pending requests can be approved"), { status: 409 });
      const current = walletSnapshot.data()?.balanceMinor ?? 0; const next = current + funding.amountMinor;
      if (!Number.isSafeInteger(current) || !Number.isSafeInteger(next)) throw new Error("Wallet balance is invalid");
      transaction.set(walletRef, { userId: funding.userId, balanceMinor: next, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      transaction.create(ledgerRef, { userId: funding.userId, reference: `credit_${input.reference}`, amountMinor: funding.amountMinor, kind: "deposit", description: "Approved bank-transfer wallet funding", providerReference: input.reference, balanceAfterMinor: next, status: "successful", actorUid: admin.uid, reason: input.reason, createdAt: FieldValue.serverTimestamp() });
      transaction.update(requestRef, { status: "approved", reviewReason: input.reason, walletCreditReference: `credit_${input.reference}`, reviewedBy: admin.uid, reviewedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
      transaction.create(auditRef, { actorUid: admin.uid, action: "manual_funding_approved", target: input.reference, reason: input.reason, userId: funding.userId, amountMinor: funding.amountMinor, createdAt: FieldValue.serverTimestamp() });
    });
    return Response.json({ updated: true, status: "approved" });
  } catch (error) {
    if (error instanceof z.ZodError) return routeError(Object.assign(new Error(error.issues[0]?.message || "Check the funding settings"), { status: 400 }));
    return routeError(error);
  }
}
