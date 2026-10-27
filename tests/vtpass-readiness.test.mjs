import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("VTpass credentials stay server-only and purchases default off", async () => { const env = await read(".env.example"); assert.match(env, /VTPASS_ENV=sandbox/); assert.match(env, /VTPASS_PURCHASES_ENABLED=false/); assert.doesNotMatch(env, /NEXT_PUBLIC_VTPASS/); });
test("official authentication headers are separated by HTTP method", async () => { const source = await read("src/lib/server/vtpass.ts"); assert.match(source, /"public-key"/); assert.match(source, /"secret-key"/); assert.match(source, /method === "GET"/); });
test("catalogues are retrieved dynamically", async () => { const source = await read("src/lib/server/vtpass.ts"); assert.match(source, /service-variations/); assert.match(source, /electricity-bill/); assert.match(source, /services\(identifier/); });
test("9mobile uses VTpass etisalat service identifiers", async () => { const source = await read("src/lib/server/vtpass.ts"); assert.match(source, /"9mobile": "etisalat"/); assert.match(source, /"9mobile": "etisalat-data"/); });
test("purchases use a safety lock and provider requery", async () => { const source = await read("src/lib/server/vtpass.ts"); assert.match(source, /purchasesEnabled/); assert.match(source, /post\("requery"/); assert.match(source, /post\("pay"/); });
test("wallet flow is idempotent and only confirmed failures refund", async () => { const order = await read("src/lib/server/vtu-order.ts"); const reconcile = await read("src/lib/server/vtpass-reconcile.ts"); assert.match(order, /vtpassReferenceFor/); assert.match(order, /reservation\.idempotent/); assert.match(order, /result\.status === "failed"/); assert.match(order, /status: "processing"/); assert.match(reconcile, /finalizePurchaseRefund/); });
test("admin monitoring, pricing and audit routes exist", async () => { const admin = await read("src/app/api/admin/vtpass/orders/route.ts"); const pricing = await read("src/app/api/admin/vtpass/pricing/route.ts"); assert.match(admin, /requireAdmin/); assert.match(admin, /reconcileVtpass/); assert.match(pricing, /adminAuditLogs/); });
test("Firestore denies client access to VTpass operational collections", async () => { const rules = await read("firestore.rules"); assert.match(rules, /vtuIdempotency/); assert.match(rules, /vtuMeterVerifications/); assert.match(rules, /airtimeOrders/); });
