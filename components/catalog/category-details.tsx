import Image from "next/image";
import type { PublishedRecord } from "@/lib/editorial/published";
import { PublishedDocument } from "@/components/published-document";
import { ProductRichContentView } from "@/components/catalog/product-rich-content";
import styles from "./category-details.module.css";

export function CategoryDetails({ category }: { category: PublishedRecord<"categories"> }) {
  const { document } = category;
  const legacyDocument = { ...document, summary: "", mediaIds: [] };

  return <section className={styles.section} aria-labelledby="category-details-title">
    <div className={styles.copy}>
      <h2 className={styles.title} id="category-details-title">{category.title}</h2>
      {category.summary && <p className={styles.summary}>{category.summary}</p>}
      {document.richContent
        ? <ProductRichContentView content={document.richContent} />
        : document.blocks.length > 0 && <PublishedDocument document={legacyDocument} hideTitle />}
    </div>
    {document.mediaIds.length > 0 && <div className={styles.images}>
      {document.mediaIds.map((id, index) => <Image
        className={styles.image}
        key={`${id}-${index}`}
        src={`/api/media/${encodeURIComponent(id)}?w=960`}
        alt=""
        aria-hidden="true"
        width={480}
        height={360}
        unoptimized
        loading="lazy"
        sizes="(max-width: 767px) 45vw, 28vw"
      />)}
    </div>}
  </section>;
}
