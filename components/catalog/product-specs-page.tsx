import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, Search } from "lucide-react";
import { EmptyState, PublicPage } from "@/components/storefront/page-frame";
import { FavoritesButton } from "@/components/favorites/favorites-button";
import { ProductCardMedia } from "@/components/catalog/product-card-media";
import { listCatalogProducts } from "@/lib/catalog/published";
import { parseCatalogQuery, type CatalogQuery } from "@/lib/catalog/query";
import { listPublishedRecords } from "@/lib/editorial/published";
import styles from "./product-specs-page.module.css";

type SearchParams = Record<string, string | string[] | undefined>;
type Props = { searchParams: Promise<SearchParams> };

const PAGE_SIZE = 12;
const MAX_PAGE = Math.floor(10_000 / PAGE_SIZE) + 1;
const SUPPORTED_PARAMS = new Set(["q", "category", "page"]);

function firstParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function allParams(value: string | string[] | undefined): string[] {
  return value === undefined ? [] : Array.isArray(value) ? value : [value];
}

function pageHref(query: CatalogQuery, page: number): string {
  const params = new URLSearchParams();
  if (query.q) params.set("q", query.q);
  query.categories.forEach((category) => params.append("category", category));
  if (page > 1) params.set("page", String(page));
  const search = params.toString();
  return search ? `/learn/product-specs?${search}` : "/learn/product-specs";
}

export async function ProductSpecsPage({ searchParams }: Props) {
  const raw = await searchParams;
  const unsupported = Object.keys(raw).filter((key) => !SUPPORTED_PARAMS.has(key));
  const parsed = parseCatalogQuery({ q: raw.q, category: raw.category, page: raw.page, limit: String(PAGE_SIZE) });
  const errors = [
    ...unsupported.map((field) => ({ field, message: "This filter is not supported on this page." })),
    ...(parsed.ok ? [] : parsed.fields),
  ];
  const query = errors.length === 0 && parsed.ok ? parsed.value : null;
  const [categoryResult, products] = await Promise.all([
    listPublishedRecords("categories", { limit: 100, offset: 0 }),
    query ? listCatalogProducts(query) : Promise.resolve({ items: [], total: 0 }),
  ]);
  const categories = [...categoryResult.items].sort((left, right) =>
    left.document.position - right.document.position || left.title.localeCompare(right.title) || left.id.localeCompare(right.id),
  );
  const submittedCategories = new Set(allParams(raw.category).map((value) => value.trim().toLowerCase()));
  const selectedCategories = new Set(query?.categories ?? categories.flatMap((category) =>
    submittedCategories.has(category.slug) || submittedCategories.has(category.id) ? [category.slug] : [],
  ));
  const pageCount = query ? Math.min(MAX_PAGE, Math.max(1, Math.ceil(products.total / PAGE_SIZE))) : 0;
  if (query && query.page > pageCount) redirect(pageHref(query, pageCount));

  return <PublicPage eyebrow="Learn" title="Product specifications" description="Browse published products by category, then open a product for its specifications." wide>
    <div className={styles.page}>
      <form className={styles.form} action="/learn/product-specs" method="get">
        <div className={styles.searchRow}>
          <label className={styles.searchField} htmlFor="product-specs-search">
            <span>Search products</span>
            <input id="product-specs-search" name="q" type="search" maxLength={120} defaultValue={firstParam(raw.q)} placeholder="Search by product, SKU or model" />
          </label>
          <button className={styles.searchButton} type="submit"><Search size={17} aria-hidden="true" />Search</button>
          <Link className={styles.resetLink} href="/learn/product-specs">Reset</Link>
        </div>

        <div className={styles.layout}>
          <aside className={styles.sidebar} aria-label="Product filters">
            <details className={styles.categoryPanel} open>
              <summary>Categories</summary>
              <fieldset className={styles.categoryFieldset}>
                <legend className={styles.srOnly}>Filter by product category</legend>
                {categories.length ? <div className={styles.categoryList}>
                  {categories.map((category) => <label className={styles.categoryOption} key={category.id}>
                    <input type="checkbox" name="category" value={category.slug} defaultChecked={selectedCategories.has(category.slug) || selectedCategories.has(category.id)} />
                    <span>{category.title}</span>
                  </label>)}
                </div> : <p className={styles.muted}>No product categories have been published yet.</p>}
                {categoryResult.total > categories.length && <p className={styles.muted}>Showing the first {categories.length} published categories.</p>}
              </fieldset>
              <button className={styles.applyButton} type="submit">Apply filters</button>
            </details>
          </aside>

          <section className={styles.results} aria-labelledby="product-specs-results-heading">
            {errors.length > 0 && <div className={styles.queryErrors} role="alert" aria-labelledby="product-specs-filter-error">
              <h2 id="product-specs-filter-error">Some search filters need attention</h2>
              <ul>{errors.map((error, index) => <li key={`${error.field}-${index}`}>{error.message}</li>)}</ul>
            </div>}
            {query ? <>
              <div className={styles.resultsHeader}>
                <h2 id="product-specs-results-heading" aria-live="polite">{products.total} {products.total === 1 ? "published product" : "published products"}</h2>
              </div>
              {products.items.length ? <ul className={styles.productGrid}>
                {products.items.map((product) => {
                  const href = `/products/${encodeURIComponent(product.slug)}`;
                  const images = product.document.mediaIds.slice(0, 2).map((id) => ({ id, alt: "" }));
                  return <li key={product.id}>
                    <article className={styles.productCard}>
                      <ProductCardMedia href={href} title={product.title} images={images} />
                      <div className={styles.cardBody}>
                        <div className={styles.cardHeading}>
                          <h3><Link href={href}>{product.title}</Link></h3>
                          <FavoritesButton productId={product.id} slug={product.slug} title={product.title} />
                        </div>
                        <Link className={styles.detailsButton} href={href}>View details <ArrowRight size={16} aria-hidden="true" /></Link>
                      </div>
                    </article>
                  </li>;
                })}
              </ul> : <EmptyState
                title={query.q || query.categories.length ? "No products match these filters" : "No products are published yet"}
                href="/learn/product-specs"
                label="Clear filters"
              >
                {query.q || query.categories.length ? "Try another search or remove one or more categories." : "Published products will appear here when they are ready to browse."}
              </EmptyState>}
              {pageCount > 1 && <nav className={styles.pagination} aria-label="Product specification pages">
                {query.page > 1 ? <Link href={pageHref(query, query.page - 1)}>Previous</Link> : <span aria-disabled="true">Previous</span>}
                <span>Page {query.page} of {pageCount}</span>
                {query.page < pageCount ? <Link href={pageHref(query, query.page + 1)}>Next</Link> : <span aria-disabled="true">Next</span>}
              </nav>}
              {products.total > MAX_PAGE * PAGE_SIZE && <p className={styles.muted}>Further results are outside the supported page range.</p>}
            </> : <div className={styles.resultsUnavailable}>
              <h2 id="product-specs-results-heading">Results are waiting for valid filters</h2>
              <p>Correct the search or category values above and try again.</p>
            </div>}
          </section>
        </div>
      </form>
    </div>
  </PublicPage>;
}
