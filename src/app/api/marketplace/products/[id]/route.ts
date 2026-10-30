import { NextRequest } from "next/server";
import { requireUser, routeError } from "@/lib/server/auth";
import { adminDb } from "@/lib/server/firebase-admin";
import { publicMarketplaceProduct } from "@/lib/server/marketplace";

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    await requireUser(request);
    const { id } = await context.params;
    if (!/^[A-Za-z0-9_-]{1,160}$/.test(id)) throw Object.assign(new Error("Product not found"), { status: 404 });
    const snapshot = await adminDb().collection("marketplaceProducts").doc(id).get();
    const data = snapshot.data();
    if (!snapshot.exists || !data?.active || data.archivedAt) throw Object.assign(new Error("Product not found"), { status: 404 });
    return Response.json({ product: publicMarketplaceProduct(snapshot.id, data) });
  } catch (error) { return routeError(error); }
}
