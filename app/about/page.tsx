import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Building2, Users } from "lucide-react";
import { permanentRedirect } from "next/navigation";
import { Card, CardTitle } from "@/components/ui/card";
import { PublishedDocument } from "@/components/published-document";
import { TeamGrid } from "@/components/editorial/team-grid";
import { EditorialPagination } from "@/components/editorial/editorial-pagination";
import { editorialPageNumber } from "@/components/editorial/public-utils";
import styles from "@/components/editorial/company.module.css";
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
  return <main id="main" tabIndex={-1} className={styles.page}>
    <nav className={styles.breadcrumb} aria-label="Breadcrumb"><Link href="/">Home</Link><span aria-hidden="true">/</span><span aria-current="page">About</span></nav>
    <section className={styles.aboutHero} aria-labelledby="about-title">
      <header className={styles.heading}>
        <p className="section-kicker">Company · PandaByte.in</p>
        <h1 id="about-title">{document?.title ?? "About PandaByte"}</h1>
        {document?.summary && <p className={styles.lede}>{document.summary}</p>}
        <div className={styles.actions}>
          <Link href="/shop" className={styles.primary}>Explore the catalog <ArrowRight size={18} aria-hidden="true" /></Link>
          <Link href="/contact" className={styles.secondary}>Contact PandaByte</Link>
        </div>
      </header>
      {document ? <div className={styles.companyContent}><PublishedDocument document={{ ...document, summary: "" }} hideTitle /></div>
        : <Card as="section" className={`${styles.panel} ${styles.empty}`} aria-labelledby="company-empty-title">
          <Building2 size={28} aria-hidden="true" />
          <CardTitle as="h2" id="company-empty-title">Company information has not been published yet.</CardTitle>
          <p>The public page will appear here when its content is approved and published.</p>
        </Card>}
    </section>
    <section className={styles.section} aria-labelledby="team-title">
      <div className={styles.sectionHeading}><h2 id="team-title">The team</h2></div>
      {team.total > 0 ? <>
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
        </> : <Card className={styles.emptyRow}>
          <Users size={24} aria-hidden="true" />
          <div><CardTitle>No team profiles published</CardTitle><p>Team details will appear here when they are approved and published.</p></div>
        </Card>}
    </section>
    <Card as="section" className={styles.contactCallout} aria-labelledby="about-contact-title">
      <div><p className="section-kicker">Get in touch</p><h2 id="about-contact-title">Contact PandaByte</h2><p>Have a question? Use the contact page to send a message to the team.</p></div>
      <Link href="/contact" className={styles.secondary}>Open contact page <ArrowRight size={18} aria-hidden="true" /></Link>
    </Card>
  </main>;
}
