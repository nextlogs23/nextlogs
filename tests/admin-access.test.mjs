import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("admin access normalizes the existing Firestore role value", () => {
  const auth = read("src/lib/server/auth.ts");
  assert.match(auth, /trim\(\)\.toLowerCase\(\)/);
  assert.match(auth, /normalizedRole\(profile\.data\(\)\?\.role\)==='admin'/);
});

test("admin denial identifies the exact Firestore document path", () => {
  const auth = read("src/lib/server/auth.ts");
  assert.match(auth, /users\/\$\{user\.uid\}/);
  assert.match(auth, /string value admin/);
});
