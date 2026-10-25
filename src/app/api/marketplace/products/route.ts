import { NextRequest } from "next/server";
import { requireUser, routeError } from "@/lib/server/auth";
import { adminDb } from "@/lib/server/firebase-admin";
import { publicMarketplaceProduct } from "@/lib/server/marketplace";

export async function GET(request: NextRequest) {
  try {
    await requireUser(request);
    const snapshot = await adminDb().collection("marketplaceProducts").where("active", "==", true).limit(100).get();
    const products = snapshot.docs
      .map((doc) => publicMarketplaceProduct(doc.id, doc.data()))
      .filter((product) => Number.isSafeInteger(product.priceMinor) && Number(product.priceMinor) > 0 && Number(product.stock) > 0)
      .sort((a, b) => Number(b.featured) - Number(a.featured) || a.title.localeCompare(b.title));
    return Response.json({ products });
  } catch (error) { return routeError(error); }
}
