"use client";

import { AdminNotice } from "./admin-notice";

import Image from "next/image";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { useAdminCapabilities } from "@/components/admin/admin-shell";
import { canAdminPermission } from "@/lib/admin/access-contract";
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

type MediaItem = { id: string; filename: string; mimeType: string; byteSize: number; width: number | null; height: number | null; altText: string; source: string; version: number; published: boolean; archived: boolean; referenced: boolean; publicUseAllowed: boolean | null; triangles: number | null; url: string };

const MediaModelEngine = dynamic(
  () => import("@/components/catalog/product-model-engine").then((module) => module.ProductModelEngine),
  { ssr: false, loading: () => <p role="status">Starting 3D preview…</p> },
);

function MediaModelPreview({ item }: { item: MediaItem }) {
  const [active, setActive] = useState(false);
  const src = `/api/media/${encodeURIComponent(item.id)}`;
  return <div className={`${styles.modelPreview} ${styles.mediaPreview}`} role="group" aria-label={`3D preview of ${item.filename}`}>
    {active ? <MediaModelEngine src={src} alt={item.altText} compact={false} onClose={() => setActive(false)} /> : <button className={styles.secondaryButton} type="button" onClick={() => setActive(true)}>Preview 3D model</button>}
  </div>;
}

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
  const capabilities = useAdminCapabilities(); const canManage = capabilities.includes("media.manage") && canAdminPermission(capabilities, "media", "read"); const canCreate = canManage && canAdminPermission(capabilities, "media", "create"); const canUpdate = canManage && canAdminPermission(capabilities, "media", "update"); const canPublish = canUpdate && capabilities.includes("content.publish");
  const [items, setItems] = useState<MediaItem[]>([]); const [total, setTotal] = useState<number | null>(null); const [query, setQuery] = useState(""); const [search, setSearch] = useState(""); const [offset, setOffset] = useState(0); const [selected, setSelected] = useState<MediaItem | null>(null); const [file, setFile] = useState<File | null>(null); const [altText, setAltText] = useState(""); const [source, setSource] = useState(""); const [uploadPublicUseAllowed, setUploadPublicUseAllowed] = useState(false); const [publicUseEdit, setPublicUseEdit] = useState<{ id: string; version: number; value: boolean } | null>(null); const [busy, setBusy] = useState(false); const [loading, setLoading] = useState(true); const [error, setError] = useState(""); const [notice, setNotice] = useState(""); const [refresh, setRefresh] = useState(0);
  const [uploadError, setUploadError] = useState("");
  const uploadErrorRef = useRef<HTMLParagraphElement>(null);
  const uploadInputRef = useRef<HTMLInputElement>(null);
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
  async function upload(event: FormEvent) { event.preventDefault(); if (!canCreate || !file) return; setBusy(true); setError(""); setUploadError(""); setNotice(""); const form = new FormData(); form.set("file", file); form.set("altText", altText); form.set("source", source); if (isGlbUpload) form.set("publicUseAllowed", String(uploadPublicUseAllowed)); try { const { media } = await request<{ media: MediaItem }>("/api/admin/media", { method: "POST", body: form }); setSelected(media); setAltText(media.altText); setSource(media.source); setPublicUseEdit(null); setFile(null); if (uploadInputRef.current) uploadInputRef.current.value = ""; setUploadPublicUseAllowed(false); setNotice(isGlbUpload ? "Private 3D model uploaded." : "Private media asset uploaded."); setRefresh((value) => value + 1); } catch (reason) { setUploadError(reason instanceof Error ? reason.message : "Upload failed."); } finally { setBusy(false); } }
  async function update(published = selected?.published) { if (!canUpdate || !selected || (published !== selected.published && !canPublish)) return; setBusy(true); setError(""); setNotice(""); const body = { expectedVersion: selected.version, altText, source, published, ...(selected.mimeType === "model/gltf-binary" ? { publicUseAllowed: editPublicUseAllowed } : {}) }; try { const result = await request<{ media: MediaItem }>(`/api/admin/media/${selected.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }); setSelected(result.media); setPublicUseEdit(null); setNotice(published ? "Media published." : selected.published ? "Media unpublished." : "Media metadata saved."); setRefresh((value) => value + 1); } catch (reason) { setError(reason instanceof Error ? reason.message : "Media could not be updated."); } finally { setBusy(false); } }
  async function archive() { if (!canUpdate || !selected || !window.confirm("Archive this media asset? Referenced media cannot be archived.")) return; setBusy(true); setError(""); try { await request(`/api/admin/media/${selected.id}/archive`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ expectedVersion: selected.version }) }); setSelected(null); setNotice("Media asset archived."); setRefresh((value) => value + 1); } catch (reason) { setError(reason instanceof Error ? reason.message : "Media could not be archived."); } finally { setBusy(false); } }
  function submitSearch(event: FormEvent) { event.preventDefault(); setLoading(true); setError(""); setSearch(query.trim()); setOffset(0); setRefresh((value) => value + 1); }
  const allowedType = file ? (isGlbFile(file) || (file.name.toLowerCase().endsWith(".glb") ? false : file.type === "application/pdf" ? file.size <= 2 * 1024 * 1024 : ["image/png", "image/jpeg", "image/webp"].includes(file.type) && file.size <= 4 * 1024 * 1024)) : false;

  if (!canManage) return <AdminAccessDeniedScreen title="Media library" />;

  return <div className={styles.screen}>
    <div className={styles.pageHeading}><div><h1>Media library</h1><p className={styles.lede}>Upload private images or PDFs, record their source and alt text, then publish approved assets for public use.</p></div></div>
    {canCreate && <section className={styles.panel}><div className={styles.sectionHeading}><div><h2>Upload media</h2><p id="media-upload-help">PNG, JPEG, and WebP up to 4 MiB; GLB models up to 4 MiB; PDF up to 2 MiB. PDFs are download-only. Models need confirmed redistribution permission before publication.</p></div></div><form className={styles.mediaUpload} onSubmit={upload} aria-busy={busy} aria-describedby={uploadError ? "media-upload-error" : undefined}><label className={styles.field}><span className={styles.fieldLabel}>File</span><input ref={uploadInputRef} className={styles.input} type="file" accept="image/png,image/jpeg,image/webp,application/pdf,model/gltf-binary,.glb" aria-describedby={file && !allowedType ? "media-upload-help media-upload-file-error" : "media-upload-help"} aria-invalid={file && !allowedType ? true : undefined} onChange={(event) => { setFile(event.target.files?.[0] ?? null); setUploadPublicUseAllowed(false); setUploadError(""); }} required /></label>{isGlbUpload && <><label className={styles.inlineCheck}><input type="checkbox" checked={uploadPublicUseAllowed} disabled={!canPublish} onChange={(event) => setUploadPublicUseAllowed(event.target.checked)} /><span>Redistribution permission confirmed</span></label><p className={styles.fieldHint}>{canPublish ? "Leave unchecked for private vendor models. Only confirm when redistribution permission is documented." : "Your role cannot confirm redistribution rights. The model can still be uploaded privately."}</p></>}<label className={styles.field}><span className={styles.fieldLabel}>Alt text</span><input className={styles.input} value={altText} onChange={(event) => { setAltText(event.target.value); setUploadError(""); }} maxLength={300} required /></label><label className={styles.field}><span className={styles.fieldLabel}>Source / rights note</span><input className={styles.input} value={source} onChange={(event) => { setSource(event.target.value); setUploadError(""); }} maxLength={500} /></label><button className={styles.primaryButton} type="submit" disabled={!canManage || busy || !allowedType || !altText.trim()}>{busy ? "Uploading…" : isGlbUpload ? "Upload private 3D model" : "Upload private asset"}</button>{uploadError && <AdminNotice key={uploadError} tone="error" onDismiss={() => setUploadError("")}><p id="media-upload-error" ref={uploadErrorRef} tabIndex={-1}>{uploadError}</p></AdminNotice>}{file && !allowedType && <p id="media-upload-file-error" className={styles.inlineError} role="alert">This file type or size is not supported.</p>}</form></section>}
    <form className={styles.toolbar} onSubmit={submitSearch} role="search"><label className={styles.searchBox}><span className={styles.visuallyHidden}>Search media</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search filename or alt text" /></label><button className={styles.secondaryButton} type="submit">Search</button><span className={styles.toolbarCount} aria-live="polite">{loading ? "Loading…" : total === null ? "Unavailable" : `${total} assets`}</span></form>
    {error && <AdminNotice tone="error" key={error} className={styles.errorBanner} actions={<button className={styles.secondaryButton} type="button" onClick={() => { setLoading(true); setError(""); setRefresh((value) => value + 1); }}>Try again</button>}><p>{error}</p></AdminNotice>}
    <div className={styles.mediaLayout}>
      <section className={styles.tableFrame} aria-label="Media assets" tabIndex={0}><table className={styles.table}><thead><tr><th scope="col">Asset</th><th scope="col">Type / size</th><th scope="col">Status</th></tr></thead><tbody>{loading && <tr><td colSpan={3} className={styles.tableMessage}>Loading media…</td></tr>}{!loading && !error && !items.length && <tr><td colSpan={3} className={styles.tableMessage}>No media assets yet.</td></tr>}{!loading && items.map((item) => <tr key={item.id} className={selected?.id === item.id ? styles.selectedRow : styles.selectableRow}><td><button className={styles.rowSelect} type="button" aria-pressed={selected?.id === item.id} onClick={() => open(item)}>{item.filename}</button><span className={styles.rowSubtext}>{item.altText || "Alt text not set"}</span></td><td>{mediaTypeLabel(item.mimeType)}<span className={styles.rowSubtext}>{(item.byteSize / 1024).toFixed(0)} KiB</span></td><td>{item.archived ? "Archived" : item.published ? "Published" : "Private"}</td></tr>)}</tbody></table></section>
      {selected ? <section className={styles.mediaDetail}>
        <div className={styles.sectionHeading}><div><h2 ref={mediaHeadingRef} tabIndex={-1}>{selected.filename}</h2><p>{selected.width && selected.height ? `${selected.width} × ${selected.height} · ` : ""}{selected.mimeType === "model/gltf-binary" && selected.triangles !== null ? `${selected.triangles.toLocaleString()} triangles · ` : ""}{selected.referenced ? "Referenced" : selected.published ? "Published" : "Private"}</p></div></div>
        {selected.mimeType.startsWith("image/") && <div className={styles.mediaPreview}><Image src={selected.url} alt={altText || selected.altText || "Media preview"} width={selected.width || 480} height={selected.height || 320} unoptimized /></div>}
        {selected.mimeType === "application/pdf" && <p><a className={styles.secondaryButton} href={selected.url} target="_blank" rel="noreferrer">Open PDF download</a></p>}
        {selected.mimeType === "model/gltf-binary" && <><MediaModelPreview key={selected.id} item={selected} /><p className={styles.fieldHint}>Unpublished model files are staff-only. Publishing this media asset makes it publicly accessible; publish the product separately to add its gallery preview.</p><label className={styles.inlineCheck}><input type="checkbox" checked={editPublicUseAllowed === true} disabled={!canPublish} onChange={(event) => setPublicUseEdit({ id: selected.id, version: selected.version, value: event.target.checked })} /><span>Redistribution permission confirmed</span></label><p className={styles.fieldHint}>{!canPublish ? "Your role cannot confirm redistribution rights." : editPublicUseAllowed ? "Permission is marked confirmed; publication still requires the expected-version save." : "This model remains private and cannot be published until redistribution permission is confirmed."}</p></>}
        <label className={styles.field}><span className={styles.fieldLabel}>Alt text</span><input className={styles.input} value={altText} onChange={(event) => setAltText(event.target.value)} disabled={!canUpdate} maxLength={300} required /></label>
        <label className={styles.field}><span className={styles.fieldLabel}>Source / rights note</span><textarea className={styles.textarea} value={source} onChange={(event) => setSource(event.target.value)} disabled={!canUpdate} maxLength={500} rows={3} /></label>
        <p className={styles.fieldHint}>Asset source: {selected.source || "Not recorded"}</p>
        {canUpdate && <div className={styles.mediaActions}><button className={styles.secondaryButton} type="button" onClick={() => void update()} disabled={!canManage || busy}>Save metadata</button>{selected.published ? <button className={styles.secondaryButton} type="button" onClick={() => void update(false)} disabled={!canManage || !canPublish || busy}>Unpublish</button> : <button className={styles.primaryButton} type="button" onClick={() => void update(true)} disabled={!canManage || !canPublish || busy || (selected.mimeType === "model/gltf-binary" && !editPublicUseAllowed)}>Publish</button>}<button className={styles.dangerButton} type="button" onClick={() => void archive()} disabled={!canManage || busy || selected.referenced}>Archive</button></div>}
        {!canPublish && <p className={styles.fieldHint}>Your role does not include publishing media.</p>}{selected.referenced && <p className={styles.fieldHint}>This asset is in use and cannot be archived.</p>}
      </section> : <section className={styles.emptyPanel}><p>Select an asset to review its metadata.</p></section>}
    </div>
    <div className={styles.pagination}><span>{total === null || total === 0 ? "" : `${offset + 1}–${Math.min(offset + items.length, total)} of ${total}`}</span><div><button className={styles.secondaryButton} type="button" onClick={() => { setLoading(true); void load(Math.max(0, offset - pageSize)); }} disabled={loading || offset === 0}>Previous</button><button className={styles.secondaryButton} type="button" onClick={() => { setLoading(true); void load(offset + pageSize); }} disabled={loading || total === null || offset + pageSize >= total}>Next</button></div></div>
    {notice && <AdminNotice tone="success" onDismiss={() => setNotice("")} className={styles.successBanner}>{notice}</AdminNotice>}
  </div>;
}
