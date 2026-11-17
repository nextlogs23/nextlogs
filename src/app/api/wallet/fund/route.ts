import { NextRequest } from "next/server";
import { DocumentReference, FieldValue } from "firebase-admin/firestore";
import { z } from "zod";
import { requireUser, routeError } from "@/lib/server/auth";
import { adminDb } from "@/lib/server/firebase-admin";
import { reference } from "@/lib/server/references";
import { enforceRateLimit } from "@/lib/server/rate-limit";
import { createPocketFiPayment, PocketFiError, pocketFiMode } from "@/lib/server/pocketfi";

const schema = z.object({ amountMinor: z.number().int().min(10_000).max(100_000_000), phone: z.string().trim().min(10).max(24) });
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
    const { amountMinor, phone: submittedPhone } = schema.parse(await request.json());
    const phone = submittedPhone.replace(/[\s()-]/g, "");
    if (!/^\+?[0-9]{10,15}$/.test(phone)) throw Object.assign(new Error("Enter a valid phone number for PocketFi checkout."), { status: 400 });
    const fundingReference = reference("NXL-FUND");
    intentRef = adminDb().collection("walletFundingIntents").doc(fundingReference);
    await intentRef.create({
      reference: fundingReference,
      userId: user.uid,
      email: user.email,
      amountMinor,
      provider: "pocketfi",
      mode: pocketFiMode(),
      status: "initializing",
      createdAt: FieldValue.serverTimestamp(),
    });

    const payment = await createPocketFiPayment({
      amountMinor,
      customerName: user.displayName || user.email.split("@")[0] || "Nextlogs customer",
      customerEmail: user.email,
      customerPhone: phone.replace(/[\s()-]/g, ""),
      redirectUrl: checkoutReturnUrl(request),
    });
    if (!payment.payment_id || !payment.payment_link) throw Object.assign(new Error("PocketFi returned an incomplete checkout"), { status: 502 });

    await intentRef.set({
      providerReference: payment.payment_id,
      providerStatus: payment.status || "pending",
      status: "pending",
      checkoutCreatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    return Response.json({ reference: fundingReference, authorizationUrl: payment.payment_link });
  } catch (error) {
    if (intentRef) {
      const providerError = error as PocketFiError;
      await intentRef.set({
        status: providerError.outcomeKnown ? "failed" : "initialization_unknown",
        lastError: providerError.message || "Payment initialization failed",
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true }).catch(() => {});
    }
    return routeError(error);
  }
}
