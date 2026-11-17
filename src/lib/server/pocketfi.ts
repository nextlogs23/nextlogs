import "server-only";

const DEFAULT_LIVE_BASE_URL = "https://api.pocketfi.ng/api/v1";
const DEFAULT_TEST_BASE_URL = "https://api.pocketfi.ng/api/test";

export type PocketFiPayment = {
  status?: string;
  payment_id?: string;
  payment_link?: string;
  message?: string;
  data?: Record<string, unknown>;
  [key: string]: unknown;
};

export class PocketFiError extends Error {
  constructor(message: string, public status: number, public providerStatus?: number, public outcomeKnown = false) {
    super(message);
  }
}

function apiToken() {
  const value = process.env.POCKETFI_API_TOKEN?.trim();
  if (!value) throw new PocketFiError("PocketFi wallet funding is not configured", 503);
  return value;
}

export function pocketFiBaseUrl() {
  const configured = process.env.POCKETFI_API_URL?.trim().replace(/\/$/, "");
  return configured || (process.env.POCKETFI_ENV === "test" ? DEFAULT_TEST_BASE_URL : DEFAULT_LIVE_BASE_URL);
}

export function pocketFiMode() {
  return pocketFiBaseUrl().endsWith("/api/test") ? "test" : "live";
}

function businessId() {
  const value = process.env.POCKETFI_BUSINESS_ID?.trim();
  if (!value) throw new PocketFiError("PocketFi business ID is not configured", 503);
  return value;
}

function safeMessage(status: number, body: PocketFiPayment) {
  if (status === 401 || status === 403) return "The PocketFi credentials are invalid or not authorized.";
  if (status >= 400 && status < 500) return body.message || "PocketFi could not accept the payment request.";
  return "PocketFi is temporarily unavailable.";
}

async function request<T>(path: string, body: Record<string, unknown>) {
  let response: Response;
  try {
    response = await fetch(`${pocketFiBaseUrl()}${path}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiToken()}`,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
  } catch (error) {
    const timedOut = error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
    throw new PocketFiError(timedOut ? "PocketFi timed out. Please check your wallet before trying again." : "PocketFi is temporarily unreachable.", 502);
  }

  const payload = await response.json().catch(() => ({})) as T & PocketFiPayment;
  if (!response.ok) {
    const outcomeKnown = response.status >= 400 && response.status < 500 && response.status !== 408 && response.status !== 429;
    throw new PocketFiError(safeMessage(response.status, payload), response.status === 401 || response.status === 403 ? 503 : outcomeKnown ? 409 : 502, response.status, outcomeKnown);
  }
  return payload as T;
}

export async function createPocketFiPayment(input: {
  amountMinor: number;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  redirectUrl: string;
}) {
  const [firstName, ...rest] = input.customerName.trim().split(/\s+/).filter(Boolean);
  const response = await request<PocketFiPayment>("/checkout/request", {
    first_name: firstName || "Nextlogs",
    last_name: rest.join(" ") || "Customer",
    phone: input.customerPhone,
    business_id: businessId(),
    email: input.customerEmail,
    redirect_link: input.redirectUrl,
    amount: (input.amountMinor / 100).toFixed(2),
  });
  const data = response.data && typeof response.data === "object" ? response.data : {};
  return {
    ...response,
    payment_id: response.payment_id || (data as { payment_id?: string }).payment_id,
    payment_link: response.payment_link || (data as { payment_link?: string }).payment_link,
  };
}

export async function confirmPocketFiPayment(paymentId: string) {
  return request<PocketFiPayment>("/checkout/confirm", { payment_id: paymentId });
}
