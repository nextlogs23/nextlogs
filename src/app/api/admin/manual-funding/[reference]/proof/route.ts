import { get } from "@vercel/blob";
import { NextRequest } from "next/server";
import { requireAdmin, routeError } from "@/lib/server/auth";
import { adminDb } from "@/lib/server/firebase-admin";

export const runtime = "nodejs";
const blobStoreId = process.env.NEXTLOGS_NEW_STORE_ID || process.env.BLOB_STORE_ID;

export async function GET(request: NextRequest, context: { params: Promise<{ reference: string }> }) {
  try {
    await requireAdmin(request); const { reference } = await context.params;
    if (!/^NXL-BANK-[A-F0-9]{24}$/.test(reference)) throw Object.assign(new Error("Payment proof not found"), { status: 404 });
    const snapshot = await adminDb().collection("manualFundingRequests").doc(reference).get(); const data = snapshot.data();
    const proof = data?.proof;
    if (!snapshot.exists || !proof?.pathname || !String(proof.pathname).startsWith("wallet/payment-proofs/")) throw Object.assign(new Error("Payment proof not found"), { status: 404 });
    const result = await get(proof.pathname, { access: "private", storeId: blobStoreId });
    if (!result || result.statusCode !== 200) throw Object.assign(new Error("Payment proof not found"), { status: 404 });
    return new Response(result.stream, { headers: { "Content-Type": result.blob.contentType || proof.contentType || "image/jpeg", "Content-Disposition": `inline; filename="payment-proof-${reference}.jpg"`, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
  } catch (error) { return routeError(error); }
}
