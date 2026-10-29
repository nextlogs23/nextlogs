import "server-only";

import { createHash } from "node:crypto";
import Telnyx from "telnyx";

export type TelnyxOffer = {
  phoneNumber: string;
  countryCode: string;
  phoneNumberType: string;
  features: string[];
  currency: string;
  monthlyCost: string;
  upfrontCost: string;
  providerCostMinor: number;
  retailPriceMinor: number;
};

function required(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw Object.assign(new Error(`${name} is not configured`), { status: 503 });
  return value;
}

export function telnyxClient(options: { webhook?: boolean } = {}) {
  return new Telnyx({
    apiKey: required("TELNYX_API_KEY"),
    ...(options.webhook ? { publicKey: required("TELNYX_PUBLIC_KEY") } : {}),
  });
}

function dollarsToNairaMinor(value: string | undefined) {
  const amount = Number.parseFloat(value || "0");
  const rate = Number.parseFloat(required("TELNYX_USD_NGN_RATE"));
  if (!Number.isFinite(amount) || amount < 0 || !Number.isFinite(rate) || rate <= 0) {
    throw Object.assign(new Error("Telnyx pricing conversion is not configured correctly"), { status: 503 });
  }
  return Math.round(amount * rate * 100);
}

export async function searchTelnyxNumbers(countryCode: string, limit = 20): Promise<TelnyxOffer[]> {
  const response = await telnyxClient().availablePhoneNumbers.list({
    filter: {
      country_code: countryCode,
      features: ["sms"],
      limit: Math.min(Math.max(limit, 1), 50),
      best_effort: false,
      exclude_held_numbers: true,
    },
  });
  const markup = Number.parseFloat(process.env.TELNYX_NUMBER_MARKUP_PERCENT || "20");
  if (!Number.isFinite(markup) || markup < 0 || markup > 500) {
    throw Object.assign(new Error("TELNYX_NUMBER_MARKUP_PERCENT is invalid"), { status: 503 });
  }
  return (response.data || []).flatMap((item) => {
    if (!item.phone_number) return [];
    const providerCostMinor = dollarsToNairaMinor(item.cost_information?.upfront_cost) + dollarsToNairaMinor(item.cost_information?.monthly_cost);
    return [{
      phoneNumber: item.phone_number,
      countryCode,
      phoneNumberType: "SMS capable",
      features: (item.features || []).map((feature) => String(feature.name || feature)),
      currency: item.cost_information?.currency || "USD",
      monthlyCost: item.cost_information?.monthly_cost || "0",
      upfrontCost: item.cost_information?.upfront_cost || "0",
      providerCostMinor,
      retailPriceMinor: Math.max(1, Math.ceil(providerCostMinor * (1 + markup / 100))),
    }];
  });
}

export function telnyxPurchasesEnabled() {
  return process.env.TELNYX_PURCHASES_ENABLED === "true";
}

export function telnyxMessagingProfileId() {
  return required("TELNYX_MESSAGING_PROFILE_ID");
}

export function stableTelnyxReference(uid: string, idempotencyKey: string) {
  return `NXL-TEL-${createHash("sha256").update(`${uid}:${idempotencyKey}`).digest("hex").slice(0, 24).toUpperCase()}`;
}

export function normalizeTelnyxError(error: unknown) {
  const candidate = error as { status?: number; statusCode?: number; message?: string; error?: { message?: string } };
  const providerStatus = candidate.status ?? candidate.statusCode;
  const status = providerStatus === 404 || providerStatus === 409 || providerStatus === 422 ? 409 : providerStatus === 401 || providerStatus === 403 ? 503 : 502;
  const message = status === 409
    ? "The selected number is no longer available. Search again and choose another number."
    : "Telnyx could not complete this request. Please try again later.";
  return Object.assign(new Error(message), {
    status,
    providerStatus,
    outcomeKnown: typeof providerStatus === "number" && providerStatus >= 400 && providerStatus < 500,
    cause: candidate.message || candidate.error?.message,
  });
}
