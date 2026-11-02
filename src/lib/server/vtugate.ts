import "server-only";
import { createHash, randomBytes } from "crypto";
import { adminDb } from "./firebase-admin";
import type { CablePlan, CableProvider, DataPlan, ElectricityProvider, ProviderResult, VtuProvider } from "./providers";

type Json = Record<string, unknown>;
type Cached<T> = { expiresAt: number; value: T };
const serviceCache = new Map<string, Cached<Json[]>>();
const CACHE_MS = 60_000;

function rec(value: unknown): Json { return value && typeof value === "object" && !Array.isArray(value) ? value as Json : {}; }
function str(value: unknown) { return typeof value === "string" || typeof value === "number" ? String(value) : ""; }
function num(value: unknown) { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : 0; }
function minor(value: unknown) { return Math.round(num(value) * 100); }
function rows(value: unknown) { return Array.isArray(value) ? value.map(rec) : []; }
function slug(value: unknown) { return str(value).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""); }

export class VtugateError extends Error {
  status: number;
  outcomeKnown: boolean;
  constructor(message: string, status = 502, outcomeKnown = false) { super(message); this.name = "VtugateError"; this.status = status; this.outcomeKnown = outcomeKnown; }
}

export function vtugateConfig() {
  const environment = process.env.VTUGATE_ENV === "production" ? "production" : "test";
  const official = "https://api.vtugate.com";
  const override = process.env.VTUGATE_API_URL?.replace(/\/$/, "");
  if (override && override !== official) throw new VtugateError("VTUGATE_API_URL must be https://api.vtugate.com", 500, true);
  return {
    environment,
    baseUrl: override || official,
    token: process.env.VTUGATE_API_KEY || "",
    purchasesEnabled: process.env.VTUGATE_PURCHASES_ENABLED === "true",
    timeoutMs: Math.min(30_000, Math.max(3_000, Number(process.env.VTUGATE_REQUEST_TIMEOUT_MS || 15_000))),
  } as const;
}

export class VtugateClient {
  async post(path: string, input: Json = {}) {
    const config = vtugateConfig();
    if (!config.token) throw new VtugateError("VTUGATE_API_KEY is not configured", 503, true);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), config.timeoutMs);
    const body = new URLSearchParams();
    for (const [key, value] of Object.entries(input)) if (value !== undefined && value !== null && value !== "") body.set(key, String(value));
    try {
      const response = await fetch(`${config.baseUrl}/api/v1/${path.replace(/^\//, "")}`, {
        method: "POST",
        cache: "no-store",
        signal: controller.signal,
        headers: { Authorization: `Bearer ${config.token}`, "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
        body,
      });
      const payload = await response.json().catch(() => ({})) as Json;
      if (!response.ok) {
        const knownRejection = response.status >= 400 && response.status < 500 && ![408, 409, 429].includes(response.status);
        throw new VtugateError(str(payload.message || payload.error) || `VTUGATE returned HTTP ${response.status}`, response.status === 401 || response.status === 403 ? 502 : response.status, knownRejection);
      }
      return payload;
    } catch (error) {
      if (error instanceof VtugateError) throw error;
      if (error instanceof Error && error.name === "AbortError") throw new VtugateError("VTUGATE request timed out; transaction requires requery", 504, false);
      throw new VtugateError(error instanceof Error ? error.message : "VTUGATE request failed", 502, false);
    } finally { clearTimeout(timer); }
  }
}

async function fetchServices(client: VtugateClient, serviceType: string) {
  const cached = serviceCache.get(serviceType);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  const payload = await client.post("fetchservices", { service_type: serviceType });
  const value = rows(payload.data);
  serviceCache.set(serviceType, { expiresAt: Date.now() + CACHE_MS, value });
  return value;
}

function serviceName(item: Json) { return str(item.network_name || item.tv_name || item.disco || item.edu_type || item.name || item.service_name); }
function serviceId(item: Json) { return str(item.service_id || item.id); }
function matchesNetwork(item: Json, network: string) {
  const name = slug(serviceName(item));
  const expected = network === "9mobile" ? ["9mobile", "etisalat", "t2"] : [network];
  return expected.some((value) => name.includes(value));
}

export async function readVtugatePricing(serviceIdValue: string) {
  const snapshot = await adminDb().collection("servicePricing").doc(`vtugate_${serviceIdValue}`).get();
  const value = snapshot.data() || {};
  return { active: value.active !== false, markupPercent: Math.min(100, Math.max(0, num(value.markupPercent ?? process.env.VTUGATE_MARKUP_PERCENT ?? 0))), flatFeeMinor: Math.max(0, Math.round(num(value.flatFeeMinor))) };
}
export function retailPrice(providerCostMinor: number, pricing: { markupPercent: number; flatFeeMinor: number }) { return Math.ceil(providerCostMinor * (1 + pricing.markupPercent / 100)) + pricing.flatFeeMinor; }

function discoCode(item: Json) {
  const explicit = slug(item.disco || item.code || item.slug || item.network_code);
  if (explicit) return explicit;
  const name = slug(serviceName(item));
  const mappings: Array<[string, string]> = [["abuja", "aedc"], ["aba", "aba"], ["benin", "benin"], ["eko", "ekedc"], ["enugu", "enugu"], ["ibadan", "ibedc"], ["ikeja", "ikedc"], ["jos", "jos"], ["kaduna", "kaduna"], ["kano", "kedco"], ["port-harcourt", "portharcourt"], ["yola", "yola"]];
  return mappings.find(([part]) => name.includes(part))?.[1] || name;
}

function electricityDisplayName(item: Json) {
  const code = discoCode(item);
  const names: Record<string, string> = {
    aba: "Aba Electric (APLE)",
    aedc: "Abuja Electricity (AEDC)",
    benin: "Benin Electricity (BEDC)",
    ekedc: "Eko Electricity (EKEDC)",
    enugu: "Enugu Electricity (EEDC)",
    ibedc: "Ibadan Electricity (IBEDC)",
    ikedc: "Ikeja Electric (IKEDC)",
    jos: "Jos Electricity (JED)",
    kaduna: "Kaduna Electric (KAEDCO)",
    kedco: "Kano Electricity (KEDCO)",
    portharcourt: "Port Harcourt Electricity (PHED)",
    yola: "Yola Electricity (YEDC)",
  };
  return names[code] || serviceName(item).replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function providerCost(data: Json, requestedMinor: number) {
  const explicit = data.total_amount ?? data.charged_amount ?? data.wallet_debit ?? data.price;
  if (explicit !== undefined && explicit !== null && num(explicit) > 0) return minor(explicit);
  const amount = minor(data.amount) || requestedMinor;
  const commission = minor(data.commission_amount);
  const platformFee = minor(data.platform_fee);
  return Math.max(0, amount - commission + platformFee) || requestedMinor;
}

function responseStatus(payload: Json, reference: string, requestedMinor = 0): ProviderResult {
  const data = rec(payload.data);
  const split = rec(data.split);
  const hasTransactionState = data.transaction_status !== undefined || data.status !== undefined;
  const rawValue = data.transaction_status ?? data.status ?? data.provider_status ?? payload.status;
  const raw = typeof rawValue === "boolean" ? rawValue ? "success" : "failed" : str(rawValue || data.provider_message || payload.message || "unknown").toLowerCase();
  const partial = split.partial === true || str(split.status).toLowerCase() === "partial";
  const successful = !partial && (["success", "successful", "completed", "delivered"].includes(raw) || (!hasTransactionState && payload.status === true && data.provider_status === true));
  const pending = partial || ["pending", "processing", "queued", "initiated", "unknown"].includes(raw) || /pending|processing|requery|timeout/.test(raw);
  const failed = !successful && !pending && (["failed", "failure", "rejected", "refunded", "cancelled", "canceled"].includes(raw) || payload.status === false);
  const token = str(data.token || data.purchased_code);
  return {
    providerReference: str(data.transaction_id) || str(data.external_reference) || reference,
    externalReference: str(data.external_reference) || undefined,
    status: successful ? "successful" : failed ? "failed" : "processing",
    rawStatus: partial ? "partial" : raw,
    rawCode: str(data.code || payload.code) || undefined,
    providerCostMinor: providerCost(data, requestedMinor),
    ...(token ? { token } : {}),
    ...(str(data.units) ? { units: str(data.units) } : {}),
    ...(str(data.customer_name) ? { customerName: str(data.customer_name) } : {}),
    ...(str(data.customer_address) ? { customerAddress: str(data.customer_address) } : {}),
    ...(str(data.payment_used_for) ? { paymentUsedFor: str(data.payment_used_for) } : {}),
    ...(data.debt_before !== undefined && data.debt_before !== null ? { debtBefore: num(data.debt_before) } : {}),
    ...(data.debt_remaining !== undefined && data.debt_remaining !== null ? { debtRemaining: num(data.debt_remaining) } : {}),
  };
}

export async function checkVtugateConnection() {
  const client = new VtugateClient();
  const [account, data, electricity, tv] = await Promise.all([
    client.post("accountdetails"),
    fetchServices(client, "data"),
    fetchServices(client, "electricity"),
    fetchServices(client, "tv"),
  ]);
  const accountData = rec(account.data);
  return { connection: account.status === true ? "connected" as const : "failed" as const, walletAccessible: Number.isFinite(Number(accountData.wallet_balance)), kycStatus: str(accountData.kyc_status) || null, accountStatus: str(accountData.account_status) || null, dataServices: data.length, electricityServices: electricity.length, cableServices: tv.length };
}

export class VtugateProvider implements VtuProvider {
  private client = new VtugateClient();

  async dataPlans(network: string): Promise<DataPlan[]> {
    const services = (await fetchServices(this.client, "data")).filter((item) => matchesNetwork(item, network));
    const groups = await Promise.all(services.map(async (service) => {
      const id = serviceId(service); if (!id) return [];
      const pricing = await readVtugatePricing(id); if (!pricing.active) return [];
      const payload = await this.client.post("fetchdataplans", { service_id: id });
      return rows(rec(payload.data).data_plans).map((item) => {
        const rowServiceId = str(item.service_id) || id, code = str(item.code), providerCostMinor = minor(item.price);
        return { id: `${rowServiceId}::${code}`, name: str(item.name), validity: str(item.validity || item.validity_days) || undefined, providerCostMinor, priceMinor: retailPrice(providerCostMinor, pricing), providerServiceId: rowServiceId, providerPlanCode: code };
      }).filter((item) => item.name && item.providerCostMinor > 0 && item.providerPlanCode);
    }));
    return groups.flat().filter((item, index, all) => all.findIndex((candidate) => candidate.id === item.id) === index);
  }

  async electricityProviders(): Promise<ElectricityProvider[]> {
    return (await fetchServices(this.client, "electricity")).map((item) => ({ id: serviceId(item), name: electricityDisplayName(item), code: discoCode(item) })).filter((item) => item.id && item.name && item.code);
  }

  private async electricityProvider(id: string) {
    const item = (await fetchServices(this.client, "electricity")).find((row) => serviceId(row) === id);
    if (!item) throw new VtugateError("This electricity provider is unavailable", 409, true);
    return { id, code: discoCode(item), name: electricityDisplayName(item) };
  }

  async validateMeter(input: { provider: string; meterType: string; meterNumber: string }) {
    const provider = await this.electricityProvider(input.provider);
    const payload = await this.client.post("verifyelectricity", { service_id: provider.id, meter_no: input.meterNumber, disco: provider.code });
    const data = rec(payload.data); const customerName = str(data.meter_name || data.customer_name);
    if (payload.status !== true || !customerName) throw new VtugateError(str(payload.message) || "VTUGATE could not verify this meter", 422, true);
    return { customerName, address: str(data.cust_address || data.customer_address) || undefined };
  }

  async cableProviders(): Promise<CableProvider[]> {
    return (await fetchServices(this.client, "tv")).map((item) => ({ id: serviceId(item), name: serviceName(item) })).filter((item) => item.id && item.name);
  }

  async cablePlans(provider: string): Promise<CablePlan[]> {
    const pricing = await readVtugatePricing(provider); if (!pricing.active) return [];
    const payload = await this.client.post("fetchcableplans", { service_id: provider });
    return rows(rec(payload.data).cable_plans).map((item) => { const rowServiceId = str(item.service_id) || provider, code = str(item.code), providerCostMinor = minor(item.price); return { id: `${rowServiceId}::${code}`, name: str(item.name), providerCostMinor, priceMinor: retailPrice(providerCostMinor, pricing), providerServiceId: rowServiceId, providerPlanCode: code }; }).filter((item) => item.name && item.providerCostMinor > 0 && item.providerPlanCode);
  }

  async validateCable(input: { provider: string; phone: string; smartcardNumber: string }) {
    const payload = await this.client.post("verifycabletv", { service_id: input.provider, phone: input.phone, smartcard_number: input.smartcardNumber });
    const data = rec(payload.data); const customerName = str(data.smartcard_name || data.customer_name);
    if (payload.status !== true || !customerName) throw new VtugateError(str(payload.message) || "VTUGATE could not verify this smartcard", 422, true);
    return { customerName };
  }

  async purchase(input: Parameters<VtuProvider["purchase"]>[0]) {
    if (!vtugateConfig().purchasesEnabled) throw new VtugateError("VTUGATE purchases are disabled by the server safety lock", 503, true);
    let path = "", body: Json = { client_reference: input.reference }; const requestedMinor = input.amountMinor;
    if (input.type === "airtime") {
      if (input.amountMinor > 500_000) throw new VtugateError("Airtime purchases are limited to ₦5,000 while split delivery is disabled", 400, true);
      const service = (await fetchServices(this.client, "airtime")).find((item) => matchesNetwork(item, input.network || ""));
      if (!service || !input.phone) throw new VtugateError("The selected airtime network is unavailable", 409, true);
      path = "buyairtime"; body = { ...body, service_id: serviceId(service), phone_number: input.phone, amount: input.amountMinor / 100 };
    } else if (input.type === "data") {
      if (!input.providerServiceId || !input.providerPlanCode || !input.phone) throw new VtugateError("Incomplete VTUGATE data purchase details", 400, true);
      path = "buydata"; body = { ...body, service_id: input.providerServiceId, phone_number: input.phone, amount: input.amountMinor / 100, plan_code: input.providerPlanCode };
    } else if (input.type === "electricity") {
      if (!input.provider || !input.meterNumber || !input.phone) throw new VtugateError("Incomplete VTUGATE electricity purchase details", 400, true);
      const provider = await this.electricityProvider(input.provider);
      path = "buyelectricity"; body = { ...body, service_id: provider.id, meter_no: input.meterNumber, disco: provider.code, amount: input.amountMinor / 100, phone_number: input.phone };
    } else {
      if (!input.providerServiceId || !input.providerPlanCode || !input.planName || !input.smartcardNumber || !input.phone) throw new VtugateError("Incomplete VTUGATE cable purchase details", 400, true);
      path = "buycabletv"; body = { ...body, service_id: input.providerServiceId, phone: input.phone, smartcard_number: input.smartcardNumber, amount: input.amountMinor / 100, plan_code: input.providerPlanCode, plan_name: input.planName };
    }
    return responseStatus(await this.client.post(path, body), input.reference, requestedMinor);
  }

  async requery(reference: string) { return responseStatus(await this.client.post("transactionstatus", { client_reference: reference, requery: true }), reference); }
}

export function newVtuReference() { return `${Date.now()}${randomBytes(6).toString("hex")}`; }
export async function vtuReferenceFor(uid: string, service: string, key: string) {
  const db = adminDb(), id = createHash("sha256").update(`${uid}:${key}`).digest("hex"), doc = db.collection("vtuIdempotency").doc(id);
  return db.runTransaction(async (tx) => { const snapshot = await tx.get(doc); if (snapshot.exists) return str(snapshot.data()?.reference); const reference = newVtuReference(); tx.create(doc, { uid, service, reference, provider: "vtugate", createdAt: new Date() }); return reference; });
}
