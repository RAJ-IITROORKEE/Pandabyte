import Image from "next/image";
import Link from "next/link";
import type { PublishedRecord } from "@/lib/editorial/published";
import { blogPreview } from "./preview";
import styles from "./blog.module.css";

type Preview = (typeof blogPreview)[number];

export function BlogCard({ record }: { record: PublishedRecord<"blog"> }) {
  const image = record.document.mediaIds[0];
  return <Link href={`/blog/${record.slug}`} className={styles.card}>
    {image ? <Image className={styles.image} src={`/api/media/${encodeURIComponent(image)}?w=960`} alt="" width={960} height={600} sizes="(max-width: 639px) 100vw, (max-width: 1023px) 50vw, 33vw" unoptimized /> : <div className={`${styles.image} ${styles.placeholder}`}>No image published</div>}
    <div className={styles.body}>
      <h2>{record.title}</h2>
      {record.summary && <p>{record.summary}</p>}
      <p className={styles.meta}>{record.document.author && <>By {record.document.author} · </>}<time dateTime={record.publishedAt}>{new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeZone: "UTC" }).format(new Date(record.publishedAt))}</time></p>
      {record.document.tags.length > 0 && <div className={styles.badges}>{record.document.tags.map((tag) => <span className={styles.badge} key={tag}>{tag}</span>)}</div>}
    </div>
  </Link>;
}

export function BlogPreviewCard({ item }: { item: Preview }) {
  return <article className={styles.card}>
    <Image className={styles.image} src={item.image} alt="" width={960} height={600} sizes="(max-width: 639px) 100vw, (max-width: 1023px) 50vw, 33vw" />
    <div className={styles.body}>
      <h2>{item.title}</h2>
      <p>{item.summary}</p>
      <span className={styles.badge}>{item.category}</span>
    </div>
  </article>;
}
