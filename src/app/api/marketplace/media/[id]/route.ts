import { NextRequest } from "next/server";
import { adminDb } from "@/lib/server/firebase-admin";

export const runtime = "nodejs";

export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!/^[A-Za-z0-9_-]{8,160}$/.test(id)) return new Response("Not found", { status: 404 });
  const snapshot = await adminDb().collection("marketplaceMedia").doc(id).get();
  if (!snapshot.exists) return new Response("Not found", { status: 404 });
  const data = snapshot.data();
  const stored = data?.bytes;
  const bytes = stored && typeof stored.toUint8Array === "function" ? stored.toUint8Array() : stored;
  if (!(bytes instanceof Uint8Array) && !Buffer.isBuffer(bytes)) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": typeof data?.contentType === "string" ? data.contentType : "application/octet-stream",
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
