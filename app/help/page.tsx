import type { Metadata } from "next";
import { permanentRedirect } from "next/navigation";
import { FaqList } from "@/components/storefront/faq-list";
import { EditorialPagination } from "@/components/editorial/editorial-pagination";
import { editorialPageNumber } from "@/components/editorial/public-utils";
import { EmptyState, PublicPage } from "@/components/storefront/page-frame";
import { PublishedDocument } from "@/components/published-document";
import styles from "@/components/editorial/editorial.module.css";
import { getPublishedRecord, listPublishedRecords } from "@/lib/editorial/published";
import { publicMetadata } from "@/lib/editorial/seo";

export const dynamic = "force-dynamic";
const PAGE_SIZE = 24;
const MAX_PAGE = Math.floor(10_000 / PAGE_SIZE) + 1;

function pageHref(page: number): string {
  return page > 1 ? `/help?page=${page}` : "/help";
}

export async function generateMetadata(): Promise<Metadata> {
  const page = await getPublishedRecord("pages", "help");
  if (page && "redirectTo" in page) return publicMetadata(null, `/${page.redirectTo}`);
  return publicMetadata(page && !("redirectTo" in page) ? page.document : null, "/help");
}

export default async function HelpPage({ searchParams }: {
  searchParams: Promise<{ page?: string | string[] }>;
}) {
  const params = await searchParams;
  const requestedPage = editorialPageNumber(Array.isArray(params.page) ? "" : params.page, PAGE_SIZE);
  const [page, firstResult] = await Promise.all([
    getPublishedRecord("pages", "help"),
    listPublishedRecords("faqs", { placement: "help", limit: PAGE_SIZE, offset: (requestedPage - 1) * PAGE_SIZE }),
  ]);
  const pageCount = Math.min(MAX_PAGE, Math.max(1, Math.ceil(firstResult.total / PAGE_SIZE)));
  const currentPage = Math.min(requestedPage, pageCount);
  const result = currentPage === requestedPage ? firstResult
    : await listPublishedRecords("faqs", { placement: "help", limit: PAGE_SIZE, offset: (currentPage - 1) * PAGE_SIZE });
  const resultCap = MAX_PAGE * PAGE_SIZE;
  if (page && "redirectTo" in page) permanentRedirect(`/${page.redirectTo}`);
  const document = page && !("redirectTo" in page) ? page.document : null;
  return <PublicPage eyebrow="Support" title={document?.title ?? "Help Center"} wide>
    <div className={styles.stack}>
      {document && <PublishedDocument document={document} hideTitle />}
      {result.items.length
        ? <FaqList items={result.items} />
        : <EmptyState title="Help articles have not been published yet." href="/contact" label="Contact the team">You can still use the contact form for assistance.</EmptyState>}
      <EditorialPagination
        ariaLabel="Help article pages"
        page={currentPage}
        pageCount={pageCount}
        total={result.total}
        resultCap={resultCap}
        itemLabel="help articles"
        hrefForPage={pageHref}
      />
    </div>
  </PublicPage>;
}
