import Link from "next/link";
import { redirect } from "next/navigation";
import { Search } from "lucide-react";
import { listCatalogProducts } from "@/lib/catalog/published";
import { parseCatalogQuery, type CatalogQuery } from "@/lib/catalog/query";
import { listPublishedRecords } from "@/lib/editorial/published";
import { EmptyState, PublicPage } from "@/components/storefront/page-frame";
import { ProductCard } from "@/components/catalog/product-card";
import { CatalogFilters } from "@/components/catalog/catalog-filters";
import styles from "@/components/catalog/catalog.module.css";
import presentation from "@/components/catalog/catalog-presentation.module.css";
import { publicMetadata } from "@/lib/editorial/seo";

export const metadata = publicMetadata({
  title: "Catalog",
  slug: "shop",
  summary: "Browse published IoT and embedded products.",
  blocks: [],
  seoTitle: "Catalog | PandaByte.in",
  seoDescription: "Browse published PandaByte IoT and embedded products.",
}, "/shop");

type SearchParams = Record<string, string | string[] | undefined>;
type PageProps = { searchParams: Promise<SearchParams> };

function firstParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function allParams(value: string | string[] | undefined): string[] {
  return value === undefined ? [] : Array.isArray(value) ? value : [value];
}

function priceInput(paise: number | null): string {
  return paise === null ? "" : `${Math.floor(paise / 100)}.${String(paise % 100).padStart(2, "0")}`;
}

function hrefForPage(query: CatalogQuery, page: number): string {
  const params = new URLSearchParams();
  if (query.q) params.set("q", query.q);
  query.categories.forEach((category) => params.append("category", category));
  if (query.minPaise !== null) params.set("min", priceInput(query.minPaise));
  if (query.maxPaise !== null) params.set("max", priceInput(query.maxPaise));
  if (query.availability !== "all") params.set("availability", query.availability);
  if (query.sort !== "relevance") params.set("sort", query.sort);
  if (query.limit !== 12) params.set("limit", String(query.limit));
  if (page > 1) params.set("page", String(page));
  const search = params.toString();
  return search ? `/shop?${search}` : "/shop";
}

function categoryHref(slug: string, query: CatalogQuery | null): string {
  const params = new URLSearchParams();
  params.set("category", slug);
  if (query?.q) params.set("q", query.q);
  if (query?.minPaise !== null && query?.minPaise !== undefined) params.set("min", priceInput(query.minPaise));
  if (query?.maxPaise !== null && query?.maxPaise !== undefined) params.set("max", priceInput(query.maxPaise));
  if (query && query.availability !== "all") params.set("availability", query.availability);
  if (query && query.sort !== "relevance") params.set("sort", query.sort);
  if (query && query.limit !== 12) params.set("limit", String(query.limit));
  return `/shop?${params.toString()}`;
}

export default async function ShopPage({ searchParams }: PageProps) {
  const raw = await searchParams;
  const rawSearchKey = JSON.stringify(Object.keys(raw).sort().map((key) => [key, raw[key]]));
  const parsed = parseCatalogQuery(raw);
  const [categoryResult, products] = await Promise.all([
    listPublishedRecords("categories", { limit: 100, offset: 0 }),
    parsed.ok ? listCatalogProducts(parsed.value) : Promise.resolve({ items: [], total: 0 }),
  ]);
  const categories = [...categoryResult.items].sort((left, right) =>
    left.document.position - right.document.position || left.title.localeCompare(right.title) || left.id.localeCompare(right.id),
  );
  const query = parsed.ok ? parsed.value : null;
  const submittedCategories = new Set(allParams(raw.category));
  const selectedCategories = new Set(query?.categories ?? categories.flatMap((category) =>
    submittedCategories.has(category.slug) || submittedCategories.has(category.id) ? [category.slug, category.id] : [],
  ));
  const availabilityOptions = ["all", "available", "unavailable"] as const;
  const submittedAvailability = firstParam(raw.availability);
  const availability = query?.availability ?? (availabilityOptions.includes(submittedAvailability as typeof availabilityOptions[number])
    ? submittedAvailability as typeof availabilityOptions[number]
    : "all");
  const sortOptions = ["relevance", "newest", "price_asc", "price_desc", "title_asc"] as const;
  const submittedSort = firstParam(raw.sort);
  const sort = query?.sort ?? (sortOptions.includes(submittedSort as typeof sortOptions[number])
    ? submittedSort as typeof sortOptions[number]
    : "relevance");
  const totalPages = query ? Math.min(Math.ceil(products.total / query.limit), Math.floor(10_000 / query.limit) + 1) : 0;
  if (query && totalPages > 0 && query.page > totalPages) redirect(hrefForPage(query, totalPages));
  const rawMin = firstParam(raw.min);
  const rawMax = firstParam(raw.max);

  return <PublicPage eyebrow="Shop" title="Catalog" description="Browse published IoT and embedded products." wide>
    <div className={presentation.catalogPage}>
    {categories.length > 0 && <nav className={`${styles.categorySection} ${presentation.categorySection}`} aria-label="Browse product categories">
      <h2 className={styles.categoryHeading}>Browse categories</h2>
      <div className={`${styles.categoryCards} ${presentation.categoryCards}`}>
        {categories.map((category) => <Link className={styles.categoryCard} href={categoryHref(category.slug, query)} key={category.id}>
          {category.title}
        </Link>)}
      </div>
      {categoryResult.total > categories.length && <p className={styles.categoryLimit}>
        Showing the first {categories.length} published categories.
      </p>}
    </nav>}

    {!parsed.ok && <section className={styles.queryErrors} aria-labelledby="catalog-filter-error" role="alert">
      <h2 id="catalog-filter-error">Some catalog filters need attention</h2>
      <ul>{parsed.fields.map((field, index) => <li key={`${field.field}-${index}`}>{field.message}</li>)}</ul>
    </section>}

    <form id="catalog-form" action="/shop" method="get" className={`${styles.catalogControls} ${presentation.controls}`} />
      <div className={`${styles.searchForm} ${presentation.searchRow}`}>
        <div className={styles.searchField} key={rawSearchKey}>
          <label className={styles.fieldLabel} htmlFor="catalog-query">Search products</label>
          <input className={styles.input} id="catalog-query" form="catalog-form" name="q" type="search" maxLength={120} defaultValue={firstParam(raw.q)} placeholder="Search by product, SKU or model" />
        </div>
        <button className={styles.searchButton} form="catalog-form" type="submit" aria-label="Search catalog">
          <Search aria-hidden="true" />
          <span className={styles.srOnly}>Search</span>
        </button>
        <Link className={styles.clearLink} href="/shop">Reset all</Link>
      </div>

      <div className={`${styles.catalogLayout} ${presentation.layout}`}>
        <CatalogFilters key={rawSearchKey}>
          <fieldset className={styles.filterGroup}>
            <legend className={styles.filterHeading}>Category</legend>
            <div className={styles.checkList}>
              {categories.length ? categories.map((category) => <label className={styles.checkLabel} key={category.id}>
                <input className={styles.checkbox} form="catalog-form" type="checkbox" name="category" value={category.slug} defaultChecked={selectedCategories.has(category.slug) || selectedCategories.has(category.id)} />
                <span>{category.title}</span>
              </label>) : <p>No product categories have been published yet.</p>}
            </div>
          </fieldset>
          <fieldset className={styles.filterGroup}>
            <legend className={styles.filterHeading}>Price range (INR)</legend>
            <div className={styles.priceFields}>
              <label><span className={styles.priceLabel}>Minimum</span>
                <input className={styles.input} form="catalog-form" name="min" type="text" inputMode="decimal" defaultValue={query?.minPaise == null ? rawMin : priceInput(query.minPaise)} placeholder="Any" />
              </label>
              <label><span className={styles.priceLabel}>Maximum</span>
                <input className={styles.input} form="catalog-form" name="max" type="text" inputMode="decimal" defaultValue={query?.maxPaise == null ? rawMax : priceInput(query.maxPaise)} placeholder="Any" />
              </label>
            </div>
          </fieldset>
          <div className={styles.filterGroup}>
            <label className={styles.fieldLabel} htmlFor="availability">Availability</label>
            <select className={styles.select} id="availability" form="catalog-form" name="availability" defaultValue={availability}>
              <option value="all">All products</option>
              <option value="available">Available</option>
              <option value="unavailable">Unavailable</option>
            </select>
          </div>
          <div className={styles.filterGroup}>
            <label className={styles.fieldLabel} htmlFor="catalog-sort">Sort</label>
            <select className={styles.select} id="catalog-sort" form="catalog-form" name="sort" defaultValue={sort}>
              <option value="relevance">Relevance</option>
              <option value="newest">Newest</option>
              <option value="price_asc">Price: low to high</option>
              <option value="price_desc">Price: high to low</option>
              <option value="title_asc">Name: A to Z</option>
            </select>
          </div>
          <div className={styles.filterActions}>
            <button className={styles.filterButton} form="catalog-form" type="submit">Apply filters</button>
          </div>
        </CatalogFilters>

        {query ? <section aria-labelledby="catalog-results-heading">
          <div className={`${styles.resultsHeader} ${presentation.resultsHeader}`}>
            <h2 className={styles.resultsCount} id="catalog-results-heading" aria-live="polite">
              {products.total} {products.total === 1 ? "published product" : "published products"}
            </h2>
            <input type="hidden" form="catalog-form" name="limit" value={query.limit} />
            <input type="hidden" form="catalog-form" name="page" value="1" />
          </div>

          {products.items.length ? <div className={`${styles.productGrid} ${presentation.grid}`}>
            {products.items.map((product) => <ProductCard key={product.id} product={product} />)}
          </div> : <EmptyState
            title={query.q || query.categories.length || query.minPaise !== null || query.maxPaise !== null || query.availability !== "all" ? "No products match these filters" : "No products are published yet"}
            href="/shop"
            label="Clear filters"
          >
            <p>{query.q || query.categories.length || query.minPaise !== null || query.maxPaise !== null || query.availability !== "all"
              ? "Try a different search or remove one or more filters."
              : "Published products will appear here when they are ready to browse."}</p>
          </EmptyState>}

          {totalPages > 1 && <nav className={styles.pagination} aria-label="Catalog pages">
            {query.page > 1 ? <Link className={styles.paginationLink} href={hrefForPage(query, query.page - 1)}>Previous</Link> : <span className={styles.paginationLink} aria-disabled="true">Previous</span>}
            <span className={styles.paginationStatus}>Page {query.page} of {totalPages}</span>
            {query.page < totalPages ? <Link className={styles.paginationLink} href={hrefForPage(query, query.page + 1)}>Next</Link> : <span className={styles.paginationLink} aria-disabled="true">Next</span>}
          </nav>}
          {products.total > (Math.floor(10_000 / query.limit) + 1) * query.limit && <p className={styles.categoryLimit}>Further results are outside the supported catalog page range.</p>}
        </section> : <section className={styles.resultsUnavailable} aria-labelledby="catalog-results-heading">
          <h2 id="catalog-results-heading">Results are waiting for valid filters</h2>
          <p>Correct the values above and apply filters to load matching products.</p>
        </section>}
      </div>
    </div>
  </PublicPage>;
}
