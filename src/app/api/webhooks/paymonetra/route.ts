import { createHmac, timingSafeEqual } from "node:crypto";
import { NextRequest } from "next/server";
import { settlePaymonetraFunding } from "@/lib/server/paymonetra-funding";

function validSignature(raw: Buffer, supplied: string, secret: string) {
  if (!/^[a-f\d]{128}$/i.test(supplied)) return false;
  const expected = createHmac("sha512", secret).update(raw).digest();
  const received = Buffer.from(supplied, "hex");
  return received.length === expected.length && timingSafeEqual(received, expected);
}

export async function POST(request: NextRequest) {
  const secret = process.env.PAYMONETRA_WEBHOOK_SECRET?.trim();
  if (!secret) return new Response("Not configured", { status: 503 });
  const raw = Buffer.from(await request.arrayBuffer());
  if (!validSignature(raw, request.headers.get("x-paymonetra-signature") || "", secret)) return new Response("Invalid signature", { status: 401 });

  let event: { event?: string; mode?: string; data?: { checkout_reference?: string | null; amount?: number; currency?: string } };
  try { event = JSON.parse(raw.toString("utf8")); } catch { return new Response("Invalid payload", { status: 400 }); }
  if (event.event !== "collection.success") return Response.json({ received: true });
  const providerReference = event.data?.checkout_reference?.trim();
  if (!providerReference) return Response.json({ received: true });

  try {
    await settlePaymonetraFunding({
      providerReference,
      eventAmountMinor: typeof event.data?.amount === "number" ? Math.round(event.data.amount * 100) : undefined,
      eventCurrency: event.data?.currency,
      eventMode: event.mode,
    });
    return Response.json({ received: true });
  } catch (error) {
    const status = (error as { status?: number }).status || 500;
    return new Response(error instanceof Error ? error.message : "Webhook processing failed", { status });
  }
}
