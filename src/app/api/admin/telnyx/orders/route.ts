import { Timestamp } from "firebase-admin/firestore";
import { NextRequest } from "next/server";
import { requireAdmin, routeError } from "@/lib/server/auth";
import { adminDb } from "@/lib/server/firebase-admin";

function iso(value: unknown) { if (value instanceof Timestamp) return value.toDate().toISOString(); if (value && typeof value === "object" && "toDate" in value) return (value as { toDate(): Date }).toDate().toISOString(); return null; }
export async function GET(request: NextRequest) {
  try {
    await requireAdmin(request);
    const snapshot = await adminDb().collection("telnyxOrders").orderBy("createdAt", "desc").limit(100).get();
    return Response.json({ orders: snapshot.docs.map((doc) => { const data = doc.data(); return { id: doc.id, reference: data.reference, userId: data.userId, phoneNumber: data.phoneNumber, countryCode: data.countryCode, status: data.status, providerStatus: data.providerStatus || null, retailPriceMinor: data.retailPriceMinor, providerCostMinor: data.providerCostMinor, providerReference: data.providerReference || null, requirementsMet: data.requirementsMet ?? null, createdAt: iso(data.createdAt) }; }) });
  } catch (error) { return routeError(error); }
}
