import { notFound, redirect } from "next/navigation";
import { getPublishedRecord } from "@/lib/editorial/published";
import { PublishedDocument } from "@/components/published-document";

export const dynamic = "force-dynamic";

export default async function BlogArticle({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const record = await getPublishedRecord("blog", slug);
  if (!record) notFound();
  if ("redirectTo" in record) redirect(`/blog/${record.redirectTo}`);
  return <main id="main" className="foundation-content route-state" tabIndex={-1}><PublishedDocument document={record.document} /></main>;
}
