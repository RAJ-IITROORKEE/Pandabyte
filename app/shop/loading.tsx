import { PublicPage } from "@/components/storefront/page-frame";
import styles from "@/components/catalog/catalog.module.css";

export default function ShopLoading() {
  return <PublicPage title="All Products" description="Loading published products…" wide>
    <p className={styles.resultsCount} role="status" aria-live="polite">Loading products.</p>
  </PublicPage>;
}
