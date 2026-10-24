import { PublicPage } from "@/components/storefront/page-frame";
import styles from "@/components/catalog/catalog.module.css";

export default function ProductLoading() {
  return <PublicPage eyebrow="Product" title="Loading product" description="Loading published product details." wide>
    <p className={styles.resultsCount} role="status" aria-live="polite">Loading current product information.</p>
  </PublicPage>;
}
