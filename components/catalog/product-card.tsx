import type { PublishedRecord } from "@/lib/editorial/published";
import { ProductQuickView } from "./product-quick-view";

export function ProductCard({ product, featured = false }: { product: PublishedRecord<"products">; featured?: boolean }) {
  return <ProductQuickView
    title={product.title}
    href={`/products/${encodeURIComponent(product.slug)}`}
    summary={product.summary}
    images={product.document.mediaIds.map((id) => ({ id, alt: "" }))}
    model3d={product.document.model3d}
    specifications={product.document.specifications.slice(0, 5)}
    variants={product.variants.map((variant) => ({
      id: variant.id,
      sku: variant.sku,
      label: variant.label,
      regularPricePaise: product.document.sourceObservation ? null : variant.regularPricePaise,
      effectivePricePaise: product.document.sourceObservation ? null : variant.effectivePricePaise,
      isOnSale: product.document.sourceObservation ? false : variant.isOnSale,
      saleEndsAt: product.document.sourceObservation ? null : variant.saleEndsAt,
      availability: product.document.sourceObservation ? "unavailable" : variant.availability,
      purchasable: variant.purchasable,
    }))}
    observation={product.document.sourceObservation}
    featured={featured}
  />;
}
