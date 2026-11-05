import { FieldValue } from "firebase-admin/firestore";
import { NextRequest } from "next/server";
import { requireUser, routeError } from "@/lib/server/auth";
import { bloomLongRentals, bloomRentalMessages } from "@/lib/server/bloomsms";
import { adminDb } from "@/lib/server/firebase-admin";
import { enforceRateLimit } from "@/lib/server/rate-limit";

export async function GET(request: NextRequest, { params }: { params: Promise<{ reference: string }> }) {
  try {
    const user = await requireUser(request); await enforceRateLimit(`bloomsms_rental_status_${user.uid}`, 30, 60 * 1000);
    const { reference } = await params; const db = adminDb(); const ref = db.collection("bloomSmsRentals").doc(reference); const snapshot = await ref.get(); const rental = snapshot.data();
    if (!snapshot.exists || rental?.userId !== user.uid) return Response.json({ error: "Rental not found" }, { status: 404 });
    if (!rental.providerReference) return Response.json({ reference, number: rental.phoneNumber || null, status: rental.status, messages: [] });
    const [list, inbox] = await Promise.all([bloomLongRentals(), bloomRentalMessages(rental.providerReference)]);
    const live = (list.rentals || []).find((item) => String(item.id) === String(rental.providerReference));
    const status = live?.status || rental.status || "processing";
    const messages = (inbox.messages || []).map((message, index) => ({ id: `${rental.providerReference}-${message.received_at || index}`, text: message.text || "", from: message.sender || "Unknown sender", receivedAt: message.received_at || new Date().toISOString() }));
    await Promise.all([
      ref.set({ status, phoneNumber: live?.phone_number || inbox.phone_number || rental.phoneNumber || null, messages, updatedAt: FieldValue.serverTimestamp() }, { merge: true }),
      db.collection("transactions").doc(reference).set({ status: status === "active" ? "successful" : status === "cancelled" || status === "expired" ? "failed" : "processing", updatedAt: FieldValue.serverTimestamp() }, { merge: true }),
    ]);
    return Response.json({ reference, number: live?.phone_number || inbox.phone_number || rental.phoneNumber || null, status, expiresAt: rental.expiresAt?.toDate?.().toISOString?.() || null, messages });
  } catch (error) { return routeError(error); }
}
