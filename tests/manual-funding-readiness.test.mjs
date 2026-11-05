import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("customer payment proofs require authentication and private image storage", () => {
  const route = read("src/app/api/wallet/manual-funding/route.ts");
  const workspace = read("src/components/dashboard/workspace.tsx");
  assert.match(route, /requireUser\(request\)/);
  assert.match(route, /access: "private"/);
  assert.match(route, /Only genuine PNG, JPEG, or WebP/);
  assert.match(route, /manualFundingRequests/);
  assert.doesNotMatch(route, /applyWalletEntry|balanceMinor: next/);
  assert.match(workspace, /<ManualFundingPanel \/>/);
  assert.match(workspace, /Bank-transfer funding/);
  assert.match(workspace, /Submit payment proof/);
});

test("admin review requires a reason and atomically credits approved transfers", () => {
  const route = read("src/app/api/admin/manual-funding/route.ts");
  assert.match(route, /requireAdmin\(request\)/);
  assert.match(route, /reason: z\.string\(\)\.trim\(\)\.min\(8\)/);
  assert.match(route, /db\.runTransaction/);
  assert.match(route, /walletTransactions/);
  assert.match(route, /manual_funding_approved/);
  assert.match(route, /manual_funding_rejected/);
  assert.match(route, /adminAuditLogs/);
});

test("payment proofs can only be read through the protected admin route", () => {
  const proof = read("src/app/api/admin/manual-funding/[reference]/proof/route.ts");
  const rules = read("firestore.rules");
  assert.match(proof, /requireAdmin\(request\)/);
  assert.match(proof, /access: "private"/);
  assert.match(proof, /Cache-Control": "private, no-store/);
  assert.match(rules, /match \/manualFundingRequests\/\{id\} \{ allow read, write: if false; \}/);
});

test("Firestore declares the manual-funding index for future ordered queries", () => {
  const indexes = JSON.parse(read("firestore.indexes.json"));
  const index = indexes.indexes.find((item) => item.collectionGroup === "manualFundingRequests");
  assert.deepEqual(index?.fields, [{ fieldPath: "userId", order: "ASCENDING" }, { fieldPath: "createdAt", order: "DESCENDING" }]);
});

test("accepted payment proofs notify the configured administrator without exposing the private proof", () => {
  const route = read("src/app/api/wallet/manual-funding/route.ts");
  const email = read("src/lib/server/email-notifications.ts");
  const example = read(".env.example");

  assert.match(route, /sendManualFundingNotification/);
  const persistedProof = route.indexOf("await requestRef.create");
  const notificationCall = route.indexOf("await sendManualFundingNotification");
  assert.ok(persistedProof >= 0 && notificationCall > persistedProof);
  assert.match(route, /emailNotification/);
  assert.match(email, /https:\/\/api\.resend\.com\/emails/);
  assert.match(email, /Idempotency-Key/);
  assert.match(email, /nextlog23@gmail\.com/);
  assert.doesNotMatch(email, /proof\.pathname|attachments/);
  assert.match(example, /RESEND_API_KEY=/);
  assert.match(example, /RESEND_FROM_EMAIL=/);
  assert.match(example, /MANUAL_FUNDING_NOTIFICATION_EMAIL=nextlog23@gmail\.com/);
});
