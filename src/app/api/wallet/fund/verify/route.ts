import { NextRequest } from "next/server";
import { z } from "zod";
import { requireUser, routeError } from "@/lib/server/auth";
import { adminDb } from "@/lib/server/firebase-admin";
import { enforceRateLimit } from "@/lib/server/rate-limit";
import { reconcilePaymonetraFundingsForUser, settlePaymonetraFunding } from "@/lib/server/paymonetra-funding";
import { reconcilePocketFiFundingsForUser, settlePocketFiFunding } from "@/lib/server/pocketfi-funding";

const schema = z.object({ reference: z.string().trim().min(8).max(160).optional() });

export async function POST(request: NextRequest) {
  try {
    const user = await requireUser(request);
    await enforceRateLimit(`verify_funding_${user.uid}`, 20, 60 * 60 * 1000);
    const { reference } = schema.parse(await request.json());
    if (reference) {
      const match = await adminDb().collection("walletFundingIntents").where("providerReference", "==", reference).limit(1).get();
      if (match.empty) throw Object.assign(new Error("Payment not found"), { status: 404 });
      const intent = match.docs[0].data() as { provider?: string };
      const result = intent.provider === "pocketfi"
        ? await settlePocketFiFunding({ providerReference: reference, expectedUserId: user.uid })
        : await settlePaymonetraFunding({ providerReference: reference, expectedUserId: user.uid });
      return Response.json(result);
    }
    const [pocketfi, paymonetra] = await Promise.all([
      reconcilePocketFiFundingsForUser(user.uid),
      reconcilePaymonetraFundingsForUser(user.uid),
    ]);
    const result = { checked: pocketfi.checked + paymonetra.checked, credited: pocketfi.credited + paymonetra.credited, pending: pocketfi.pending + paymonetra.pending, reviewRequired: pocketfi.reviewRequired + paymonetra.reviewRequired };
    return Response.json({ status: result.credited > 0 ? "successful" : result.pending > 0 ? "pending" : "checked", ...result });
  } catch (error) {
    return routeError(error);
  }
}
