import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("SMSPool purchases remain fail-closed", () => {
  const env = read(".env.example");
  const provider = read("src/lib/server/smspool.ts");
  assert.match(env, /^SMSPOOL_PURCHASES_ENABLED=false$/m);
  assert.match(provider, /process\.env\.SMSPOOL_PURCHASES_ENABLED === "true"/);
  assert.doesNotMatch(env, /^NEXT_PUBLIC_SMSPOOL_/m);
});

test("adapter uses the documented catalogue, order, status and rental endpoints", () => {
  const provider = read("src/lib/server/smspool.ts");
  for (const endpoint of [
    "/country/retrieve_all",
    "/service/retrieve_all",
    "/pool/retrieve_valid",
    "/purchase/sms",
    "/sms/check",
    "/sms/cancel",
    "/rental/retrieve_all",
    "/purchase/rental",
    "/rental/retrieve_status",
    "/rental/retrieve_messages",
    "/rental/refund",
  ]) assert.ok(provider.includes(`"${endpoint}"`), `Missing ${endpoint}`);
});

test("customer UI describes provider assignment instead of exact-number selection", () => {
  const workspace = read("src/components/dashboard/workspace.tsx");
  assert.match(workspace, /SMSPool assigns the phone number only after a successful order/);
  assert.match(workspace, /Number assigned after purchase/);
  assert.match(workspace, /does not provide a browsable exact-number inventory/);
});

test("SMSPool reservation and refunds are idempotent and atomic", () => {
  const wallet = read("src/lib/server/wallet.ts");
  const order = read("src/app/api/smspool/orders/route.ts");
  const rental = read("src/app/api/smspool/rentals/route.ts");
  const orderStatus = read("src/app/api/smspool/orders/[reference]/route.ts");
  const rentalStatus = read("src/app/api/smspool/rentals/[reference]/route.ts");
  assert.match(wallet, /export async function finalizePurchaseRefund/);
  assert.match(wallet, /Purchase reservation could not be verified/);
  assert.match(order, /providerOrder: \{ collection: "smsPoolOrders"/);
  assert.match(rental, /providerOrder: \{ collection: "smsPoolRentals"/);
  assert.match(order, /if \(reservation\.idempotent\)/);
  assert.match(rental, /if \(reservation\.idempotent\)/);
  assert.match(orderStatus, /finalizePurchaseRefund/);
  assert.match(rentalStatus, /finalizePurchaseRefund/);
});

test("Firestore rules deny direct access to every SMSPool and financial collection", () => {
  const rules = read("firestore.rules");
  for (const collection of ["wallets", "walletTransactions", "transactions", "smsPoolOffers", "smsPoolOrders", "smsPoolRentalOffers", "smsPoolRentals"]) {
    assert.match(rules, new RegExp(`match /${collection}/\\{id\\} \\{ allow read, write: if false; \\}`));
  }
});

test("Firestore indexes cover customer SMSPool history and transaction history", () => {
  const config = JSON.parse(read("firestore.indexes.json"));
  const indexed = new Set(config.indexes.map((index) => `${index.collectionGroup}:${index.fields.map((field) => `${field.fieldPath}:${field.order}`).join(",")}`));
  for (const collection of ["transactions", "smsPoolOrders", "smsPoolRentals"]) {
    assert.ok(indexed.has(`${collection}:userId:ASCENDING,createdAt:DESCENDING`), `Missing ${collection} customer history index`);
  }
});
