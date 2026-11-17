import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("PocketFi credentials remain server-only and sandbox/live URLs are explicit", () => {
  const env = read(".env.example");
  const provider = read("src/lib/server/pocketfi.ts");
  const workspace = read("src/components/dashboard/workspace.tsx");
  assert.match(env, /POCKETFI_API_TOKEN=/);
  assert.match(env, /POCKETFI_BUSINESS_ID=/);
  assert.match(env, /POCKETFI_API_URL=https:\/\/api\.pocketfi\.ng\/api\/test/);
  assert.match(provider, /import "server-only"/);
  assert.match(provider, /https:\/\/api\.pocketfi\.ng\/api\/v1/);
  assert.match(provider, /https:\/\/api\.pocketfi\.ng\/api\/test/);
  assert.match(provider, /Authorization: `Bearer \$\{apiToken\(\)\}`/);
  assert.doesNotMatch(workspace, /POCKETFI_API_TOKEN|POCKETFI_BUSINESS_ID/);
});

test("new wallet checkout uses authenticated PocketFi initialization and protected intents", () => {
  const route = read("src/app/api/wallet/fund/route.ts");
  const provider = read("src/lib/server/pocketfi.ts");
  assert.match(route, /requireUser\(request\)/);
  assert.match(route, /walletFundingIntents/);
  assert.match(route, /createPocketFiPayment/);
  assert.match(route, /provider: "pocketfi"/);
  assert.match(route, /providerReference: payment\.payment_id/);
  assert.match(route, /customerPhone/);
  assert.match(provider, /\/checkout\/request/);
  assert.match(provider, /business_id: businessId\(\)/);
  assert.match(provider, /redirect_link: input\.redirectUrl/);
  assert.match(provider, /amount: \(input\.amountMinor \/ 100\)\.toFixed\(2\)/);
  assert.match(route, /https:\/\/www\.nextlogs\.online/);
  assert.match(route, /checkoutReturnUrl\(request\)/);
  assert.match(route, /x-forwarded-host/);
});

test("PocketFi confirmation verifies payment server-side before idempotent wallet credit", () => {
  const verify = read("src/app/api/wallet/fund/verify/route.ts");
  const settlement = read("src/lib/server/pocketfi-funding.ts");
  assert.match(verify, /requireUser\(request\)/);
  assert.match(verify, /expectedUserId: user\.uid/);
  assert.match(verify, /intent\.provider === "pocketfi"/);
  assert.match(settlement, /confirmPocketFiPayment/);
  assert.match(settlement, /actualAmount === intent\.amountMinor/);
  assert.match(settlement, /currency === "NGN"/);
  assert.match(settlement, /reference: `credit_\$\{intent\.reference\}`/);
  assert.match(settlement, /applyWalletEntry/);
});

test("PocketFi webhook verifies raw-body HMAC-SHA512 signatures and supports duplicate-safe settlement", () => {
  const webhook = read("src/app/api/webhooks/pocketfi/route.ts");
  const settlement = read("src/lib/server/pocketfi-funding.ts");
  assert.match(webhook, /request\.arrayBuffer\(\)/);
  assert.match(webhook, /createHmac\("sha512", secret\)\.update\(raw\)/);
  assert.match(webhook, /timingSafeEqual/);
  assert.match(webhook, /http_pocketfi_signature/);
  assert.match(webhook, /settlePocketFiFunding/);
  assert.match(settlement, /if \(intent\.status === "successful"\)/);
  assert.match(settlement, /status: "successful"/);
});

test("legacy Paymonetra reconciliation remains available only for existing intents", () => {
  const verify = read("src/app/api/wallet/fund/verify/route.ts");
  const legacy = read("src/lib/server/paymonetra-funding.ts");
  const env = read(".env.example");
  assert.match(verify, /settlePaymonetraFunding/);
  assert.match(verify, /reconcilePaymonetraFundingsForUser/);
  assert.match(legacy, /provider === "paymonetra"/);
  assert.match(env, /Legacy Paymonetra values are read only/);
});

test("wallet funding UI identifies PocketFi without exposing provider credentials", () => {
  const workspace = read("src/components/dashboard/workspace.tsx");
  const dashboard = read("src/components/dashboard/dashboard-home.tsx");
  assert.match(workspace, /PocketFi/);
  assert.match(dashboard, /Add funds through PocketFi/);
  assert.doesNotMatch(workspace, /PAYMONETRA_SECRET_KEY|POCKETFI_API_TOKEN/);
});
