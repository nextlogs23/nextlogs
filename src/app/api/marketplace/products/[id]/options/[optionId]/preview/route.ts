import { NextRequest } from "next/server";
import { requireUser, routeError } from "@/lib/server/auth";
import { adminDb } from "@/lib/server/firebase-admin";

const safeId = /^[A-Za-z0-9_-]{1,160}$/;

export async function GET(request: NextRequest, context: { params: Promise<{ id: string; optionId: string }> }) {
  try {
    await requireUser(request);
    const { id, optionId } = await context.params;
    if (!safeId.test(id) || !safeId.test(optionId)) throw Object.assign(new Error("Preview not found"), { status: 404 });

    const snapshot = await adminDb().collection("marketplaceProducts").doc(id).get();
    const product = snapshot.data();
    if (!snapshot.exists || !product?.active || product.archivedAt) throw Object.assign(new Error("This preview is no longer available"), { status: 410 });

    const options = Array.isArray(product.options) ? product.options : [];
    const option = options.find((item) => {
      const value = item && typeof item === "object" ? item as { id?: unknown; active?: unknown } : null;
      return value?.id === optionId && value.active === true;
    }) as { previewUrl?: unknown; purchaseUrl?: unknown } | undefined;
    if (!option) throw Object.assign(new Error("This preview is no longer available because the product option was sold or disabled"), { status: 410 });

    const candidate = typeof option.previewUrl === "string" ? option.previewUrl : typeof option.purchaseUrl === "string" ? option.purchaseUrl : "";
    let previewUrl: URL;
    try { previewUrl = new URL(candidate); }
    catch { throw Object.assign(new Error("Preview not found"), { status: 404 }); }
    if (previewUrl.protocol !== "https:" && previewUrl.protocol !== "http:") throw Object.assign(new Error("Preview not found"), { status: 404 });

    return Response.json({ previewUrl: previewUrl.toString() }, { headers: { "Cache-Control": "private, no-store, max-age=0" } });
  } catch (error) {
    return routeError(error);
  }
}
