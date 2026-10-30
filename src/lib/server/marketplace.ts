import { createHash } from "node:crypto";

export const marketplaceCategories = ["social_assets", "digital_products"] as const;
export const marketplaceKinds = ["download", "template", "subscription", "service"] as const;
export const marketplaceFulfillment = ["instant", "manual"] as const;

const prohibitedProductLanguage = /\b(aged\s+accounts?|verified\s+accounts?|account\s+logins?|passwords?|session\s+tokens?|cookies?|followers?|likes?|engagement\s+bots?|verification\s+bypass|kyc\s+bypass|stolen|hacked)\b/i;

export function assertPermittedMarketplaceProduct(...values: string[]) {
  if (values.some((value) => prohibitedProductLanguage.test(value))) {
    throw Object.assign(new Error("This product type is not permitted in the marketplace"), { status: 400 });
  }
}

export function stableMarketplaceReference(uid: string, idempotencyKey: string) {
  return `NXL-MKT-${createHash("sha256").update(`${uid}:${idempotencyKey}`).digest("hex").slice(0, 24).toUpperCase()}`;
}

export function publicMarketplaceProduct(id: string, data: Record<string, unknown>) {
  return {
    id,
    title: String(data.title || ""),
    description: String(data.description || ""),
    category: data.category,
    kind: data.kind,
    priceMinor: data.priceMinor,
    stock: data.stock,
    featured: Boolean(data.featured),
    badge: data.badge ? String(data.badge) : null,
    iconUrl: data.iconUrl ? String(data.iconUrl) : null,
    previewBullets: Array.isArray(data.previewBullets) ? data.previewBullets.map(String).slice(0, 6) : [],
    resourceLinks: Array.isArray(data.resourceLinks) ? data.resourceLinks.flatMap((item) => {
      if (!item || typeof item !== "object") return [];
      const link = item as { label?: unknown; url?: unknown };
      return typeof link.label === "string" && typeof link.url === "string" && /^https:\/\//i.test(link.url) ? [{ label: link.label, url: link.url }] : [];
    }).slice(0, 12) : [],
    fulfillment: data.fulfillment,
  };
}
