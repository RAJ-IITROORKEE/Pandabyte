import type { PublishedRecord } from "@/lib/editorial/published";
import { PublishedDocument } from "@/components/published-document";
import { Plus } from "lucide-react";
import styles from "./faq-list.module.css";

export function FaqList({ items }: { items: PublishedRecord<"faqs">[] }) {
  if (!items.length) return null;
  return <div className={styles.faqList}>
    {items.map(({ id, document }) => <details className={styles.faqItem} key={id}>
      <summary><span>{document.title}</span><Plus aria-hidden="true" /></summary>
      <div className={styles.faqAnswer}><PublishedDocument document={document} hideTitle /></div>
    </details>)}
  </div>;
}
