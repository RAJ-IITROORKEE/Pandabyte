import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { ArrowRight, Building2, Users } from "lucide-react";
import { permanentRedirect } from "next/navigation";
import { Card, CardTitle } from "@/components/ui/card";
import { PublishedDocument } from "@/components/published-document";
import { TeamGrid } from "@/components/editorial/team-grid";
import { HomeBrands } from "@/components/home-brands";
import { aboutSections } from "@/components/editorial/about-sections";
import { EditorialPagination } from "@/components/editorial/editorial-pagination";
import { editorialPageNumber } from "@/components/editorial/public-utils";
import styles from "@/components/storefront/about-page.module.css";
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
  const [page, firstTeamPage, categories, products] = await Promise.all([
    getPublishedRecord("pages", "about"),
    listPublishedRecords("team", { limit: TEAM_PAGE_SIZE, offset: (requestedTeamPage - 1) * TEAM_PAGE_SIZE }),
    listPublishedRecords("categories", { limit: 100 }),
    listPublishedRecords("products", { limit: 1 }),
  ]);
  const teamPageCount = Math.min(MAX_TEAM_PAGE, Math.max(1, Math.ceil(firstTeamPage.total / TEAM_PAGE_SIZE)));
  const teamPage = Math.min(requestedTeamPage, teamPageCount);
  const team = teamPage === requestedTeamPage ? firstTeamPage
    : await listPublishedRecords("team", { limit: TEAM_PAGE_SIZE, offset: (teamPage - 1) * TEAM_PAGE_SIZE });
  const teamResultCap = MAX_TEAM_PAGE * TEAM_PAGE_SIZE;
  const document = page && !("redirectTo" in page) ? page.document : null;
  if (page && "redirectTo" in page) permanentRedirect(`/${page.redirectTo}`);
  const heroCategory = categories.items.find((item) => item.slug === "iot-kits" && item.document.mediaIds[0])
    ?? categories.items.find((item) => item.document.mediaIds[0]);
  const sections = aboutSections(document?.blocks ?? []);
  return <main id="main" tabIndex={-1} className={styles.page}>
    <nav className={styles.breadcrumb} aria-label="Breadcrumb"><Link href="/">Home</Link><span aria-hidden="true">/</span><span aria-current="page">About</span></nav>
    <section className={styles.aboutHero} aria-labelledby="about-title">
      <header className={styles.heading}>
        <h1 id="about-title">{document?.title ?? "About PandaByte"}</h1>
        <p className={styles.lede}>{document?.summary || "PandaByte is an IoT and embedded hardware company. Explore development boards, sensors, shields, accessories and IoT kits in our catalog."}</p>
        <div className={styles.actions}>
          <Link href="/shop" className={styles.primary}>Explore the catalog <ArrowRight size={18} aria-hidden="true" /></Link>
          <Link href="/contact" className={styles.secondary}>Contact PandaByte</Link>
        </div>
      </header>
      {heroCategory && <div className={styles.heroImage}>
        <Image unoptimized src={`/api/media/${encodeURIComponent(heroCategory.document.mediaIds[0])}?w=960`} alt={`${heroCategory.title} hardware`} width={720} height={540} priority />
        <span>Explore the hardware behind your next idea</span>
      </div>}
    </section>
    <section className={styles.ecosystem} aria-label="Hardware ecosystem">
      <p className={styles.sectionLabel}>From the wider hardware ecosystem</p>
      <HomeBrands />
    </section>
    <section className={styles.companySection} aria-label="Company information">
      {document ? <div className={styles.companyContent}>{sections.map((blocks, index) => <PublishedDocument key={index} document={{ ...document, summary: "", blocks }} hideTitle />)}</div>
        : <Card as="section" className={`${styles.panel} ${styles.empty}`} aria-labelledby="company-empty-title">
          <Building2 size={28} aria-hidden="true" />
          <CardTitle as="h2" id="company-empty-title">Company information has not been published yet.</CardTitle>
          <p>The public page will appear here when its content is approved and published.</p>
        </Card>}
    </section>
    <section className={styles.section} aria-labelledby="team-title">
      <div className={styles.sectionHeading}><h2 id="team-title">Meet the team</h2><p>The people behind PandaByte Innovations Pvt Ltd.</p></div>
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
    <section className={styles.metrics} aria-label="PandaByte in numbers">
      <div><strong>{products.total}</strong><span>Products in the catalog</span></div>
      <div><strong>{categories.total}</strong><span>Hardware categories</span></div>
      <div><strong>{team.total}</strong><span>People behind PandaByte</span></div>
    </section>
    <Card as="section" className={styles.contactCallout} aria-labelledby="about-contact-title">
      <div><h2 id="about-contact-title">What will you build next?</h2><p>From a first experiment to your next research idea, tell us what you have in mind.</p></div>
      <Link href="/contact" className={styles.secondary}>Talk to the team <ArrowRight size={18} aria-hidden="true" /></Link>
    </Card>
  </main>;
}
