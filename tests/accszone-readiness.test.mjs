import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("AccsZone adapter is server-only and bounded", () => { const source = read("src/lib/server/accszone.ts"); assert.match(source, /process\.env\.ACCZONE_API_KEY/); assert.match(source, /method: "GET"/); assert.match(source, /cache: "no-store"/); assert.match(source, /12_000/); assert.match(source, /2 \* 1024 \* 1024/); assert.match(source, /reader\.read/); assert.match(source, /accsZoneCatalogueCache/); });
test("admin routes authenticate and disable all caching", () => { for (const path of ["status", "categories", "listings", "listings/[slug]", "allowlist"]) { const source = read(`src/app/api/admin/accszone/${path}/route.ts`); assert.match(source, /requireAdmin/); assert.match(source, /private, no-store, max-age=0/); } assert.match(read("src/lib/server/accszone.ts"), /credentialFreeConfirmed: z\.literal\(true\)/); });
test("subcategory reads are admin-only and normalized", () => { const source = read("src/app/api/admin/accszone/categories/[category]/subcategories/route.ts"); assert.match(source, /requireAdmin/); assert.match(source, /projectSubcategories/); assert.match(source, /private, no-store, max-age=0/); });
test("allowlist is private, non-purchasable, refreshed, fingerprinted, and audited", () => { const source = read("src/app/api/admin/accszone/allowlist/route.ts"); const helper = read("src/lib/server/accszone.ts"); assert.match(source, /accsZoneAllowlist/); assert.match(source, /adminAuditLogs/); assert.match(helper, /refreshAndPrepareAllowlist/); assert.match(helper, /contentFingerprint: z\.string/); assert.match(helper, /input\.contentFingerprint !== listing\.contentFingerprint/); assert.match(helper, /customerVisible: false/); assert.match(helper, /purchasesEnabled: false/); assert.match(helper, /credentialFreeConfirmed: false/); });
test("Firestore denies private collections and config has TTL override", () => { const rules = read("firestore.rules"); const indexes = JSON.parse(read("firestore.indexes.json")); assert.match(rules, /match \/accsZoneCatalogueCache\/\{id\} \{ allow read, write: if false; \}/); assert.match(rules, /match \/accsZoneAllowlist\/\{id\} \{ allow read, write: if false; \}/); assert.ok(indexes.fieldOverrides.some((item) => item.collectionGroup === "accsZoneCatalogueCache" && item.fieldPath === "expiresAt" && item.ttl === true)); });
test("prohibited AccsZone language extends marketplace safety", () => { const source = read("src/lib/server/marketplace.ts"); const helper = read("src/lib/server/accszone.ts"); for (const word of ["proxy", "vpn", "vps", "rdp", "iptv", "contact\\s+databases"]) assert.match(`${source}\n${helper}`, new RegExp(word, "i")); });
test("customer marketplace has no AccsZone private collection references", () => { for (const path of ["src/app/api/marketplace/products/route.ts", "src/app/api/marketplace/orders/route.ts", "src/components/dashboard/marketplace-workspace.tsx"]) assert.doesNotMatch(read(path), /accsZoneAllowlist|accsZoneCatalogueCache/i); });

test("Stage 1 supplier reads use secret-safe cache keys, bounded TTLs, and distinct body errors", () => {
  const helper = read("src/lib/server/accszone.ts");
  assert.match(helper, /"X-API-Key"/);
  assert.doesNotMatch(helper, /Authorization:\s*`Bearer/);
  assert.match(helper, /fingerprint\(process\.env\.ACCZONE_API_KEY/);
  assert.match(helper, /15 \* 60_000/);
  assert.match(helper, /2 \* 60_000/);
  assert.match(helper, /30_000/);
  assert.match(helper, /content-length/);
  assert.match(helper, /ACCSZONE_RESPONSE_TOO_LARGE/);
  assert.match(helper, /ACCSZONE_BODY_READ_FAILED/);
  assert.match(helper, /parseListingsQuery/);
  assert.match(helper, /parseSlug/);
});

test("Stage 1 read routes do not return provider payloads", () => {
  const routes = ["status", "categories", "listings", "listings/[slug]"];
  for (const path of routes) {
    const source = read(`src/app/api/admin/accszone/${path}/route.ts`);
    assert.doesNotMatch(source, /\bdetail\s*:/);
    assert.doesNotMatch(source, /\.\.\(payload/);
    assert.match(source, /Cache-Control/);
  }
});
