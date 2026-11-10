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

test("fixed naira markup overrides percentage pricing for every BloomSMS product", async () => {
  const [env, provider, report] = await Promise.all([read(".env.example"), read("src/lib/server/bloomsms.ts"), read("BLOOMSMS_INTEGRATION_REPORT.md")]);
  assert.match(env, /BLOOMSMS_FIXED_MARKUP_NGN=2000/);
  assert.match(provider, /process\.env\.BLOOMSMS_FIXED_MARKUP_NGN/);
  assert.match(provider, /providerCostMinor \+ Math\.round\(fixedMarkupNgn \* 100\)/);
  assert.match(provider, /fixedMarkupNgn !== null/);
  assert.match(report, /fixed naira amount is added to every temporary-number and rental product/);
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
  assert.match(workspace, /Review number purchase/);
  assert.match(workspace, /Confirm temporary number/);
  assert.match(workspace, /purchaseAttempt\?\.offerId === offerId/);
  assert.match(workspace, /idempotencyKey: attempt\.idempotencyKey/);
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
  assert.match(workspace, /preferredCountries\.indexOf\(countryCode\(a\)/);
  assert.match(workspace, /src="\/flags\/us\.svg"/);
  assert.match(provider, /usa: "US"/);
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

test("number activity uses a visible, scroll-free launcher and accessible popup details", async () => {
  const [workspace, styles] = await Promise.all([read("src/components/dashboard/workspace.tsx"), read("src/app/globals.css")]);
  const providerWorkspace = workspace.slice(workspace.indexOf("function ProviderAssignedNumberWorkspace"), workspace.indexOf("function SmsWorkspace"));
  assert.match(providerWorkspace, /Open Number Activity/);
  assert.match(providerWorkspace, /number-activity-modal/);
  assert.match(providerWorkspace, /setActivityOpen\(true\)/);
  assert.match(providerWorkspace, /refresh\(item, item\.kind, true\)/);
  assert.doesNotMatch(providerWorkspace, /overflow-x-auto|<table|>Manage</);
  assert.match(workspace, /aria-modal="true"/);
  assert.match(workspace, /SMS and order details/);
  assert.match(workspace, /Verification code/);
  assert.match(workspace, /Copy code/);
  assert.match(workspace, /Copy full message/);
  assert.match(workspace, /navigator\.clipboard\.writeText/);
  assert.match(styles, /\.number-details-modal/);
  assert.match(styles, /\.number-message-code/);
  assert.match(styles, /\.number-activity-launcher/);
  assert.match(styles, /\.number-activity-list/);
});

test("social media SMS has a dedicated live BloomSMS catalogue experience", async () => {
  const [workspace, route, shell, home] = await Promise.all([
    read("src/components/dashboard/workspace.tsx"),
    read("src/app/dashboard/social-sms/page.tsx"),
    read("src/components/app-shell.tsx"),
    read("src/components/dashboard/dashboard-home.tsx"),
  ]);
  assert.match(workspace, /SOCIAL_SMS_SERVICE_PATTERN/);
  assert.match(workspace, /socialOnly \|\| SOCIAL_SMS_SERVICE_PATTERN\.test/);
  assert.match(workspace, /Social media SMS/);
  assert.match(workspace, /BloomSMS has no supported social-platform inventory/);
  assert.match(route, /section="social-sms"/);
  assert.match(shell, /"Social media SMS", "social-sms"/);
  assert.match(home, /href: "\/dashboard\/social-sms"/);
});

test("expired no-code orders expose an idempotent provider-confirmed refund application", async () => {
  const [route, workspace, wallet, styles, adminRoute, adminWorkspace] = await Promise.all([
    read("src/app/api/bloomsms/orders/[reference]/route.ts"),
    read("src/components/dashboard/workspace.tsx"),
    read("src/lib/server/wallet.ts"),
    read("src/app/globals.css"),
    read("src/app/api/admin/bloomsms/orders/route.ts"),
    read("src/components/admin/admin-workspace.tsx"),
  ]);
  assert.match(route, /REFUND_COUNTDOWN_ACTIVE/);
  assert.match(route, /SMS_ALREADY_RECEIVED/);
  assert.match(route, /providerConfirmedCancellation/);
  assert.match(route, /refundStatus: "pending_provider"/);
  assert.match(route, /finalizePurchaseRefund/);
  assert.match(wallet, /refundSnapshot\.exists/);
  assert.match(workspace, /smsWaitCountdown/);
  assert.match(workspace, /Apply for refund/);
  assert.match(workspace, /requestRefund/);
  assert.match(styles, /\.sms-refund-panel/);
  assert.match(adminRoute, /refundStatus: data\.refundStatus/);
  assert.match(adminWorkspace, /Refund:/);
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
