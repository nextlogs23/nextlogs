import { NextRequest } from "next/server";
import { DocumentReference, FieldValue } from "firebase-admin/firestore";
import { z } from "zod";
import { requireUser, routeError } from "@/lib/server/auth";
import { adminDb } from "@/lib/server/firebase-admin";
import { reference } from "@/lib/server/references";
import { enforceRateLimit } from "@/lib/server/rate-limit";
import { createPaymonetraPayment, PaymonetraError, paymonetraMode } from "@/lib/server/paymonetra";

const schema = z.object({ amountMinor: z.number().int().min(10_000).max(100_000_000) });

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

    const appUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "");
    if (!appUrl) throw Object.assign(new Error("Application URL is not configured"), { status: 503 });
    const payment = await createPaymonetraPayment({
      amountMinor,
      reference: fundingReference,
      description: "Nextlogs wallet funding",
      customerName: user.displayName || user.email.split("@")[0] || "Nextlogs customer",
      customerEmail: user.email,
      redirectUrl: `${appUrl}/dashboard/wallet`,
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
