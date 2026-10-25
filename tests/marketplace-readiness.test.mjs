import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("marketplace customer and admin routes require authenticated principals", () => {
  assert.match(read("src/app/api/marketplace/products/route.ts"), /requireUser/);
  assert.match(read("src/app/api/marketplace/orders/route.ts"), /requireUser/);
  assert.match(read("src/app/api/admin/marketplace/route.ts"), /requireAdmin/);
});

test("catalog responses do not expose delivery URLs", () => {
  const helper = read("src/lib/server/marketplace.ts");
  const publicProjection = helper.slice(helper.indexOf("export function publicMarketplaceProduct"));
  assert.doesNotMatch(publicProjection, /deliveryUrl/);
});

test("purchases atomically validate stock and wallet balance", () => {
  const route = read("src/app/api/marketplace/orders/route.ts");
  assert.match(route, /runTransaction/);
  assert.match(route, /Insufficient wallet balance/);
  assert.match(route, /out of stock/);
  assert.match(route, /transaction\.update\(productRef/);
  assert.match(route, /transaction\.create\(ledgerRef/);
  assert.match(route, /transaction\.create\(orderRef/);
  assert.match(route, /transaction\.create\(transactionRef/);
});

test("duplicate marketplace purchases use a stable reference", () => {
  const helper = read("src/lib/server/marketplace.ts");
  const route = read("src/app/api/marketplace/orders/route.ts");
  assert.match(helper, /stableMarketplaceReference/);
  assert.match(route, /ledgerSnapshot\.exists && orderSnapshot\.exists/);
  assert.match(route, /idempotent: true/);
});

test("prohibited credential and fake-engagement products are rejected", () => {
  const helper = read("src/lib/server/marketplace.ts");
  const admin = read("src/app/api/admin/marketplace/route.ts");
  assert.match(helper, /account\\s\+logins/);
  assert.match(helper, /followers/);
  assert.match(helper, /verification\\s\+bypass/);
  assert.match(admin, /assertPermittedMarketplaceProduct/);
});

test("Firestore rules and indexes protect marketplace records", () => {
  const rules = read("firestore.rules");
  const indexes = JSON.parse(read("firestore.indexes.json"));
  for (const collection of ["marketplaceProducts", "marketplaceOrders"]) assert.match(rules, new RegExp(`match /${collection}/\\{id\\} \\{ allow read, write: if false; \\}`));
  assert.ok(indexes.indexes.some((index) => index.collectionGroup === "marketplaceOrders" && index.fields.map((field) => field.fieldPath).join(",") === "userId,createdAt"));
});

test("number marketplace reuses the existing provider-backed SMS flow", () => {
  const workspace = read("src/components/dashboard/marketplace-workspace.tsx");
  assert.match(workspace, /href="\/dashboard\/sms"/);
  assert.match(workspace, /Telnyx inventory/);
  assert.match(workspace, /SMSPool services/);
});
