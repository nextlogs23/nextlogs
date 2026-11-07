import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("Paymonetra credentials remain server-only and Paystack is removed", () => {
  const env = read(".env.example");
  const provider = read("src/lib/server/paymonetra.ts");
  const workspace = read("src/components/dashboard/workspace.tsx");
  assert.match(env, /PAYMONETRA_SECRET_KEY=/);
  assert.match(env, /PAYMONETRA_WEBHOOK_SECRET=/);
  assert.doesNotMatch(env, /NEXT_PUBLIC_PAYMONETRA|PAYSTACK/);
  assert.match(provider, /import "server-only"/);
  assert.match(provider, /https:\/\/api\.paymonetra\.com\/v1/);
  assert.doesNotMatch(workspace, /PAYMONETRA_SECRET_KEY|PAYMONETRA_WEBHOOK_SECRET/);
});

test("wallet checkout uses authenticated idempotent Paymonetra payments", () => {
  const route = read("src/app/api/wallet/fund/route.ts");
  const provider = read("src/lib/server/paymonetra.ts");
  assert.match(route, /requireUser\(request\)/);
  assert.match(route, /walletFundingIntents/);
  assert.match(route, /createPaymonetraPayment/);
  assert.match(provider, /Authorization: `Bearer \$\{paymonetraSecretKey\(\)\}`/);
  assert.match(provider, /input\.amountMinor \/ 100/);
  assert.match(provider, /reference: input\.reference/);
  assert.match(provider, /redirect_url: input\.redirectUrl/);
});

test("signed webhooks are verified over raw bytes and payments are re-queried", () => {
  const webhook = read("src/app/api/webhooks/paymonetra/route.ts");
  const settlement = read("src/lib/server/paymonetra-funding.ts");
  assert.match(webhook, /request\.arrayBuffer\(\)/);
  assert.match(webhook, /createHmac\("sha512", secret\)\.update\(raw\)/);
  assert.match(webhook, /timingSafeEqual/);
  assert.match(webhook, /event\.event !== "collection\.success"/);
  assert.match(webhook, /event\.data\.amount \* 100/);
  assert.match(settlement, /getPaymonetraPayment/);
  assert.match(settlement, /payment\.status === "paid"/);
  assert.match(settlement, /payment\.merchant_reference === intent\.reference/);
  assert.match(settlement, /amountRequested === intent\.amountMinor/);
  assert.match(settlement, /Math\.round\(amount \* 100\)/);
  assert.match(settlement, /currency === "NGN"/);
});

test("wallet credit is idempotent and redirects are verified server-side", () => {
  const settlement = read("src/lib/server/paymonetra-funding.ts");
  const verify = read("src/app/api/wallet/fund/verify/route.ts");
  const workspace = read("src/components/dashboard/workspace.tsx");
  assert.match(settlement, /reference: `credit_\$\{intent\.reference\}`/);
  assert.match(settlement, /applyWalletEntry/);
  assert.match(verify, /requireUser\(request\)/);
  assert.match(verify, /expectedUserId: user\.uid/);
  assert.match(workspace, /\/api\/wallet\/fund\/verify/);
});
