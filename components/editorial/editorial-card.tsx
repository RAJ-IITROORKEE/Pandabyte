import Link from "next/link";
import type { PublishedRecord } from "@/lib/editorial/published";
import type { AdminModule } from "@/lib/admin/validation";
import styles from "./editorial.module.css";

export function EditorialCard<M extends AdminModule>({ record, href, showPublishedAt = false }: {
  record: PublishedRecord<M>;
  href: string;
  showPublishedAt?: boolean;
}) {
  const tags = "tags" in record.document && Array.isArray(record.document.tags) ? record.document.tags : [];
  return <Link className={styles.card} href={href}>
    <h2>{record.title}</h2>
    {record.summary && <p>{record.summary}</p>}
    {"author" in record.document && record.document.author && <span className={styles.cardMeta}>By {record.document.author}</span>}
    {tags.length > 0 && <ul className={styles.cardTags} aria-label="Article tags">{tags.map((tag) => <li key={tag}>{tag}</li>)}</ul>}
    {showPublishedAt && <time dateTime={record.publishedAt}>{new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeZone: "UTC" }).format(new Date(record.publishedAt))}</time>}
    <span className={styles.cardArrow}>Read more <span aria-hidden="true">→</span></span>
  </Link>;
}
