import type { Metadata } from "next";
import { permanentRedirect } from "next/navigation";
import Link from "next/link";
import { FaqList } from "@/components/storefront/faq-list";
import { helpPageHref, helpTopic } from "@/components/storefront/help-filters";
import { EditorialPagination } from "@/components/editorial/editorial-pagination";
import { editorialPageNumber, editorialSearchQuery } from "@/components/editorial/public-utils";
import { EmptyState, PublicPage } from "@/components/storefront/page-frame";
import { PublishedDocument } from "@/components/published-document";
import styles from "@/components/editorial/editorial.module.css";
import { getPublishedRecord, listPublishedFaqs } from "@/lib/editorial/published";
import { publicMetadata } from "@/lib/editorial/seo";

export const dynamic = "force-dynamic";
const PAGE_SIZE = 24;
const MAX_PAGE = Math.floor(10_000 / PAGE_SIZE) + 1;

export async function generateMetadata(): Promise<Metadata> {
  const page = await getPublishedRecord("pages", "help");
  if (page && "redirectTo" in page) return publicMetadata(null, `/${page.redirectTo}`);
  return publicMetadata(page && !("redirectTo" in page) ? page.document : null, "/help");
}

export default async function HelpPage({ searchParams }: {
  searchParams: Promise<{ q?: string | string[]; topic?: string | string[]; page?: string | string[] }>;
}) {
  const params = await searchParams;
  const query = editorialSearchQuery(params.q);
  const topic = helpTopic(params.topic);
  const requestedPage = editorialPageNumber(Array.isArray(params.page) ? "" : params.page, PAGE_SIZE);
  const [page, firstResult] = await Promise.all([
    getPublishedRecord("pages", "help"),
    listPublishedFaqs({ q: query, topic, placement: "help", limit: PAGE_SIZE, offset: (requestedPage - 1) * PAGE_SIZE }),
  ]);
  const pageCount = Math.min(MAX_PAGE, Math.max(1, Math.ceil(firstResult.total / PAGE_SIZE)));
  const currentPage = Math.min(requestedPage, pageCount);
  const result = currentPage === requestedPage ? firstResult
    : await listPublishedFaqs({ q: query, topic, placement: "help", limit: PAGE_SIZE, offset: (currentPage - 1) * PAGE_SIZE });
  const { items, topics } = result;
  const resultCap = MAX_PAGE * PAGE_SIZE;
  if (page && "redirectTo" in page) permanentRedirect(`/${page.redirectTo}`);
  const document = page && !("redirectTo" in page) ? page.document : null;
  return <PublicPage eyebrow="Support" title={document?.title ?? "Help Center"} wide>
    <div className={styles.stack}>
      {document && <PublishedDocument document={document} hideTitle />}
      <form className={styles.searchForm} action="/help" method="get" role="search">
        {topic && <input type="hidden" name="topic" value={topic} />}
        <label>Search FAQs<input name="q" type="search" maxLength={120} defaultValue={query} /></label>
        <button type="submit">Search</button>
        {query && <Link href={helpPageHref("", 1, topic)} className={styles.filterLink}>Clear search</Link>}
      </form>
      <p className={styles.muted}>Search questions, topics and answers.</p>
      {topics.length > 0 && <form className={styles.searchForm} action="/help" method="get">
        {query && <input type="hidden" name="q" value={query} />}
        <label>Topic<select name="topic" defaultValue={topic}>
          <option value="">All topics</option>
          {topic && !topics.includes(topic) && <option value={topic}>Current filter: {topic}</option>}
          {topics.map((item) => <option key={item} value={item}>{item}</option>)}
        </select></label>
        <button type="submit">Apply topic</button>
        {topic && <Link href={helpPageHref(query, currentPage)} className={styles.filterLink}>Clear topic</Link>}
      </form>}
      {result.topicsTruncated && <p className={styles.muted}>Showing the first 100 topics. Search to narrow the list.</p>}
      {topic && result.items.length === 0 && <Link href={helpPageHref(query, currentPage)} className={styles.filterLink}>Clear topic</Link>}
      {items.length
        ? <FaqList items={items} />
        : <EmptyState title={query || topic ? "No FAQs match these filters." : "Help articles have not been published yet."} href="/contact" label="Contact the team">{query || topic ? "Try another search or clear the topic filter." : "You can still use the contact form for assistance."}</EmptyState>}
      <EditorialPagination
        ariaLabel="Help article pages"
        page={currentPage}
        pageCount={pageCount}
        total={result.total}
        resultCap={resultCap}
        itemLabel="help articles"
        hrefForPage={(page) => helpPageHref(query, page, topic)}
      />
    </div>
  </PublicPage>;
}
