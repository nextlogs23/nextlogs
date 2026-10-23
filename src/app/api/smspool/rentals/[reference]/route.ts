import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { NextRequest } from "next/server";
import { requireUser, routeError } from "@/lib/server/auth";
import { adminDb } from "@/lib/server/firebase-admin";
import { checkSmsPoolRental, refundSmsPoolRental, smsPoolRentalMessages } from "@/lib/server/smspool";
import { applyWalletEntry } from "@/lib/server/wallet";

export async function GET(request: NextRequest, { params }: { params: Promise<{ reference: string }> }) {
  try {
    const user = await requireUser(request); const { reference } = await params; const db = adminDb(); const ref = db.collection("smsPoolRentals").doc(reference); const snapshot = await ref.get(); const rental = snapshot.data();
    if (!snapshot.exists || rental?.userId !== user.uid) return Response.json({ error: "Rental not found" }, { status: 404 }); if (!rental.providerReference) return Response.json({ reference, number: rental.phoneNumber || null, status: rental.status, messages: [] });
    const [live, inbox] = await Promise.all([checkSmsPoolRental(rental.providerReference), smsPoolRentalMessages(rental.providerReference)]); const expiry = live.status?.expiry; const status = expiry && expiry * 1000 <= Date.now() ? "expired" : live.status?.available === 1 ? "active" : "processing";
    const messages = (inbox.messages || []).map((message) => ({ id: String(message.ID || `${message.timestamp}-${message.sender}`), text: message.message || "", from: message.sender || "Unknown sender", receivedAt: message.timestamp || new Date().toISOString() }));
    await ref.set({ status, phoneNumber: live.status?.phonenumber || rental.phoneNumber || null, messages, expiresAt: expiry ? Timestamp.fromMillis(expiry * 1000) : rental.expiresAt, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    return Response.json({ reference, number: live.status?.phonenumber || rental.phoneNumber || null, status, expiresAt: expiry ? new Date(expiry * 1000).toISOString() : null, messages });
  } catch (error) { return routeError(error); }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ reference: string }> }) {
  try {
    const user = await requireUser(request); const { reference } = await params; const db = adminDb(); const ref = db.collection("smsPoolRentals").doc(reference); const snapshot = await ref.get(); const rental = snapshot.data();
    if (!snapshot.exists || rental?.userId !== user.uid) return Response.json({ error: "Rental not found" }, { status: 404 }); if (!rental.refundable || !rental.providerReference) throw Object.assign(new Error("This rental is not eligible for a provider refund"), { status: 409 });
    const result = await refundSmsPoolRental(rental.providerReference); if (result.success !== 1) throw Object.assign(new Error("SMSPool did not confirm this refund"), { status: 409 });
    await applyWalletEntry({ uid: user.uid, reference: `${reference}-REFUND`, amountMinor: rental.retailPriceMinor, kind: "refund", description: "SMSPool rental refund", providerReference: rental.providerReference });
    await Promise.all([ref.set({ status: "refunded", updatedAt: FieldValue.serverTimestamp() }, { merge: true }), db.collection("transactions").doc(reference).set({ status: "refunded", updatedAt: FieldValue.serverTimestamp() }, { merge: true })]); return Response.json({ reference, status: "refunded" });
  } catch (error) { return routeError(error); }
}
