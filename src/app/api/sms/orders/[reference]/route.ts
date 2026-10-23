import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { NextRequest } from "next/server";
import { requireUser, routeError } from "@/lib/server/auth";
import { adminDb } from "@/lib/server/firebase-admin";
import { normalizeTelnyxError, telnyxClient } from "@/lib/server/telnyx";

function iso(value: unknown) { if (value instanceof Timestamp) return value.toDate().toISOString(); if (value && typeof value === "object" && "toDate" in value) return (value as { toDate(): Date }).toDate().toISOString(); return typeof value === "string" ? value : new Date().toISOString(); }

export async function GET(request: NextRequest, { params }: { params: Promise<{ reference: string }> }) {
  try {
    const user = await requireUser(request); const { reference } = await params; const db = adminDb();
    const orderRef = db.collection("telnyxOrders").doc(reference); const snapshot = await orderRef.get();
    if (!snapshot.exists || snapshot.data()?.userId !== user.uid) return Response.json({ error: "Order not found" }, { status: 404 });
    const order = snapshot.data()!; let status = order.status;
    if (order.providerReference && status === "processing") {
      try {
        const live = (await telnyxClient().numberOrders.retrieve(order.providerReference)).data;
        status = live?.status === "success" ? "active" : live?.status === "failure" ? "failed" : "processing";
        await Promise.all([
          orderRef.set({ status, providerStatus: live?.status || "pending", updatedAt: FieldValue.serverTimestamp() }, { merge: true }),
          db.collection("purchasedNumbers").doc(reference).set({ status, updatedAt: FieldValue.serverTimestamp() }, { merge: true }),
          db.collection("transactions").doc(reference).set({ status: status === "active" ? "successful" : status === "failed" ? "failed" : "processing", updatedAt: FieldValue.serverTimestamp() }, { merge: true }),
        ]);
      } catch (error) { if ((error as { status?: number }).status === 404) throw normalizeTelnyxError(error); }
    }
    const messages = await db.collection("inboundMessages").where("purchasedNumberId", "==", reference).orderBy("receivedAt", "desc").limit(50).get();
    return Response.json({ reference, number: order.phoneNumber, status, messages: messages.docs.map((doc) => { const data = doc.data(); return { id: doc.id, from: data.from || "Unknown sender", text: data.text || "", receivedAt: iso(data.receivedAt) }; }) });
  } catch (error) { return routeError(error); }
}
