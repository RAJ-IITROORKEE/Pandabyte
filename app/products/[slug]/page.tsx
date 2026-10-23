import { notFound, redirect } from "next/navigation";
import { getPublishedRecord } from "@/lib/editorial/published";
import { PublishedDocument } from "@/components/published-document";
import { foundationPages } from "@/lib/site-navigation";

export const dynamic = "force-dynamic";

type PublicVariant = { id: string; sku: string; label: string; regularPricePaise: number; effectivePricePaise: number; availability: string };

export default async function ProductDetail({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const record = await getPublishedRecord("products", slug);
  if (!record) {
    const title = foundationPages[`/products/${slug}`];
    if (!title) notFound();
    return <main id="main" className="foundation-content route-state" tabIndex={-1}><h1 className="auth-title">{title}</h1><p>This section is being prepared. Its content and business workflows are not connected in this development build.</p><p>Coming soon. No release date or availability is announced.</p></main>;
  }
  if ("redirectTo" in record) redirect(`/products/${record.redirectTo}`);
  const money = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" });
  return <main id="main" className="foundation-content route-state" tabIndex={-1}>
    <PublishedDocument document={record.document} />
    <section><h2>Variants</h2>{record.variants.map((variant: PublicVariant) => <div key={variant.id}><h3>{variant.label}</h3><p>SKU: {variant.sku}</p><p>{money.format(variant.effectivePricePaise / 100)}{variant.effectivePricePaise < variant.regularPricePaise && <> <del>{money.format(variant.regularPricePaise / 100)}</del></>}</p><p>{variant.availability === "available" ? "Available" : "Unavailable"}</p></div>)}</section>
    <p>Development preview. Checkout is not connected.</p>
  </main>;
}
