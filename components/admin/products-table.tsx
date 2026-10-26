"use client";

import { IconArrowLeft, IconArrowRight, IconEye, IconPencil, IconRefresh, IconSearch, IconTrash, IconX } from "@tabler/icons-react";
import Image from "next/image";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { useAdminCapabilities } from "@/components/admin/admin-shell";
import { ADMIN_MODULES } from "@/lib/admin/validation";
import {
  PRODUCT_TABLE_PAGE_SIZES,
  parseProductTableQuery,
  presentProductPrice,
  serializeProductTableQuery,
  type ProductTablePrice,
  type ProductTableQuery,
  type ProductTableStatus,
  type ProductTableSort,
} from "./products-table-query";
import styles from "./products-table.module.css";

type ProductCategory = { id: string; title: string };
type ProductTableRow = {
  id: string;
  title: string;
  version: number;
  status: Exclude<ProductTableStatus, "all">;
  updatedAt: string;
  image: { mediaId: string; alt: string } | null;
  categories: ProductCategory[];
  price: ProductTablePrice;
  sourceObservation: boolean;
};
type ProductTableResponse = { items: ProductTableRow[]; total: number; categoryOptions: ProductCategory[] };
type ApiError = { error?: { message?: string } };
const EMPTY_CATEGORY_OPTIONS: ProductCategory[] = [];

const conciseDate = new Intl.DateTimeFormat(undefined, { dateStyle: "medium" });
const fullDate = new Intl.DateTimeFormat(undefined, { dateStyle: "full", timeStyle: "long" });

function formatUpdated(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return { visible: value, title: value };
  return { visible: conciseDate.format(date), title: fullDate.format(date), dateTime: date.toISOString() };
}

async function readError(response: Response) {
  const body = await response.json().catch(() => null) as ApiError | null;
  return body && typeof body === "object" && typeof body.error?.message === "string"
    ? body.error.message
    : response.status === 409
      ? "This product changed. Reload it before trying again."
      : "The request could not be completed. Try again.";
}

function replaceTableQuery(query: ProductTableQuery) {
  const url = new URL(window.location.href);
  url.search = serializeProductTableQuery(query);
  window.history.replaceState(null, "", url);
}

export function ProductsTable() {
  const capabilities = useAdminCapabilities();
  const canEdit = capabilities.includes(ADMIN_MODULES.products.editCapability);
  const canArchive = canEdit && capabilities.includes("content.publish");
  const searchParams = useSearchParams();
  const searchString = searchParams?.toString() ?? "";
  const queryString = useMemo(() => serializeProductTableQuery(parseProductTableQuery(searchString)), [searchString]);
  const query = useMemo(() => parseProductTableQuery(queryString), [queryString]);
  const [searchDraft, setSearchDraft] = useState<{ base: string; value: string } | null>(null);
  const searchText = searchDraft?.base === query.q ? searchDraft.value : query.q;
  const [responseState, setResponseState] = useState<{ key: string; value: ProductTableResponse } | null>(null);
  const [errorState, setErrorState] = useState<{ key: string; message: string } | null>(null);
  const [reload, setReload] = useState(0);
  const [preview, setPreview] = useState<{ title: string; mediaId: string; alt: string; requestId: number } | null>(null);
  const [previewLoadState, setPreviewLoadState] = useState<{ key: string; status: "loaded" | "error" } | null>(null);
  const [previewAttempt, setPreviewAttempt] = useState(0);
  const [archiveTarget, setArchiveTarget] = useState<ProductTableRow | null>(null);
  const [archiveError, setArchiveError] = useState("");
  const [archiving, setArchiving] = useState(false);
  const imageDialog = useRef<HTMLDialogElement>(null);
  const archiveDialog = useRef<HTMLDialogElement>(null);
  const previewSequence = useRef(0);
  const requestKey = `${queryString}#${reload}`;
  const response = responseState?.key === requestKey ? responseState.value : null;
  const rows = response?.items ?? [];
  const categoryOptions = response?.categoryOptions ?? EMPTY_CATEGORY_OPTIONS;
  const total = response?.total ?? null;
  const error = errorState?.key === requestKey ? errorState.message : "";
  const loading = canEdit && responseState?.key !== requestKey && errorState?.key !== requestKey;
  const previewLoadKey = preview ? `${preview.requestId}:${previewAttempt}` : "";
  const previewLoading = Boolean(preview && previewLoadState?.key !== previewLoadKey);
  const previewError = previewLoadState?.key === previewLoadKey && previewLoadState.status === "error";

  useEffect(() => {
    if (searchText.trim() === query.q) return;
    const timer = window.setTimeout(() => {
      const q = searchText.trim();
      replaceTableQuery({ ...query, q, offset: 0 });
    }, 300);
    return () => window.clearTimeout(timer);
  }, [query, searchText]);

  useEffect(() => {
    const dialog = imageDialog.current;
    if (!dialog) return;
    if (preview && !dialog.open) dialog.showModal();
    if (!preview && dialog.open) dialog.close();
  }, [preview]);

  useEffect(() => {
    const dialog = archiveDialog.current;
    if (!dialog) return;
    if (archiveTarget && !dialog.open) dialog.showModal();
    if (!archiveTarget && dialog.open) dialog.close();
  }, [archiveTarget]);

  useEffect(() => {
    if (!canEdit) return;
    const url = new URL(window.location.href);
    if (url.search.slice(1) !== queryString) replaceTableQuery(query);

    const controller = new AbortController();
    void fetch(`/api/admin/products/table?${queryString}`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(await readError(response));
        return response.json() as Promise<ProductTableResponse>;
      })
      .then((result) => {
        if (!Array.isArray(result.items) || !Number.isSafeInteger(result.total) || result.total < 0 || !Array.isArray(result.categoryOptions)) {
          throw new Error("Products could not be loaded. Try again.");
        }
        setResponseState({ key: requestKey, value: result });
        const lastPageOffset = result.total === 0 ? 0 : Math.floor((result.total - 1) / query.limit) * query.limit;
        if (query.offset > lastPageOffset) replaceTableQuery({ ...query, offset: lastPageOffset });
      })
      .catch((reason: unknown) => {
        if (controller.signal.aborted) return;
        setErrorState({ key: requestKey, message: reason instanceof Error ? reason.message : "Products could not be loaded. Try again." });
      });
    return () => controller.abort();
  }, [canEdit, query, queryString, reload, requestKey]);

  const categoryTitles = useMemo(() => new Map(categoryOptions.map((category) => [category.id, category.title])), [categoryOptions]);
  const pageRange = useMemo(() => {
    if (total === null || total === 0) return "";
    return `${query.offset + 1}–${Math.min(query.offset + rows.length, total)} of ${total}`;
  }, [query.offset, rows.length, total]);

  const retry = useCallback(() => setReload((value) => value + 1), []);

  function updateQuery(patch: Partial<ProductTableQuery>) {
    replaceTableQuery({ ...query, ...patch });
  }

  async function archiveProduct() {
    if (!archiveTarget || !canArchive || archiving) return;
    setArchiving(true);
    setArchiveError("");
    try {
      const response = await fetch(`/api/admin/products/${encodeURIComponent(archiveTarget.id)}/archive`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expectedVersion: archiveTarget.version }),
      });
      if (!response.ok) throw new Error(await readError(response));
      setArchiveTarget(null);
      toast.success("Product archived. Its revisions and history were preserved.");
      retry();
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : "Product could not be archived. Try again.";
      setArchiveError(message);
      toast.error(message);
    } finally {
      setArchiving(false);
    }
  }

  if (!canEdit) return <div className={styles.screen}><h1>Products</h1><p className={styles.accessMessage} role="alert">You do not have permission to manage products.</p></div>;

  return <div className={styles.screen}>
    <header className={styles.heading}>
      <div><h1>Products</h1><p>Manage product descriptions, categories, and specifications.</p></div>
      <Link className={styles.newButton} href="/admin/products/new">New product</Link>
    </header>

    <section className={styles.controls} aria-label="Product table filters">
      <label className={styles.search} htmlFor="products-search">
        <IconSearch aria-hidden="true" size={16} />
        <span className={styles.visuallyHidden}>Search products</span>
        <input id="products-search" type="search" value={searchText} onChange={(event) => setSearchDraft({ base: query.q, value: event.target.value })} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); updateQuery({ q: searchText.trim(), offset: 0 }); } }} placeholder="Search title, model, or SKU" />
      </label>
      <label className={styles.filter}>
        <span>Status</span>
        <select value={query.status} onChange={(event) => updateQuery({ status: event.target.value as ProductTableStatus, offset: 0 })}>
          <option value="all">All statuses</option><option value="draft">Draft</option><option value="published">Published</option><option value="archived">Archived</option>
        </select>
      </label>
      <label className={styles.filter}>
        <span>Category</span>
        <select value={query.categoryId} onChange={(event) => updateQuery({ categoryId: event.target.value, offset: 0 })}>
          <option value="">All categories</option>
          {query.categoryId && !categoryTitles.has(query.categoryId) && <option value={query.categoryId}>Selected category</option>}
          {categoryOptions.map((category) => <option key={category.id} value={category.id}>{category.title}</option>)}
        </select>
      </label>
      <label className={styles.filter}>
        <span>Sort</span>
        <select value={query.sort} onChange={(event) => updateQuery({ sort: event.target.value as ProductTableSort, offset: 0 })}>
          <option value="updated_desc">Recently updated</option><option value="updated_asc">Least recently updated</option>
          <option value="title_asc">Title A–Z</option><option value="title_desc">Title Z–A</option>
          <option value="price_asc">Price low to high</option><option value="price_desc">Price high to low</option>
        </select>
      </label>
      <span className={styles.count} aria-live="polite">{loading ? "Loading products…" : total === null ? "" : `${total} ${total === 1 ? "product" : "products"}`}</span>
    </section>

    {error && <div className={styles.errorBanner} role="alert"><p>{error}</p><button type="button" className={styles.controlButton} onClick={retry}><IconRefresh aria-hidden="true" size={15} /> Try again</button></div>}

    <div className={styles.tableScroller} role="region" aria-label="Products" tabIndex={0} aria-busy={loading}>
      <table className={styles.table}>
        <thead><tr>
          <th scope="col" className={styles.numberHeading}>No.</th><th scope="col">Image</th><th scope="col">Title</th><th scope="col">Category</th>
          <th scope="col">Status</th><th scope="col">Price</th><th scope="col">Updated</th><th scope="col"><span className={styles.visuallyHidden}>Actions</span></th>
        </tr></thead>
        <tbody>
          {loading && <tr><td className={styles.tableMessage} colSpan={8}>Loading products…</td></tr>}
          {!loading && !error && rows.length === 0 && <tr><td className={styles.tableMessage} colSpan={8}>{query.q || query.categoryId || query.status !== "all" ? "No products match these filters." : "No products yet. Create the first record when approved content is ready."}</td></tr>}
          {!loading && rows.map((row, index) => {
            const price = presentProductPrice(row.price, row.sourceObservation);
            const updated = formatUpdated(row.updatedAt);
            const title = row.title || "Untitled product";
            return <tr key={row.id}>
              <td className={styles.rowNumber}>{query.offset + index + 1}</td>
              <td>
                {row.image ? <div className={styles.thumbnail}>
                  <Image unoptimized src={`/api/media/${encodeURIComponent(row.image.mediaId)}?w=96`} alt="" width={48} height={48} loading="lazy" />
                  <button type="button" className={styles.previewButton} aria-label={`Preview image for ${title}`} onClick={() => { setPreview({ title, mediaId: row.image!.mediaId, alt: row.image!.alt || title, requestId: ++previewSequence.current }); setPreviewAttempt(0); }}>
                    <IconEye aria-hidden="true" size={16} />
                  </button>
                </div> : <span className={styles.noImage}>No image</span>}
              </td>
              <td><Link className={styles.titleLink} href={`/admin/products/${encodeURIComponent(row.id)}`} title={title}>{title}</Link></td>
              <td><div className={styles.categoryList}>
                {row.categories.length ? row.categories.map((category) => <span key={category.id} className={styles.categoryBadge}>{category.title}</span>) : <span className={styles.muted}>Uncategorized</span>}
              </div></td>
              <td><span className={`${styles.statusBadge} ${styles[`status${row.status[0].toUpperCase()}${row.status.slice(1)}`]}`}>{row.status}</span></td>
              <td className={styles.priceCell}>
                {price.regular && <del className={styles.regularPrice}>{price.regular}</del>}
                <span className={styles.currentPrice}>{price.current}</span>
                {price.discount && <span className={styles.discountBadge}>{price.discount}</span>}
                {price.sourceObservation && <span className={styles.sourceLabel}>Source observation</span>}
              </td>
              <td className={styles.updatedCell}><time dateTime={updated.dateTime} title={updated.title}>{updated.visible}</time></td>
              <td><div className={styles.actions}>
                <Link className={styles.iconButton} href={`/admin/products/${encodeURIComponent(row.id)}`} aria-label={`Edit ${title}`} title="Edit"><IconPencil aria-hidden="true" size={16} /></Link>
                {canArchive && <button type="button" className={`${styles.iconButton} ${styles.deleteButton}`} aria-label={`Archive ${title}`} title="Archive" disabled={row.status === "archived"} onClick={() => { setArchiveError(""); setArchiveTarget(row); }}><IconTrash aria-hidden="true" size={16} /></button>}
              </div></td>
            </tr>;
          })}
        </tbody>
      </table>
    </div>

    <nav className={styles.pagination} aria-label="Product pages">
      <span>{pageRange}</span>
      <div className={styles.pageControls}>
        <label className={styles.pageSize}><span>Rows</span><select aria-label="Rows per page" value={query.limit} onChange={(event) => updateQuery({ limit: Number(event.target.value) as ProductTableQuery["limit"], offset: 0 })}>{PRODUCT_TABLE_PAGE_SIZES.map((size) => <option key={size} value={size}>{size}</option>)}</select></label>
        <button className={styles.controlButton} type="button" onClick={() => updateQuery({ offset: Math.max(0, query.offset - query.limit) })} disabled={loading || query.offset === 0}><IconArrowLeft aria-hidden="true" size={16} /> Previous</button>
        <button className={styles.controlButton} type="button" onClick={() => updateQuery({ offset: query.offset + query.limit })} disabled={loading || total === null || query.offset + query.limit >= total || query.offset + query.limit > 10000}>Next <IconArrowRight aria-hidden="true" size={16} /></button>
      </div>
    </nav>

    <dialog ref={imageDialog} className={styles.dialog} aria-labelledby="product-image-title" onClose={() => setPreview(null)}>
      {preview && <>
        <header className={styles.dialogHeader}><h2 id="product-image-title">{preview.title}</h2><button type="button" className={styles.iconButton} aria-label="Close image preview" onClick={() => imageDialog.current?.close()}><IconX aria-hidden="true" size={18} /></button></header>
        <div className={styles.imagePreview}>
          {previewLoading && <p role="status">Loading image…</p>}
          {previewError ? <div className={styles.previewMessage} role="alert"><p>The image could not be loaded.</p><button type="button" className={styles.controlButton} onClick={() => setPreviewAttempt((value) => value + 1)}>Try again</button></div>
            : <Image unoptimized key={previewLoadKey} src={`/api/media/${encodeURIComponent(preview.mediaId)}?w=960`} alt={preview.alt} width={1200} height={900} sizes="(max-width: 760px) calc(100vw - 56px), 720px" onLoad={() => setPreviewLoadState({ key: previewLoadKey, status: "loaded" })} onError={() => setPreviewLoadState({ key: previewLoadKey, status: "error" })} />}
        </div>
      </>}
    </dialog>

    <dialog ref={archiveDialog} className={`${styles.dialog} ${styles.confirmDialog}`} aria-labelledby="archive-product-title" aria-describedby="archive-product-warning" onClose={() => { if (!archiving) setArchiveTarget(null); }} onCancel={(event) => { if (archiving) event.preventDefault(); }}>
      {archiveTarget && <>
        <header className={styles.dialogHeader}><h2 id="archive-product-title">Archive product?</h2><button type="button" className={styles.iconButton} aria-label="Close archive confirmation" disabled={archiving} onClick={() => archiveDialog.current?.close()}><IconX aria-hidden="true" size={18} /></button></header>
        <p id="archive-product-warning" className={styles.confirmCopy}><strong>{archiveTarget.title || "Untitled product"}</strong> will be removed from the active catalog. Published revisions and its history will be preserved.</p>
        {archiveError && <p role="alert" className={styles.confirmCopy}>{archiveError}</p>}
        <div className={styles.confirmActions}><button type="button" className={styles.controlButton} disabled={archiving} onClick={() => archiveDialog.current?.close()}>Cancel</button><button type="button" className={styles.archiveConfirm} disabled={archiving} onClick={() => void archiveProduct()}>{archiving ? "Archiving…" : "Archive product"}</button></div>
      </>}
    </dialog>
  </div>;
}
