"use client";

import { AdminNotice } from "./admin-notice";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { useAdminCapabilities } from "@/components/admin/admin-shell";
import { AdminAccessDeniedScreen } from "@/components/admin/record-screens";
import type { AdminVariantDto } from "@/lib/admin/validation";
import styles from "./admin-ui.module.css";

type ApiProblem = { error?: { message?: string } };

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { cache: "no-store", ...init });
  const body = await response.json().catch(() => null) as T | ApiProblem | null;
  if (!response.ok) {
    const message = body && typeof body === "object" && "error" in body ? body.error?.message : undefined;
    throw Object.assign(new Error(message || (response.status === 409 ? "This item changed since it was opened. Reload the latest values before saving." : "The action could not be completed. Try again.")), { status: response.status });
  }
  return body as T;
}

type Variant = AdminVariantDto;

function inr(paise: number | null) {
  if (paise === null) return "Not set";
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: 2 }).format(paise / 100);
}

function localInput(iso: string | null) {
  if (!iso) return "";
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return "";
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60_000).toISOString().slice(0, 16);
}

function toUtc(value: string) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function VariantList({ mode, onSelect, selectedId }: { mode: "pricing" | "inventory"; onSelect: (item: Variant) => void; selectedId: string }) {
  const [items, setItems] = useState<Variant[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const pageSize = 20;

  const load = useCallback(async (nextOffset = 0, q = search) => {
    try {
      const params = new URLSearchParams({ limit: String(pageSize), offset: String(nextOffset) });
      if (q.trim()) params.set("q", q.trim());
      const result = await request<{ items: Variant[]; total: number }>(`/api/admin/${mode}?${params}`);
      setItems(result.items); setTotal(result.total); setOffset(nextOffset);
      if (selectedId) {
        const selected = result.items.find((item) => item.id === selectedId);
        if (selected) onSelect(selected);
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Variants could not be loaded."); setItems([]); setTotal(null);
    } finally { setLoading(false); }
  }, [mode, onSelect, search, selectedId]);

  useEffect(() => {
    let active = true;
    const params = new URLSearchParams({ limit: String(pageSize), offset: "0" });
    if (search.trim()) params.set("q", search.trim());
    request<{ items: Variant[]; total: number }>(`/api/admin/${mode}?${params}`)
      .then((result) => {
        if (!active) return;
        setItems(result.items); setTotal(result.total); setOffset(0);
        const selected = result.items.find((item) => item.id === selectedId);
        if (selected) onSelect(selected);
      })
      .catch((reason: unknown) => {
        if (!active) return;
        setError(reason instanceof Error ? reason.message : "Variants could not be loaded."); setItems([]); setTotal(null);
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [mode, onSelect, search, selectedId, reloadKey]);
  function submit(event: FormEvent) { event.preventDefault(); setLoading(true); setError(""); setOffset(0); setSearch(query.trim()); setReloadKey((value) => value + 1); }

  return <div className={styles.operationsList}>
    <form className={styles.toolbar} onSubmit={submit} role="search"><label className={styles.searchBox}><span className={styles.visuallyHidden}>Search product variants</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search product title or exact SKU" /></label><button className={styles.secondaryButton} type="submit">Search</button><span className={styles.toolbarCount} aria-live="polite">{loading ? "Loading variants…" : total === null ? "Unavailable" : `${total} variants`}</span></form>
    {error && <AdminNotice tone="error" key={error} className={styles.errorBanner} actions={<button className={styles.secondaryButton} type="button" onClick={() => { setLoading(true); setError(""); void load(offset); }}>Try again</button>}><p>{error}</p></AdminNotice>}
    <div className={styles.tableFrame} role="region" aria-label={mode === "pricing" ? "Product pricing" : "Product inventory"} tabIndex={0}><table className={styles.table}><thead><tr><th>Product</th><th>Variant / SKU</th>{mode === "pricing" ? <><th>Regular</th><th>Sale</th></> : <th>On hand</th>}</tr></thead><tbody>
      {loading && <tr><td colSpan={mode === "pricing" ? 4 : 3} className={styles.tableMessage}>Loading variants…</td></tr>}
      {!loading && !error && !items.length && <tr><td colSpan={mode === "pricing" ? 4 : 3} className={styles.tableMessage}>No variants found. Create product variants in the product editor first.</td></tr>}
      {!loading && items.map((item) => <tr className={item.id === selectedId ? styles.selectedRow : styles.selectableRow} key={item.id}>
        <td><button className={styles.rowSelect} type="button" onClick={() => onSelect(item)}>{item.productTitle}</button></td><td><span>{item.label || "Default"}</span><code className={styles.sku}>{item.sku}</code></td>
        {mode === "pricing" ? <><td>{inr(item.regularPaise)}</td><td>{inr(item.salePaise)}</td></> : <td><strong>{item.stock ?? "Not configured"}</strong></td>}
      </tr>)}
    </tbody></table></div>
    <div className={styles.pagination}><span>{total === null || total === 0 ? "" : `${offset + 1}–${Math.min(offset + items.length, total)} of ${total}`}</span><div><button className={styles.secondaryButton} type="button" onClick={() => { setLoading(true); void load(Math.max(0, offset - pageSize)); }} disabled={loading || offset === 0}>Previous</button><button className={styles.secondaryButton} type="button" onClick={() => { setLoading(true); void load(offset + pageSize); }} disabled={loading || total === null || offset + pageSize >= total}>Next</button></div></div>
  </div>;
}

export function PricingScreen() {
  const capabilities = useAdminCapabilities();
  const canEdit = capabilities.includes("catalog.edit");
  const [variant, setVariant] = useState<Variant | null>(null);
  const [regular, setRegular] = useState("");
  const [sale, setSale] = useState("");
  const [saleFrom, setSaleFrom] = useState("");
  const [saleUntil, setSaleUntil] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [refresh, setRefresh] = useState(0);
  const [selectedId, setSelectedId] = useState("");
  const errorRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => { if (error) errorRef.current?.focus(); }, [error]);

  const choose = useCallback((item: Variant) => {
    setVariant(item); setSelectedId(item.id); setRegular(item.regularPaise === null ? "" : (item.regularPaise / 100).toFixed(2));
    setSale(item.salePaise === null ? "" : (item.salePaise / 100).toFixed(2)); setSaleFrom(localInput(item.saleFrom)); setSaleUntil(localInput(item.saleUntil)); setReason(""); setError(""); setNotice("");
  }, []);

  async function save(event: FormEvent) {
    event.preventDefault(); if (!variant || !canEdit) return;
    setError(""); setNotice("");
    const parsePrice = (value: string) => {
      if (value.trim() === "") return null;
      if (!/^\d+(?:\.\d{1,2})?$/.test(value.trim())) return Number.NaN;
      const paise = Math.round(Number(value) * 100);
      return Number.isSafeInteger(paise) && paise <= 10_000_000_000 ? paise : Number.NaN;
    };
    const regularPaise = parsePrice(regular); const salePaise = parsePrice(sale);
    if (Number.isNaN(regularPaise) || Number.isNaN(salePaise)) { setError("Enter valid INR amounts with at most two decimal places."); return; }
    const body = { expectedVersion: variant.priceVersion, regularPaise, salePaise, saleFrom: toUtc(saleFrom), saleUntil: toUtc(saleUntil), reason: reason.trim() };
    if (salePaise !== null && (regularPaise === null || salePaise > regularPaise || !body.saleFrom || !body.saleUntil || body.saleFrom >= body.saleUntil)) { setError("Set a sale below the regular price and provide a valid start and end time."); return; }
    if (salePaise === null && (body.saleFrom || body.saleUntil)) { setError("Clear sale dates when there is no sale price."); return; }
    if (!body.reason) { setError("Enter a reason for this price change."); return; }
    setBusy(true);
    try {
      await request<{ variant: Variant }>(`/api/admin/pricing/${encodeURIComponent(variant.id)}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      setNotice("Price updated and recorded."); setReason(""); setRefresh((value) => value + 1);
    } catch (reasonError) { setError(reasonError instanceof Error ? reasonError.message : "Price could not be updated."); }
    finally { setBusy(false); }
  }

  if (!canEdit) return <AdminAccessDeniedScreen title="Pricing" />;

  return <div className={styles.screen}>
    <div className={styles.pageHeading}><div><h1>Pricing</h1><p className={styles.lede}>Set regular prices and optional sale prices in INR. Add a reason for every change.</p></div></div>
    <div className={styles.operationsLayout} key={refresh}><VariantList mode="pricing" selectedId={selectedId} onSelect={choose} /></div>
    {variant && <form className={styles.panel} onSubmit={save} aria-describedby={error ? "pricing-error" : undefined} aria-busy={busy}>
      <div className={styles.sectionHeading}><div><h2>{variant.productTitle}</h2><p>{variant.label || "Default variant"} · {variant.sku}</p></div></div>
      <div className={styles.formGrid}>
        <label className={styles.field}><span className={styles.fieldLabel}>Regular price (₹)</span><input className={styles.input} inputMode="decimal" value={regular} onChange={(event) => setRegular(event.target.value)} placeholder="Not set" /></label>
        <label className={styles.field}><span className={styles.fieldLabel}>Sale price (₹)</span><input className={styles.input} inputMode="decimal" value={sale} onChange={(event) => setSale(event.target.value)} placeholder="No sale" /></label>
        <label className={styles.field}><span className={styles.fieldLabel}>Sale starts</span><input className={styles.input} type="datetime-local" value={saleFrom} onChange={(event) => setSaleFrom(event.target.value)} /></label>
        <label className={styles.field}><span className={styles.fieldLabel}>Sale ends</span><input className={styles.input} type="datetime-local" value={saleUntil} onChange={(event) => setSaleUntil(event.target.value)} /></label>
        <label className={`${styles.field} ${styles.spanTwo}`}><span className={styles.fieldLabel}>Reason</span><textarea className={styles.textarea} value={reason} onChange={(event) => setReason(event.target.value)} rows={3} maxLength={500} required /></label>
      </div>
      {error && <p id="pricing-error" ref={errorRef} className={styles.inlineError} role="alert" tabIndex={-1}>{error}</p>}{notice && <AdminNotice tone="success" onDismiss={() => setNotice("")} className={styles.successBanner}>{notice}</AdminNotice>}
      <div className={styles.formSubmit}><button className={styles.primaryButton} type="submit" disabled={!canEdit || busy}>{busy ? "Saving…" : "Save price"}</button></div>
    </form>}
  </div>;
}
