import type { Metadata } from "next";
import { EditorialCard } from "@/components/editorial/editorial-card";
import { EditorialPagination } from "@/components/editorial/editorial-pagination";
import styles from "@/components/editorial/editorial.module.css";
import { EmptyState, PublicPage } from "@/components/storefront/page-frame";
import { listPublishedRecords } from "@/lib/editorial/published";
import { publicMetadata } from "@/lib/editorial/seo";
import { editorialPageNumber } from "@/components/editorial/public-utils";

export const dynamic = "force-dynamic";
export const metadata: Metadata = publicMetadata(null, "/solutions");
const PAGE_SIZE = 24;
const MAX_PAGE = Math.floor(10_000 / PAGE_SIZE) + 1;

function pageHref(page: number): string {
  return page > 1 ? `/solutions?page=${page}` : "/solutions";
}

export default async function SolutionsPage({ searchParams }: {
  searchParams: Promise<{ page?: string | string[] }>;
}) {
  const params = await searchParams;
  const requestedPage = editorialPageNumber(Array.isArray(params.page) ? "" : params.page, PAGE_SIZE);
  const firstResult = await listPublishedRecords("solutions", { limit: PAGE_SIZE, offset: (requestedPage - 1) * PAGE_SIZE });
  const pageCount = Math.min(MAX_PAGE, Math.max(1, Math.ceil(firstResult.total / PAGE_SIZE)));
  const page = Math.min(requestedPage, pageCount);
  const result = page === requestedPage ? firstResult
    : await listPublishedRecords("solutions", { limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE });
  const resultCap = MAX_PAGE * PAGE_SIZE;
  return <PublicPage eyebrow="Solutions" title="Solutions" description="Explore solutions published by PandaByte." wide>
    <div className={styles.stack}>
      {result.items.length
        ? <div className={styles.grid}>{result.items.map((record) => <EditorialCard key={record.id} record={record} href={`/solutions/${record.slug}`} />)}</div>
        : <EmptyState title="No solutions have been published yet.">Product-specific guidance will appear here when it is ready.</EmptyState>}
      <EditorialPagination
        ariaLabel="Solution pages"
        page={page}
        pageCount={pageCount}
        total={result.total}
        resultCap={resultCap}
        itemLabel="solutions"
        hrefForPage={pageHref}
      />
    </div>
  </PublicPage>;
}
