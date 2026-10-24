import type { Metadata } from "next";
import Link from "next/link";
import { EditorialCard } from "@/components/editorial/editorial-card";
import styles from "@/components/editorial/editorial.module.css";
import { EmptyState, PublicPage } from "@/components/storefront/page-frame";
import { listPublishedRecords } from "@/lib/editorial/published";
import { publicMetadata } from "@/lib/editorial/seo";

export const dynamic = "force-dynamic";
export const metadata: Metadata = publicMetadata(null, "/learn");
const EMBEDDED_SYSTEMS_PAGE_SIZE = 24;

const collections = [
  ["embedded-systems", "Embedded systems"],
  ["product-specs", "Product specifications"],
  ["kit-guides", "Kit guides"],
] as const;

export default async function LearnPage() {
  const { items, total } = await listPublishedRecords("learn", { collection: "embedded-systems", limit: EMBEDDED_SYSTEMS_PAGE_SIZE });
  return <PublicPage eyebrow="Learn" title="Learn" description="Browse technical resources published by PandaByte." wide>
    <div className={styles.stack}>
      <nav className={styles.filters} aria-label="Learning resource collections">
        {collections.map(([slug, label]) => <Link className={styles.filterLink} href={`/learn/${slug}`} key={slug} aria-current={slug === "embedded-systems" ? "page" : undefined}>{label}</Link>)}
        <Link className={styles.filterLink} href="/learn/youtube">YouTube</Link>
      </nav>
      {items.length
        ? <div className={styles.grid}>{items.map((record) => <EditorialCard key={record.id} record={record} href={`/learn/resources/${record.slug}`} />)}</div>
        : <EmptyState title="No embedded systems resources have been published yet.">Published guides and links will appear here.</EmptyState>}
      {total > EMBEDDED_SYSTEMS_PAGE_SIZE && <Link className={styles.filterLink} href="/learn/embedded-systems">View all embedded systems resources</Link>}
    </div>
  </PublicPage>;
}
