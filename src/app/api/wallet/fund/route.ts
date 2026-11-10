import { NextRequest } from "next/server";
import { DocumentReference, FieldValue } from "firebase-admin/firestore";
import { z } from "zod";
import { requireUser, routeError } from "@/lib/server/auth";
import { adminDb } from "@/lib/server/firebase-admin";
import { reference } from "@/lib/server/references";
import { enforceRateLimit } from "@/lib/server/rate-limit";
import { createPaymonetraPayment, PaymonetraError, paymonetraMode } from "@/lib/server/paymonetra";

const schema = z.object({ amountMinor: z.number().int().min(10_000).max(100_000_000) });
const CANONICAL_APP_ORIGIN = "https://www.nextlogs.online";

function checkoutReturnUrl(request: NextRequest) {
  const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const requestHost = forwardedHost || request.nextUrl.host;
  const hostname = requestHost.split(":")[0].toLowerCase();
  if (hostname === "localhost" || hostname === "127.0.0.1") {
    const forwardedProtocol = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
    const protocol = forwardedProtocol === "https" ? "https" : "http";
    return `${protocol}://${requestHost}/dashboard/wallet`;
  }
  if (hostname === "nextlogs.online" || hostname === "www.nextlogs.online") {
    return `https://${requestHost}/dashboard/wallet`;
  }
  return `${CANONICAL_APP_ORIGIN}/dashboard/wallet`;
}

export async function POST(request: NextRequest) {
  let intentRef: DocumentReference | undefined;
  try {
    const user = await requireUser(request);
    await enforceRateLimit(`fund_${user.uid}`, 8, 60 * 60 * 1000);
    const { amountMinor } = schema.parse(await request.json());
    const fundingReference = reference("NXL-FUND");
    intentRef = adminDb().collection("walletFundingIntents").doc(fundingReference);
    await intentRef.create({
      reference: fundingReference,
      userId: user.uid,
      email: user.email,
      amountMinor,
      provider: "paymonetra",
      mode: paymonetraMode(),
      status: "initializing",
      createdAt: FieldValue.serverTimestamp(),
    });

    const payment = await createPaymonetraPayment({
      amountMinor,
      reference: fundingReference,
      description: "Nextlogs wallet funding",
      customerName: user.displayName || user.email.split("@")[0] || "Nextlogs customer",
      customerEmail: user.email,
      redirectUrl: checkoutReturnUrl(request),
    });
    if (!payment.reference || !payment.checkout_url) throw Object.assign(new Error("The payment gateway returned an incomplete checkout"), { status: 502 });

    await intentRef.set({
      providerReference: payment.reference,
      providerStatus: payment.status || "pending",
      status: "pending",
      checkoutCreatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    return Response.json({ reference: fundingReference, authorizationUrl: payment.checkout_url });
  } catch (error) {
    if (intentRef) {
      const providerError = error as PaymonetraError;
      await intentRef.set({
        status: providerError.outcomeKnown ? "failed" : "initialization_unknown",
        lastError: providerError.message || "Payment initialization failed",
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true }).catch(() => {});
    }
    return routeError(error);
  }
}
