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
    hasDownload: Boolean(data.downloadFile && typeof data.downloadFile === "object" && typeof (data.downloadFile as { pathname?: unknown }).pathname === "string"),
    previewBullets: Array.isArray(data.previewBullets) ? data.previewBullets.map(String).slice(0, 6) : [],
    hasOptions: Array.isArray(data.options) && data.options.length > 0,
    options: Array.isArray(data.options) ? data.options.flatMap((item) => {
      if (!item || typeof item !== "object") return [];
      const option = item as { id?: unknown; title?: unknown; priceMinor?: unknown; previewUrl?: unknown; purchaseUrl?: unknown; displayOrder?: unknown; active?: unknown };
      if (option.active !== true || typeof option.id !== "string" || typeof option.title !== "string" || typeof option.priceMinor !== "number" || !Number.isSafeInteger(option.priceMinor) || option.priceMinor < 100) return [];
      const candidateUrl = typeof option.previewUrl === "string" ? option.previewUrl : option.purchaseUrl;
      const previewUrl = typeof candidateUrl === "string" && /^https?:\/\//i.test(candidateUrl) ? candidateUrl : null;
      return [{ id: option.id, title: option.title, priceMinor: Number(option.priceMinor), previewUrl, displayOrder: Number.isSafeInteger(option.displayOrder) ? Number(option.displayOrder) : 0 }];
    }).sort((a, b) => a.displayOrder - b.displayOrder || a.title.localeCompare(b.title)).slice(0, 100) : [],
    fulfillment: data.fulfillment,
  };
}
