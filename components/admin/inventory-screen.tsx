"use client";

import { IconArrowLeft, IconArrowRight, IconRefresh, IconSearch, IconDots, IconPhoto } from "@tabler/icons-react";
import * as Dialog from "@radix-ui/react-dialog";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useAdminCapabilities } from "@/components/admin/admin-shell";
import { AdminAccessDeniedScreen } from "@/components/admin/record-screens";
import type { AdminVariantDto } from "@/lib/admin/validation";
import styles from "./inventory-screen.module.css";

type ApiProblem = { error?: { message?: string } };
type InventoryVariant = AdminVariantDto & { sourceOnly: boolean; categoryNames: string[]; categoryIds: string[]; imageId: string | null; unitPricePaise: number | null };
type InventoryList = { items: InventoryVariant[]; total: number; categories: { id: string; title: string }[]; stats: { total: number; aboveZero: number; zero: number; unverified: number } };
type InventoryHistory = { items: { operation: "initialize" | "adjust"; delta: number; balanceAfter: number; reason: string; occurredAt: string }[]; offset: number; hasMore: boolean };
type KeyedInventoryList = { key: string; value: InventoryList };
type KeyedError = { key: string; message: string };
type InventoryStockFilter = "all" | "unverified" | "in_stock" | "out_of_stock";
type InventorySort = "updated_desc" | "title_asc" | "title_desc" | "sku_asc" | "sku_desc" | "stock_asc" | "stock_desc";

async function readError(response: Response) {
  const body = await response.json().catch(() => null) as ApiProblem | null;
  return typeof body?.error?.message === "string"
    ? body.error.message
    : response.status === 409
      ? "This stock record changed. Reload the latest value before saving."
      : "The request could not be completed. Try again.";
}

function InventoryThumbnail({ imageId }: { imageId: string | null }) {
  const [failedImage, setFailedImage] = useState<string | null>(null);
  return <span className={styles.thumbnail}>{imageId && failedImage !== imageId ? <Image unoptimized src={`/api/media/${encodeURIComponent(imageId)}?w=96`} alt="" width={40} height={40} loading="lazy" onError={() => setFailedImage(imageId)} /> : <IconPhoto size={18} aria-hidden="true" />}</span>;
}

export function InventoryScreen() {
  const capabilities = useAdminCapabilities();
  const canAdjust = capabilities.includes("orders.manage");
  const canEdit = capabilities.includes("catalog.edit");
  const [listState, setListState] = useState<KeyedInventoryList | null>(null);
  const [listErrorState, setListErrorState] = useState<KeyedError | null>(null);
  const [searchText, setSearchText] = useState("");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [columns, setColumns] = useState({ sku: true, category: true, stock: true, price: true });
  const [stockFilter, setStockFilter] = useState<InventoryStockFilter>("all");
  const [sort, setSort] = useState<InventorySort>("updated_desc");
  const [offset, setOffset] = useState(0);
  const [pageSize, setPageSize] = useState(20);
  const [selected, setSelected] = useState<InventoryVariant | null>(null);
  const [historyItem, setHistoryItem] = useState<InventoryVariant | null>(null);
  const [historyOffset, setHistoryOffset] = useState(0);
  const [historyRefresh, setHistoryRefresh] = useState(0);
  const [historyState, setHistoryState] = useState<{ key: string; value: InventoryHistory } | null>(null);
  const [historyErrorState, setHistoryErrorState] = useState<KeyedError | null>(null);
  const [delta, setDelta] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState("");
  const [notice, setNotice] = useState("");
  const [refresh, setRefresh] = useState(0);
  const requestId = useRef<string | null>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);
  const [portalContainer, setPortalContainer] = useState<HTMLDivElement | null>(null);
  const requestKey = `${query}\u0000${stockFilter}\u0000${category}\u0000${sort}\u0000${offset}\u0000${pageSize}#${refresh}`;
  const response = listState?.key === requestKey ? listState.value : null;
  const items = response?.items ?? [];
  const total = response?.total ?? null;
  const listError = listErrorState?.key === requestKey ? listErrorState.message : "";
  const loading = canAdjust && !response && !listError;

  const historyKey = `${historyItem?.id ?? ""}#${historyOffset}#${historyRefresh}`;
  const history = historyState?.key === historyKey ? historyState.value : null;
  const historyError = historyErrorState?.key === historyKey ? historyErrorState.message : "";

  useEffect(() => {
    if (!historyItem || !canAdjust) return;
    const controller = new AbortController();
    void fetch(`/api/admin/inventory/${encodeURIComponent(historyItem.id)}/history?offset=${historyOffset}`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(await readError(response));
        return response.json() as Promise<InventoryHistory>;
      })
      .then((value) => setHistoryState({ key: historyKey, value }))
      .catch((error: unknown) => {
        if (!controller.signal.aborted) setHistoryErrorState({ key: historyKey, message: error instanceof Error ? error.message : "Stock history could not be loaded." });
      });
    return () => controller.abort();
  }, [canAdjust, historyItem, historyKey, historyOffset]);

  useEffect(() => {
    if (actionError) errorRef.current?.focus();
  }, [actionError]);

  useEffect(() => {
    if (!canAdjust) return;
    const controller = new AbortController();
    const params = new URLSearchParams({ limit: String(pageSize), offset: String(offset), stock: stockFilter, sort });
    if (query) params.set("q", query);
    if (category) params.set("category", category);
    void fetch(`/api/admin/inventory?${params}`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(await readError(response));
        return response.json() as Promise<InventoryList>;
      })
      .then((result) => {
        setListState({ key: requestKey, value: result });
        const lastOffset = result.total === 0 ? 0 : Math.min(Math.floor((result.total - 1) / pageSize) * pageSize, 10_000);
        if (offset > lastOffset) setOffset(lastOffset);
      })
      .catch((reason: unknown) => {
        if (controller.signal.aborted) return;
        setListErrorState({ key: requestKey, message: reason instanceof Error ? reason.message : "Inventory could not be loaded. Try again." });
      });
    return () => controller.abort();
  }, [canAdjust, category, offset, pageSize, query, refresh, requestKey, sort, stockFilter]);

  function choose(item: InventoryVariant) {
    requestId.current = null;
    setSelected(item);
    setDelta("");
    setReason("");
    setActionError("");
    setNotice("");
  }

  function submitSearch(event: FormEvent) {
    event.preventDefault();
    const nextQuery = searchText.trim();
    setSelected(null);
    setQuery(nextQuery);
    setOffset(0);
    if (nextQuery === query) setRefresh((value) => value + 1);
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!selected || !canAdjust || busy || delta.trim() === "") return;
    const initializing = selected.stock === null;
    const adjustment = Number(delta);
    if (!Number.isSafeInteger(adjustment) || (initializing ? adjustment < 0 || adjustment > 1000000 : adjustment === 0)) {
      setActionError(initializing ? "Enter a whole-number stock count from 0 to 1,000,000." : "Enter a nonzero whole-number adjustment.");
      return;
    }
    if (!reason.trim()) {
      setActionError("Add a note explaining this stock change.");
      return;
    }
    setActionError("");
    setNotice("");
    setBusy(true);
    try {
      requestId.current ??= crypto.randomUUID();
      const response = await fetch(`/api/admin/inventory/${encodeURIComponent(selected.id)}${initializing ? "/initialize" : ""}`, {
        method: initializing ? "POST" : "PATCH",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          expectedVersion: selected.stockVersion ?? 0,
          ...(initializing ? { quantity: adjustment } : { delta: adjustment }),
          reason: reason.trim(),
          requestId: requestId.current,
        }),
      });
      if (!response.ok) throw new Error(await readError(response));
      const result = await response.json() as { variant: AdminVariantDto };
      requestId.current = null;
      setSelected({ ...selected, ...result.variant });
      setDelta("");
      setReason("");
      setNotice(initializing ? "Stock count recorded." : "Stock adjustment recorded.");
      setRefresh((value) => value + 1);
    } catch (reasonError) {
      setActionError(reasonError instanceof Error ? reasonError.message : "Inventory could not be adjusted.");
    } finally {
      setBusy(false);
    }
  }

  if (!canAdjust) return <AdminAccessDeniedScreen title="Inventory" />;

  const pageRange = total === null || total === 0 ? "" : `${offset + 1}–${Math.min(offset + items.length, total)} of ${total} ${total === 1 ? "variant" : "variants"}`;
  const offsetLimitReached = total !== null && offset + items.length < total && offset + pageSize > 10_000;

  return (
    <div className={styles.screen} ref={setPortalContainer}>
      <header className={styles.heading}>
        <div>
          <h1>Inventory</h1>
          <p>Review on-hand counts by variant and record each adjustment with a reason.</p>
        </div>
        {canEdit && <Link className={styles.button} href="/admin/products/new">Add product</Link>}
      </header>

      <section className={styles.stats} aria-label="Inventory across all variants" aria-busy={loading}>
        {([
          ["Total variants", response?.stats.total],
          ["Recorded: above zero", response?.stats.aboveZero],
          ["Recorded: zero", response?.stats.zero],
          ["Not set", response?.stats.unverified],
        ] as const).map(([label, value]) => <div className={styles.stat} key={label}><span>{label}</span><strong>{value === undefined ? (loading ? "Loading…" : "Unavailable") : value.toLocaleString("en-IN")}</strong></div>)}
      </section>

      <div className={styles.workspace}>
        <section className={styles.listPanel} aria-labelledby="inventory-list-title" aria-busy={loading}>
          <div className={styles.listHeading}>
            <div>
              <h2 id="inventory-list-title" tabIndex={-1}>All inventory</h2>
              <p>Counts are on hand. Reservations and item orderability are managed separately.</p>
            </div>
          </div>
          <form className={styles.controls} onSubmit={submitSearch} role="search">
            <label className={styles.search}>
              <IconSearch size={16} aria-hidden="true" />
              <span className={styles.visuallyHidden}>Search product title or exact SKU</span>
              <input value={searchText} maxLength={120} onChange={(event) => setSearchText(event.target.value)} placeholder="Product title or exact SKU" />
            </label>
            <button className={styles.button} type="submit"><IconSearch size={15} aria-hidden="true" />Search</button>
            <label className={styles.pageSize}>
              <span>Rows</span>
              <select value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value)); setOffset(0); setSelected(null); }}>
                <option value={20}>20</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
            </label>
            <label className={styles.stockFilter}><span>Category</span><select value={category} onChange={(event) => { setCategory(event.target.value); setOffset(0); }}><option value="">All categories</option>{(response?.categories ?? listState?.value.categories ?? []).map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label>
            <label className={styles.stockFilter}>
              <span>Stock</span>
              <select value={stockFilter} onChange={(event) => { setStockFilter(event.target.value as InventoryStockFilter); setOffset(0); setSelected(null); }}>
                <option value="all">All statuses</option>
                <option value="unverified">Not set</option>
                <option value="in_stock">Recorded: above zero</option>
                <option value="out_of_stock">Recorded: zero</option>
              </select>
            </label>
            <label className={styles.sortBy}>
              <span>Sort</span>
              <select value={sort} onChange={(event) => { setSort(event.target.value as InventorySort); setOffset(0); setSelected(null); }}>
                <option value="updated_desc">Recently updated</option>
                <option value="title_asc">Product: A–Z</option>
                <option value="title_desc">Product: Z–A</option>
                <option value="sku_asc">SKU: A–Z</option>
                <option value="sku_desc">SKU: Z–A</option>
                <option value="stock_asc">On hand: low to high</option>
                <option value="stock_desc">On hand: high to low</option>
              </select>
            </label>
            {(query || category || stockFilter !== "all") && <button className={styles.button} type="button" onClick={() => { setSearchText(""); setQuery(""); setCategory(""); setStockFilter("all"); setOffset(0); }}>Clear filters</button>}
            <details className={styles.manage}><summary className={styles.button}>Manage table</summary><div className={styles.menu}>{(Object.keys(columns) as (keyof typeof columns)[]).map((column) => <label key={column}><input type="checkbox" checked={columns[column]} onChange={(event) => setColumns({ ...columns, [column]: event.target.checked })} />{column === "sku" ? "SKU" : column === "stock" ? "On hand" : column === "price" ? "Unit price" : "Category"}</label>)}</div></details>
            <span className={styles.count} aria-live="polite">{loading ? "Loading inventory…" : total === null ? "Unavailable" : `${total.toLocaleString("en-IN")} ${total === 1 ? "variant" : "variants"}`}</span>
          </form>

          {listError && <div className={styles.errorBanner} role="alert"><p>{listError}</p><button className={styles.button} type="button" onClick={() => setRefresh((value) => value + 1)}><IconRefresh size={15} aria-hidden="true" />Try again</button></div>}

          <div className={styles.tableScroller} role="region" aria-label="Inventory variants" tabIndex={0}>
            <table className={styles.table}>
              <thead><tr>
                <th scope="col" aria-sort={sort.startsWith("title_") ? (sort.endsWith("asc") ? "ascending" : "descending") : "none"}><button type="button" onClick={() => { setSort(sort === "title_asc" ? "title_desc" : "title_asc"); setOffset(0); }}>Product ↕</button></th>
                {columns.sku && <th scope="col" aria-sort={sort.startsWith("sku_") ? (sort.endsWith("asc") ? "ascending" : "descending") : "none"}><button type="button" onClick={() => { setSort(sort === "sku_asc" ? "sku_desc" : "sku_asc"); setOffset(0); }}>SKU ↕</button></th>}
                {columns.category && <th scope="col">Category</th>}
                {columns.stock && <th scope="col" aria-sort={sort.startsWith("stock_") ? (sort.endsWith("asc") ? "ascending" : "descending") : "none"}><button type="button" onClick={() => { setSort(sort === "stock_asc" ? "stock_desc" : "stock_asc"); setOffset(0); }}>On hand ↕</button></th>}
                {columns.price && <th scope="col">Unit price</th>}<th scope="col"><span className={styles.visuallyHidden}>Actions</span></th>
              </tr></thead>
              <tbody>
                {loading && <tr><td colSpan={6} className={styles.tableMessage}>Loading inventory…</td></tr>}
                {!loading && !listError && items.length === 0 && <tr><td colSpan={6} className={styles.tableMessage}>{query || category || stockFilter !== "all" ? "No variants match these filters." : "No product variants are available to manage."}</td></tr>}
                {!loading && !listError && items.map((item) => <tr key={item.id}>
                  <td><div className={styles.product}><InventoryThumbnail imageId={item.imageId} /><span className={styles.productText}><strong title={item.productTitle}>{item.productTitle}</strong>{item.label && item.label !== item.productTitle && <small title={item.label}>{item.label}</small>}{item.sourceOnly && <span className={styles.sourceBadge}>Source only</span>}</span></div></td>
                  {columns.sku && <td><code className={styles.sku}>{item.sku}</code></td>}
                  {columns.category && <td>{(item.categoryNames ?? []).length ? item.categoryNames.join(", ") : <span className={styles.unconfigured}>Uncategorized</span>}</td>}
                  {columns.stock && <td className={styles.quantity}>{item.stock === null ? <span className={styles.unconfigured}>Not set</span> : <>{item.stock.toLocaleString("en-IN")}<small>{item.stock === 0 ? "Recorded: zero" : "Recorded: above zero"}</small></>}</td>}
                  {columns.price && <td>{item.unitPricePaise == null ? <span className={styles.unconfigured}>{canEdit ? "Not configured" : "Restricted"}</span> : new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(item.unitPricePaise / 100)}</td>}
                  <td><details className={styles.rowMenu}><summary className={styles.iconButton} aria-label={`Actions for ${item.productTitle}, ${item.sku}`}><IconDots size={18} aria-hidden="true" /></summary><div className={styles.menu}>{canEdit && <Link href={`/admin/products/${encodeURIComponent(item.productId)}`}>Edit product</Link>}<button type="button" onClick={(event) => { event.currentTarget.closest("details")?.removeAttribute("open"); choose(item); }}>{item.stock === null ? "Set stock count" : "Adjust stock"}</button><button type="button" onClick={(event) => { event.currentTarget.closest("details")?.removeAttribute("open"); setHistoryOffset(0); setHistoryRefresh((value) => value + 1); setHistoryItem(item); }}>View stock history</button></div></details></td>
                </tr>)}
              </tbody>
            </table>
          </div>

          <footer className={styles.pagination}>
            <span>{pageRange}{offsetLimitReached && " · API pagination limit reached"}</span>
            <div>
              <button className={styles.button} type="button" onClick={() => { setOffset(Math.max(0, offset - pageSize)); setSelected(null); }} disabled={loading || offset === 0}>
                <IconArrowLeft size={15} aria-hidden="true" />Previous
              </button>
              <button className={styles.button} type="button" onClick={() => { setOffset(offset + pageSize); setSelected(null); }} disabled={loading || total === null || offset + pageSize >= total || offset + pageSize > 10_000}>
                Next<IconArrowRight size={15} aria-hidden="true" />
              </button>
            </div>
          </footer>
        </section>

        <Dialog.Root open={historyItem !== null} onOpenChange={(open) => { if (!open) setHistoryItem(null); }}><Dialog.Portal container={portalContainer}><Dialog.Overlay className={styles.overlay} /><Dialog.Content className={styles.adjustPanel} onCloseAutoFocus={(event) => { event.preventDefault(); document.getElementById("inventory-list-title")?.focus(); }}>
          <div className={styles.adjustHeading}>
            <Dialog.Title>Stock history</Dialog.Title><Dialog.Close className={styles.dialogClose} aria-label="Close stock history">X</Dialog.Close>
            <Dialog.Description>{historyItem?.productTitle} / {historyItem?.sku}</Dialog.Description>
          </div>
          <div className={styles.historyBody} aria-busy={!history && !historyError}>
            {!history && !historyError && <p role="status">Loading stock history...</p>}
            {historyError && <div className={styles.errorBanner} role="alert"><p>{historyError}</p><button className={styles.button} type="button" onClick={() => setHistoryRefresh((value) => value + 1)}>Try again</button></div>}
            {history && history.items.length === 0 && <p>No stock movements recorded yet.</p>}
            {history && history.items.length > 0 && <ol className={styles.historyList}>{history.items.map((movement, index) => <li key={`${history.offset}-${index}`}>
              <div className={styles.historyRow}><strong>{movement.operation === "initialize" ? "Initial count" : "Adjustment"}</strong><time dateTime={movement.occurredAt}>{new Date(movement.occurredAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</time></div>
              <p>{movement.reason}</p>
              <div className={styles.historyRow}><span>{movement.operation === "initialize" ? "Balance reconciliation" : "Change"}: {movement.delta > 0 ? "+" : ""}{movement.delta.toLocaleString("en-IN")}</span><span>{movement.operation === "initialize" ? "Physical count" : "On hand after"}: {movement.balanceAfter.toLocaleString("en-IN")}</span></div>
            </li>)}</ol>}
            {history && history.hasMore && historyOffset >= 10000 && <p>History display reached its 10,020-entry limit; older records are not shown.</p>}
            {history && (historyOffset > 0 || history.hasMore) && <div className={styles.historyPagination}><button className={styles.button} type="button" disabled={historyOffset === 0} onClick={() => setHistoryOffset((value) => Math.max(0, value - 20))}>Previous</button><button className={styles.button} type="button" disabled={!history.hasMore || historyOffset >= 10000} onClick={() => setHistoryOffset((value) => value + 20)}>Next</button></div>}
          </div>
        </Dialog.Content></Dialog.Portal></Dialog.Root>

        <Dialog.Root open={selected !== null} onOpenChange={(open) => { if (!open && !busy) setSelected(null); }}><Dialog.Portal container={portalContainer}><Dialog.Overlay className={styles.overlay} /><Dialog.Content className={styles.adjustPanel} onCloseAutoFocus={(event) => { event.preventDefault(); document.getElementById("inventory-list-title")?.focus(); }}>
          <div className={styles.adjustHeading}>
            <Dialog.Title>Record adjustment</Dialog.Title><Dialog.Close className={styles.dialogClose} aria-label="Close" disabled={busy}>×</Dialog.Close>
            <Dialog.Description>Update the stock count and note why it changed.</Dialog.Description>
          </div>
          {!selected ? (
            <p className={styles.emptySelection}>Select a row to review its current count.</p>
          ) : (
            <form onSubmit={save} aria-busy={busy}>
              <div className={styles.selectedProduct}>
                <strong>{selected.productTitle}</strong>
                <span>{selected.label || "Default variant"}</span>
                <code>{selected.sku}</code>
              </div>
              <div className={styles.currentStock}>
                <span>On hand</span>
                <strong>{selected.stock === null ? "Not set" : selected.stock.toLocaleString("en-IN")}</strong>
              </div>
              {selected.stock === null && <p className={styles.helper}>Enter the current physical stock count, including zero if none are on hand.</p>}
              <fieldset className={styles.formFields} disabled={busy}>
                <legend className={styles.visuallyHidden}>Stock adjustment fields</legend>
                <label className={styles.field}>
                  <span>{selected.stock === null ? "On-hand quantity" : "Adjustment"}</span>
                  <input type="number" step="1" value={delta} onChange={(event) => { requestId.current = null; setDelta(event.target.value); }} placeholder={selected.stock === null ? "Enter counted units" : "+10 or −2"} required />
                  <small>{selected.stock === null ? "Enter an absolute count; this does not change pricing or product information." : "Use a positive number to add stock or a negative number to remove it."}</small>
                </label>
                <label className={styles.field}>
                  <span>Adjustment note</span>
                  <input value={reason} maxLength={500} onChange={(event) => { requestId.current = null; setReason(event.target.value); }} placeholder="e.g. New shipment, return or stock correction" aria-describedby="inventory-adjustment-note-help" required />
                  <small id="inventory-adjustment-note-help">Saved in the stock history so your team knows why the quantity changed.</small>
                </label>
              </fieldset>
              {delta !== "" && Number.isSafeInteger(Number(delta)) && selected.stock !== null && Number(delta) !== 0 && <p className={styles.helper}>Resulting on hand: {((selected.stock ?? 0) + Number(delta)).toLocaleString("en-IN")}</p>}
              {actionError && <p ref={errorRef} className={styles.formError} role="alert" tabIndex={-1}>{actionError}</p>}
              {notice && <p className={styles.success} role="status">{notice}</p>}
              <button className={`${styles.button} ${styles.primaryButton}`} type="submit" disabled={busy}>
                {busy ? "Recording…" : "Record adjustment"}
              </button>
            </form>
          )}
        </Dialog.Content></Dialog.Portal></Dialog.Root>
      </div>
    </div>
  );
}
