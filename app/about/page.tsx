import type { Metadata } from "next";
import { permanentRedirect } from "next/navigation";
import { EmptyState, PublicPage } from "@/components/storefront/page-frame";
import { PublishedDocument } from "@/components/published-document";
import { TeamGrid } from "@/components/editorial/team-grid";
import { EditorialPagination } from "@/components/editorial/editorial-pagination";
import { editorialPageNumber } from "@/components/editorial/public-utils";
import styles from "@/components/editorial/editorial.module.css";
import { getPublishedRecord, listPublishedRecords } from "@/lib/editorial/published";
import { publicMetadata } from "@/lib/editorial/seo";

export const dynamic = "force-dynamic";
const TEAM_PAGE_SIZE = 24;
const MAX_TEAM_PAGE = Math.floor(10_000 / TEAM_PAGE_SIZE) + 1;

function teamPageHref(page: number): string {
  return page > 1 ? `/about?page=${page}` : "/about";
}

type AboutPageProps = { searchParams: Promise<{ page?: string | string[] }> };

export async function generateMetadata(): Promise<Metadata> {
  const page = await getPublishedRecord("pages", "about");
  if (page && "redirectTo" in page) return publicMetadata(null, `/${page.redirectTo}`);
  return publicMetadata(page && !("redirectTo" in page) ? page.document : null, "/about");
}

export default async function AboutPage({ searchParams }: AboutPageProps) {
  const params = await searchParams;
  const requestedTeamPage = editorialPageNumber(Array.isArray(params.page) ? "" : params.page, TEAM_PAGE_SIZE);
  const [page, firstTeamPage] = await Promise.all([
    getPublishedRecord("pages", "about"),
    listPublishedRecords("team", { limit: TEAM_PAGE_SIZE, offset: (requestedTeamPage - 1) * TEAM_PAGE_SIZE }),
  ]);
  const teamPageCount = Math.min(MAX_TEAM_PAGE, Math.max(1, Math.ceil(firstTeamPage.total / TEAM_PAGE_SIZE)));
  const teamPage = Math.min(requestedTeamPage, teamPageCount);
  const team = teamPage === requestedTeamPage ? firstTeamPage
    : await listPublishedRecords("team", { limit: TEAM_PAGE_SIZE, offset: (teamPage - 1) * TEAM_PAGE_SIZE });
  const teamResultCap = MAX_TEAM_PAGE * TEAM_PAGE_SIZE;
  const document = page && !("redirectTo" in page) ? page.document : null;
  if (page && "redirectTo" in page) permanentRedirect(`/${page.redirectTo}`);
  return <PublicPage eyebrow="Company" title={document?.title ?? "About PandaByte"}>
    <div className={styles.stack}>
      {document
        ? <PublishedDocument document={document} hideTitle />
        : <EmptyState title="Company information has not been published yet.">The public page will appear here when its content is approved and published.</EmptyState>}
      {team.total > 0 && <section className={styles.section}>
        <div className={styles.sectionHeading}><h2>Team</h2></div>
        <TeamGrid items={team.items} />
        <EditorialPagination
          ariaLabel="Team pages"
          page={teamPage}
          pageCount={teamPageCount}
          total={team.total}
          resultCap={teamResultCap}
          itemLabel="team members"
          hrefForPage={teamPageHref}
        />
      </section>}
    </div>
  </PublicPage>;
}
