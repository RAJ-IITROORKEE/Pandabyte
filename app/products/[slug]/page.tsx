import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { ProductDetails } from "@/components/catalog/product-details";
import { ProductGallery } from "@/components/catalog/product-gallery";
import { ProductVariantPanel } from "@/components/catalog/product-variant-panel";
import { ProductOverview } from "@/components/catalog/product-overview";
import { EmptyState, PublicPage } from "@/components/storefront/page-frame";
import { getPublishedRecord } from "@/lib/editorial/published";
import { publicMetadata } from "@/lib/editorial/seo";
import { upcomingLinks } from "@/lib/site-navigation";
import { FavoritesButton } from "@/components/favorites/favorites-button";

export const dynamic = "force-dynamic";

type ProductPageProps = { params: Promise<{ slug: string }> };
const upcomingTitle = (slug:string) => slug==="pando" ? "Future PandaByte Agent" : upcomingLinks.find((link)=>link.href===`/products/${slug}`)?.label;

export async function generateMetadata({ params }: ProductPageProps): Promise<Metadata> {
  const { slug } = await params;
  const product = await getPublishedRecord("products", slug);
  if (!product) return { title: upcomingTitle(slug) ? `${upcomingTitle(slug)} · Coming soon` : "Product not found", robots: { index: false, follow: false } };
  if ("redirectTo" in product) {
    const canonical = await getPublishedRecord("products", product.redirectTo);
    if (!canonical || "redirectTo" in canonical) return { title: "Product not found", robots: { index: false, follow: false } };
    return publicMetadata(canonical.document, `/products/${canonical.slug}`);
  }
  return publicMetadata(product.document, `/products/${product.slug}`);
}

export default async function ProductDetail({ params }: ProductPageProps) {
  const { slug } = await params;
  const product = await getPublishedRecord("products", slug);
  if (!product) {
    const title = upcomingTitle(slug);
    if (!title) notFound();
    return <PublicPage eyebrow="Upcoming" title={title}><EmptyState title="Coming soon">No release date or availability is announced.</EmptyState></PublicPage>;
  }
  if ("redirectTo" in product) permanentRedirect(`/products/${encodeURIComponent(product.redirectTo)}`);
  const images = product.document.mediaIds.map((id) => {
    const block = product.document.blocks.find((item) => item.type === "image" && item.mediaId === id);
    return { id, alt: block?.type === "image" ? block.alt : product.title };
  });

  return <ProductOverview
    product={product}
    gallery={<ProductGallery key={product.id} images={images} model3d={product.document.model3d} title={product.title} />}
    panel={<><ProductVariantPanel key={product.id} variants={product.variants} observation={product.document.sourceObservation} /><FavoritesButton productId={product.id} title={product.title} slug={product.slug} /></>}
  >
    <ProductDetails product={product} gallery={images.length || product.document.model3d ? <ProductGallery images={images} model3d={product.document.model3d} title={product.title} /> : undefined} />
  </ProductOverview>;
}
