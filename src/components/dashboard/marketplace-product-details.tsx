"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, ArrowRight, BadgeCheck, ExternalLink, Link2, LoaderCircle, PackageX, RefreshCw, ShieldCheck, ShoppingBag } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api-client";
import { ProductGeneratedIcon } from "@/components/marketplace/product-generated-icon";

type ProductOption = { id: string; title: string; priceMinor: number; purchaseUrl: string | null; displayOrder: number };
type Product = { id: string; title: string; description: string; category: string; kind: string; priceMinor: number; stock: number; featured: boolean; badge?: string | null; iconUrl?: string | null; previewBullets: string[]; resourceLinks: Array<{ label: string; url: string }>; hasOptions: boolean; options: ProductOption[]; fulfillment: "instant" | "manual" };
type Order = { reference: string; title: string; priceMinor: number; status: string };

const money = (minor = 0) => new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN" }).format(minor / 100);
const categoryLabel = (category: string) => category === "social_assets" ? "Social media assets" : "Digital products";
function hostname(url: string) { try { return new URL(url).hostname; } catch { return url; } }

export function MarketplaceProductDetails({ productId }: { productId: string }) {
  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [buying, setBuying] = useState<string | null>(null);
  const [lastOrder, setLastOrder] = useState<Order | null>(null);
  const load = useCallback(async () => { setLoading(true); setError(""); try { const data = await api<{ product: Product }>(`/api/marketplace/products/${encodeURIComponent(productId)}`); setProduct(data.product); } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to load this product"); } finally { setLoading(false); } }, [productId]);
  useEffect(() => { void load(); }, [load]);

  async function purchase(option?: ProductOption) {
    const key = option?.id || "base"; setBuying(key);
    try {
      const order = await api<Order>("/api/marketplace/orders", { method: "POST", body: JSON.stringify({ productId, optionId: option?.id, idempotencyKey: crypto.randomUUID() }) });
      setLastOrder(order); toast.success(order.status === "successful" ? "Purchase complete. Your product is ready." : "Order received for secure delivery.");
      setProduct((current) => current ? { ...current, stock: Math.max(0, current.stock - 1) } : current);
    } catch (cause) { toast.error(cause instanceof Error ? cause.message : "Purchase could not be completed"); }
    finally { setBuying(null); }
  }

  if (loading) return <div className="marketplace-detail-loading"><span /><div /><div /></div>;
  if (error || !product) return <section className="marketplace-detail-error"><span><PackageX size={25} /></span><h1>Product unavailable</h1><p>{error || "This product is not currently available."}</p><div><Link href="/dashboard/marketplace" className="ui-button-secondary"><ArrowLeft size={15} /> Back to marketplace</Link><button onClick={() => void load()} className="ui-button-primary"><RefreshCw size={15} /> Try again</button></div></section>;

  const canPurchase = product.stock > 0;
  return <div className="marketplace-detail-page">
    <Link href="/dashboard/marketplace" className="marketplace-detail-back"><ArrowLeft size={14} /> Back to marketplace</Link>
    <section className="marketplace-detail-hero">
      <div className="marketplace-detail-art"><span><ProductGeneratedIcon id={product.id} title={product.title} category={product.category} kind={product.kind} iconUrl={product.iconUrl} /></span>{product.badge && <b>{product.badge}</b>}</div>
      <div className="marketplace-detail-copy"><p className="ui-eyebrow">{categoryLabel(product.category)} · {product.kind}</p><h1>{product.title}</h1><p>{product.description}</p><div className="marketplace-detail-meta"><span><BadgeCheck size={14} /> Administrator approved</span><span>{product.stock} available</span><span>{product.fulfillment === "instant" ? "Instant access" : "Managed delivery"}</span></div>{product.previewBullets.length ? <div className="marketplace-detail-points">{product.previewBullets.map((item) => <span key={item}><BadgeCheck size={14} /> {item}</span>)}</div> : null}</div>
    </section>

    <section className="marketplace-detail-options"><header><div><p className="ui-eyebrow">Available choices</p><h2>{product.hasOptions ? "Choose a product option" : "Purchase this product"}</h2><p>{product.hasOptions ? "Compare active options and choose the purchase path that suits you." : "This product uses the original NextLogs wallet checkout."}</p></div><span><ShieldCheck size={16} /> Server-validated pricing</span></header>
      {product.options.length ? <div className="marketplace-option-grid">{product.options.map((option, index) => <article key={option.id}>
        <div className="marketplace-option-number">{String(index + 1).padStart(2, "0")}</div><div className="marketplace-option-copy"><small>{option.purchaseUrl ? "External purchase" : "NextLogs wallet"}</small><h3>{option.title}</h3><strong>{money(option.priceMinor)}</strong><p>{option.purchaseUrl ? `Continue securely on ${hostname(option.purchaseUrl)}. NextLogs does not mark external clicks as completed purchases.` : "Price and availability are rechecked on the server before your wallet is charged."}</p></div>
        {option.purchaseUrl && canPurchase ? <a href={option.purchaseUrl} target="_blank" rel="noopener noreferrer" className="marketplace-option-action">Open purchase link <ExternalLink size={14} /></a> : <button disabled={!canPurchase || buying !== null || Boolean(option.purchaseUrl)} onClick={() => void purchase(option)} className="marketplace-option-action">{buying === option.id ? <LoaderCircle className="animate-spin" size={14} /> : <ShoppingBag size={14} />}{canPurchase ? "Purchase option" : "Out of stock"}</button>}
      </article>)}</div> : product.hasOptions ? <div className="marketplace-options-empty"><PackageX size={21} /><div><h3>No active options</h3><p>The administrator has temporarily disabled every option for this product.</p></div></div> : <div className="marketplace-legacy-purchase"><div><small>Product price</small><strong>{money(product.priceMinor)}</strong><p>The server will verify the current price, stock, and wallet balance before processing.</p></div><button disabled={!canPurchase || buying !== null} onClick={() => void purchase()} className="ui-button-primary">{buying === "base" ? <LoaderCircle className="animate-spin" size={15} /> : <ShoppingBag size={15} />}{canPurchase ? "Purchase with wallet" : "Out of stock"}</button></div>}
    </section>

    {product.resourceLinks.length ? <section className="marketplace-detail-links"><header><span><Link2 size={15} /></span><div><h2>Product links</h2><p>Resources supplied by the marketplace administrator.</p></div></header><div>{product.resourceLinks.map((link) => <a key={`${link.label}-${link.url}`} href={link.url} target="_blank" rel="noopener noreferrer"><span><b>{link.label}</b><small>{hostname(link.url)}</small></span><ExternalLink size={14} /></a>)}</div></section> : null}
    {lastOrder && <section className="marketplace-order-success"><span><BadgeCheck size={20} /></span><div><h3>{lastOrder.status === "successful" ? "Purchase completed" : "Order received"}</h3><p>{lastOrder.title} · {money(lastOrder.priceMinor)} · {lastOrder.reference}</p></div><Link href="/dashboard/marketplace#marketplace-orders">View purchases <ArrowRight size={14} /></Link></section>}
  </div>;
}
