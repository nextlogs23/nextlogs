import "server-only";
import { createHash } from "node:crypto";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { z } from "zod";
import { adminDb } from "@/lib/server/firebase-admin";

const BASE_URL = "https://accszone.com/api/v1";
const REQUEST_TIMEOUT_MS = 12_000;
const MAX_BODY_BYTES = 2 * 1024 * 1024;
const RATE_LIMIT = 12;
const RATE_WINDOW_MS = 60_000;
const SECRET_KEY_NAMES = /token|secret|password|credential|cookie|authorization|api[_-]?key|private[_-]?key|access[_-]?key|session/i;
const SAFE_TEXT = /^[A-Za-z0-9][A-Za-z0-9 ._:/+()\-]*$/;

const slugSchema = z.string().trim().min(1).max(240).regex(/^[A-Za-z0-9][A-Za-z0-9._~\-]*$/);
const filterSchema = z.string().trim().min(1).max(240).regex(SAFE_TEXT);
const cursorSchema = z.string().trim().min(1).max(512).regex(/^[A-Za-z0-9._~:/+\-=]+$/);
const pageSchema = z.string().regex(/^[1-9][0-9]{0,3}$/).transform(Number).refine((value) => value <= 10_000);
const limitSchema = z.string().regex(/^(?:[1-9]|[1-9][0-9]|100)$/).transform(Number);

export const accsZoneListingSchema = z.object({
  slug: slugSchema,
  title: z.string().trim().min(1).max(500),
  description: z.string().max(20_000).optional().nullable(),
  category: z.string().max(240).optional().nullable(),
  subcategory: z.string().max(240).optional().nullable(),
  price: z.union([z.string().max(80), z.number().finite()]).optional().nullable(),
  currency: z.string().max(12).optional().nullable(),
  status: z.string().max(80).optional().nullable(),
  available: z.boolean().optional().nullable(),
  image: z.string().url().max(2_000).optional().nullable(),
  url: z.string().url().max(2_000).optional().nullable(),
});

const pageEnvelopeSchema = z.object({
  items: z.array(z.unknown()).optional(), listings: z.array(z.unknown()).optional(), data: z.array(z.unknown()).optional(),
  nextPage: z.union([z.string(), z.number()]).optional().nullable(), nextCursor: z.string().optional().nullable(),
  page: z.number().optional(), total: z.number().optional(), totalPages: z.number().optional(),
});

export const accsZoneAllowlistInputSchema = z.object({
  slug: slugSchema,
  contentFingerprint: z.string().regex(/^[a-f0-9]{32}$/),
  credentialFreeConfirmed: z.literal(true),
  customerVisible: z.literal(false).optional().default(false),
  purchasesEnabled: z.literal(false).optional().default(false),
  confirmationFlags: z.object({ noAccountLogins: z.literal(true), noPasswords: z.literal(true), noSessionTokens: z.literal(true), noRestrictedContent: z.literal(true) }).optional().default({ noAccountLogins: true, noPasswords: true, noSessionTokens: true, noRestrictedContent: true }),
}).strict();

export type AccsZoneListing = z.infer<typeof accsZoneListingSchema>;
export type AccsZoneAllowlistInput = z.infer<typeof accsZoneAllowlistInputSchema>;
export type AccsZoneListingsQuery = { category?: string; subcategory?: string; page?: number; cursor?: string; limit: number };

function fingerprint(value: string) { return createHash("sha256").update(value).digest("hex").slice(0, 32); }
function stableSanitized(value: unknown, depth = 0): unknown {
  if (depth > 6 || value === null || typeof value === "boolean" || typeof value === "number" || typeof value === "string") return typeof value === "string" ? value.slice(0, 20_000) : value;
  if (Array.isArray(value)) return value.slice(0, 100).map((item) => stableSanitized(item, depth + 1));
  if (typeof value === "object") return Object.keys(value as Record<string, unknown>).filter((key) => !SECRET_KEY_NAMES.test(key)).sort().slice(0, 100).reduce<Record<string, unknown>>((out, key) => { out[key] = stableSanitized((value as Record<string, unknown>)[key], depth + 1); return out; }, {});
  return null;
}

export function accsZoneCacheKey(path: string, params: Record<string, unknown> = {}) {
  const keyFingerprint = fingerprint(process.env.ACCZONE_API_KEY || "unconfigured");
  const query = JSON.stringify(Object.keys(params).sort().map((key) => [key, params[key]]));
  return `accszone:${fingerprint(`${keyFingerprint}:${path}?${query}`)}`;
}

export function accsZoneContentFingerprint(value: unknown) { return fingerprint(JSON.stringify(stableSanitized(value))); }

function classifyError(error: unknown): Error & { status?: number; code?: string } {
  if (error instanceof z.ZodError) return Object.assign(new Error("AccsZone returned an invalid response"), { status: 502, code: "ACCSZONE_INVALID_RESPONSE" });
  const value = error as { name?: string; message?: string; status?: number; code?: string };
  if (value?.code === "ACCSZONE_RESPONSE_TOO_LARGE") return Object.assign(new Error("AccsZone response exceeded the 2 MiB limit"), { status: 502, code: value.code });
  if (value?.code === "ACCSZONE_BODY_READ_FAILED") return Object.assign(new Error("AccsZone response body could not be read"), { status: 502, code: value.code });
  if (value?.code === "ACCSZONE_INVALID_JSON") return Object.assign(new Error("AccsZone returned invalid JSON"), { status: 502, code: value.code });
  if (value?.name === "AbortError") return Object.assign(new Error("AccsZone request timed out"), { status: 504, code: "ACCSZONE_TIMEOUT" });
  if (value?.code === "ACCSZONE_RATE_LIMIT") return Object.assign(new Error("AccsZone review rate limit reached; try again shortly"), { status: 429, code: value.code });
  if (value?.code === "ACCSZONE_NOT_CONFIGURED") return Object.assign(new Error("AccsZone integration is not configured"), { status: 503, code: value.code });
  if (value?.code === "ACCSZONE_INVALID_INPUT") return Object.assign(new Error(value.message || "Invalid AccsZone input"), { status: 400, code: value.code });
  return Object.assign(new Error("AccsZone is temporarily unavailable"), { status: 502, code: "ACCSZONE_UNAVAILABLE" });
}

async function enforceRateLimit() {
  const db = adminDb(); const ref = db.collection("rateLimits").doc("accszone-shared-readonly"); const now = Date.now();
  try { await db.runTransaction(async (transaction) => { const snapshot = await transaction.get(ref); const data = snapshot.data() || {}; const started = Number(data.windowStartedAt || 0); const count = Number(data.count || 0); const active = started > 0 && now - started < RATE_WINDOW_MS; if (active && count >= RATE_LIMIT) throw Object.assign(new Error("rate limited"), { code: "ACCSZONE_RATE_LIMIT" }); transaction.set(ref, { windowStartedAt: active ? started : now, count: active ? count + 1 : 1, updatedAt: FieldValue.serverTimestamp() }, { merge: true }); }); } catch (error) { if ((error as { code?: string }).code === "ACCSZONE_RATE_LIMIT") throw error; throw Object.assign(new Error("AccsZone rate-limit state unavailable"), { status: 503, code: "ACCSZONE_RATE_LIMIT_FAIL_CLOSED" }); }
}

async function readBody(response: Response) {
  const declared = response.headers.get("content-length");
  if (declared && (!/^\d+$/.test(declared) || Number(declared) > MAX_BODY_BYTES)) throw Object.assign(new Error("response too large"), { code: "ACCSZONE_RESPONSE_TOO_LARGE" });
  if (!response.body) return "";
  const reader = response.body.getReader(); const chunks: Uint8Array[] = []; let size = 0;
  try { while (true) { const part = await reader.read(); if (part.done) break; size += part.value.byteLength; if (size > MAX_BODY_BYTES) throw Object.assign(new Error("response too large"), { code: "ACCSZONE_RESPONSE_TOO_LARGE" }); chunks.push(part.value); } } catch (error) { if ((error as { code?: string }).code === "ACCSZONE_RESPONSE_TOO_LARGE") throw error; throw Object.assign(new Error("body read failed"), { code: "ACCSZONE_BODY_READ_FAILED" }); } finally { reader.releaseLock(); }
  const output = new Uint8Array(size); let offset = 0; for (const chunk of chunks) { output.set(chunk, offset); offset += chunk.byteLength; } return new TextDecoder().decode(output);
}

function sanitizeProvider(value: unknown, depth = 0): unknown {
  if (depth > 5 || value === null || typeof value === "boolean" || typeof value === "number") return value;
  if (typeof value === "string") return value.slice(0, 20_000);
  if (Array.isArray(value)) return value.slice(0, 100).map((item) => sanitizeProvider(item, depth + 1));
  if (typeof value === "object") return Object.entries(value as Record<string, unknown>).slice(0, 100).reduce<Record<string, unknown>>((out, [key, item]) => { if (!SECRET_KEY_NAMES.test(key)) out[key.slice(0, 100)] = sanitizeProvider(item, depth + 1); return out; }, {});
  return null;
}

function endpoint(path: string, params: Record<string, string | number | undefined> = {}) { const url = new URL(`${BASE_URL}/${path.replace(/^\//, "")}`); for (const [key, value] of Object.entries(params)) if (value !== undefined && value !== "") url.searchParams.set(key, String(value)); return url; }

async function getJson(path: string, params: Record<string, string | number | undefined> = {}) {
  const apiKey = process.env.ACCZONE_API_KEY; if (!apiKey) throw Object.assign(new Error("not configured"), { code: "ACCSZONE_NOT_CONFIGURED" }); await enforceRateLimit();
  const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try { const response = await fetch(endpoint(path, params), { method: "GET", headers: { Accept: "application/json", "X-API-Key": apiKey }, cache: "no-store", signal: controller.signal }); const text = await readBody(response); if (!response.ok) throw Object.assign(new Error(`provider status ${response.status}`), { status: response.status }); try { return sanitizeProvider(JSON.parse(text || "null")); } catch { throw Object.assign(new Error("invalid json"), { code: "ACCSZONE_INVALID_JSON" }); } } catch (error) { throw classifyError(error); } finally { clearTimeout(timer); }
}

function ttlFor(path: string) { if (path === "status" || path === "balance") return 30_000; if (path === "categories" || path.includes("/subcategories")) return 15 * 60_000; return 2 * 60_000; }
async function cachedGet(path: string, params: Record<string, string | number | undefined> = {}) { const ref = adminDb().collection("accsZoneCatalogueCache").doc(accsZoneCacheKey(path, params)); const snapshot = await ref.get(); const data = snapshot.data(); if (data?.expiresAt && data.expiresAt.toMillis?.() > Date.now()) return data.payload; const payload = await getJson(path, params); await ref.set({ keyFingerprint: ref.id.slice(-32), path, payload, fetchedAt: FieldValue.serverTimestamp(), expiresAt: Timestamp.fromMillis(Date.now() + ttlFor(path)) }); return payload; }

export async function getAccsZoneStatus() { return cachedGet("status"); }
export async function getAccsZoneCategories() { return cachedGet("categories"); }
export async function getAccsZoneSubcategories(category: string) { return cachedGet(`categories/${encodeURIComponent(category)}/subcategories`); }
export async function getAccsZoneListings(params: AccsZoneListingsQuery) { return cachedGet("listings", { ...params, page: params.page, limit: params.limit }); }
export async function getAccsZoneListing(slug: string) { return cachedGet(`listings/${encodeURIComponent(slug)}`); }
export async function getAccsZoneBalance() { return cachedGet("balance"); }

export function listingItems(payload: unknown): unknown[] { if (Array.isArray(payload)) return payload; const parsed = pageEnvelopeSchema.safeParse(payload); return parsed.success ? (parsed.data.items || parsed.data.listings || parsed.data.data || []) : []; }
export function pageMetadata(payload: unknown) { const parsed = pageEnvelopeSchema.safeParse(payload); if (!parsed.success) return { nextPage: null, nextCursor: null, page: null, total: null, totalPages: null }; return { nextPage: parsed.data.nextPage ?? null, nextCursor: parsed.data.nextCursor ?? null, page: parsed.data.page ?? null, total: parsed.data.total ?? null, totalPages: parsed.data.totalPages ?? null }; }

export function projectListing(value: unknown) { const parsed = accsZoneListingSchema.safeParse(value); if (!parsed.success) return null; const item = parsed.data; const projection = { slug: item.slug, title: item.title, description: item.description ?? "", category: item.category ?? null, subcategory: item.subcategory ?? null, price: item.price ?? null, currency: item.currency ?? null, status: item.status ?? null, available: item.available ?? null, image: item.image ?? null, url: item.url ?? null }; return { ...projection, contentFingerprint: accsZoneContentFingerprint(projection) }; }

function projectNamedValues(payload: unknown, key: "categories" | "subcategories") { const values = Array.isArray(payload) ? payload : (payload && typeof payload === "object" && Array.isArray((payload as Record<string, unknown>)[key]) ? (payload as Record<string, unknown>)[key] as unknown[] : []); return values.slice(0, 100).map((value) => typeof value === "string" ? { name: value } : value && typeof value === "object" && typeof (value as { name?: unknown }).name === "string" ? { name: (value as { name: string }).name, slug: typeof (value as { slug?: unknown }).slug === "string" ? (value as { slug: string }).slug : null } : null).filter(Boolean); }
export function projectCategories(payload: unknown) { return projectNamedValues(payload, "categories"); }
export function projectSubcategories(payload: unknown) { return projectNamedValues(payload, "subcategories"); }
export function projectStatus(payload: unknown) { const value = payload && typeof payload === "object" ? payload as Record<string, unknown> : {}; return { status: typeof value.status === "string" ? value.status : null, healthy: typeof value.healthy === "boolean" ? value.healthy : null, configured: true, readOnly: true }; }
export function projectBalance(payload: unknown) { const value = payload && typeof payload === "object" ? payload as Record<string, unknown> : {}; return { balance: typeof value.balance === "number" || typeof value.balance === "string" ? value.balance : null, currency: typeof value.currency === "string" ? value.currency : null }; }

export function parseListingsQuery(searchParams: URLSearchParams): AccsZoneListingsQuery { const parse = <T>(schema: z.ZodType<T>, key: string): T | undefined => { const raw = searchParams.get(key); if (raw === null || raw === "") return undefined; const result = schema.safeParse(raw); if (!result.success) throw Object.assign(new Error(`Invalid ${key}`), { status: 400, code: "ACCSZONE_INVALID_INPUT" }); return result.data; }; return { category: parse(filterSchema, "category"), subcategory: parse(filterSchema, "subcategory"), page: parse(pageSchema, "page"), cursor: parse(cursorSchema, "cursor"), limit: parse(limitSchema, "limit") ?? 25 }; }
export function parseSlug(value: string) { const result = slugSchema.safeParse(value); if (!result.success) throw Object.assign(new Error("Invalid slug"), { status: 400, code: "ACCSZONE_INVALID_INPUT" }); return result.data; }

export async function refreshAndPrepareAllowlist(input: AccsZoneAllowlistInput) { const detail = await getAccsZoneListing(input.slug); const listing = projectListing(detail); if (!listing) throw Object.assign(new Error("AccsZone listing detail could not be validated"), { status: 422 }); if (input.contentFingerprint !== listing.contentFingerprint) throw Object.assign(new Error("Listing changed since it was loaded; refresh the exact listing before review"), { status: 409, code: "ACCSZONE_FINGERPRINT_MISMATCH" }); const restriction = marketplaceProductRestrictionAccsZone(listing.title, listing.description); if (restriction) throw Object.assign(new Error(restriction), { status: 422, code: "ACCSZONE_RESTRICTED" }); return { ...listing, customerVisible: false, purchasesEnabled: false, credentialFreeConfirmed: false, restrictionCleared: false, confirmationFlags: { ...input.confirmationFlags }, providerRefreshedAt: FieldValue.serverTimestamp() }; }
export function marketplaceProductRestrictionAccsZone(...values: string[]) { const prohibited = /\b(account\s+logins?|passwords?|session\s+tokens?|browser\s+cookies?|recovery\s+(?:codes?|info)|verification\s+bypass|kyc\s+bypass|stolen\s+(?:data|accounts?|credentials?)|hacked\s+(?:data|accounts?|credentials?)|followers?|likes?|views?|engagement|bots?|proxies?|proxy|vpn|vps|rdp|iptv|leads?|contact\s+databases?)\b/i; return values.some((value) => prohibited.test(value)) ? "AccsZone listing contains prohibited account, credential, bypass, stolen-data, engagement, proxy, IPTV, or contact-database language." : null; }
export function accsZoneError(error: unknown) { return classifyError(error); }
