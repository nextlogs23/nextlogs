import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("BloomSMS stays disabled by default and credentials remain server-only", async () => {
  const [env, provider, client] = await Promise.all([read(".env.example"), read("src/lib/server/bloomsms.ts"), read("src/components/dashboard/workspace.tsx")]);
  assert.match(env, /BLOOMSMS_PURCHASES_ENABLED=false/);
  assert.match(provider, /import "server-only"/);
  assert.match(provider, /process\.env\.BLOOMSMS_API_KEY/);
  assert.doesNotMatch(client, /BLOOMSMS_API_KEY/);
});

test("customer routes use protected offers, idempotency and atomic wallet operations", async () => {
  const [orders, rentals] = await Promise.all([read("src/app/api/bloomsms/orders/route.ts"), read("src/app/api/bloomsms/rentals/route.ts")]);
  for (const source of [orders, rentals]) {
    assert.match(source, /requireUser/);
    assert.match(source, /idempotencyKey/);
    assert.match(source, /reservePurchase/);
    assert.match(source, /finalizePurchaseRefund/);
    assert.match(source, /bloomSmsPurchasesEnabled/);
  }
});

test("provider-assigned flow does not promise exact-number selection", async () => {
  const [offers, workspace] = await Promise.all([read("src/app/api/bloomsms/offers/route.ts"), read("src/components/dashboard/workspace.tsx")]);
  assert.match(offers, /exactNumberSelectionSupported: false/);
  assert.match(workspace, /Number assigned after purchase/);
  assert.match(workspace, /\/api\/bloomsms\/orders/);
});

test("live countries include real ISO-derived flag images with a neutral fallback", async () => {
  const [provider, workspace] = await Promise.all([read("src/lib/server/bloomsms.ts"), read("src/components/dashboard/workspace.tsx")]);
  assert.match(provider, /countryCodeForName/);
  assert.match(provider, /flagForCountryCode/);
  assert.match(provider, /"🌐"/);
  assert.match(workspace, /className="country-flag"/);
  assert.match(workspace, /https:\/\/flagcdn\.com\/w40\//);
  assert.match(workspace, /alt=\{`\$\{item\.name\} flag`\}/);
  assert.match(workspace, /preferredCountries = \["US", "GB", "DE", "PL", "IT"\]/);
  assert.match(workspace, /preferredCountries\.indexOf\(a\.countryCode/);
});

test("monthly rentals render recognizable service logos with a safe fallback", async () => {
  const [workspace, config] = await Promise.all([read("src/components/dashboard/workspace.tsx"), read("next.config.ts")]);
  assert.match(workspace, /function RentalBrandLogo/);
  assert.match(workspace, /facebook\/1877F2/);
  assert.match(workspace, /whatsapp\/25D366/);
  assert.match(workspace, /wechat\/07C160/);
  assert.match(workspace, /<RentalBrandLogo serviceName=\{offer\.name\} \/>/);
  assert.match(config, /cdn\.simpleicons\.org/);
});

test("Firestore denies direct provider-record access and declares user history indexes", async () => {
  const [rules, indexes] = await Promise.all([read("firestore.rules"), read("firestore.indexes.json")]);
  assert.match(rules, /match \/bloomSmsOrders\/\{id\} \{ allow read, write: if false; \}/);
  const parsed = JSON.parse(indexes);
  assert.ok(parsed.indexes.some((index) => index.collectionGroup === "bloomSmsOrders"));
  assert.ok(parsed.indexes.some((index) => index.collectionGroup === "bloomSmsRentals"));
});

test("ambiguous provider outcomes are not automatically refunded", async () => {
  const [provider, orders, rentals] = await Promise.all([read("src/lib/server/bloomsms.ts"), read("src/app/api/bloomsms/orders/route.ts"), read("src/app/api/bloomsms/rentals/route.ts")]);
  assert.match(provider, /NETWORK_ERROR", false/);
  assert.match(orders, /INCOMPLETE_RESPONSE", false/);
  assert.match(rentals, /INCOMPLETE_RESPONSE", false/);
});
