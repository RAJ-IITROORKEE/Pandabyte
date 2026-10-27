import type { PublishedRecord } from "@/lib/editorial/published";
import { ProductQuickView } from "./product-quick-view";

export function ProductCard({ product, categories, featured = false }: { product: PublishedRecord<"products">; categories: PublishedRecord<"categories">[]; featured?: boolean }) {
  return <ProductQuickView
    title={product.title}
    href={`/products/${encodeURIComponent(product.slug)}`}
    summary={product.summary}
    categories={categories.filter((category) => product.document.categoryIds.includes(category.id)).map((category) => category.title)}
    images={product.document.mediaIds.map((id) => ({ id, alt: "" }))}
    model3d={product.document.model3d}
    specifications={product.document.specifications.slice(0, 5)}
    variants={product.variants.map((variant) => ({
      id: variant.id,
      sku: variant.sku,
      label: variant.label,
      regularPricePaise: variant.regularPricePaise,
      effectivePricePaise: variant.effectivePricePaise,
      isOnSale: variant.isOnSale,
      saleEndsAt: variant.saleEndsAt,
      availability: variant.availability,
      purchasable: variant.purchasable,
      cartEligible: variant.cartEligible,
    }))}
    observation={product.document.sourceObservation}
    featured={featured}
  />;
}
