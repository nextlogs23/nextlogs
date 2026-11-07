import { NextRequest } from "next/server";
import { z } from "zod";
import { requireUser, routeError } from "@/lib/server/auth";
import { enforceRateLimit } from "@/lib/server/rate-limit";
import { settlePaymonetraFunding } from "@/lib/server/paymonetra-funding";

const schema = z.object({ reference: z.string().trim().min(8).max(160) });

export async function POST(request: NextRequest) {
  try {
    const user = await requireUser(request);
    await enforceRateLimit(`verify_funding_${user.uid}`, 20, 60 * 60 * 1000);
    const { reference } = schema.parse(await request.json());
    const result = await settlePaymonetraFunding({ providerReference: reference, expectedUserId: user.uid });
    return Response.json(result);
  } catch (error) {
    return routeError(error);
  }
}
