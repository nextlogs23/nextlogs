import { MarketplaceProductDetails } from "@/components/dashboard/marketplace-product-details";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <MarketplaceProductDetails productId={id} />;
}
