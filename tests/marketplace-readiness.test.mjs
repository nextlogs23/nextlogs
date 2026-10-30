import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("marketplace customer and admin routes require authenticated principals", () => {
  assert.match(read("src/app/api/marketplace/products/route.ts"), /requireUser/);
  assert.match(read("src/app/api/marketplace/products/[id]/route.ts"), /requireUser/);
  assert.match(read("src/app/api/marketplace/orders/route.ts"), /requireUser/);
  assert.match(read("src/app/api/admin/marketplace/route.ts"), /requireAdmin/);
});

test("product options use preview links, are ordered, and expose only active public records", () => {
  const admin = read("src/app/api/admin/marketplace/route.ts");
  const helper = read("src/lib/server/marketplace.ts");
  assert.match(admin, /productOptionSchema/);
  assert.match(admin, /Every product option must have a unique ID/);
  assert.match(admin, /Preview links must use HTTP or HTTPS/);
  assert.match(helper, /option\.active !== true/);
  assert.match(helper, /sort\(\(a, b\) => a\.displayOrder - b\.displayOrder/);
});

test("internal option checkout validates option state and server-side price", () => {
  const route = read("src/app/api/marketplace/orders/route.ts");
  assert.match(route, /This product option is disabled or unavailable/);
  assert.match(route, /const priceMinor = selectedOption\?\.priceMinor \?\? product\.priceMinor/);
  assert.doesNotMatch(route, /External options must be opened using their purchase link/);
  assert.match(route, /optionId: selectedOption\?\.id/);
});

test("private product files require a completed owner order", () => {
  const upload = read("src/app/api/admin/marketplace/file/route.ts");
  const download = read("src/app/api/marketplace/orders/[reference]/download/route.ts");
  const order = read("src/app/api/marketplace/orders/route.ts");
  assert.match(upload, /requireAdmin/);
  assert.match(upload, /access: "private"/);
  assert.match(download, /requireUser/);
  assert.match(download, /order\?\.userId !== user\.uid/);
  assert.match(download, /\["successful", "completed"\]/);
  assert.match(download, /get\(file\.pathname, \{ access: "private" \}\)/);
  assert.match(order, /downloadUrl/);
});

test("every marketplace product has a customer details route", () => {
  const details = read("src/components/dashboard/marketplace-product-details.tsx");
  const catalogue = read("src/components/dashboard/marketplace-workspace.tsx");
  assert.match(catalogue, /dashboard\/marketplace\/\$\{product\.id\}/);
  assert.match(details, /product\.options\.map/);
  assert.match(details, /target="_blank" rel="noopener noreferrer"/);
  assert.match(details, /optionId: option\?\.id/);
});

test("catalog responses expose neither delivery URLs nor retired product links", () => {
  const helper = read("src/lib/server/marketplace.ts");
  const publicProjection = helper.slice(helper.indexOf("export function publicMarketplaceProduct"));
  assert.doesNotMatch(publicProjection, /deliveryUrl/);
  assert.doesNotMatch(publicProjection, /resourceLinks/);
  assert.doesNotMatch(read("src/components/dashboard/marketplace-product-details.tsx"), /Product links/);
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

test("customer order history works before the composite index finishes deploying", () => {
  const route = read("src/app/api/marketplace/orders/route.ts");
  const customerRead = route.slice(route.indexOf("export async function GET"), route.indexOf("export async function POST"));
  assert.match(customerRead, /where\("userId", "==", user\.uid\)\.limit\(100\)/);
  assert.doesNotMatch(customerRead, /orderBy/);
  assert.match(customerRead, /\.sort\(/);
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
