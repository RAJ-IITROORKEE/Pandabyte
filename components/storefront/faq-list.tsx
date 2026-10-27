import type { PublishedRecord } from "@/lib/editorial/published";
import { PublishedDocument } from "@/components/published-document";
import { ChevronDown } from "lucide-react";
import { faqGroups } from "./faq-groups";
import styles from "./faq-list.module.css";

export function FaqList({ items }: { items: PublishedRecord<"faqs">[] }) {
  if (!items.length) return null;
  const groups = faqGroups(items);
  return <div className={styles.faqList}>
    {[...groups].map(([topic, entries]) => <div className={styles.faqGroup} key={topic}>
      {topic && <p className={styles.faqTopic}>{topic}</p>}
      {entries.map(({ id, document }) => <details className={styles.faqItem} key={id}>
        <summary><span>{document.title}</span><ChevronDown aria-hidden="true" /></summary>
        <div className={styles.faqAnswer}><PublishedDocument document={document} hideTitle /></div>
      </details>)}
    </div>)}
  </div>;
}
