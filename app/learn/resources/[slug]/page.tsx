import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { PublishedDocument } from "@/components/published-document";
import { PublicPage } from "@/components/storefront/page-frame";
import { getPublishedRecord } from "@/lib/editorial/published";
import { publicMetadata } from "@/lib/editorial/seo";

export const dynamic = "force-dynamic";
type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const record = await getPublishedRecord("learn", slug);
  if (!record) return { title: "Page not found | PandaByte.in", robots: { index: false, follow: false } };
  const canonicalSlug = record && "redirectTo" in record ? record.redirectTo : slug;
  return publicMetadata(record && !("redirectTo" in record) ? record.document : null, `/learn/resources/${canonicalSlug}`);
}

export default async function LearnResourceDetail({ params }: Props) {
  const { slug } = await params;
  const record = await getPublishedRecord("learn", slug);
  if (!record) notFound();
  if ("redirectTo" in record) permanentRedirect(`/learn/resources/${record.redirectTo}`);
  return <PublicPage eyebrow="Learn" title={record.title}>
    <PublishedDocument document={record.document} hideTitle />
  </PublicPage>;
}
