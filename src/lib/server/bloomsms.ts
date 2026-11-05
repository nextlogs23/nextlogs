import "server-only";

import { createHash } from "node:crypto";

const BASE_URL = process.env.BLOOMSMS_API_URL?.replace(/\/$/, "") || "https://bloomsms.com/api/v1";
const RESTRICTED_SERVICE_NAME = /\b(bank|banking|paypal|cash\s?app|venmo|crypto|binance|coinbase|kraken|government|identity|kyc|telecom|carrier)\b/i;

type BloomEnvelope<T> = {
  status?: "success" | "error";
  data?: T | null;
  errors?: { code?: string; message?: string } | null;
};

export type BloomCountry = { id: string; name: string; shortName: string; region: string };
export type BloomService = { id: string; name: string };
export type BloomOffer = {
  countryId: string;
  countryName: string;
  serviceId: string;
  serviceName: string;
  stock: number;
  providerPriceUsd: number;
  providerCostMinor: number;
  retailPriceMinor: number;
};
export type BloomRentalOffer = {
  rentalId: string;
  name: string;
  region: string;
  period: string;
  days: number;
  refundable: boolean;
  refundWithinHours: number;
  providerPriceUsd: number;
  providerCostMinor: number;
  retailPriceMinor: number;
};

export class BloomSmsError extends Error {
  constructor(
    message: string,
    public status: number,
    public providerStatus?: number,
    public providerCode?: string,
    public outcomeKnown = false,
  ) {
    super(message);
  }
}

function apiKey() {
  const value = process.env.BLOOMSMS_API_KEY?.trim();
  if (!value) throw new BloomSmsError("Number service is not configured", 503);
  return value;
}

function safeProviderMessage(status: number, code?: string) {
  if (code === "NO_NUMBERS_AVAILABLE") return "Live inventory changed and this number is no longer available.";
  if (code === "INSUFFICIENT_FUNDS") return "The number provider is temporarily unable to accept this order.";
  if (code === "MAX_RENTALS_EXCEEDED") return "The number provider cannot start another rental right now.";
  if (code === "RATE_LIMITED" || status === 429) return "The number service is busy. Please wait a moment and try again.";
  if (status === 401 || status === 403) return "Number-provider authentication failed.";
  return "The number provider could not complete this request.";
}

async function request<T>(path: string, options: { method?: "GET" | "POST" | "PATCH"; body?: Record<string, unknown> } = {}): Promise<T> {
  const method = options.method || "GET";
  let response: Response;
  try {
    response = await fetch(`${BASE_URL}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${apiKey()}`,
        Accept: "application/json",
        ...(method !== "GET" ? { "Content-Type": "application/json" } : {}),
      },
      body: method !== "GET" ? JSON.stringify(options.body || {}) : undefined,
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
  } catch (error) {
    throw new BloomSmsError(error instanceof Error && error.name === "TimeoutError" ? "The number provider timed out. The order remains pending for reconciliation." : "The number provider is temporarily unreachable.", 502, undefined, "NETWORK_ERROR", false);
  }

  const envelope = await response.json().catch(() => ({})) as BloomEnvelope<T>;
  if (!response.ok || envelope.status !== "success" || envelope.data == null) {
    const code = envelope.errors?.code;
    const knownFailure = response.status >= 400 && response.status < 500 && response.status !== 408 && response.status !== 429;
    throw new BloomSmsError(safeProviderMessage(response.status, code), response.status === 401 || response.status === 403 ? 503 : knownFailure ? 409 : 502, response.status, code, knownFailure);
  }
  return envelope.data;
}

function price(providerPriceUsd: number) {
  const rate = Number(process.env.BLOOMSMS_USD_NGN_RATE);
  const markup = Number(process.env.BLOOMSMS_MARKUP_PERCENT ?? 20);
  if (!Number.isFinite(rate) || rate <= 0) throw new BloomSmsError("BLOOMSMS_USD_NGN_RATE is not configured correctly", 503);
  if (!Number.isFinite(markup) || markup < 0 || markup > 500) throw new BloomSmsError("BLOOMSMS_MARKUP_PERCENT is invalid", 503);
  const providerCostMinor = Math.round(providerPriceUsd * rate * 100);
  return { providerCostMinor, retailPriceMinor: Math.max(1, Math.ceil(providerCostMinor * (1 + markup / 100))) };
}

function daysFromPeriod(period: string) {
  const match = /^(1|3|7|14|30)d$/.exec(period);
  return match ? Number(match[1]) : 0;
}

export function bloomSmsPurchasesEnabled() { return process.env.BLOOMSMS_PURCHASES_ENABLED === "true"; }
export function stableBloomReference(uid: string, idempotencyKey: string, prefix = "NXL-BLM") {
  return `${prefix}-${createHash("sha256").update(`${uid}:${idempotencyKey}`).digest("hex").slice(0, 24).toUpperCase()}`;
}

export async function bloomBalance() {
  return request<{ balance: string; currency: string }>("/balance");
}

export async function bloomCountries(): Promise<BloomCountry[]> {
  const result = await request<{ countries?: Array<{ id?: string | number; name?: string }> }>("/countries");
  return (result.countries || []).flatMap((item) => item.id !== undefined && item.name
    ? [{ id: String(item.id), name: item.name, shortName: String(item.id), region: "Live inventory" }]
    : []);
}

export async function bloomServices(countryId: string): Promise<BloomService[]> {
  const result = await request<{ services?: Array<{ code?: string; name?: string; price?: string | number; stock?: string | number }> }>(`/services?country=${encodeURIComponent(countryId)}`);
  return (result.services || []).flatMap((item) => item.code && item.name && !RESTRICTED_SERVICE_NAME.test(item.name) && Number(item.stock || 0) > 0
    ? [{ id: item.code, name: item.name }]
    : []);
}

export async function bloomOffer(countryId: string, serviceId: string, countryName = "Selected country"): Promise<BloomOffer[]> {
  const result = await request<{ services?: Array<{ code?: string; name?: string; price?: string | number; stock?: string | number }> }>(`/services?country=${encodeURIComponent(countryId)}`);
  return (result.services || []).flatMap((item) => {
    const providerPriceUsd = Number(item.price);
    const stock = Number(item.stock || 0);
    if (item.code !== serviceId || !item.name || RESTRICTED_SERVICE_NAME.test(item.name) || !Number.isFinite(providerPriceUsd) || providerPriceUsd <= 0 || !Number.isFinite(stock) || stock <= 0) return [];
    return [{ countryId, countryName, serviceId, serviceName: item.name, stock, providerPriceUsd, ...price(providerPriceUsd) }];
  });
}

export async function purchaseBloomNumber(input: { countryId: string; serviceId: string; maxPriceUsd: number }) {
  return request<{ activation_id?: string | number; phone_number?: string; service?: string; country?: string; price?: string; currency?: string; expires_at?: string; new_balance?: string }>("/activations", {
    method: "POST",
    body: { country: input.countryId, service: input.serviceId, max_price: input.maxPriceUsd },
  });
}

export async function checkBloomActivation(activationId: string) {
  return request<{ activation_id?: string | number; activation_status?: string; phone_number?: string; expires_at?: string; sms?: { code?: string; full_text?: string } | null }>(`/activations/${encodeURIComponent(activationId)}`);
}

export async function updateBloomActivation(activationId: string, status: "cancel" | "complete" | "request_another_sms") {
  return request<{ activation_id?: string | number; activation_status?: string; status?: string; refund_amount?: string; phone_number?: string }>(`/activations/${encodeURIComponent(activationId)}`, { method: "PATCH", body: { status } });
}

export async function bloomRentalOffers(): Promise<BloomRentalOffer[]> {
  const result = await request<{ services?: Array<{ service_name?: string; service_code?: string; periods?: Array<{ period?: string; price?: string | number }> }> }>("/long-rentals/prices");
  return (result.services || []).flatMap((service) => (service.periods || []).flatMap((item) => {
    const period = item.period || "";
    const days = daysFromPeriod(period);
    const providerPriceUsd = Number(item.price);
    if (!service.service_code || !service.service_name || RESTRICTED_SERVICE_NAME.test(service.service_name) || !days || !Number.isFinite(providerPriceUsd) || providerPriceUsd <= 0) return [];
    return [{ rentalId: service.service_code, name: service.service_name, region: "Long-term rental", period, days, refundable: false, refundWithinHours: 0, providerPriceUsd, ...price(providerPriceUsd) }];
  }));
}

export async function purchaseBloomRental(input: { serviceId: string; period: string }) {
  return request<{ id?: string | number; phone_number?: string; service_name?: string; service_code?: string; status?: string; period?: string; price?: string; auto_renew?: boolean; new_balance?: string }>("/long-rentals", {
    method: "POST",
    body: { service: input.serviceId, period: input.period, auto_renew: false },
  });
}

export async function bloomLongRentals() {
  return request<{ rentals?: Array<{ id?: string | number; phone_number?: string; service_name?: string; service_code?: string; status?: string; period?: string; expires_at?: string; auto_renew?: boolean }> }>("/long-rentals");
}

export async function bloomRentalMessages(rentalId: string) {
  return request<{ rental_id?: string | number; phone_number?: string; messages?: Array<{ text?: string; sender?: string; received_at?: string }> }>(`/long-rentals/${encodeURIComponent(rentalId)}/messages`);
}
