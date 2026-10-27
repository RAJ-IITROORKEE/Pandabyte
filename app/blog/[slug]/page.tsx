import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { PublicPage } from "@/components/storefront/page-frame";
import { getPublishedRecord } from "@/lib/editorial/published";
import { PublishedDocument } from "@/components/published-document";
import { ProductRichContentView } from "@/components/catalog/product-rich-content";
import { publicMetadata } from "@/lib/editorial/seo";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const record = await getPublishedRecord("blog", slug);
  if (!record) return { title: "Page not found | PandaByte.in", robots: { index: false, follow: false } };
  const canonicalSlug = record && "redirectTo" in record ? record.redirectTo : slug;
  return publicMetadata(record && !("redirectTo" in record) ? record.document : null, `/blog/${canonicalSlug}`);
}

export default async function BlogArticle({ params }: Props) {
  const { slug } = await params;
  const record = await getPublishedRecord("blog", slug);
  if (!record) notFound();
  if ("redirectTo" in record) permanentRedirect(`/blog/${record.redirectTo}`);
  return <PublicPage eyebrow="Blog" title={record.title}>
    <PublishedDocument document={record.document} hideTitle content={record.document.richContent && <ProductRichContentView content={record.document.richContent} />} />
  </PublicPage>;
}
