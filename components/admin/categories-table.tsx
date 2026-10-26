"use client";

import { IconArrowLeft, IconArrowRight, IconEye, IconPencil, IconRefresh, IconSearch, IconTrash, IconX } from "@tabler/icons-react";
import Image from "next/image";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { useAdminCapabilities } from "@/components/admin/admin-shell";
import { ADMIN_MODULES } from "@/lib/admin/validation";
import { isCategoryTableResult, type CategoryTableItem, type CategoryTableResult } from "@/lib/admin/category-contract";
import {
  CATEGORY_TABLE_PAGE_SIZES,
  parseCategoryTableQuery,
  serializeCategoryTableQuery,
  type CategoryTablePageSize,
  type CategoryTableQuery,
  type CategoryTableSort,
  type CategoryTableStatus,
} from "./categories-table-query";
import tableStyles from "./products-table.module.css";
import styles from "./categories-table.module.css";

type CategoryTableRow = CategoryTableItem;
type CategoryTableResponse = CategoryTableResult;
type ApiError = { error?: { message?: string } };

const conciseDate = new Intl.DateTimeFormat(undefined, { dateStyle: "medium" });
const fullDate = new Intl.DateTimeFormat(undefined, { dateStyle: "full", timeStyle: "long" });

function formatUpdated(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return { visible: value, title: value, dateTime: undefined };
  return { visible: conciseDate.format(date), title: fullDate.format(date), dateTime: date.toISOString() };
}

async function readError(response: Response) {
  if (response.status === 409) return "This category changed or is linked to products or child categories. Reload it and review those links before archiving. No links were removed.";
  const body = await response.json().catch(() => null) as ApiError | null;
  return body && typeof body === "object" && typeof body.error?.message === "string"
    ? body.error.message
    : "The request could not be completed. Try again.";
}

function replaceTableQuery(query: CategoryTableQuery) {
  const url = new URL(window.location.href);
  url.search = serializeCategoryTableQuery(query);
  window.history.replaceState(null, "", url);
}

export function CategoriesTable() {
  const capabilities = useAdminCapabilities();
  const canEdit = capabilities.includes(ADMIN_MODULES.categories.editCapability);
  const canArchive = canEdit && capabilities.includes("content.publish");
  const searchParams = useSearchParams();
  const searchString = searchParams?.toString() ?? "";
  const queryString = useMemo(() => serializeCategoryTableQuery(parseCategoryTableQuery(searchString)), [searchString]);
  const query = useMemo(() => parseCategoryTableQuery(queryString), [queryString]);
  const [searchDraft, setSearchDraft] = useState<{ base: string; value: string } | null>(null);
  const searchText = searchDraft?.base === query.q ? searchDraft.value : query.q;
  const [responseState, setResponseState] = useState<{ key: string; value: CategoryTableResponse } | null>(null);
  const [errorState, setErrorState] = useState<{ key: string; message: string } | null>(null);
  const [reload, setReload] = useState(0);
  const [archiveTarget, setArchiveTarget] = useState<CategoryTableRow | null>(null);
  const [preview, setPreview] = useState<{ title: string; mediaId: string; alt: string } | null>(null);
  const [previewError, setPreviewError] = useState(false);
  const imageDialog = useRef<HTMLDialogElement>(null);
  const [archiveError, setArchiveError] = useState("");
  const [archiving, setArchiving] = useState(false);
  const archiveDialog = useRef<HTMLDialogElement>(null);
  const archiveInvoker = useRef<HTMLButtonElement | null>(null);
  const restoreToTable = useRef(false);
  const tableScroller = useRef<HTMLDivElement>(null);
  const requestKey = `${queryString}#${reload}`;
  const response = responseState?.key === requestKey ? responseState.value : null;
  const rows = response?.items ?? [];
  const total = response?.total ?? null;
  const error = errorState?.key === requestKey ? errorState.message : "";
  const loading = canEdit && responseState?.key !== requestKey && errorState?.key !== requestKey;

  useEffect(() => {
    if (searchText.trim() === query.q) return;
    const timer = window.setTimeout(() => replaceTableQuery({ ...query, q: searchText.trim(), offset: 0 }), 300);
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
    void fetch(`/api/admin/categories/table?${queryString}`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(await readError(response));
        return response.json() as Promise<unknown>;
      })
      .then((result) => {
        if (!isCategoryTableResult(result, query.limit)) throw new Error("Categories could not be loaded. Try again.");
        setResponseState({ key: requestKey, value: result });
        const lastPageOffset = result.total === 0 ? 0 : Math.min(Math.floor((result.total - 1) / query.limit) * query.limit, 10_000);
        if (query.offset > lastPageOffset) replaceTableQuery({ ...query, offset: lastPageOffset });
      })
      .catch((reason: unknown) => {
        if (controller.signal.aborted) return;
        setErrorState({ key: requestKey, message: reason instanceof Error ? reason.message : "Categories could not be loaded. Try again." });
      });
    return () => controller.abort();
  }, [canEdit, query, queryString, reload, requestKey]);

  const pageRange = useMemo(() => {
    if (total === null || total === 0) return "";
    return `${query.offset + 1}–${Math.min(query.offset + rows.length, total)} of ${total}`;
  }, [query.offset, rows.length, total]);

  const retry = useCallback(() => setReload((value) => value + 1), []);

  function updateQuery(patch: Partial<CategoryTableQuery>) {
    replaceTableQuery({ ...query, ...patch });
  }

  async function archiveCategory() {
    if (!archiveTarget || !canArchive || archiving || archiveTarget.status === "archived") return;
    setArchiving(true);
    setArchiveError("");
    try {
      const response = await fetch(`/api/admin/categories/${encodeURIComponent(archiveTarget.id)}/archive`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expectedVersion: archiveTarget.version }),
      });
      if (!response.ok) throw new Error(await readError(response));
      restoreToTable.current = true;
      setArchiveTarget(null);
      toast.success("Category archived.");
      retry();
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : "Category could not be archived. Try again.";
      setArchiveError(message);
      toast.error(message);
    } finally {
      setArchiving(false);
    }
  }

  if (!canEdit) return <div className={tableStyles.screen}><h1>Categories</h1><p className={tableStyles.accessMessage} role="alert">You do not have permission to manage categories.</p></div>;

  return <div className={tableStyles.screen}>
    <header className={tableStyles.heading}>
      <div><h1>Categories</h1><p>Manage catalog categories and their parent relationships.</p></div>
      <Link className={tableStyles.newButton} href="/admin/categories/new">New category</Link>
    </header>

    <section className={tableStyles.controls} aria-label="Category table filters">
      <label className={tableStyles.search} htmlFor="categories-search">
        <IconSearch aria-hidden="true" size={16} />
        <span className={tableStyles.visuallyHidden}>Search categories</span>
        <input id="categories-search" type="search" maxLength={120} value={searchText} onChange={(event) => setSearchDraft({ base: query.q, value: event.target.value })} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); updateQuery({ q: searchText.trim(), offset: 0 }); } }} placeholder="Search title or slug" />
      </label>
      <label className={tableStyles.filter}>
        <span>Status</span>
        <select value={query.status} onChange={(event) => updateQuery({ status: event.target.value as CategoryTableStatus, offset: 0 })}>
          <option value="all">All statuses</option><option value="draft">Draft</option><option value="published">Published</option><option value="archived">Archived</option>
        </select>
      </label>
      <label className={tableStyles.filter}>
        <span>Sort</span>
        <select value={query.sort} onChange={(event) => updateQuery({ sort: event.target.value as CategoryTableSort, offset: 0 })}>
          <option value="updated_desc">Recently updated</option><option value="updated_asc">Least recently updated</option>
          <option value="title_asc">Title A–Z</option><option value="title_desc">Title Z–A</option>
          <option value="position_asc">Position low to high</option><option value="position_desc">Position high to low</option>
          <option value="products_desc">Most products</option>
        </select>
      </label>
      <span className={tableStyles.count} aria-live="polite">{loading ? "Loading categories…" : total === null ? "" : `${total} ${total === 1 ? "category" : "categories"}`}</span>
    </section>

    {error && <div className={tableStyles.errorBanner} role="alert"><p>{error}</p><button type="button" className={tableStyles.controlButton} onClick={retry}><IconRefresh aria-hidden="true" size={15} /> Try again</button></div>}

    <div ref={tableScroller} className={tableStyles.tableScroller} role="region" aria-label="Categories" tabIndex={0} aria-busy={loading}>
      <table className={tableStyles.table}>
        <thead><tr>
          <th scope="col" className={tableStyles.numberHeading}>No.</th><th scope="col">Image</th><th scope="col">Category</th><th scope="col">Parent</th>
          <th scope="col">Products</th><th scope="col">Status</th><th scope="col">Updated</th><th scope="col"><span className={tableStyles.visuallyHidden}>Actions</span></th>
        </tr></thead>
        <tbody>
          {loading && <tr><td className={tableStyles.tableMessage} colSpan={8}>Loading categories…</td></tr>}
          {!loading && !error && rows.length === 0 && <tr><td className={tableStyles.tableMessage} colSpan={8}>{query.q || query.status !== "all" ? "No categories match these filters." : "No categories yet. Create the first category."}</td></tr>}
          {!loading && rows.map((row, index) => {
            const title = row.title || "Untitled category";
            const updated = formatUpdated(row.updatedAt);
            const editHref = `/admin/categories/${encodeURIComponent(row.id)}`;
            return <tr key={row.id}>
              <td className={tableStyles.rowNumber}>{query.offset + index + 1}</td>
              <td>{row.image ? <div className={tableStyles.thumbnail}>
                <Image unoptimized src={`/api/media/${encodeURIComponent(row.image.mediaId)}?w=96`} alt="" width={48} height={48} loading="lazy" />
                <button type="button" className={tableStyles.previewButton} aria-label={`Preview image for ${title}`} onClick={() => { setPreviewError(false); setPreview({ title, mediaId: row.image!.mediaId, alt: row.image!.alt || title }); }}><IconEye aria-hidden="true" size={16} /></button>
              </div> : <span className={tableStyles.noImage}>No image</span>}</td>
              <td className={styles.categoryCell}>
                <Link className={styles.categoryTitle} href={editHref} title={title}>{title}</Link>
                <span className={styles.categorySlug} title={row.slug}>{row.slug}</span>
              </td>
              <td className={styles.parentCell} title={row.parent?.title ?? "No parent"}>{row.parent?.title ?? <span className={tableStyles.muted}>No parent</span>}</td>
              <td className={styles.productCount}>{row.productCount.toLocaleString()}</td>
              <td><span className={`${tableStyles.statusBadge} ${tableStyles[`status${row.status[0].toUpperCase()}${row.status.slice(1)}`]}`}>{row.status}</span></td>
              <td className={tableStyles.updatedCell}><time dateTime={updated.dateTime} title={updated.title}>{updated.visible}</time></td>
              <td><div className={tableStyles.actions}>
                <Link className={tableStyles.iconButton} href={editHref} aria-label={`Edit ${title}`} title="Edit"><IconPencil aria-hidden="true" size={16} /></Link>
                {canArchive && <button type="button" className={`${tableStyles.iconButton} ${tableStyles.deleteButton}`} aria-label={`Archive ${title}`} title="Archive" disabled={row.status === "archived"} onClick={(event) => { archiveInvoker.current = event.currentTarget; restoreToTable.current = false; setArchiveError(""); setArchiveTarget(row); }}><IconTrash aria-hidden="true" size={16} /></button>}
              </div></td>
            </tr>;
          })}
        </tbody>
      </table>
    </div>

    <nav className={tableStyles.pagination} aria-label="Category pages">
      <span>{pageRange}</span>
      <div className={tableStyles.pageControls}>
        <label className={tableStyles.pageSize}><span>Rows</span><select aria-label="Rows per page" value={query.limit} onChange={(event) => updateQuery({ limit: Number(event.target.value) as CategoryTablePageSize, offset: 0 })}>{CATEGORY_TABLE_PAGE_SIZES.map((size) => <option key={size} value={size}>{size}</option>)}</select></label>
        <button className={tableStyles.controlButton} type="button" onClick={() => updateQuery({ offset: Math.max(0, query.offset - query.limit) })} disabled={loading || query.offset === 0}><IconArrowLeft aria-hidden="true" size={16} /> Previous</button>
        <button className={tableStyles.controlButton} type="button" onClick={() => updateQuery({ offset: query.offset + query.limit })} disabled={loading || total === null || query.offset + query.limit >= total || query.offset + query.limit > 10_000}>Next <IconArrowRight aria-hidden="true" size={16} /></button>
      </div>
    </nav>

    <dialog ref={imageDialog} className={tableStyles.dialog} aria-labelledby="category-image-title" onClose={() => setPreview(null)}>
      {preview && <><header className={tableStyles.dialogHeader}><h2 id="category-image-title">{preview.title}</h2><button type="button" className={tableStyles.iconButton} aria-label="Close image preview" onClick={() => imageDialog.current?.close()}><IconX aria-hidden="true" size={18} /></button></header>
        <div className={tableStyles.imagePreview}>{previewError ? <p role="alert">The image could not be loaded.</p> : <Image unoptimized src={`/api/media/${encodeURIComponent(preview.mediaId)}?w=960`} alt={preview.alt} width={1200} height={900} sizes="(max-width: 760px) calc(100vw - 56px), 720px" onError={() => setPreviewError(true)} />}</div>
      </>}
    </dialog>

    <dialog ref={archiveDialog} className={`${tableStyles.dialog} ${tableStyles.confirmDialog}`} aria-labelledby="archive-category-title" aria-describedby="archive-category-warning" onClose={() => {
      const invoker = archiveInvoker.current;
      if (restoreToTable.current || !invoker?.isConnected || invoker.disabled) tableScroller.current?.focus();
      else invoker.focus();
      archiveInvoker.current = null;
      restoreToTable.current = false;
      if (!archiving) setArchiveTarget(null);
    }} onCancel={(event) => { if (archiving) event.preventDefault(); }}>
      {archiveTarget && <>
        <header className={tableStyles.dialogHeader}><h2 id="archive-category-title">Archive category?</h2><button type="button" className={tableStyles.iconButton} aria-label="Close archive confirmation" disabled={archiving} onClick={() => archiveDialog.current?.close()}><IconX aria-hidden="true" size={18} /></button></header>
        <p id="archive-category-warning" className={tableStyles.confirmCopy}><strong>{archiveTarget.title || "Untitled category"}</strong> will be archived. Public references, child categories, or linked products can block this action. No links will be removed.</p>
        {archiveError && <p role="alert" className={`${tableStyles.confirmCopy} ${styles.archiveError}`}>{archiveError}</p>}
        <p className={`${tableStyles.confirmCopy} ${styles.dependencyNote}`}>Resolve dependencies through the existing category and product editors, then review the category again before archiving.</p>
        <div className={tableStyles.confirmActions}><button type="button" className={tableStyles.controlButton} autoFocus disabled={archiving} onClick={() => archiveDialog.current?.close()}>Cancel</button><button type="button" className={tableStyles.archiveConfirm} disabled={archiving || archiveTarget.status === "archived"} onClick={() => void archiveCategory()}>{archiving ? "Archiving…" : "Archive category"}</button></div>
      </>}
    </dialog>
  </div>;
}
