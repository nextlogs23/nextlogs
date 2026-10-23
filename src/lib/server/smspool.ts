import "server-only";

import { createHash } from "node:crypto";

const BASE_URL = process.env.SMSPOOL_API_URL?.replace(/\/$/, "") || "https://api.smspool.net";

export type SmsPoolCountry = { id: number; name: string; shortName: string; region: string };
export type SmsPoolService = { id: number; name: string };
export type SmsPoolOffer = { countryId: number; serviceId: number; poolId: number; poolName: string; stock: number; providerPriceUsd: number; providerCostMinor: number; retailPriceMinor: number };
export type SmsPoolRentalOffer = { rentalId: number; name: string; region: string; days: number; refundable: boolean; refundWithinHours: number; providerPriceUsd: number; providerCostMinor: number; retailPriceMinor: number };

type ApiErrorBody = { success?: number; message?: string; type?: string; errors?: Array<{ message?: string }> };
export class SmsPoolError extends Error {
  constructor(message: string, public status: number, public providerStatus?: number, public providerType?: string, public outcomeKnown = false) { super(message); }
}

function apiKey() {
  const value = process.env.SMSPOOL_API_KEY?.trim();
  if (!value) throw new SmsPoolError("SMSPool is not configured", 503);
  return value;
}

async function request<T>(path: string, options: { method?: "GET" | "POST"; form?: Record<string, string | number | undefined> } = {}): Promise<T> {
  const method = options.method || "POST";
  const form = new URLSearchParams();
  for (const [key, value] of Object.entries(options.form || {})) if (value !== undefined) form.set(key, String(value));
  const response = await fetch(`${BASE_URL}${path}${method === "GET" && form.size ? `?${form}` : ""}`, {
    method,
    headers: { Authorization: `Bearer ${apiKey()}`, Accept: "application/json", ...(method === "POST" ? { "Content-Type": "application/x-www-form-urlencoded" } : {}) },
    body: method === "POST" ? form : undefined,
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  const body = await response.json().catch(() => ({})) as T & ApiErrorBody;
  if (!response.ok || body.success === 0) {
    const type = body.type || "PROVIDER_ERROR";
    const safeMessage = type === "OUT_OF_STOCK" ? "SMSPool inventory changed and this offer is no longer available." : type === "PRICE_NOT_FOUND" ? "SMSPool pricing changed. Refresh the offer and try again." : response.status === 401 || response.status === 403 ? "SMSPool authentication failed." : "SMSPool could not complete this request.";
    const knownFailure = body.success === 0 || (response.status >= 400 && response.status < 500);
    throw new SmsPoolError(safeMessage, response.status === 401 || response.status === 403 ? 503 : knownFailure ? 409 : 502, response.status, type, knownFailure);
  }
  return body;
}

function price(providerPriceUsd: number) {
  const rate = Number(process.env.SMSPOOL_USD_NGN_RATE);
  const markup = Number(process.env.SMSPOOL_MARKUP_PERCENT ?? 20);
  if (!Number.isFinite(rate) || rate <= 0) throw new SmsPoolError("SMSPOOL_USD_NGN_RATE is not configured correctly", 503);
  if (!Number.isFinite(markup) || markup < 0 || markup > 500) throw new SmsPoolError("SMSPOOL_MARKUP_PERCENT is invalid", 503);
  const providerCostMinor = Math.round(providerPriceUsd * rate * 100);
  return { providerCostMinor, retailPriceMinor: Math.max(1, Math.ceil(providerCostMinor * (1 + markup / 100))) };
}

export function smsPoolPurchasesEnabled() { return process.env.SMSPOOL_PURCHASES_ENABLED === "true"; }
export function stableSmsPoolReference(uid: string, idempotencyKey: string, prefix = "DMB-SP") { return `${prefix}-${createHash("sha256").update(`${uid}:${idempotencyKey}`).digest("hex").slice(0, 24).toUpperCase()}`; }

export async function smsPoolCountries(): Promise<SmsPoolCountry[]> {
  const result = await request<Array<{ ID?: number; name?: string; short_name?: string; region?: string }>>("/country/retrieve_all", { method: "GET", form: { show_all: 1 } });
  return result.flatMap((item) => item.ID && item.name && item.short_name ? [{ id: item.ID, name: item.name, shortName: item.short_name, region: item.region || "" }] : []);
}

export async function smsPoolServices(countryId: number): Promise<SmsPoolService[]> {
  const result = await request<Array<{ ID?: number; name?: string }>>("/service/retrieve_all", { method: "GET", form: { country: countryId } });
  return result.flatMap((item) => item.ID && item.name ? [{ id: item.ID, name: item.name }] : []);
}

export async function smsPoolOffers(countryId: number, serviceId: number): Promise<SmsPoolOffer[]> {
  const result = await request<Array<{ pool?: number; name?: string; price?: string | number; stock?: number | string; amount?: number | string }>>("/pool/retrieve_valid", { form: { country: countryId, service: serviceId, web: 1, include_stock: 1 } });
  return result.flatMap((item) => {
    const providerPriceUsd = Number(item.price); const poolId = Number(item.pool); const stock = Number(item.stock ?? item.amount ?? 0);
    if (!Number.isFinite(providerPriceUsd) || providerPriceUsd <= 0 || !Number.isInteger(poolId)) return [];
    return [{ countryId, serviceId, poolId, poolName: item.name || `Pool ${poolId}`, stock: Number.isFinite(stock) ? stock : 0, providerPriceUsd, ...price(providerPriceUsd) }];
  });
}

export async function purchaseSmsPoolNumber(input: { countryId: number; serviceId: number; poolId: number; maxPriceUsd: number }) {
  return request<{ success: number; number?: number | string; cc?: string; phonenumber?: string; order_id?: string; country?: string; service?: string; pool?: number; expires_in?: number; expiration?: number; cost?: string; cost_in_cents?: number }>("/purchase/sms", { form: { country: input.countryId, service: input.serviceId, pool: input.poolId, max_price: input.maxPriceUsd.toFixed(4), pricing_option: 0, quantity: 1, activation_type: "SMS" } });
}

export async function checkSmsPoolOrder(orderId: string) { return request<{ status?: number; sms?: string; full_sms?: string; expiration?: number; time_left?: number; message?: string }>("/sms/check", { form: { orderid: orderId } }); }
export async function cancelSmsPoolOrder(orderId: string) { return request<{ success: number; message?: string }>("/sms/cancel", { form: { orderid: orderId } }); }

export async function smsPoolRentalOffers(): Promise<SmsPoolRentalOffer[]> {
  const response = await request<{ success: number; data?: Array<{ ID?: number; name?: string; region?: string; pricing?: Record<string, number | string>; is_refundable?: number; refund_within?: number }> }>("/rental/retrieve_all", { form: { type: 1 } });
  return (response.data || []).flatMap((rental) => Object.entries(rental.pricing || {}).flatMap(([daysValue, usdValue]) => {
    const rentalId = Number(rental.ID); const days = Number(daysValue); const providerPriceUsd = Number(usdValue);
    if (!Number.isInteger(rentalId) || !Number.isInteger(days) || !Number.isFinite(providerPriceUsd) || providerPriceUsd <= 0) return [];
    return [{ rentalId, name: rental.name || `Rental ${rentalId}`, region: rental.region || "", days, refundable: rental.is_refundable === 1, refundWithinHours: Number(rental.refund_within || 0), providerPriceUsd, ...price(providerPriceUsd) }];
  }));
}

export async function purchaseSmsPoolRental(input: { rentalId: number; days: number }) { return request<{ success: number; phonenumber?: string; days?: number; rental_code?: string; expiry?: number }>("/purchase/rental", { form: { id: input.rentalId, days: input.days, create_token: 0 } }); }
export async function checkSmsPoolRental(rentalCode: string) { return request<{ success: number; status?: { available?: number; phonenumber?: string; activeFor?: number; expiry?: number; auto_extend?: number } }>("/rental/retrieve_status", { form: { rental_code: rentalCode } }); }
export async function smsPoolRentalMessages(rentalCode: string) { return request<{ success: number; messages?: Array<{ ID?: number; message?: string; sender?: string; timestamp?: string }> }>("/rental/retrieve_messages", { form: { rental_code: rentalCode } }); }
export async function refundSmsPoolRental(rentalCode: string) { return request<{ success: number; message?: string }>("/rental/refund", { form: { rental_code: rentalCode } }); }
