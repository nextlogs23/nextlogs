import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { NextRequest } from "next/server";
import { z } from "zod";
import { requireUser, routeError } from "@/lib/server/auth";
import { adminDb } from "@/lib/server/firebase-admin";
import { stableMarketplaceReference } from "@/lib/server/marketplace";
import { enforceRateLimit } from "@/lib/server/rate-limit";

const purchaseSchema = z.object({ productId: z.string().min(1).max(120), optionId: z.string().uuid().optional(), idempotencyKey: z.string().min(16).max(100) });
const iso = (value: unknown) => value instanceof Timestamp ? value.toDate().toISOString() : value && typeof value === "object" && "toDate" in value ? (value as { toDate(): Date }).toDate().toISOString() : null;
const millis = (value: unknown) => value instanceof Timestamp ? value.toMillis() : value && typeof value === "object" && "toMillis" in value ? (value as { toMillis(): number }).toMillis() : 0;
function publicOrder(id: string, data: Record<string, unknown>) { const fulfilled = data.status === "successful" || data.status === "completed"; return { id, reference: data.reference, productId: data.productId, optionId: data.optionId ?? null, optionTitle: data.optionTitle ?? null, title: data.title, category: data.category, kind: data.kind, priceMinor: data.priceMinor, status: data.status, fulfillment: data.fulfillment, deliveryUrl: fulfilled ? data.deliveryUrl || null : null, downloadUrl: fulfilled && data.downloadFile ? `/api/marketplace/orders/${encodeURIComponent(id)}/download` : null, createdAt: iso(data.createdAt) }; }

export async function GET(request: NextRequest) {
  try {
    const user = await requireUser(request);
    // Keep the customer view available while the production composite index is
    // being created. The user equality filter uses Firestore's built-in index;
    // the bounded result is then sorted securely on the server.
    const snapshot = await adminDb().collection("marketplaceOrders").where("userId", "==", user.uid).limit(100).get();
    const orders = snapshot.docs.sort((a, b) => millis(b.data().createdAt) - millis(a.data().createdAt)).slice(0, 50).map((doc) => publicOrder(doc.id, doc.data()));
    return Response.json({ orders });
  } catch (error) { return routeError(error); }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireUser(request);
    await enforceRateLimit(`marketplace_buy_${user.uid}`, 15, 24 * 60 * 60 * 1000);
    const input = purchaseSchema.parse(await request.json());
    const reference = stableMarketplaceReference(user.uid, input.idempotencyKey); const db = adminDb();
    const result = await db.runTransaction(async (transaction) => {
      const productRef = db.collection("marketplaceProducts").doc(input.productId);
      const walletRef = db.collection("wallets").doc(user.uid);
      const ledgerRef = db.collection("walletTransactions").doc(reference);
      const orderRef = db.collection("marketplaceOrders").doc(reference);
      const transactionRef = db.collection("transactions").doc(reference);
      const [productSnapshot, walletSnapshot, ledgerSnapshot, orderSnapshot] = await Promise.all([transaction.get(productRef), transaction.get(walletRef), transaction.get(ledgerRef), transaction.get(orderRef)]);
      if (ledgerSnapshot.exists && orderSnapshot.exists) return { ...publicOrder(reference, orderSnapshot.data()!), idempotent: true };
      const product = productSnapshot.data();
      if (!productSnapshot.exists || !product?.active) throw Object.assign(new Error("This product is no longer available"), { status: 404 });
      if (!Number.isSafeInteger(product.stock) || product.stock <= 0) throw Object.assign(new Error("This product is currently out of stock"), { status: 409 });
      const options = Array.isArray(product.options) ? product.options : [];
      const activeOptions = options.filter((option) => option && option.active === true);
      const selectedOption = input.optionId ? activeOptions.find((option) => option.id === input.optionId) : null;
      if (input.optionId && !selectedOption) throw Object.assign(new Error("This product option is disabled or unavailable"), { status: 409 });
      if (!input.optionId && options.length) throw Object.assign(new Error("Select an available product option before checkout"), { status: 400 });
      const priceMinor = selectedOption?.priceMinor ?? product.priceMinor;
      if (!Number.isSafeInteger(priceMinor) || priceMinor <= 0) throw Object.assign(new Error("This product price is invalid"), { status: 409 });
      const balanceMinor = walletSnapshot.data()?.balanceMinor ?? 0;
      if (!Number.isSafeInteger(balanceMinor) || balanceMinor < priceMinor) throw Object.assign(new Error("Insufficient wallet balance"), { status: 409 });
      const nextBalance = balanceMinor - priceMinor;
      const downloadFile = product.downloadFile && typeof product.downloadFile === "object" && typeof product.downloadFile.pathname === "string" && product.downloadFile.pathname.startsWith("marketplace/product-files/") ? product.downloadFile : null;
      const instant = Boolean(downloadFile) || (product.fulfillment === "instant" && typeof product.deliveryUrl === "string" && /^https:\/\//i.test(product.deliveryUrl));
      const status = instant ? "successful" : "processing";
      const optionTitle = selectedOption?.title || null;
      const orderTitle = optionTitle ? `${product.title} — ${optionTitle}` : product.title;
      const order = { reference, userId: user.uid, productId: input.productId, optionId: selectedOption?.id || null, optionTitle, title: orderTitle, category: product.category, kind: product.kind, priceMinor, providerCostMinor: product.providerCostMinor ?? null, fulfillment: product.fulfillment, deliveryUrl: instant && !downloadFile ? product.deliveryUrl : null, downloadFile, status, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() };
      transaction.update(productRef, { stock: product.stock - 1, updatedAt: FieldValue.serverTimestamp() });
      transaction.set(walletRef, { userId: user.uid, balanceMinor: nextBalance, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      transaction.create(ledgerRef, { userId: user.uid, reference, amountMinor: -priceMinor, kind: "purchase", description: `Marketplace purchase: ${orderTitle}`, balanceAfterMinor: nextBalance, status: "successful", createdAt: FieldValue.serverTimestamp() });
      transaction.create(orderRef, order);
      transaction.create(transactionRef, { reference, userId: user.uid, serviceType: "marketplace", amountMinor: priceMinor, retailPriceMinor: priceMinor, providerCostMinor: product.providerCostMinor ?? null, status, metadata: { productId: input.productId, optionId: selectedOption?.id || null, optionTitle, title: product.title, category: product.category }, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
      return { reference, productId: input.productId, optionId: selectedOption?.id || null, optionTitle, title: orderTitle, category: product.category, kind: product.kind, priceMinor, status, fulfillment: product.fulfillment, deliveryUrl: instant && !downloadFile ? product.deliveryUrl : null, downloadUrl: downloadFile ? `/api/marketplace/orders/${encodeURIComponent(reference)}/download` : null, idempotent: false };
    });
    return Response.json(result);
  } catch (error) {
    if (error instanceof z.ZodError) return routeError(Object.assign(new Error("Invalid marketplace purchase request"), { status: 400 }));
    return routeError(error);
  }
}
