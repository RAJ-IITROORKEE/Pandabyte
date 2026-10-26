"use client";

import { IconArrowLeft, IconArrowRight, IconRefresh, IconSearch } from "@tabler/icons-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useAdminCapabilities } from "@/components/admin/admin-shell";
import { AdminAccessDeniedScreen } from "@/components/admin/record-screens";
import type { AdminVariantDto } from "@/lib/admin/validation";
import styles from "./inventory-screen.module.css";

type ApiProblem = { error?: { message?: string } };
type InventoryVariant = AdminVariantDto & { sourceOnly: boolean };
type InventoryList = { items: InventoryVariant[]; total: number };
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

export function InventoryScreen() {
  const canAdjust = useAdminCapabilities().includes("orders.manage");
  const [listState, setListState] = useState<KeyedInventoryList | null>(null);
  const [listErrorState, setListErrorState] = useState<KeyedError | null>(null);
  const [searchText, setSearchText] = useState("");
  const [query, setQuery] = useState("");
  const [stockFilter, setStockFilter] = useState<InventoryStockFilter>("all");
  const [sort, setSort] = useState<InventorySort>("updated_desc");
  const [offset, setOffset] = useState(0);
  const [pageSize, setPageSize] = useState(20);
  const [selected, setSelected] = useState<InventoryVariant | null>(null);
  const [delta, setDelta] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState("");
  const [notice, setNotice] = useState("");
  const [refresh, setRefresh] = useState(0);
  const requestId = useRef<string | null>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);
  const requestKey = `${query}\u0000${stockFilter}\u0000${sort}\u0000${offset}\u0000${pageSize}#${refresh}`;
  const response = listState?.key === requestKey ? listState.value : null;
  const items = response?.items ?? [];
  const total = response?.total ?? null;
  const listError = listErrorState?.key === requestKey ? listErrorState.message : "";
  const loading = canAdjust && !response && !listError;

  useEffect(() => {
    if (actionError) errorRef.current?.focus();
  }, [actionError]);

  useEffect(() => {
    if (!canAdjust) return;
    const controller = new AbortController();
    const params = new URLSearchParams({ limit: String(pageSize), offset: String(offset), stock: stockFilter, sort });
    if (query) params.set("q", query);
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
  }, [canAdjust, offset, pageSize, query, refresh, requestKey, sort, stockFilter]);

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
    if (!selected || selected.sourceOnly || !canAdjust || busy) return;
    const adjustment = Number(delta);
    if (!Number.isSafeInteger(adjustment) || adjustment === 0) {
      setActionError("Enter a nonzero whole-number adjustment.");
      return;
    }
    if (!reason.trim()) {
      setActionError("Enter a reason for this adjustment.");
      return;
    }
    setActionError("");
    setNotice("");
    setBusy(true);
    try {
      requestId.current ??= crypto.randomUUID();
      const response = await fetch(`/api/admin/inventory/${encodeURIComponent(selected.id)}`, {
        method: "PATCH",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          expectedVersion: selected.stockVersion ?? 0,
          delta: adjustment,
          reason: reason.trim(),
          requestId: requestId.current,
        }),
      });
      if (!response.ok) throw new Error(await readError(response));
      const result = await response.json() as { variant: AdminVariantDto };
      requestId.current = null;
      setSelected({ ...result.variant, sourceOnly: false });
      setDelta("");
      setReason("");
      setNotice("Stock adjustment recorded.");
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
    <div className={styles.screen}>
      <header className={styles.heading}>
        <div>
          <h1>Inventory</h1>
          <p>Review on-hand counts by variant and record each adjustment with a reason.</p>
        </div>
      </header>

      <div className={styles.workspace}>
        <section className={styles.listPanel} aria-labelledby="inventory-list-title" aria-busy={loading}>
          <div className={styles.listHeading}>
            <div>
              <h2 id="inventory-list-title">Stock by variant</h2>
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
            <label className={styles.stockFilter}>
              <span>Stock</span>
              <select value={stockFilter} onChange={(event) => { setStockFilter(event.target.value as InventoryStockFilter); setOffset(0); setSelected(null); }}>
                <option value="all">All statuses</option>
                <option value="unverified">Unverified</option>
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
            <span className={styles.count} aria-live="polite">{loading ? "Loading inventory…" : total === null ? "Unavailable" : `${total.toLocaleString("en-IN")} ${total === 1 ? "variant" : "variants"}`}</span>
          </form>

          {listError && <div className={styles.errorBanner} role="alert"><p>{listError}</p><button className={styles.button} type="button" onClick={() => setRefresh((value) => value + 1)}><IconRefresh size={15} aria-hidden="true" />Try again</button></div>}

          <div className={styles.tableScroller} role="region" aria-label="Inventory variants" tabIndex={0}>
            <table className={styles.table}>
              <thead><tr><th scope="col">Product</th><th scope="col">Variant / SKU</th><th scope="col">On hand</th></tr></thead>
              <tbody>
                {loading && <tr><td colSpan={3} className={styles.tableMessage}>Loading inventory…</td></tr>}
                {!loading && !listError && items.length === 0 && <tr><td colSpan={3} className={styles.tableMessage}>{query || stockFilter !== "all" ? "No variants match these filters." : "No product variants are available to manage."}</td></tr>}
                {!loading && !listError && items.map((item) => (
                  <tr key={item.id} className={selected?.id === item.id ? styles.selectedRow : undefined}>
                    <td>
                      <button className={styles.rowSelect} type="button" aria-pressed={selected?.id === item.id} onClick={() => choose(item)}>{item.productTitle}</button>
                    </td>
                    <td><span>{item.label || "Default variant"}</span>{item.sourceOnly && <span className={styles.sourceBadge}>Source only</span>}<code className={styles.sku}>{item.sku}</code></td>
                    <td className={styles.quantity}>{item.sourceOnly ? <span className={styles.unconfigured}>Stock unverified</span> : item.stock === null ? <span className={styles.unconfigured}>Not configured</span> : item.stock.toLocaleString("en-IN")}</td>
                  </tr>
                ))}
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

        <section className={styles.adjustPanel} aria-labelledby="inventory-adjust-title">
          <div className={styles.adjustHeading}>
            <h2 id="inventory-adjust-title">Record adjustment</h2>
            <p>Choose one variant, then enter the stock change and reason.</p>
          </div>
          {!selected ? (
            <p className={styles.emptySelection}>Select a row to review its current count.</p>
          ) : selected.sourceOnly ? (
            <div className={styles.unavailableSelection}>
              <div className={styles.selectedProduct}>
                <strong>{selected.productTitle}</strong>
                <span>{selected.label || "Default variant"}</span>
                <code>{selected.sku}</code>
                <span className={styles.sourceBadge}>Source only</span>
              </div>
              <div className={styles.currentStock}>
                <span>Stock</span>
                <strong>Unverified</strong>
              </div>
              <p className={styles.helper}>Source-only items remain non-purchasable. Stock is unverified and cannot be adjusted here.</p>
            </div>
          ) : (
            <form onSubmit={save} aria-busy={busy}>
              <div className={styles.selectedProduct}>
                <strong>{selected.productTitle}</strong>
                <span>{selected.label || "Default variant"}</span>
                <code>{selected.sku}</code>
              </div>
              <div className={styles.currentStock}>
                <span>On hand</span>
                <strong>{selected.stock === null ? "Not configured" : selected.stock.toLocaleString("en-IN")}</strong>
              </div>
              {selected.stock === null && <p className={styles.helper}>The first adjustment must add stock to establish an on-hand count.</p>}
              <fieldset className={styles.formFields} disabled={busy}>
                <legend className={styles.visuallyHidden}>Stock adjustment fields</legend>
                <label className={styles.field}>
                  <span>Adjustment</span>
                  <input type="number" step="1" value={delta} onChange={(event) => { requestId.current = null; setDelta(event.target.value); }} placeholder="+10 or −2" required />
                  <small>Use a positive number to add stock or a negative number to remove it.</small>
                </label>
                <label className={styles.field}>
                  <span>Reason</span>
                  <input value={reason} maxLength={500} onChange={(event) => { requestId.current = null; setReason(event.target.value); }} required />
                </label>
              </fieldset>
              {actionError && <p ref={errorRef} className={styles.formError} role="alert" tabIndex={-1}>{actionError}</p>}
              {notice && <p className={styles.success} role="status">{notice}</p>}
              <button className={`${styles.button} ${styles.primaryButton}`} type="submit" disabled={busy}>
                {busy ? "Recording…" : "Record adjustment"}
              </button>
            </form>
          )}
        </section>
      </div>
    </div>
  );
}
