import Link from "next/link";
import styles from "./editorial.module.css";

export function EditorialPagination({
  ariaLabel,
  page,
  pageCount,
  total,
  resultCap,
  itemLabel,
  hrefForPage,
}: {
  ariaLabel: string;
  page: number;
  pageCount: number;
  total: number;
  resultCap: number;
  itemLabel: string;
  hrefForPage: (page: number) => string;
}) {
  if (total <= 0 || pageCount <= 1) return null;

  const totalLabel = total > resultCap
    ? `showing the first ${resultCap.toLocaleString("en-IN")} of ${total.toLocaleString("en-IN")} ${itemLabel}`
    : `${total.toLocaleString("en-IN")} ${itemLabel}`;

  return <nav className={styles.pagination} aria-label={ariaLabel}>
    {page > 1 ? <Link href={hrefForPage(page - 1)} rel="prev">Previous page</Link> : <span aria-disabled="true">Previous page</span>}
    <span aria-current="page">Page {page} of {pageCount} · {totalLabel}</span>
    {page < pageCount ? <Link href={hrefForPage(page + 1)} rel="next">Next page</Link> : <span aria-disabled="true">Next page</span>}
  </nav>;
}
