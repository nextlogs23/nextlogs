import "server-only";

const DEFAULT_BASE_URL = "https://api.paymonetra.com/v1";

export type PaymonetraPayment = {
  reference: string;
  merchant_reference?: string | null;
  status: string;
  amount: number;
  amount_requested?: number | null;
  currency?: string | null;
  checkout_url?: string | null;
  account_number?: string | null;
  account_name?: string | null;
  mode?: "test" | "live" | string;
  collects?: string[];
};

type PaymonetraErrorBody = {
  error?: { type?: string; message?: string; field?: string };
};

export class PaymonetraError extends Error {
  constructor(message: string, public status: number, public providerStatus?: number, public outcomeKnown = false) {
    super(message);
  }
}

function baseUrl() {
  return process.env.PAYMONETRA_API_URL?.replace(/\/$/, "") || DEFAULT_BASE_URL;
}

export function paymonetraSecretKey() {
  const value = process.env.PAYMONETRA_SECRET_KEY?.trim();
  if (!value) throw new PaymonetraError("Online wallet funding is not configured", 503);
  if (!/^sk_(test|live)_/.test(value)) throw new PaymonetraError("Paymonetra secret key is not configured correctly", 503);
  return value;
}

export function paymonetraMode() {
  return paymonetraSecretKey().startsWith("sk_live_") ? "live" : "test";
}

function safeMessage(status: number, body: PaymonetraErrorBody) {
  const type = body.error?.type;
  if (status === 401) return "The payment gateway credentials are invalid.";
  if (type === "not_verified") return "The payment gateway business account is awaiting verification.";
  if (type === "account_inactive") return "Online wallet funding is temporarily unavailable.";
  if (type === "amount_over_limit") return "This amount is above the payment gateway limit.";
  if (status === 409 || type === "conflict") return body.error?.message || "This payment request already exists.";
  if (status >= 400 && status < 500) return body.error?.message || "The payment request could not be accepted.";
  return "The payment gateway is temporarily unavailable.";
}

async function request<T>(path: string, options: { method?: "GET" | "POST"; body?: URLSearchParams } = {}) {
  const method = options.method || "GET";
  let response: Response;
  try {
    response = await fetch(`${baseUrl()}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${paymonetraSecretKey()}`,
        Accept: "application/json",
        ...(options.body ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
      },
      body: options.body,
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
  } catch (error) {
    const timedOut = error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
    throw new PaymonetraError(timedOut ? "The payment gateway timed out. Please check your wallet before trying again." : "The payment gateway is temporarily unreachable.", 502, undefined, false);
  }

  const body = await response.json().catch(() => ({})) as T & PaymonetraErrorBody;
  if (!response.ok) {
    const outcomeKnown = response.status >= 400 && response.status < 500 && response.status !== 408 && response.status !== 429;
    throw new PaymonetraError(safeMessage(response.status, body), response.status === 401 || response.status === 403 ? 503 : outcomeKnown ? 409 : 502, response.status, outcomeKnown);
  }
  return body as T;
}

export async function createPaymonetraPayment(input: {
  amountMinor: number;
  reference: string;
  description: string;
  customerName: string;
  customerEmail: string;
  redirectUrl: string;
}) {
  const body = new URLSearchParams({
    amount: (input.amountMinor / 100).toFixed(2),
    reference: input.reference,
    description: input.description,
    customer_name: input.customerName,
    customer_email: input.customerEmail,
    redirect_url: input.redirectUrl,
  });
  return request<PaymonetraPayment>("/payments", { method: "POST", body });
}

export async function getPaymonetraPayment(reference: string) {
  return request<PaymonetraPayment>(`/payments/${encodeURIComponent(reference)}`);
}

export async function getPaymonetraBalance() {
  return request<{ mode?: string; currency?: string; collected?: number; settled?: number }>("/balance");
}
