import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { EditorialCard } from "@/components/editorial/editorial-card";
import { EditorialPagination } from "@/components/editorial/editorial-pagination";
import { editorialPageNumber } from "@/components/editorial/public-utils";
import styles from "@/components/editorial/editorial.module.css";
import { EmptyState, PublicPage } from "@/components/storefront/page-frame";
import { listPublishedRecords } from "@/lib/editorial/published";
import { publicMetadata } from "@/lib/editorial/seo";
import { LearningNavigation } from "../learning-navigation";
import { ProductSpecsPage } from "@/components/catalog/product-specs-page";

export const dynamic = "force-dynamic";

const collections = {
  "product-specs": "Product specifications",
  "embedded-systems": "Embedded systems",
  "kit-guides": "Kit guides",
} as const;

type Collection = keyof typeof collections;
type Props = {
  params: Promise<{ collection: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};
const PAGE_SIZE = 24;
const MAX_PAGE = Math.floor(10_000 / PAGE_SIZE) + 1;

function pageHref(collection: Collection, page: number): string {
  return page > 1 ? `/learn/${collection}?page=${page}` : `/learn/${collection}`;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { collection } = await params;
  if (!Object.hasOwn(collections, collection)) return { title: "Page not found | PandaByte.in", robots: { index: false, follow: false } };
  const title = collections[collection as Collection];
  return { ...publicMetadata(null, `/learn/${collection}`), title: `${title} | PandaByte.in` };
}

export default async function LearnCollection({ params, searchParams }: Props) {
  const [{ collection }, search] = await Promise.all([params, searchParams]);
  if (!Object.hasOwn(collections, collection)) notFound();
  const selected = collection as Collection;
  if (selected === "product-specs") return <ProductSpecsPage searchParams={Promise.resolve(search)} />;
  const requestedPage = editorialPageNumber(Array.isArray(search.page) ? "" : search.page, PAGE_SIZE);
  const firstResult = await listPublishedRecords("learn", { collection: selected, limit: PAGE_SIZE, offset: (requestedPage - 1) * PAGE_SIZE });
  const pageCount = Math.min(MAX_PAGE, Math.max(1, Math.ceil(firstResult.total / PAGE_SIZE)));
  const page = Math.min(requestedPage, pageCount);
  const result = page === requestedPage ? firstResult
    : await listPublishedRecords("learn", { collection: selected, limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE });
  const resultCap = MAX_PAGE * PAGE_SIZE;
  return <PublicPage eyebrow="Learn" title={collections[selected]} description="Resources published by PandaByte." wide>
    <div className={styles.stack}>
      <LearningNavigation current={selected} />
      {result.items.length
        ? <div className={styles.grid}>{result.items.map((record) => <EditorialCard key={record.id} record={record} href={`/learn/resources/${record.slug}`} />)}</div>
        : <EmptyState title="No resources have been published in this collection yet." />}
      <EditorialPagination
        ariaLabel="Learning resource pages"
        page={page}
        pageCount={pageCount}
        total={result.total}
        resultCap={resultCap}
        itemLabel="resources"
        hrefForPage={(nextPage) => pageHref(selected, nextPage)}
      />
    </div>
  </PublicPage>;
}
