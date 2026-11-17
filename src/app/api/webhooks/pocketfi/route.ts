import { createHmac, timingSafeEqual } from "node:crypto";
import { NextRequest } from "next/server";
import { settlePocketFiFunding } from "@/lib/server/pocketfi-funding";

function validSignature(raw: Buffer, supplied: string, secret: string) {
  if (!/^[a-f\d]{128}$/i.test(supplied)) return false;
  const expected = createHmac("sha512", secret).update(raw).digest();
  const received = Buffer.from(supplied, "hex");
  return received.length === expected.length && timingSafeEqual(received, expected);
}

export async function POST(request: NextRequest) {
  const secret = process.env.POCKETFI_SECRET_KEY?.trim();
  if (!secret) return new Response("Not configured", { status: 503 });
  const raw = Buffer.from(await request.arrayBuffer());
  const signature = request.headers.get("http_pocketfi_signature") || request.headers.get("HTTP_POCKETFI_SIGNATURE") || "";
  if (!validSignature(raw, signature, secret)) return new Response("Invalid signature", { status: 401 });
  let event: { transaction?: { reference?: string | null }; payment_id?: string | null };
  try { event = JSON.parse(raw.toString("utf8")); } catch { return new Response("Invalid payload", { status: 400 }); }
  const providerReference = event.payment_id?.trim() || event.transaction?.reference?.trim();
  if (!providerReference) return Response.json({ received: true });
  try {
    await settlePocketFiFunding({ providerReference });
    return Response.json({ received: true });
  } catch (error) {
    const status = (error as { status?: number }).status || 500;
    return new Response(error instanceof Error ? error.message : "Webhook processing failed", { status });
  }
}
