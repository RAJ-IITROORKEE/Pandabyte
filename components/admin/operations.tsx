"use client";

import Image from "next/image";
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
    {error && <div className={styles.errorBanner} role="alert"><p>{error}</p><button className={styles.secondaryButton} type="button" onClick={() => { setLoading(true); setError(""); void load(offset); }}>Try again</button></div>}
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
      {error && <p id="pricing-error" ref={errorRef} className={styles.inlineError} role="alert" tabIndex={-1}>{error}</p>}{notice && <p className={styles.successBanner} role="status">{notice}</p>}
      <div className={styles.formSubmit}><button className={styles.primaryButton} type="submit" disabled={!canEdit || busy}>{busy ? "Saving…" : "Save price"}</button></div>
    </form>}
  </div>;
}

export function InventoryScreen() {
  const capabilities = useAdminCapabilities();
  const canAdjust = capabilities.includes("orders.manage");
  const [variant, setVariant] = useState<Variant | null>(null);
  const [delta, setDelta] = useState(""); const [reason, setReason] = useState(""); const [busy, setBusy] = useState(false);
  const [error, setError] = useState(""); const [notice, setNotice] = useState(""); const [refresh, setRefresh] = useState(0); const [selectedId, setSelectedId] = useState("");
  const requestId = useRef<string | null>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);
  useEffect(() => { if (error) errorRef.current?.focus(); }, [error]);
  const choose = useCallback((item: Variant) => { requestId.current = null; setVariant(item); setSelectedId(item.id); setDelta(""); setReason(""); setError(""); setNotice(""); }, []);
  async function save(event: FormEvent) {
    event.preventDefault(); if (!variant || !canAdjust) return;
    setError("");
    const adjustment = Number(delta);
    if (!Number.isSafeInteger(adjustment) || adjustment === 0) { setError("Enter a nonzero whole-number adjustment."); return; }
    if (!reason.trim()) { setError("Enter a reason for this adjustment."); return; }
    setBusy(true); setNotice("");
    try {
      requestId.current ??= crypto.randomUUID();
      await request<{ variant: Variant }>(`/api/admin/inventory/${encodeURIComponent(variant.id)}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ expectedVersion: variant.stockVersion ?? 0, delta: adjustment, reason: reason.trim(), requestId: requestId.current }) });
      requestId.current = null;
      setNotice("Inventory adjustment recorded."); setDelta(""); setReason(""); setRefresh((value) => value + 1);
    } catch (reasonError) { setError(reasonError instanceof Error ? reasonError.message : "Inventory could not be adjusted."); }
    finally { setBusy(false); }
  }
  if (!canAdjust) return <AdminAccessDeniedScreen title="Inventory" />;
  return <div className={styles.screen}>
    <div className={styles.pageHeading}><div><h1>Inventory</h1><p className={styles.lede}>Record each stock adjustment with a reason. The on-hand count is checked again before saving.</p></div></div>
    <div className={styles.operationsLayout} key={refresh}><VariantList mode="inventory" selectedId={selectedId} onSelect={choose} /></div>
    {variant && <form className={styles.panel} onSubmit={save} aria-describedby={error ? "inventory-error" : undefined} aria-busy={busy}><div className={styles.sectionHeading}><div><h2>{variant.productTitle}</h2><p>{variant.label || "Default variant"} · {variant.sku}</p></div><strong className={styles.stockValue}>{variant.stock === null ? "Not configured" : `${variant.stock} on hand`}</strong></div>{variant.stock === null && <p className={styles.fieldHint}>The first positive adjustment establishes the on-hand count.</p>}
       <div className={styles.formGrid}><label className={styles.field}><span className={styles.fieldLabel}>Adjustment</span><input className={styles.input} type="number" step="1" value={delta} onChange={(event) => { requestId.current = null; setDelta(event.target.value); }} placeholder="+10 or −2" required /><span className={styles.fieldHint}>Use a positive number to add stock or a negative number to remove it.</span></label><label className={styles.field}><span className={styles.fieldLabel}>Reason</span><input className={styles.input} value={reason} onChange={(event) => { requestId.current = null; setReason(event.target.value); }} maxLength={500} required /></label></div>
      {error && <p id="inventory-error" ref={errorRef} className={styles.inlineError} role="alert" tabIndex={-1}>{error}</p>}{notice && <p className={styles.successBanner} role="status">{notice}</p>}<div className={styles.formSubmit}><button className={styles.primaryButton} type="submit" disabled={!canAdjust || busy}>{busy ? "Saving…" : "Record adjustment"}</button></div>
    </form>}
  </div>;
}

type NotificationStatus = "unconfigured" | "leased" | "sending" | "accepted" | "failed" | "uncertain" | "suppressed";
type InquiryNotification = { status: NotificationStatus; version: number; attempts: number; lastAttemptAt: string | null; acceptedAt: string | null };
type Inquiry = { id: string; name: string; email: string; phone: string | null; subject: string; message: string; status: "new" | "in_progress" | "resolved" | "spam"; version: number; createdAt: string; notificationStatus: NotificationStatus; notification: InquiryNotification };
type InquiryNote = { id: string; text: string; actor: string; createdAt: string };
type InquiryResponse = { inquiry: Inquiry & { notes?: InquiryNote[] }; notificationAvailable: boolean };

function notificationLabel(status: NotificationStatus) {
  return ({
    unconfigured: "Not sent",
    leased: "Preparing to send",
    sending: "Sending",
    accepted: "Accepted by email service · delivery not confirmed",
    failed: "Send failed",
    uncertain: "Result unknown · do not retry",
    suppressed: "Suppressed",
  } as const)[status];
}

export function InquiriesScreen() {
  const capabilities = useAdminCapabilities();
  const [items, setItems] = useState<Inquiry[]>([]); const [total, setTotal] = useState<number | null>(null); const [offset, setOffset] = useState(0); const [query, setQuery] = useState(""); const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState(""); const [selected, setSelected] = useState<Inquiry | null>(null); const [notes, setNotes] = useState<InquiryNote[]>([]); const [nextStatus, setNextStatus] = useState<Inquiry["status"]>("new"); const [note, setNote] = useState(""); const [loading, setLoading] = useState(true); const [detailLoading, setDetailLoading] = useState(false); const [busy, setBusy] = useState(false); const [notificationBusy, setNotificationBusy] = useState(false); const [notificationRefreshing, setNotificationRefreshing] = useState(false); const [error, setError] = useState(""); const [formError, setFormError] = useState(""); const [notice, setNotice] = useState(""); const [notificationAvailable, setNotificationAvailable] = useState<boolean | null>(null); const [notificationError, setNotificationError] = useState(""); const [notificationNotice, setNotificationNotice] = useState(""); const [refresh, setRefresh] = useState(0);
  const detailRequest = useRef(0);
  const formErrorRef = useRef<HTMLParagraphElement>(null);
  useEffect(() => { if (formError) formErrorRef.current?.focus(); }, [formError]);
  const pageSize = 20;
  const load = useCallback(async (nextOffset = 0, q = search, status = statusFilter) => {
    try {
      const params = new URLSearchParams({ limit: String(pageSize), offset: String(nextOffset) }); if (q) params.set("q", q); if (status) params.set("status", status);
      const result = await request<{ items: Inquiry[]; total: number }>(`/api/admin/inquiries?${params}`); setItems(result.items); setTotal(result.total); setOffset(nextOffset);
      if (selected) { const latest = result.items.find((item) => item.id === selected.id); if (latest) setSelected((current) => current?.id === latest.id ? { ...current, notification: latest.notification, notificationStatus: latest.notificationStatus } : current); }
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Inquiries could not be loaded."); setItems([]); setTotal(null); }
    finally { setLoading(false); }
  }, [search, selected, statusFilter]);
  useEffect(() => {
    let active = true;
    const params = new URLSearchParams({ limit: String(pageSize), offset: "0" });
    if (search) params.set("q", search);
    if (statusFilter) params.set("status", statusFilter);
    request<{ items: Inquiry[]; total: number }>(`/api/admin/inquiries?${params}`)
      .then((result) => {
        if (!active) return;
        setItems(result.items); setTotal(result.total); setOffset(0);
        setSelected((current) => {
          if (!current) return current;
          const latest = result.items.find((item) => item.id === current.id);
          return latest ? { ...current, notification: latest.notification, notificationStatus: latest.notificationStatus } : current;
        });
      })
      .catch((reason: unknown) => {
        if (!active) return;
        setError(reason instanceof Error ? reason.message : "Inquiries could not be loaded."); setItems([]); setTotal(null);
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [search, statusFilter, refresh]);
  async function open(item: Inquiry) {
    if (busy) return;
    const requestId = ++detailRequest.current;
    setDetailLoading(true);
    setSelected(item); setNotes([]); setNextStatus(item.status); setNote(""); setNotice(""); setError(""); setFormError(""); setNotificationError(""); setNotificationNotice(""); setNotificationAvailable(null);
    try { const result = await request<InquiryResponse>(`/api/admin/inquiries/${item.id}`); if (requestId !== detailRequest.current) return; setSelected(result.inquiry); setNextStatus(result.inquiry.status); setNotes(result.inquiry.notes ?? []); setNotificationAvailable(result.notificationAvailable); }
    catch (reason) { if (requestId === detailRequest.current) setError(reason instanceof Error ? reason.message : "Inquiry details could not be loaded."); }
    finally { if (requestId === detailRequest.current) setDetailLoading(false); }
  }
  async function update(event: FormEvent) {
    event.preventDefault(); if (!selected || busy || detailLoading) return; setFormError(""); if (note.length > 2000) { setFormError("Notes must be 2,000 characters or fewer."); return; }
    setBusy(true); setNotice("");
    try { const result = await request<InquiryResponse>(`/api/admin/inquiries/${selected.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ expectedVersion: selected.version, status: nextStatus, note: note.trim() }) }); setSelected(result.inquiry); setNotes(result.inquiry.notes ?? []); setNotificationAvailable(result.notificationAvailable); setNote(""); setNotice("Inquiry updated."); setRefresh((value) => value + 1); }
    catch (reason) { const status = reason && typeof reason === "object" && "status" in reason ? reason.status : undefined; setFormError(status === 409 ? "Another staff member changed this inquiry. Reopen it to review the latest details before saving. Your note has been kept." : "Inquiry could not be updated. Try again."); }
    finally { setBusy(false); }
  }
  async function sendNotification() {
    if (!selected || busy || detailLoading || notificationBusy || notificationAvailable !== true || selected.status === "spam" || selected.notification.attempts >= 5 || !["unconfigured", "failed"].includes(selected.notification.status)) return;
    setBusy(true); setNotificationBusy(true); setNotificationRefreshing(false); setNotificationError(""); setNotificationNotice("");
    try {
      const result = await request<InquiryResponse>(`/api/admin/inquiries/${selected.id}/notification`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ expectedVersion: selected.notification.version }) });
      setSelected((current) => current?.id === result.inquiry.id ? { ...current, notification: result.inquiry.notification, notificationStatus: result.inquiry.notificationStatus } : current);
      setNotes(result.inquiry.notes ?? []); setNotificationAvailable(result.notificationAvailable);
      setNotificationNotice(notificationLabel(result.inquiry.notification.status));
    } catch (reason) {
      const status = reason && typeof reason === "object" && "status" in reason ? reason.status : undefined;
      setNotificationError(status === 409 ? "This inquiry changed. Refresh its email status before trying again." : status === 503 ? "Email sending is unavailable right now. Check setup before trying again." : status === 403 ? "You no longer have permission to manage this inquiry." : "The email request could not be completed.");
    } finally { setBusy(false); setNotificationBusy(false); }
  }
  async function refreshNotificationStatus() {
    if (!selected || busy || detailLoading) return;
    const requestId = ++detailRequest.current;
    setBusy(true); setNotificationBusy(true); setNotificationRefreshing(true); setNotificationError(""); setNotificationNotice("");
    try {
      const result = await request<InquiryResponse>(`/api/admin/inquiries/${selected.id}`);
      if (requestId !== detailRequest.current) return;
      // Refreshing email must not silently advance an unsaved inquiry's edit version.
      setSelected((current) => current?.id === result.inquiry.id ? { ...current, notification: result.inquiry.notification, notificationStatus: result.inquiry.notificationStatus } : current);
      setNotes(result.inquiry.notes ?? []); setNotificationAvailable(result.notificationAvailable); setNotificationNotice("Email status refreshed.");
    } catch (reason) {
      const status = reason && typeof reason === "object" && "status" in reason ? reason.status : undefined;
      setNotificationError(status === 409 ? "This inquiry changed. Refresh its email status before trying again." : status === 503 ? "Email sending is unavailable right now. Check setup before trying again." : status === 403 ? "You no longer have permission to manage this inquiry." : "Email status could not be refreshed.");
    } finally { if (requestId === detailRequest.current) { setBusy(false); setNotificationBusy(false); setNotificationRefreshing(false); } }
  }
  function submitSearch(event: FormEvent) { event.preventDefault(); setLoading(true); setError(""); setSearch(query.trim()); setOffset(0); setRefresh((value) => value + 1); }
  const date = (value: string) => new Date(value).toLocaleString();

  if (!capabilities.includes("inquiries.manage")) return <AdminAccessDeniedScreen title="Inquiries" />;

  return <div className={styles.screen}>
    <div className={styles.pageHeading}><div><h1>Inquiries</h1><p className={styles.lede}>Review messages, update their status, and leave private notes.</p></div></div>
    <form className={styles.toolbar} onSubmit={submitSearch} role="search"><label className={styles.searchBox}><span className={styles.visuallyHidden}>Search inquiries</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search email or subject" /></label><select className={styles.input} value={statusFilter} onChange={(event) => { setLoading(true); setError(""); setOffset(0); setStatusFilter(event.target.value); }} aria-label="Filter by status"><option value="">All statuses</option><option value="new">New</option><option value="in_progress">In progress</option><option value="resolved">Resolved</option><option value="spam">Spam</option></select><button className={styles.secondaryButton} type="submit">Search</button><span className={styles.toolbarCount} aria-live="polite">{loading ? "Loading…" : total === null ? "Unavailable" : `${total} inquiries`}</span></form>
    {error && <div className={styles.errorBanner} role="alert"><p>{error}</p><button type="button" className={styles.secondaryButton} onClick={() => { setLoading(true); setError(""); setRefresh((value) => value + 1); }}>Try again</button></div>}
    <div className={styles.inquiryLayout}>
      <section className={styles.tableFrame} aria-label="Inquiry list" tabIndex={0}><table className={styles.table}><thead><tr><th scope="col">Name / subject</th><th scope="col">Status</th><th scope="col">Received</th></tr></thead><tbody>{loading && <tr><td colSpan={3} className={styles.tableMessage}>Loading inquiries…</td></tr>}{!loading && !error && !items.length && <tr><td colSpan={3} className={styles.tableMessage}>No inquiries match this view.</td></tr>}{!loading && items.map((item) => <tr key={item.id} className={selected?.id === item.id ? styles.selectedRow : styles.selectableRow}><td><button className={styles.rowSelect} type="button" onClick={() => void open(item)}>{item.name}</button><span className={styles.rowSubtext}>{item.subject}</span></td><td>{item.status.replace("_", " ")}</td><td className={styles.dateCell}>{date(item.createdAt)}</td></tr>)}</tbody></table></section>
      {selected ? <section className={styles.inquiryDetail} aria-label="Inquiry detail">
        <div className={styles.sectionHeading}><div><h2>{selected.subject || "No subject"}</h2><p>{selected.name} · {selected.email}{selected.phone ? ` · ${selected.phone}` : ""}</p></div></div>
        <div className={styles.messageBody}>{selected.message}</div>
        <div className={styles.notificationNote}>
          <strong>Email notification · {notificationLabel(selected.notification.status)}</strong>
          {notificationAvailable === false && <p className={styles.fieldHint}>Setup required before email can be sent.</p>}
          {notificationAvailable === null && <p className={styles.fieldHint}>Email setup status could not be confirmed.</p>}
          {selected.notification.attempts > 0 && <p className={styles.fieldHint}>Attempt {selected.notification.attempts} of 5{selected.notification.lastAttemptAt ? ` · Last attempt ${date(selected.notification.lastAttemptAt)}` : ""}</p>}
          {selected.notification.acceptedAt && selected.notification.status === "accepted" && <p className={styles.fieldHint}>Accepted {date(selected.notification.acceptedAt)}. Delivery is not confirmed.</p>}
          {(selected.notification.status === "unconfigured" || selected.notification.status === "failed") && <button className={styles.secondaryButton} type="button" onClick={() => void sendNotification()} disabled={busy || detailLoading || notificationAvailable !== true || selected.status === "spam" || selected.notification.attempts >= 5}>{notificationBusy && !notificationRefreshing ? "Sending…" : selected.notification.status === "unconfigured" ? "Send email" : "Retry email"}</button>}
          {(selected.notification.status === "unconfigured" || selected.notification.status === "failed") && selected.notification.attempts >= 5 && <p className={styles.fieldHint}>Maximum of 5 attempts reached; no further retry is available.</p>}
          <button className={styles.secondaryButton} type="button" onClick={() => void refreshNotificationStatus()} disabled={busy || detailLoading}>{notificationRefreshing ? "Refreshing…" : "Refresh email status"}</button>
          {notificationError && <p className={styles.inlineError} role="alert">{notificationError}</p>}
          {notificationNotice && <p className={styles.fieldHint} role="status">{notificationNotice}</p>}
        </div>
        <form onSubmit={update} className={styles.noteForm} aria-describedby={formError ? "inquiry-form-error" : undefined} aria-busy={busy}><label className={styles.field}><span className={styles.fieldLabel}>Status</span><select className={styles.input} value={nextStatus} onChange={(event) => setNextStatus(event.target.value as Inquiry["status"])} disabled={detailLoading}><option value="new">New</option><option value="in_progress">In progress</option><option value="resolved">Resolved</option><option value="spam">Spam</option></select></label><label className={styles.field}><span className={styles.fieldLabel}>Internal note</span><textarea className={styles.textarea} value={note} onChange={(event) => setNote(event.target.value)} maxLength={2000} rows={4} placeholder="Add context for staff" disabled={detailLoading} /></label>{formError && <p id="inquiry-form-error" ref={formErrorRef} className={styles.inlineError} role="alert" tabIndex={-1}>{formError}</p>}{notice && <p className={styles.successBanner} role="status">{notice}</p>}<button className={styles.primaryButton} type="submit" disabled={busy || detailLoading}>{busy && !notificationBusy ? "Saving…" : "Save inquiry"}</button></form>
        <div className={styles.noteHistory}><h3>Staff notes</h3>{notes.length ? notes.map((item) => <article key={item.id}><p>{item.text}</p><small>Staff · {date(item.createdAt)}</small></article>) : <p className={styles.fieldHint}>No staff notes yet.</p>}</div>
      </section> : <section className={styles.emptyPanel}><p>Select an inquiry to review its message and notes.</p></section>}
    </div>
    <div className={styles.pagination}><span>{total === null || total === 0 ? "" : `${offset + 1}–${Math.min(offset + items.length, total)} of ${total}`}</span><div><button className={styles.secondaryButton} type="button" onClick={() => { setLoading(true); void load(Math.max(0, offset - pageSize)); }} disabled={loading || offset === 0}>Previous</button><button className={styles.secondaryButton} type="button" onClick={() => { setLoading(true); void load(offset + pageSize); }} disabled={loading || total === null || offset + pageSize >= total}>Next</button></div></div>
  </div>;
}

type MediaItem = { id: string; filename: string; mimeType: string; byteSize: number; width: number | null; height: number | null; altText: string; source: string; version: number; published: boolean; archived: boolean; referenced: boolean; publicUseAllowed: boolean | null; triangles: number | null; url: string };

function mediaTypeLabel(mimeType: string) {
  return ({
    "image/png": "PNG image",
    "image/jpeg": "JPEG image",
    "image/webp": "WebP image",
    "application/pdf": "PDF",
    "model/gltf-binary": "3D model (GLB)",
  } as Record<string, string>)[mimeType] ?? "File";
}

export function MediaScreen() {
  const capabilities = useAdminCapabilities(); const canManage = capabilities.includes("media.manage"); const canPublish = capabilities.includes("content.publish");
  const [items, setItems] = useState<MediaItem[]>([]); const [total, setTotal] = useState<number | null>(null); const [query, setQuery] = useState(""); const [search, setSearch] = useState(""); const [offset, setOffset] = useState(0); const [selected, setSelected] = useState<MediaItem | null>(null); const [file, setFile] = useState<File | null>(null); const [altText, setAltText] = useState(""); const [source, setSource] = useState(""); const [uploadPublicUseAllowed, setUploadPublicUseAllowed] = useState(false); const [publicUseEdit, setPublicUseEdit] = useState<{ id: string; version: number; value: boolean } | null>(null); const [busy, setBusy] = useState(false); const [loading, setLoading] = useState(true); const [error, setError] = useState(""); const [notice, setNotice] = useState(""); const [refresh, setRefresh] = useState(0);
  const [uploadError, setUploadError] = useState("");
  const uploadErrorRef = useRef<HTMLParagraphElement>(null);
  const mediaHeadingRef = useRef<HTMLHeadingElement>(null);
  const selectedId = selected?.id;
  const editPublicUseAllowed = selected && publicUseEdit?.id === selected.id && publicUseEdit.version === selected.version ? publicUseEdit.value : selected?.publicUseAllowed === true;
  const pageSize = 20;
  const load = useCallback(async (nextOffset = 0, q = search) => { try { const params = new URLSearchParams({ limit: String(pageSize), offset: String(nextOffset) }); if (q) params.set("q", q); const result = await request<{ items: MediaItem[]; total: number }>(`/api/admin/media?${params}`); setItems(result.items); setTotal(result.total); setOffset(nextOffset); if (selected) { const latest = result.items.find((item) => item.id === selected.id); if (latest && latest.version !== selected.version) setSelected(latest); } } catch (reason) { setError(reason instanceof Error ? reason.message : "Media could not be loaded."); setItems([]); setTotal(null); } finally { setLoading(false); } }, [search, selected]);
  useEffect(() => {
    let active = true;
    const params = new URLSearchParams({ limit: String(pageSize), offset: "0" });
    if (search) params.set("q", search);
    request<{ items: MediaItem[]; total: number }>(`/api/admin/media?${params}`)
      .then((result) => {
        if (!active) return;
        setItems(result.items); setTotal(result.total); setOffset(0);
        setSelected((current) => {
          if (!current) return current;
          const latest = result.items.find((item) => item.id === current.id);
          return latest && latest.version !== current.version ? latest : current;
        });
      })
      .catch((reason: unknown) => {
        if (!active) return;
        setError(reason instanceof Error ? reason.message : "Media could not be loaded."); setItems([]); setTotal(null);
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [search, refresh]);
  useEffect(() => { if (selectedId) mediaHeadingRef.current?.focus(); }, [selectedId]);
  useEffect(() => { if (uploadError) uploadErrorRef.current?.focus(); }, [uploadError]);
  const isGlbFile = (value: File | null) => Boolean(value && value.name.toLowerCase().endsWith(".glb") && value.size <= 4 * 1024 * 1024 && ["", "model/gltf-binary", "application/octet-stream"].includes(value.type));
  const isGlbUpload = isGlbFile(file);
  function open(item: MediaItem) { setSelected(item); setAltText(item.altText); setSource(item.source); setPublicUseEdit(null); setNotice(""); setError(""); }
  async function upload(event: FormEvent) { event.preventDefault(); if (!file) return; setBusy(true); setError(""); setUploadError(""); setNotice(""); const form = new FormData(); form.set("file", file); form.set("altText", altText); form.set("source", source); if (isGlbUpload) form.set("publicUseAllowed", String(uploadPublicUseAllowed)); try { await request<{ media: MediaItem }>("/api/admin/media", { method: "POST", body: form }); setFile(null); setAltText(""); setSource(""); setUploadPublicUseAllowed(false); setNotice(isGlbUpload ? "Private 3D model uploaded." : "Private media asset uploaded."); setRefresh((value) => value + 1); } catch (reason) { setUploadError(reason instanceof Error ? reason.message : "Upload failed."); } finally { setBusy(false); } }
  async function update(published = selected?.published) { if (!selected) return; setBusy(true); setError(""); setNotice(""); const body = { expectedVersion: selected.version, altText, source, published, ...(selected.mimeType === "model/gltf-binary" ? { publicUseAllowed: editPublicUseAllowed } : {}) }; try { const result = await request<{ media: MediaItem }>(`/api/admin/media/${selected.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }); setSelected(result.media); setPublicUseEdit(null); setNotice(published ? "Media published." : selected.published ? "Media unpublished." : "Media metadata saved."); setRefresh((value) => value + 1); } catch (reason) { setError(reason instanceof Error ? reason.message : "Media could not be updated."); } finally { setBusy(false); } }
  async function archive() { if (!selected || !window.confirm("Archive this media asset? Referenced media cannot be archived.")) return; setBusy(true); setError(""); try { await request(`/api/admin/media/${selected.id}/archive`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ expectedVersion: selected.version }) }); setSelected(null); setNotice("Media asset archived."); setRefresh((value) => value + 1); } catch (reason) { setError(reason instanceof Error ? reason.message : "Media could not be archived."); } finally { setBusy(false); } }
  function submitSearch(event: FormEvent) { event.preventDefault(); setLoading(true); setError(""); setSearch(query.trim()); setOffset(0); setRefresh((value) => value + 1); }
  const allowedType = file ? (isGlbFile(file) || (file.name.toLowerCase().endsWith(".glb") ? false : file.type === "application/pdf" ? file.size <= 2 * 1024 * 1024 : ["image/png", "image/jpeg", "image/webp"].includes(file.type) && file.size <= 4 * 1024 * 1024)) : false;

  if (!canManage) return <AdminAccessDeniedScreen title="Media library" />;

  return <div className={styles.screen}>
    <div className={styles.pageHeading}><div><h1>Media library</h1><p className={styles.lede}>Upload private images or PDFs, record their source and alt text, then publish approved assets for public use.</p></div></div>
    <section className={styles.panel}><div className={styles.sectionHeading}><div><h2>Upload media</h2><p id="media-upload-help">PNG, JPEG, and WebP up to 4 MiB; GLB models up to 4 MiB; PDF up to 2 MiB. PDFs are download-only. Models need confirmed redistribution permission before publication.</p></div></div><form className={styles.mediaUpload} onSubmit={upload} aria-busy={busy} aria-describedby={uploadError ? "media-upload-error" : undefined}><label className={styles.field}><span className={styles.fieldLabel}>File</span><input className={styles.input} type="file" accept="image/png,image/jpeg,image/webp,application/pdf,model/gltf-binary,.glb" aria-describedby={file && !allowedType ? "media-upload-help media-upload-file-error" : "media-upload-help"} aria-invalid={file && !allowedType ? true : undefined} onChange={(event) => { setFile(event.target.files?.[0] ?? null); setUploadPublicUseAllowed(false); setUploadError(""); }} required /></label>{isGlbUpload && <><label className={styles.inlineCheck}><input type="checkbox" checked={uploadPublicUseAllowed} disabled={!canPublish} onChange={(event) => setUploadPublicUseAllowed(event.target.checked)} /><span>Redistribution permission confirmed</span></label><p className={styles.fieldHint}>{canPublish ? "Leave unchecked for private vendor models. Only confirm when redistribution permission is documented." : "Your role cannot confirm redistribution rights. The model can still be uploaded privately."}</p></>}<label className={styles.field}><span className={styles.fieldLabel}>Alt text</span><input className={styles.input} value={altText} onChange={(event) => { setAltText(event.target.value); setUploadError(""); }} maxLength={300} required /></label><label className={styles.field}><span className={styles.fieldLabel}>Source / rights note</span><input className={styles.input} value={source} onChange={(event) => { setSource(event.target.value); setUploadError(""); }} maxLength={500} /></label><button className={styles.primaryButton} type="submit" disabled={!canManage || busy || !allowedType || !altText.trim()}>{busy ? "Uploading…" : isGlbUpload ? "Upload private 3D model" : "Upload private asset"}</button>{uploadError && <p id="media-upload-error" ref={uploadErrorRef} className={styles.inlineError} role="alert" tabIndex={-1}>{uploadError}</p>}{file && !allowedType && <p id="media-upload-file-error" className={styles.inlineError} role="alert">This file type or size is not supported.</p>}</form></section>
    <form className={styles.toolbar} onSubmit={submitSearch} role="search"><label className={styles.searchBox}><span className={styles.visuallyHidden}>Search media</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search filename or alt text" /></label><button className={styles.secondaryButton} type="submit">Search</button><span className={styles.toolbarCount} aria-live="polite">{loading ? "Loading…" : total === null ? "Unavailable" : `${total} assets`}</span></form>
    {error && <div className={styles.errorBanner} role="alert"><p>{error}</p><button className={styles.secondaryButton} type="button" onClick={() => { setLoading(true); setError(""); setRefresh((value) => value + 1); }}>Try again</button></div>}
    <div className={styles.mediaLayout}>
      <section className={styles.tableFrame} aria-label="Media assets" tabIndex={0}><table className={styles.table}><thead><tr><th scope="col">Asset</th><th scope="col">Type / size</th><th scope="col">Status</th></tr></thead><tbody>{loading && <tr><td colSpan={3} className={styles.tableMessage}>Loading media…</td></tr>}{!loading && !error && !items.length && <tr><td colSpan={3} className={styles.tableMessage}>No media assets yet.</td></tr>}{!loading && items.map((item) => <tr key={item.id} className={selected?.id === item.id ? styles.selectedRow : styles.selectableRow}><td><button className={styles.rowSelect} type="button" aria-pressed={selected?.id === item.id} onClick={() => open(item)}>{item.filename}</button><span className={styles.rowSubtext}>{item.altText || "Alt text not set"}</span></td><td>{mediaTypeLabel(item.mimeType)}<span className={styles.rowSubtext}>{(item.byteSize / 1024).toFixed(0)} KiB</span></td><td>{item.archived ? "Archived" : item.published ? "Published" : "Private"}</td></tr>)}</tbody></table></section>
      {selected ? <section className={styles.mediaDetail}>
        <div className={styles.sectionHeading}><div><h2 ref={mediaHeadingRef} tabIndex={-1}>{selected.filename}</h2><p>{selected.width && selected.height ? `${selected.width} × ${selected.height} · ` : ""}{selected.mimeType === "model/gltf-binary" && selected.triangles !== null ? `${selected.triangles.toLocaleString()} triangles · ` : ""}{selected.referenced ? "Referenced" : selected.published ? "Published" : "Private"}</p></div></div>
        {selected.mimeType.startsWith("image/") && <div className={styles.mediaPreview}><Image src={selected.url} alt={altText || selected.altText || "Media preview"} width={selected.width || 480} height={selected.height || 320} unoptimized /></div>}
        {selected.mimeType === "application/pdf" && <p><a className={styles.secondaryButton} href={selected.url} target="_blank" rel="noreferrer">Open PDF download</a></p>}
        {selected.mimeType === "model/gltf-binary" && <><p className={styles.fieldHint}>Unpublished model files are staff-only. Publishing this media asset makes it publicly accessible; publish the product separately to add its gallery preview.</p><label className={styles.inlineCheck}><input type="checkbox" checked={editPublicUseAllowed === true} disabled={!canPublish} onChange={(event) => setPublicUseEdit({ id: selected.id, version: selected.version, value: event.target.checked })} /><span>Redistribution permission confirmed</span></label><p className={styles.fieldHint}>{!canPublish ? "Your role cannot confirm redistribution rights." : editPublicUseAllowed ? "Permission is marked confirmed; publication still requires the expected-version save." : "This model remains private and cannot be published until redistribution permission is confirmed."}</p></>}
        <label className={styles.field}><span className={styles.fieldLabel}>Alt text</span><input className={styles.input} value={altText} onChange={(event) => setAltText(event.target.value)} maxLength={300} required /></label>
        <label className={styles.field}><span className={styles.fieldLabel}>Source / rights note</span><textarea className={styles.textarea} value={source} onChange={(event) => setSource(event.target.value)} maxLength={500} rows={3} /></label>
        <p className={styles.fieldHint}>Asset source: {selected.source || "Not recorded"}</p>
        <div className={styles.mediaActions}><button className={styles.secondaryButton} type="button" onClick={() => void update()} disabled={!canManage || busy}>Save metadata</button>{selected.published ? <button className={styles.secondaryButton} type="button" onClick={() => void update(false)} disabled={!canManage || !canPublish || busy}>Unpublish</button> : <button className={styles.primaryButton} type="button" onClick={() => void update(true)} disabled={!canManage || !canPublish || busy || (selected.mimeType === "model/gltf-binary" && !editPublicUseAllowed)}>Publish</button>}<button className={styles.dangerButton} type="button" onClick={() => void archive()} disabled={!canManage || busy || selected.referenced}>Archive</button></div>
        {!canPublish && <p className={styles.fieldHint}>Your role does not include publishing media.</p>}{selected.referenced && <p className={styles.fieldHint}>This asset is in use and cannot be archived.</p>}
      </section> : <section className={styles.emptyPanel}><p>Select an asset to review its metadata.</p></section>}
    </div>
    <div className={styles.pagination}><span>{total === null || total === 0 ? "" : `${offset + 1}–${Math.min(offset + items.length, total)} of ${total}`}</span><div><button className={styles.secondaryButton} type="button" onClick={() => { setLoading(true); void load(Math.max(0, offset - pageSize)); }} disabled={loading || offset === 0}>Previous</button><button className={styles.secondaryButton} type="button" onClick={() => { setLoading(true); void load(offset + pageSize); }} disabled={loading || total === null || offset + pageSize >= total}>Next</button></div></div>
    {notice && <p className={styles.successBanner} role="status">{notice}</p>}
  </div>;
}
