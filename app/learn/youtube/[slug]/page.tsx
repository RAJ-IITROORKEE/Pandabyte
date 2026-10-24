import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { PublishedDocument } from "@/components/published-document";
import { VideoPlayer } from "@/components/editorial/video-player";
import { youtubeVideoId } from "@/components/editorial/public-utils";
import styles from "@/components/editorial/editorial.module.css";
import { PublicPage } from "@/components/storefront/page-frame";
import { getPublishedRecord } from "@/lib/editorial/published";
import { publicMetadata } from "@/lib/editorial/seo";

export const dynamic = "force-dynamic";
type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const record = await getPublishedRecord("videos", slug);
  if (!record) return { title: "Page not found | PandaByte.in", robots: { index: false, follow: false } };
  const canonicalSlug = record && "redirectTo" in record ? record.redirectTo : slug;
  return publicMetadata(record && !("redirectTo" in record) ? record.document : null, `/learn/youtube/${canonicalSlug}`);
}

export default async function YouTubeVideoDetail({ params }: Props) {
  const { slug } = await params;
  const record = await getPublishedRecord("videos", slug);
  if (!record) notFound();
  if ("redirectTo" in record) permanentRedirect(`/learn/youtube/${record.redirectTo}`);
  return <PublicPage eyebrow="Learn / YouTube" title={record.title}>
    <div className={styles.stack}>
      <VideoPlayer videoId={youtubeVideoId(record.document.url)} title={record.title} />
      <PublishedDocument document={record.document} hideTitle />
    </div>
  </PublicPage>;
}
