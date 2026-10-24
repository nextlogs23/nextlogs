import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("Telnyx uses server-only credentials and purchases remain fail-closed", () => {
  const env = read(".env.example");
  const provider = read("src/lib/server/telnyx.ts");
  assert.match(env, /^TELNYX_API_KEY=$/m);
  assert.match(env, /^TELNYX_PUBLIC_KEY=$/m);
  assert.match(env, /^TELNYX_PURCHASES_ENABLED=false$/m);
  assert.match(provider, /required\("TELNYX_API_KEY"\)/);
  assert.match(provider, /required\("TELNYX_PUBLIC_KEY"\)/);
  assert.doesNotMatch(env, /^NEXT_PUBLIC_TELNYX_/m);
});

test("search requests exact SMS-capable inventory and the UI previews exact numbers", () => {
  const provider = read("src/lib/server/telnyx.ts");
  const workspace = read("src/components/dashboard/workspace.tsx");
  assert.match(provider, /availablePhoneNumbers\.list/);
  assert.match(provider, /features: \["sms"\]/);
  assert.match(provider, /exclude_held_numbers: true/);
  assert.match(workspace, /select an exact available number/);
  assert.match(workspace, /Purchase selected number/);
});

test("admin health check performs read-only authentication, inventory and profile checks", () => {
  const route = read("src/app/api/admin/telnyx/health/route.ts");
  assert.match(route, /requireAdmin/);
  assert.match(route, /balance\.retrieve/);
  assert.match(route, /availablePhoneNumbers\.list/);
  assert.match(route, /messagingProfiles\.retrieve/);
  assert.doesNotMatch(route, /numberOrders\.create/);
});

test("webhook verifies the raw body and stores owner-scoped messages idempotently", () => {
  const webhook = read("src/app/api/webhooks/telnyx/route.ts");
  assert.match(webhook, /request\.text\(\)/);
  assert.match(webhook, /webhooks\.unwrap/);
  assert.match(webhook, /telnyxWebhookEvents/);
  assert.match(webhook, /userId: number\.userId/);
  assert.match(webhook, /inboundMessages/);
});

test("wallet reservation, duplicate prevention and confirmed refunds are atomic", () => {
  const wallet = read("src/lib/server/wallet.ts");
  const orders = read("src/app/api/sms/orders/route.ts");
  const status = read("src/app/api/sms/orders/[reference]/route.ts");
  const webhook = read("src/app/api/webhooks/telnyx/route.ts");
  assert.match(wallet, /export async function finalizePurchaseRefund/);
  assert.match(orders, /providerOrder: \{ collection: "telnyxOrders"/);
  assert.match(orders, /if \(reservation\.idempotent\)/);
  assert.match(orders, /"Idempotency-Key": reference/);
  assert.match(status, /finalizePurchaseRefund/);
  assert.match(webhook, /finalizePurchaseRefund/);
});

test("Firestore rules and indexes protect Telnyx records", () => {
  const rules = read("firestore.rules");
  const indexes = JSON.parse(read("firestore.indexes.json"));
  for (const collection of ["wallets", "walletTransactions", "transactions", "telnyxSearchOffers", "telnyxOrders", "purchasedNumbers", "inboundMessages", "telnyxWebhookEvents"]) {
    assert.match(rules, new RegExp(`match /${collection}/\\{id\\} \\{ allow read, write: if false; \\}`));
  }
  const indexed = new Set(indexes.indexes.map((index) => `${index.collectionGroup}:${index.fields.map((field) => `${field.fieldPath}:${field.order}`).join(",")}`));
  assert.ok(indexed.has("telnyxOrders:userId:ASCENDING,createdAt:DESCENDING"));
  assert.ok(indexed.has("inboundMessages:purchasedNumberId:ASCENDING,receivedAt:DESCENDING"));
});
