import Link from "next/link";
import styles from "@/components/editorial/editorial.module.css";

const collections = [
  ["embedded-systems", "Embedded systems"],
  ["product-specs", "Product specifications"],
  ["kit-guides", "Kit guides"],
  ["youtube", "YouTube"],
] as const;

export function LearningNavigation({ current }: { current?: string }) {
  return <nav className={styles.filters} aria-label="Learning resource collections">
    {collections.map(([slug, label]) => <Link className={styles.filterLink} href={`/learn/${slug}`} key={slug} aria-current={slug === current ? "page" : undefined}>{label}</Link>)}
  </nav>;
}
