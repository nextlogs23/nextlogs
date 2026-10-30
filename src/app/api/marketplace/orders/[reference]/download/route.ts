import { NextRequest } from "next/server";
import { get } from "@vercel/blob";
import { requireUser, routeError } from "@/lib/server/auth";
import { adminDb } from "@/lib/server/firebase-admin";

export const runtime = "nodejs";

function attachmentName(value: unknown) {
  const name = typeof value === "string" ? value : "download";
  return name.normalize("NFKC").replace(/[^a-zA-Z0-9._ -]/g, "").replace(/\s+/g, " ").trim().slice(0, 120) || "download";
}

export async function GET(request: NextRequest, context: { params: Promise<{ reference: string }> }) {
  try {
    const user = await requireUser(request);
    const { reference } = await context.params;
    if (!/^NXL-MKT-[A-Z0-9]{24}$/.test(reference)) throw Object.assign(new Error("Download not found"), { status: 404 });
    const snapshot = await adminDb().collection("marketplaceOrders").doc(reference).get();
    const order = snapshot.data();
    if (!snapshot.exists || order?.userId !== user.uid) throw Object.assign(new Error("Download not found"), { status: 404 });
    if (!["successful", "completed"].includes(order?.status)) throw Object.assign(new Error("This download is not available yet"), { status: 409 });
    const file = order?.downloadFile;
    if (!file || typeof file.pathname !== "string" || !file.pathname.startsWith("marketplace/product-files/")) throw Object.assign(new Error("No downloadable file is attached to this purchase"), { status: 404 });
    const result = await get(file.pathname, { access: "private" });
    if (!result || result.statusCode !== 200) throw Object.assign(new Error("Download not found"), { status: 404 });
    return new Response(result.stream, {
      headers: {
        "Content-Type": result.blob.contentType || (typeof file.contentType === "string" ? file.contentType : "application/octet-stream"),
        "Content-Disposition": `attachment; filename="${attachmentName(file.fileName).replace(/"/g, "")}"`,
        "Cache-Control": "private, no-cache",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return routeError(error);
  }
}
