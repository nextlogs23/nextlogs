import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("transactional email remains server-only, configurable, and idempotent", () => {
  const email = read("src/lib/server/email-notifications.ts");
  const env = read(".env.example");
  assert.match(email, /import "server-only"/);
  assert.match(email, /https:\/\/api\.resend\.com\/emails/);
  assert.match(email, /"Idempotency-Key"/);
  assert.match(email, /wallet-funded-customer\/\$\{input\.reference\}/);
  assert.match(email, /marketplace-purchase-customer\/\$\{input\.reference\}/);
  assert.match(email, /TRANSACTION_NOTIFICATION_EMAIL/);
  assert.match(email, /nextlog23@gmail\.com/);
  assert.match(env, /TRANSACTION_NOTIFICATION_EMAIL=nextlog23@gmail\.com/);
  assert.doesNotMatch(env, /NEXT_PUBLIC_RESEND/);
});

test("marketplace checkout emails the customer and administrator only after the atomic purchase", () => {
  const route = read("src/app/api/marketplace/orders/route.ts");
  const commit = route.indexOf("await db.runTransaction");
  const notification = route.indexOf("await sendMarketplacePurchaseNotifications");
  assert.ok(commit >= 0 && notification > commit);
  assert.match(route, /emailNotification/);
  assert.match(route, /notificationComplete/);
  assert.match(route, /customerEmail: user\.email/);
});

test("confirmed Paymonetra and approved manual funding notify without controlling wallet settlement", () => {
  const paymonetra = read("src/lib/server/paymonetra-funding.ts");
  const manual = read("src/app/api/admin/manual-funding/route.ts");
  assert.ok(paymonetra.lastIndexOf("await notifySuccessfulFunding") > paymonetra.indexOf("await applyWalletEntry"));
  assert.match(paymonetra, /wallet credit must never be rolled back/);
  assert.ok(manual.indexOf("await sendWalletFundingNotifications") > manual.indexOf("await db.runTransaction"));
  assert.match(manual, /fundingEmailNotification/);
  assert.match(manual, /Manual bank transfer/);
});

test("customer emails never include marketplace deliverables or payment proof attachments", () => {
  const email = read("src/lib/server/email-notifications.ts");
  assert.doesNotMatch(email, /deliveryText|downloadFile|proof\.pathname|attachments/);
  assert.match(email, /Never share your password or one-time code by email/);
});
