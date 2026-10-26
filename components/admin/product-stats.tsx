import { IconCategory, IconPackages, IconTags } from "@tabler/icons-react";
import type { ProductTableStats } from "@/lib/admin/product-contract";
import styles from "./product-stats.module.css";

const countFormat = new Intl.NumberFormat("en-IN");
const moneyFormat = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 });

function count(value: number) {
  return countFormat.format(value);
}

function price(value: number) {
  return moneyFormat.format(value / 100);
}

export function ProductStats({ stats, loading }: { stats: ProductTableStats | undefined; loading: boolean }) {
  if (!stats) return <section aria-busy={loading} aria-label="Product statistics" className={styles.stats}>
    <p className={styles.state} role="status">{loading ? "Loading product statistics…" : "Product statistics are unavailable."}</p>
  </section>;

  const largestCategory = stats.categories.reduce((largest, category) => Math.max(largest, category.count), 0);
  const prices = stats.prices?.pricedProducts ? stats.prices : null;

  return <section aria-busy={loading} aria-label="Product statistics" className={styles.stats}>
    <article className={`${styles.panel} ${styles.totalPanel}`}>
      <header className={styles.heading}><IconPackages aria-hidden="true" size={17} stroke={1.7} /><h2>Total products</h2></header>
      <strong className={styles.totalValue}>{count(stats.totalProducts)}</strong>
      <dl className={styles.unpriced}><dt>Unpriced products</dt><dd>{count(stats.unpricedProducts)}</dd></dl>
      <p className={styles.caption}>Across the non-archived catalog</p>
    </article>

    <article className={`${styles.panel} ${styles.categoryPanel}`}>
      <header className={styles.heading}><IconCategory aria-hidden="true" size={17} stroke={1.7} /><h2>Category distribution</h2><span className={styles.categoryTotal}>{count(stats.categories.length)} categories</span></header>
      {stats.categories.length ? <ul className={styles.categoryList} aria-label="Products by category" tabIndex={0}>
        {stats.categories.map((category) => <li className={styles.categoryRow} key={category.id}>
          <div className={styles.categoryLabel}><span>{category.title}</span><strong>{count(category.count)}</strong></div>
          <div aria-hidden="true" className={styles.meter}><span style={{ width: `${largestCategory ? Math.max(0, category.count) / largestCategory * 100 : 0}%` }} /></div>
        </li>)}
      </ul> : <p className={styles.state}>No categories yet.</p>}
      <p className={styles.note}>Products may appear in more than one category.</p>
    </article>

    <article className={`${styles.panel} ${styles.pricePanel}`}>
      <header className={styles.heading}><IconTags aria-hidden="true" size={17} stroke={1.7} /><h2>Price overview</h2></header>
      <p className={styles.caption}>{prices ? `${count(prices.pricedProducts)} priced products` : "No configured product prices"}</p>
      <dl className={styles.priceList}>
        <div><dt>Lowest</dt><dd>{prices ? price(prices.minPaise) : "Not configured"}</dd></div>
        <div><dt>Average</dt><dd>{prices ? price(prices.avgPaise) : "Not configured"}</dd></div>
        <div><dt>Highest</dt><dd>{prices ? price(prices.maxPaise) : "Not configured"}</dd></div>
      </dl>
      <p className={styles.caption}>One current price per product. Unpriced products excluded.</p>
    </article>
  </section>;
}
