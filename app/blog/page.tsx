import type { Metadata } from "next";
import Link from "next/link";
import { EditorialCard } from "@/components/editorial/editorial-card";
import { editorialPageNumber, editorialSearchQuery } from "@/components/editorial/public-utils";
import styles from "@/components/editorial/editorial.module.css";
import { EmptyState, PublicPage } from "@/components/storefront/page-frame";
import { listPublishedBlogTags, listPublishedRecords } from "@/lib/editorial/published";
import { publicMetadata } from "@/lib/editorial/seo";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { ...publicMetadata(null, "/blog"), title: "Blog | PandaByte.in", description: "Articles published by PandaByte." };

const PAGE_SIZE = 12;
const MAX_PAGE = Math.floor(10_000 / PAGE_SIZE) + 1;

function pageHref(query: string, tag: string, page: number) {
  const params = new URLSearchParams();
  if (query) params.set("q", query);
  if (tag) params.set("tag", tag);
  if (page > 1) params.set("page", String(page));
  const suffix = params.toString();
  return suffix ? `/blog?${suffix}` : "/blog";
}

export default async function BlogPage({ searchParams }: {
  searchParams: Promise<{ q?: string | string[]; tag?: string | string[]; page?: string | string[] }>;
}) {
  const params = await searchParams;
  const query = editorialSearchQuery(Array.isArray(params.q) ? "" : params.q);
  const rawTag = Array.isArray(params.tag) ? "" : params.tag?.trim() ?? "";
  const tag = rawTag.length <= 60 && !/[\u0000-\u001f\u007f]/u.test(rawTag) ? rawTag : "";
  const requestedPage = editorialPageNumber(Array.isArray(params.page) ? "" : params.page, PAGE_SIZE);
  const [topics, firstResult] = await Promise.all([
    listPublishedBlogTags(),
    listPublishedRecords("blog", { q: query, tag, limit: PAGE_SIZE, offset: (requestedPage - 1) * PAGE_SIZE }),
  ]);
  const pageCount = Math.min(MAX_PAGE, Math.max(1, Math.ceil(firstResult.total / PAGE_SIZE)));
  const page = Math.min(requestedPage, pageCount);
  const { items, total } = page === requestedPage ? firstResult
    : await listPublishedRecords("blog", { q: query, tag, limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE });
  const resultCap = MAX_PAGE * PAGE_SIZE;
  return <PublicPage eyebrow="Learn" title="Blog" description="Articles and updates published by PandaByte." wide>
    <div className={styles.stack}>
      <form className={styles.searchForm} action="/blog" method="get" role="search">
        <label>Search articles<input name="q" type="search" maxLength={120} defaultValue={query} /></label>
        <label>Topic<select name="tag" defaultValue={tag}>
          <option value="">All topics</option>
          {tag && !topics.includes(tag) && <option value={tag}>Current filter: {tag}</option>}
          {topics.map((topic) => <option value={topic} key={topic}>{topic}</option>)}
        </select></label>
        <button type="submit">Search</button>
        {(query || tag) && <Link href="/blog" className={styles.filterLink}>Clear filters</Link>}
      </form>
      {items.length
        ? <div className={styles.grid}>{items.map((record) => <EditorialCard key={record.id} record={record} href={`/blog/${record.slug}`} showPublishedAt />)}</div>
        : <EmptyState title={query || tag ? "No published articles match these filters." : "No articles have been published yet."}>{query || tag ? "Try another search or clear the topic filter." : "New articles will appear here when published."}</EmptyState>}
      {total > PAGE_SIZE && <nav className={styles.pagination} aria-label="Blog pages">
        {page > 1 ? <Link href={pageHref(query, tag, page - 1)}>Previous</Link> : <span />}
        <span>Page {page} of {pageCount} · {total > resultCap ? `showing the first ${resultCap.toLocaleString("en-IN")} of ${total.toLocaleString("en-IN")} articles` : `${total} articles`}</span>
        {page < pageCount ? <Link href={pageHref(query, tag, page + 1)}>Next</Link> : <span />}
      </nav>}
    </div>
  </PublicPage>;
}
