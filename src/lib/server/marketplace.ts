import { createHash } from "node:crypto";

export const marketplaceCategories = ["social_assets", "digital_products"] as const;
export const marketplaceKinds = ["download", "template", "subscription", "service"] as const;
export const marketplaceFulfillment = ["instant", "manual"] as const;

const prohibitedCredentialLanguage = /\b(aged\s+accounts?|verified\s+accounts?|account\s+logins?|passwords?|session\s+tokens?|browser\s+cookies?|recovery\s+(?:codes?|info)|verification\s+bypass|kyc\s+bypass|stolen\s+(?:accounts?|credentials?|data)|hacked\s+(?:accounts?|credentials?|data))\b/i;
const prohibitedEngagementLanguage = /\b(?:buy|sell|purchase|instant|guaranteed|cheap|bulk|bot|fake)\s+(?:social\s+media\s+)?(?:followers?|likes?|views?|engagement)|\b(?:followers?|likes?|views?|engagement)\s+(?:packages?|bots?|for\s+sale)\b|\b\d[\d,.]*\+?\s+(?:followers?|likes?|views?)\b/i;
const prohibitedAccsZoneLanguage = /\b(?:proxy|proxies|vpn|vps|rdp|iptv|leads?|contact\s+databases?)\b/i;

export function marketplaceProductRestriction(...values: string[]) {
  if (values.some((value) => prohibitedCredentialLanguage.test(value))) {
    return "Remove references to account credentials, passwords, session data, stolen accounts, or verification bypass before publishing.";
  }
  if (values.some((value) => prohibitedEngagementLanguage.test(value))) {
    return "Remove claims offering followers, likes, views, bots, or other artificial engagement before publishing.";
  }
  if (values.some((value) => prohibitedAccsZoneLanguage.test(value))) {
    return "Remove references to proxies, VPN/VPS/RDP, IPTV, leads, or contact databases before publishing.";
  }
  return null;
}

export function assertPermittedMarketplaceProduct(...values: string[]) {
  const restriction = marketplaceProductRestriction(...values);
  if (restriction) throw Object.assign(new Error(restriction), { status: 400, code: "MARKETPLACE_PRODUCT_RESTRICTED" });
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
    hasDownload: Boolean(data.downloadFile && typeof data.downloadFile === "object" && typeof (data.downloadFile as { pathname?: unknown }).pathname === "string") || (Array.isArray(data.options) && data.options.some((item) => item && typeof item === "object" && "downloadFile" in item && Boolean((item as { downloadFile?: unknown }).downloadFile))),
    previewBullets: Array.isArray(data.previewBullets) ? data.previewBullets.map(String).slice(0, 6) : [],
    hasOptions: Array.isArray(data.options) && data.options.length > 0,
    options: Array.isArray(data.options) ? data.options.flatMap((item) => {
      if (!item || typeof item !== "object") return [];
      const option = item as { id?: unknown; title?: unknown; priceMinor?: unknown; previewUrl?: unknown; purchaseUrl?: unknown; downloadFile?: unknown; displayOrder?: unknown; active?: unknown };
      if (option.active !== true || typeof option.id !== "string" || typeof option.title !== "string" || typeof option.priceMinor !== "number" || !Number.isSafeInteger(option.priceMinor) || option.priceMinor < 100) return [];
      const candidateUrl = typeof option.previewUrl === "string" ? option.previewUrl : option.purchaseUrl;
      const hasPreview = typeof candidateUrl === "string" && /^https?:\/\//i.test(candidateUrl);
      const hasDownload = Boolean(option.downloadFile && typeof option.downloadFile === "object" && typeof (option.downloadFile as { pathname?: unknown }).pathname === "string");
      return [{ id: option.id, title: option.title, priceMinor: Number(option.priceMinor), hasPreview, hasDownload, displayOrder: Number.isSafeInteger(option.displayOrder) ? Number(option.displayOrder) : 0 }];
    }).sort((a, b) => a.displayOrder - b.displayOrder || a.title.localeCompare(b.title)).slice(0, 100) : [],
    fulfillment: data.fulfillment,
  };
}
