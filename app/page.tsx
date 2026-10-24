import Link from "next/link";
import { HomeCircuit } from "@/components/home-circuit";
import { ProductCard } from "@/components/catalog/product-card";
import { FaqList } from "@/components/storefront/faq-list";
import { EmptyState } from "@/components/storefront/page-frame";
import { PublishedDocument } from "@/components/published-document";
import { listCatalogProducts } from "@/lib/catalog/published";
import { getPublishedRecord, listPublishedRecords } from "@/lib/editorial/published";
import styles from "@/components/home.module.css";
import { publicMetadata } from "@/lib/editorial/seo";
import { permanentRedirect } from "next/navigation";

const defaultTitle = "Incredible Products for all your IoT Experiments";
const defaultSummary = "Development Boards · Sensors · Shields · Accessories · IoT Kits";

export async function generateMetadata() {
  const result = await getPublishedRecord("pages","home");
  return publicMetadata(result && "document" in result ? result.document : {title:defaultTitle,slug:"home",summary:defaultSummary,blocks:[],seoTitle:"",seoDescription:""}, "/");
}

function categoryHref(slug: string): string {
  const query = new URLSearchParams({ category: slug });
  return `/shop?${query.toString()}`;
}

export default async function HomePage() {
  const [homeResult, categoryResult, products, faqs] = await Promise.all([
    getPublishedRecord("pages", "home"),
    listPublishedRecords("categories", { limit: 100, offset: 0 }),
    listCatalogProducts({ sort: "newest", limit: 4 }),
    listPublishedRecords("faqs", { placement: "home", limit: 6, offset: 0 }),
  ]);
  if (homeResult && "redirectTo" in homeResult) permanentRedirect(`/${homeResult.redirectTo}`);

  const home = homeResult && "document" in homeResult ? homeResult : null;
  const title = home?.document.title || defaultTitle;
  const summary = home ? home.document.summary : defaultSummary;
  const categories = [...categoryResult.items]
    .sort((left, right) => left.document.position - right.document.position || left.title.localeCompare(right.title) || left.id.localeCompare(right.id))
    .slice(0, 5);

  return (
    <main id="main" tabIndex={-1} className={styles.homeMain}>
      <section className={styles.hero} aria-labelledby="home-title">
        <div className={styles.heroCopy}>
          <p className={styles.eyebrow}><span aria-hidden="true" />IoT &amp; Embedded</p>
          <h1 id="home-title" className={styles.heroTitle}>
            {title === defaultTitle ? <>
              <span>Incredible Products</span>
              <span className={styles.titleAccent}>for all your IoT Experiments</span>
            </> : title}
          </h1>
          {summary && <p className={styles.heroSummary}>{summary}</p>}
          <div className={styles.heroActions}>
            <Link className={styles.primaryAction} href="/shop">Shop All <span aria-hidden="true">→</span></Link>
            <Link className={styles.secondaryAction} href="/help">Help Center</Link>
          </div>
        </div>
        <div className={styles.heroVisual}>
          <HomeCircuit />
        </div>
      </section>

      {home?.document.blocks.length ? (
        <section className={styles.homeContent} aria-label="Additional homepage content">
          <PublishedDocument document={{ ...home.document, summary: "" }} hideTitle />
        </section>
      ) : null}

      <section className={styles.contentSection} aria-labelledby="categories-title">
        <div className={styles.sectionHeading}>
          <div>
            <p className="section-kicker">Browse</p>
            <h2 id="categories-title">Explore categories</h2>
          </div>
          <Link className={styles.sectionLink} href="/shop">View the shop <span aria-hidden="true">→</span></Link>
        </div>
        {categories.length ? (
          <nav aria-label="Published product categories" className={styles.categoryGrid}>
            {categories.map((category) => (
              <Link className={styles.categoryCard} href={categoryHref(category.slug)} key={category.id}>
                <span className={styles.categoryCardTitle}>{category.title}</span>
                {category.summary && <span className={styles.categoryCardSummary}>{category.summary}</span>}
                <span className={styles.categoryArrow} aria-hidden="true">↗</span>
              </Link>
            ))}
          </nav>
        ) : (
          <EmptyState title="No product categories are published yet">
            <p>Published categories will appear here when they are ready to browse.</p>
          </EmptyState>
        )}
      </section>

      <section className={styles.contentSection} aria-labelledby="featured-title">
        <div className={styles.sectionHeading}>
          <div>
            <p className="section-kicker">Catalog</p>
            <h2 id="featured-title">Featured hardware</h2>
          </div>
          <Link className={styles.sectionLink} href="/shop">Browse all products <span aria-hidden="true">→</span></Link>
        </div>
        {products.items.length ? (
          <div className={styles.productGrid}>
            {products.items.map((product) => <ProductCard key={product.id} product={product} />)}
          </div>
        ) : (
          <EmptyState title="No products are published yet" href="/shop" label="Browse the shop">
            <p>Published products will appear here when they are ready to browse.</p>
          </EmptyState>
        )}
      </section>

      <section className={styles.supportPanel} aria-labelledby="support-title">
        <div>
          <p className="section-kicker">Support</p>
          <h2 id="support-title">Need product or project help?</h2>
          <p>Visit the help center for available support information.</p>
        </div>
        <Link className={styles.secondaryAction} href="/help">Help Center <span aria-hidden="true">→</span></Link>
      </section>

      <section className={styles.contentSection} aria-labelledby="faq-title">
        <div className={styles.sectionHeading}>
          <div>
            <p className="section-kicker">Help</p>
            <h2 id="faq-title">Frequently asked questions</h2>
          </div>
          <Link className={styles.sectionLink} href="/help">Visit the help center <span aria-hidden="true">→</span></Link>
        </div>
        {faqs.items.length ? <FaqList items={faqs.items} /> : (
          <EmptyState title="No frequently asked questions are published yet">
            <p>Published answers will appear here when they are ready.</p>
          </EmptyState>
        )}
      </section>
    </main>
  );
}
