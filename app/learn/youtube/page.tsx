import type { Metadata } from "next";
import { EditorialCard } from "@/components/editorial/editorial-card";
import { EditorialPagination } from "@/components/editorial/editorial-pagination";
import { editorialPageNumber } from "@/components/editorial/public-utils";
import styles from "@/components/editorial/editorial.module.css";
import { EmptyState, PublicPage } from "@/components/storefront/page-frame";
import { listPublishedRecords } from "@/lib/editorial/published";
import { publicMetadata } from "@/lib/editorial/seo";
import { LearningNavigation } from "../learning-navigation";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { ...publicMetadata(null, "/learn/youtube"), title: "YouTube | Learn | PandaByte.in" };
const PAGE_SIZE = 24;
const MAX_PAGE = Math.floor(10_000 / PAGE_SIZE) + 1;

function pageHref(page: number): string {
  return page > 1 ? `/learn/youtube?page=${page}` : "/learn/youtube";
}

export default async function YouTubePage({ searchParams }: {
  searchParams: Promise<{ page?: string | string[] }>;
}) {
  const params = await searchParams;
  const requestedPage = editorialPageNumber(Array.isArray(params.page) ? "" : params.page, PAGE_SIZE);
  const firstResult = await listPublishedRecords("videos", { limit: PAGE_SIZE, offset: (requestedPage - 1) * PAGE_SIZE });
  const pageCount = Math.min(MAX_PAGE, Math.max(1, Math.ceil(firstResult.total / PAGE_SIZE)));
  const page = Math.min(requestedPage, pageCount);
  const result = page === requestedPage ? firstResult
    : await listPublishedRecords("videos", { limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE });
  const resultCap = MAX_PAGE * PAGE_SIZE;
  return <PublicPage eyebrow="Learn" title="YouTube" description="Videos published by PandaByte." wide>
    <div className={styles.stack}>
      <LearningNavigation current="youtube" />
      {result.items.length
        ? <div className={styles.grid}>{result.items.map((record) => <EditorialCard key={record.id} record={record} href={`/learn/youtube/${record.slug}`} />)}</div>
        : <EmptyState title="No videos have been published yet.">PandaByte videos will appear here when they are ready.</EmptyState>}
      <EditorialPagination
        ariaLabel="YouTube video pages"
        page={page}
        pageCount={pageCount}
        total={result.total}
        resultCap={resultCap}
        itemLabel="videos"
        hrefForPage={pageHref}
      />
    </div>
  </PublicPage>;
}
