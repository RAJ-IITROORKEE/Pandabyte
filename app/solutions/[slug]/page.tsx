import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { PublishedDocument } from "@/components/published-document";
import { EmptyState, PublicPage } from "@/components/storefront/page-frame";
import { getPublishedRecord } from "@/lib/editorial/published";
import { publicMetadata } from "@/lib/editorial/seo";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const page = await getPublishedRecord("solutions", slug);
  const canonicalSlug = page && "redirectTo" in page ? page.redirectTo : slug;
  if (!page) return { title: slug === "skills-cli" ? "Skills & CLI tools | PandaByte.in" : "Page not found | PandaByte.in", robots: { index: false, follow: false } };
  return publicMetadata(page && !("redirectTo" in page) ? page.document : null, `/solutions/${canonicalSlug}`);
}

export default async function SolutionDetail({ params }: Props) {
  const { slug } = await params;
  const record = await getPublishedRecord("solutions", slug);
  if (record && "redirectTo" in record) permanentRedirect(`/solutions/${record.redirectTo}`);
  if (!record && slug !== "skills-cli") notFound();
  return <PublicPage eyebrow="Solutions" title={record ? record.title : "Skills & CLI tools"}>
    {record
      ? <PublishedDocument document={record.document} hideTitle />
      : <EmptyState title="Coming soon.">This guide has not been published yet. No release date is announced.</EmptyState>}
  </PublicPage>;
}
