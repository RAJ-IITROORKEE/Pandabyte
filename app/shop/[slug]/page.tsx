import { permanentRedirect, notFound } from "next/navigation";
import { getPublishedRecord } from "@/lib/editorial/published";

export const dynamic = "force-dynamic";

export default async function LegacyCategoryRoute({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const category = await getPublishedRecord("categories", slug);
  if (!category) notFound();
  if ("redirectTo" in category) permanentRedirect(`/shop?category=${encodeURIComponent(category.redirectTo)}`);
  permanentRedirect(`/shop?category=${encodeURIComponent(category.slug)}`);
}
