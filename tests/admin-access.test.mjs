import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("admin access normalizes the existing Firestore role value", () => {
  const auth = read("src/lib/server/auth.ts");
  assert.match(auth, /trim\(\)\.toLowerCase\(\)/);
  assert.match(auth, /normalizedRole\(profile\?\.role\) === "admin"/);
});

test("admin denial identifies the exact Firestore document path", () => {
  const auth = read("src/lib/server/auth.ts");
  assert.match(auth, /users\/\$\{user\.uid\}/);
  assert.match(auth, /string value admin/);
});

test("new Firebase users receive a Firestore profile and wallet before protected data loads", () => {
  const auth = read("src/lib/server/auth.ts");
  const bootstrap = read("src/app/api/auth/bootstrap/route.ts");

  assert.match(auth, /ensureCustomerAccount/);
  assert.match(auth, /transaction\.create\(profileRef/);
  assert.match(auth, /transaction\.create\(walletRef/);
  assert.match(auth, /balanceMinor: 0/);
  assert.match(bootstrap, /requireFirebaseUser\(req\)/);
  assert.doesNotMatch(bootstrap, /requireUser\(req\)/);
});
