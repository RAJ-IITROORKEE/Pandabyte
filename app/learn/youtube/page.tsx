import type { Metadata } from "next";
import Link from "next/link";
import { EditorialPagination } from "@/components/editorial/editorial-pagination";
import { editorialPageNumber, editorialSearchQuery, youtubeVideoId } from "@/components/editorial/public-utils";
import { VideoPlayer } from "@/components/editorial/video-player";
import styles from "@/components/editorial/editorial.module.css";
import { EmptyState, PublicPage } from "@/components/storefront/page-frame";
import { listPublishedRecords } from "@/lib/editorial/published";
import { publicMetadata } from "@/lib/editorial/seo";
import { LearningNavigation } from "../learning-navigation";
import youtubeStyles from "./youtube.module.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { ...publicMetadata(null, "/learn/youtube"), title: "YouTube | Learn | PandaByte.in" };
const PAGE_SIZE = 24;
const MAX_PAGE = Math.floor(10_000 / PAGE_SIZE) + 1;

function pageHref(query: string, page: number): string {
  const params = new URLSearchParams();
  if (query) params.set("q", query);
  if (page > 1) params.set("page", String(page));
  const suffix = params.toString();
  return suffix ? `/learn/youtube?${suffix}` : "/learn/youtube";
}

export default async function YouTubePage({ searchParams }: {
  searchParams: Promise<{ q?: string | string[]; page?: string | string[] }>;
}) {
  const params = await searchParams;
  const query = editorialSearchQuery(Array.isArray(params.q) ? "" : params.q);
  const requestedPage = editorialPageNumber(Array.isArray(params.page) ? "" : params.page, PAGE_SIZE);
  const firstResult = await listPublishedRecords("videos", { q: query, limit: PAGE_SIZE, offset: (requestedPage - 1) * PAGE_SIZE });
  const pageCount = Math.min(MAX_PAGE, Math.max(1, Math.ceil(firstResult.total / PAGE_SIZE)));
  const page = Math.min(requestedPage, pageCount);
  const result = page === requestedPage ? firstResult
    : await listPublishedRecords("videos", { q: query, limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE });
  const resultCap = MAX_PAGE * PAGE_SIZE;
  return <PublicPage eyebrow="Learn" title="YouTube" description="Videos published by PandaByte." wide>
    <div className={styles.stack}>
      <LearningNavigation current="youtube" />
      <section className={youtubeStyles.library} aria-labelledby="videos-heading">
        <div className={youtubeStyles.libraryHeader}>
          <div><h2 id="videos-heading">PandaByte videos</h2><p>Explore videos from PandaByte.</p></div>
          <form className={styles.searchForm} action="/learn/youtube" method="get" role="search">
            <label>Search videos<input name="q" type="search" maxLength={120} defaultValue={query} /></label>
            <button type="submit">Search</button>
            {query && <Link href="/learn/youtube" className={styles.filterLink}>Clear</Link>}
          </form>
        </div>
        <p className={youtubeStyles.count}>{result.total.toLocaleString("en-IN")} {result.total === 1 ? "video" : "videos"}{query ? " found" : ""}</p>
        {result.items.length
          ? <div className={youtubeStyles.grid}>{result.items.map((record) => <article className={youtubeStyles.card} key={record.id}>
              <VideoPlayer videoId={youtubeVideoId(record.document.url)} title={record.title} compact inline />
              <h3><Link href={`/learn/youtube/${record.slug}`}>{record.title}</Link></h3>
              {record.summary && <p>{record.summary}</p>}
            </article>)}</div>
          : <EmptyState title={query ? "No published videos match your search." : "No videos have been published yet."}>{query ? "Try another search or clear the search." : "PandaByte videos will appear here when they are ready."}</EmptyState>}
      </section>
      <EditorialPagination
        ariaLabel="YouTube video pages"
        page={page}
        pageCount={pageCount}
        total={result.total}
        resultCap={resultCap}
        itemLabel="videos"
        hrefForPage={(nextPage) => pageHref(query, nextPage)}
      />
    </div>
  </PublicPage>;
}
