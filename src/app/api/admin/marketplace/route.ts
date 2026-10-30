import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { NextRequest } from "next/server";
import { z } from "zod";
import { requireAdmin, routeError } from "@/lib/server/auth";
import { adminDb } from "@/lib/server/firebase-admin";
import { assertPermittedMarketplaceProduct, marketplaceCategories, marketplaceFulfillment, marketplaceKinds } from "@/lib/server/marketplace";

const purchaseUrlSchema = z.string().url().max(2000).refine((value) => /^https?:\/\//i.test(value), "Purchase links must use HTTP or HTTPS");
const productOptionSchema = z.object({
  id: z.string().uuid(), title: z.string().trim().min(2).max(90), priceMinor: z.number().int().min(100),
  purchaseUrl: purchaseUrlSchema.nullable().default(null), displayOrder: z.number().int().min(0).max(10000), active: z.boolean().default(true),
});
const productSchema = z.object({
  title: z.string().trim().min(3).max(90), description: z.string().trim().min(12).max(500),
  category: z.enum(marketplaceCategories), kind: z.enum(marketplaceKinds),
  priceMinor: z.number().int().min(100), providerCostMinor: z.number().int().min(0).optional(), stock: z.number().int().min(0).max(100000),
  featured: z.boolean().default(false), badge: z.string().trim().max(24).optional(), previewBullets: z.array(z.string().trim().min(2).max(100)).max(6),
  iconUrl: z.string().url().startsWith("https://").max(2000).optional(),
  resourceLinks: z.array(z.object({ label: z.string().trim().min(2).max(60), url: z.string().url().startsWith("https://").max(2000) })).max(12).default([]),
  options: z.array(productOptionSchema).max(100).default([]),
  fulfillment: z.enum(marketplaceFulfillment), deliveryUrl: z.string().url().startsWith("https://").optional(), active: z.boolean().default(false),
}).superRefine((value, context) => {
  const hasInternalOption = value.options.some((option) => option.active && !option.purchaseUrl);
  if (value.fulfillment === "instant" && !value.deliveryUrl && (!value.options.length || hasInternalOption)) context.addIssue({ code: "custom", message: "Instant wallet-checkout products require a secure delivery URL", path: ["deliveryUrl"] });
  const ids = new Set<string>(); value.options.forEach((option, index) => { if (ids.has(option.id)) context.addIssue({ code: "custom", message: "Every product option must have a unique ID", path: ["options", index, "id"] }); ids.add(option.id); });
});
const actionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("toggle"), productId: z.string().min(1), active: z.boolean() }),
  z.object({ action: z.literal("feature"), productId: z.string().min(1), featured: z.boolean() }),
  z.object({ action: z.literal("edit"), productId: z.string().min(1), product: productSchema }),
  z.object({ action: z.literal("archive"), productId: z.string().min(1), reason: z.string().trim().min(8).max(300) }),
  z.object({ action: z.literal("restore"), productId: z.string().min(1) }),
  z.object({ action: z.literal("fulfill"), reference: z.string().min(1), deliveryUrl: z.string().url().startsWith("https://") }),
  z.object({ action: z.literal("refund"), reference: z.string().min(1), reason: z.string().trim().min(8).max(300) }),
]);
const iso = (value: unknown) => value instanceof Timestamp ? value.toDate().toISOString() : value && typeof value === "object" && "toDate" in value ? (value as { toDate(): Date }).toDate().toISOString() : null;

export async function GET(request: NextRequest) {
  try {
    await requireAdmin(request); const db = adminDb();
    const [products, orders] = await Promise.all([db.collection("marketplaceProducts").orderBy("createdAt", "desc").limit(100).get(), db.collection("marketplaceOrders").orderBy("createdAt", "desc").limit(100).get()]);
    return Response.json({
      products: products.docs.map((doc) => { const data = doc.data(); return { id: doc.id, title: data.title, description: data.description, category: data.category, kind: data.kind, priceMinor: data.priceMinor, providerCostMinor: data.providerCostMinor ?? null, stock: data.stock, active: data.active, featured: Boolean(data.featured), badge: data.badge ?? null, iconUrl: data.iconUrl ?? null, previewBullets: Array.isArray(data.previewBullets) ? data.previewBullets : [], resourceLinks: Array.isArray(data.resourceLinks) ? data.resourceLinks : [], options: Array.isArray(data.options) ? data.options : [], fulfillment: data.fulfillment, deliveryUrl: data.deliveryUrl ?? null, createdAt: iso(data.createdAt), updatedAt: iso(data.updatedAt), archivedAt: iso(data.archivedAt) }; }),
      orders: orders.docs.map((doc) => { const data = doc.data(); return { id: doc.id, reference: data.reference, userId: data.userId, productId: data.productId, title: data.title, priceMinor: data.priceMinor, status: data.status, fulfillment: data.fulfillment, createdAt: iso(data.createdAt) }; }),
    });
  } catch (error) { return routeError(error); }
}

export async function POST(request: NextRequest) {
  try {
    const admin = await requireAdmin(request); const input = productSchema.parse(await request.json());
    assertPermittedMarketplaceProduct(input.title, input.description, input.previewBullets.join(" "));
    const db = adminDb(); const productRef = db.collection("marketplaceProducts").doc(); const auditRef = db.collection("adminAuditLogs").doc();
    await db.runTransaction(async (transaction) => {
      transaction.create(productRef, { ...input, providerCostMinor: input.providerCostMinor ?? null, badge: input.badge || null, iconUrl: input.iconUrl || null, deliveryUrl: input.deliveryUrl || null, archivedAt: null, createdBy: admin.uid, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
      transaction.create(auditRef, { actorUid: admin.uid, action: "marketplace_product_created", targetId: productRef.id, reason: "New marketplace catalogue item", metadata: { title: input.title, active: input.active }, createdAt: FieldValue.serverTimestamp() });
    });
    return Response.json({ id: productRef.id, created: true });
  } catch (error) { if (error instanceof z.ZodError) return routeError(Object.assign(new Error(error.issues[0]?.message || "Invalid product"), { status: 400 })); return routeError(error); }
}

export async function PATCH(request: NextRequest) {
  try {
    const admin = await requireAdmin(request); const input = actionSchema.parse(await request.json()); const db = adminDb();
    if (input.action === "toggle") {
      const productRef = db.collection("marketplaceProducts").doc(input.productId); const auditRef = db.collection("adminAuditLogs").doc();
      await db.runTransaction(async (transaction) => { const product = await transaction.get(productRef); if (!product.exists) throw Object.assign(new Error("Product not found"), { status: 404 }); if (product.data()?.archivedAt) throw Object.assign(new Error("Restore this product before publishing it"), { status: 409 }); transaction.update(productRef, { active: input.active, updatedAt: FieldValue.serverTimestamp() }); transaction.create(auditRef, { actorUid: admin.uid, action: input.active ? "marketplace_product_enabled" : "marketplace_product_disabled", targetId: input.productId, reason: "Catalogue availability changed", createdAt: FieldValue.serverTimestamp() }); });
      return Response.json({ updated: true });
    }
    if (input.action === "feature") {
      await Promise.all([db.collection("marketplaceProducts").doc(input.productId).set({ featured: input.featured, updatedAt: FieldValue.serverTimestamp() }, { merge: true }), db.collection("adminAuditLogs").add({ actorUid: admin.uid, action: input.featured ? "marketplace_product_featured" : "marketplace_product_unfeatured", targetId: input.productId, reason: "Catalogue merchandising changed", createdAt: FieldValue.serverTimestamp() })]);
      return Response.json({ updated: true });
    }
    if (input.action === "edit") {
      assertPermittedMarketplaceProduct(input.product.title, input.product.description, input.product.previewBullets.join(" "));
      const productRef = db.collection("marketplaceProducts").doc(input.productId); const auditRef = db.collection("adminAuditLogs").doc();
      await db.runTransaction(async (transaction) => { const current = await transaction.get(productRef); if (!current.exists) throw Object.assign(new Error("Product not found"), { status: 404 }); if (current.data()?.archivedAt) throw Object.assign(new Error("Restore this product before editing it"), { status: 409 }); transaction.update(productRef, { ...input.product, providerCostMinor: input.product.providerCostMinor ?? null, badge: input.product.badge || null, iconUrl: input.product.iconUrl || null, deliveryUrl: input.product.deliveryUrl || null, editedBy: admin.uid, updatedAt: FieldValue.serverTimestamp() }); transaction.create(auditRef, { actorUid: admin.uid, action: "marketplace_product_edited", targetId: input.productId, reason: "Catalogue product details updated", metadata: { title: input.product.title, active: input.product.active }, createdAt: FieldValue.serverTimestamp() }); });
      return Response.json({ updated: true });
    }
    if (input.action === "archive") {
      const productRef = db.collection("marketplaceProducts").doc(input.productId); const auditRef = db.collection("adminAuditLogs").doc();
      await db.runTransaction(async (transaction) => { const product = await transaction.get(productRef); if (!product.exists) throw Object.assign(new Error("Product not found"), { status: 404 }); transaction.update(productRef, { active: false, archivedAt: FieldValue.serverTimestamp(), archivedBy: admin.uid, updatedAt: FieldValue.serverTimestamp() }); transaction.create(auditRef, { actorUid: admin.uid, action: "marketplace_product_archived", targetId: input.productId, reason: input.reason, metadata: { title: product.data()?.title }, createdAt: FieldValue.serverTimestamp() }); });
      return Response.json({ updated: true });
    }
    if (input.action === "restore") {
      const productRef = db.collection("marketplaceProducts").doc(input.productId); const auditRef = db.collection("adminAuditLogs").doc();
      await db.runTransaction(async (transaction) => { const product = await transaction.get(productRef); if (!product.exists) throw Object.assign(new Error("Product not found"), { status: 404 }); transaction.update(productRef, { active: false, archivedAt: null, restoredBy: admin.uid, updatedAt: FieldValue.serverTimestamp() }); transaction.create(auditRef, { actorUid: admin.uid, action: "marketplace_product_restored", targetId: input.productId, reason: "Archived catalogue item restored as hidden", metadata: { title: product.data()?.title }, createdAt: FieldValue.serverTimestamp() }); });
      return Response.json({ updated: true });
    }
    if (input.action === "fulfill") {
      const orderRef = db.collection("marketplaceOrders").doc(input.reference); const transactionRef = db.collection("transactions").doc(input.reference); const auditRef = db.collection("adminAuditLogs").doc();
      await db.runTransaction(async (transaction) => { const order = await transaction.get(orderRef); if (!order.exists || order.data()?.status !== "processing") throw Object.assign(new Error("Only processing orders can be fulfilled"), { status: 409 }); transaction.update(orderRef, { status: "completed", deliveryUrl: input.deliveryUrl, fulfilledBy: admin.uid, updatedAt: FieldValue.serverTimestamp() }); transaction.set(transactionRef, { status: "successful", updatedAt: FieldValue.serverTimestamp() }, { merge: true }); transaction.create(auditRef, { actorUid: admin.uid, action: "marketplace_order_fulfilled", targetId: input.reference, reason: "Manual digital delivery completed", createdAt: FieldValue.serverTimestamp() }); });
      return Response.json({ updated: true });
    }
    const orderRef = db.collection("marketplaceOrders").doc(input.reference); const auditRef = db.collection("adminAuditLogs").doc();
    await db.runTransaction(async (transaction) => {
      const orderSnapshot = await transaction.get(orderRef); const order = orderSnapshot.data();
      if (!orderSnapshot.exists || !["processing", "successful", "completed"].includes(order?.status)) throw Object.assign(new Error("This order cannot be refunded"), { status: 409 });
      const walletRef = db.collection("wallets").doc(order!.userId); const refundRef = db.collection("walletTransactions").doc(`${input.reference}-REFUND`); const productRef = db.collection("marketplaceProducts").doc(order!.productId); const platformRef = db.collection("transactions").doc(input.reference);
      const [wallet, refund, product] = await Promise.all([transaction.get(walletRef), transaction.get(refundRef), transaction.get(productRef)]);
      if (!refund.exists) { const balance = wallet.data()?.balanceMinor ?? 0; const next = balance + order!.priceMinor; transaction.set(walletRef, { userId: order!.userId, balanceMinor: next, updatedAt: FieldValue.serverTimestamp() }, { merge: true }); transaction.create(refundRef, { userId: order!.userId, reference: `${input.reference}-REFUND`, amountMinor: order!.priceMinor, kind: "refund", description: `Marketplace refund: ${order!.title}`, balanceAfterMinor: next, status: "successful", actorUid: admin.uid, reason: input.reason, createdAt: FieldValue.serverTimestamp() }); if (product.exists && Number.isSafeInteger(product.data()?.stock)) transaction.update(productRef, { stock: product.data()!.stock + 1, updatedAt: FieldValue.serverTimestamp() }); }
      transaction.update(orderRef, { status: "refunded", refundReason: input.reason, refundedBy: admin.uid, updatedAt: FieldValue.serverTimestamp() }); transaction.set(platformRef, { status: "refunded", updatedAt: FieldValue.serverTimestamp() }, { merge: true }); transaction.create(auditRef, { actorUid: admin.uid, action: "marketplace_order_refunded", targetId: input.reference, reason: input.reason, createdAt: FieldValue.serverTimestamp() });
    });
    return Response.json({ updated: true });
  } catch (error) { if (error instanceof z.ZodError) return routeError(Object.assign(new Error(error.issues[0]?.message || "Invalid marketplace action"), { status: 400 })); return routeError(error); }
}
