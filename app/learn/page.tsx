import type { Metadata } from "next";
import Link from "next/link";
import { EditorialCard } from "@/components/editorial/editorial-card";
import styles from "@/components/editorial/editorial.module.css";
import { EmptyState, PublicPage } from "@/components/storefront/page-frame";
import { listPublishedRecords } from "@/lib/editorial/published";
import { publicMetadata } from "@/lib/editorial/seo";
import { LearningNavigation } from "./learning-navigation";
import learningStyles from "./learning.module.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = publicMetadata(null, "/learn");
const EMBEDDED_SYSTEMS_PAGE_SIZE = 24;

export default async function LearnPage() {
  const { items, total } = await listPublishedRecords("learn", { collection: "embedded-systems", limit: EMBEDDED_SYSTEMS_PAGE_SIZE });
  return <PublicPage eyebrow="Learn" title="Learn" description="Browse technical resources published by PandaByte." wide>
    <div className={styles.stack}>
      <LearningNavigation />
      <section className={learningStyles.collection} aria-labelledby="embedded-resources-title">
        <div className={learningStyles.collectionHeading}>
          <h2 id="embedded-resources-title">Embedded systems</h2>
          {total > EMBEDDED_SYSTEMS_PAGE_SIZE && <Link className={styles.filterLink} href="/learn/embedded-systems">View all embedded systems resources</Link>}
        </div>
        {items.length
          ? <div className={styles.grid}>{items.map((record) => <EditorialCard key={record.id} record={record} href={`/learn/resources/${record.slug}`} />)}</div>
          : <EmptyState title="No embedded systems resources have been published yet.">Published guides and links will appear here.</EmptyState>}
      </section>
    </div>
  </PublicPage>;
}
