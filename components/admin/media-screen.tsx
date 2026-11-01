"use client";

import { useUser } from "@clerk/nextjs";
import dynamic from "next/dynamic";
import Image from "next/image";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Box, Copy, Eye, FileText, Trash2, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { AdminNotice } from "./admin-notice";
import { useAdminCapabilities } from "./admin-shell";
import { AdminAccessDeniedScreen } from "./record-screens";
import { parseMediaDetail, parseMediaWorkspace, type MediaItem, type MediaWorkspace, type MediaDetail } from "@/lib/admin/media-contract";
import { canAdminPermission } from "@/lib/admin/access-contract";
import { MorphingDialog, MorphingDialogCard, MorphingDialogClose, MorphingDialogContainer, MorphingDialogContent, MorphingDialogDescription, MorphingDialogTitle, MorphingDialogTrigger } from "@/components/core/morphing-dialog";
import ui from "./admin-ui.module.css";
import css from "./media-screen.module.css";

const ModelEngine = dynamic(() => import("@/components/catalog/product-model-engine").then((module) => module.ProductModelEngine), { ssr: false, loading: () => <p role="status">Starting 3D preview…</p> });
type Media = MediaItem;
type Usage = MediaDetail["usage"];
type Result = MediaWorkspace;
type Problem = Error & { status?: number };
const size = (bytes: number) => bytes < 1024 ? `${bytes} B` : bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MiB` : `${(bytes / 1024).toFixed(0)} KiB`;
const typeLabel = (mime: string) => mime.startsWith("image/") ? "Image" : mime === "model/gltf-binary" ? "3D model" : mime === "application/pdf" ? "PDF" : mime.includes("wordprocessingml") ? "Word document" : "Document";
const date = (value: string) => value && Number.isFinite(Date.parse(value)) ? new Intl.DateTimeFormat("en-IN", { dateStyle: "medium" }).format(new Date(value)) : "—";
async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { cache: "no-store", ...init });
  const body = await response.json().catch(() => null);
  if (!response.ok) throw Object.assign(new Error(body?.error?.message || (response.status === 409 ? "This asset changed. Reload its details before trying again." : "The request could not be completed.")), { status: response.status });
  return body as T;
}
function allowed(file: File | null) {
  if (!file || file.size < 1) return false;
  const name = file.name.toLowerCase();
  if (name.endsWith(".glb")) return file.size <= 4 * 1024 * 1024 && ["", "application/octet-stream", "model/gltf-binary"].includes(file.type);
  if (name.endsWith(".docx")) return file.size <= 4 * 1024 * 1024 && ["", "application/octet-stream", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"].includes(file.type);
  if (name.endsWith(".pdf")) return file.size <= 2 * 1024 * 1024 && file.type === "application/pdf";
  if (name.endsWith(".svg")) return file.size <= 256 * 1024 && file.type === "image/svg+xml";
  return /\.(png|jpe?g|webp)$/.test(name) && ["image/png", "image/jpeg", "image/webp"].includes(file.type) && file.size <= 4 * 1024 * 1024;
}
export function MediaScreen() {
  const { user, isLoaded } = useUser();
  if (!isLoaded) return <p role="status">Loading media access…</p>;
  if (!user) return <AdminAccessDeniedScreen title="Media library" />;
  return <MediaSession key={user.id} />;
}
function MediaSession() {
  const caps = useAdminCapabilities();
  const canRead = caps.includes("media.manage") && canAdminPermission(caps, "media", "read");
  const canCreate = canRead && canAdminPermission(caps, "media", "create");
  const canUpdate = canRead && canAdminPermission(caps, "media", "update");
  const canPublish = canUpdate && caps.includes("content.publish");
  const [query, setQuery] = useState(""); const [search, setSearch] = useState(""); const [type, setType] = useState("all"); const [status, setStatus] = useState("all"); const [sort, setSort] = useState("newest"); const [offset, setOffset] = useState(0);
  const [result, setResult] = useState<Result | null>(null); const [loading, setLoading] = useState(true); const [error, setError] = useState(""); const [reload, setReload] = useState(0);
  const [selected, setSelected] = useState<Media | null>(null); const [usage, setUsage] = useState<Usage | null>(null); const [detailError, setDetailError] = useState(""); const [detailLoading, setDetailLoading] = useState(false); const [detailReload, setDetailReload] = useState(0);
  const [alt, setAlt] = useState(""); const [source, setSource] = useState(""); const [rights, setRights] = useState(false); const [conflict, setConflict] = useState(false); const [confirmArchive, setConfirmArchive] = useState(false); const [modelActive, setModelActive] = useState(false);
  const [file, setFile] = useState<File | null>(null); const [filePreview, setFilePreview] = useState(""); const [dragActive, setDragActive] = useState(false); const [uploadAlt, setUploadAlt] = useState(""); const [uploadSource, setUploadSource] = useState(""); const [uploadRights, setUploadRights] = useState(false); const [uploadError, setUploadError] = useState(""); const [busy, setBusy] = useState(false); const [uploadOpen, setUploadOpen] = useState(false);
  const [portal, setPortal] = useState<HTMLDivElement | null>(null); const fileInput = useRef<HTMLInputElement>(null); const active = useRef(true); const mutation = useRef<AbortController | null>(null); const archiveRequested = useRef(false);
  useEffect(() => { active.current = true; return () => { active.current = false; mutation.current?.abort(); }; }, []);
  useEffect(() => () => { if (filePreview) URL.revokeObjectURL(filePreview); }, [filePreview]);
  useEffect(() => {
    if (!canRead) return;
    const controller = new AbortController(); const params = new URLSearchParams({ q: search, type, status, sort, limit: "20", offset: String(offset) });
    request<unknown>(`/api/admin/media?${params}`, { signal: controller.signal }).then((body) => { const data = parseMediaWorkspace(body); if (!data) throw new Error("Media response was incomplete. Try again."); if (!controller.signal.aborted) { setResult(data); setError(""); setLoading(false); } }).catch((reason: unknown) => { if (!controller.signal.aborted) { setResult(null); setError(reason instanceof Error ? reason.message : "Media could not be loaded."); setLoading(false); } });
    return () => controller.abort();
  }, [canRead, search, type, status, sort, offset, reload]);
  const selectedId = selected?.id;
  useEffect(() => {
    if (!selectedId) return;
    const controller = new AbortController(); const id = selectedId;
    request<unknown>(`/api/admin/media/${encodeURIComponent(id)}`, { signal: controller.signal }).then((body) => { const data = parseMediaDetail(body); if (!data) throw new Error("Media details were incomplete. Try again."); if (!controller.signal.aborted) { setSelected(data.media); setUsage(data.usage); setAlt(data.media.altText); setSource(data.media.source); setRights(data.media.publicUseAllowed === true); setConflict(false); setDetailError(""); setDetailLoading(false); } }).catch((reason: unknown) => { if (!controller.signal.aborted) { setDetailError(reason instanceof Error ? reason.message : "Media details could not be loaded."); setDetailLoading(false); } });
    return () => controller.abort();
  }, [selectedId, detailReload]);
  function refreshList() { setLoading(true); setReload((n) => n + 1); }
  function open(item: Media) { setSelected(item); setUsage(null); setDetailError(""); setDetailLoading(true); setConflict(false); setConfirmArchive(archiveRequested.current); archiveRequested.current = false; setModelActive(false); }
  function close() { if (mutation.current) { mutation.current.abort(); mutation.current = null; setBusy(false); refreshList(); } setSelected(null); setUsage(null); setModelActive(false); setConfirmArchive(false); }
  function chooseFiles(files: FileList | null) {
    if (busy) return;
    if (files && files.length > 1) { setFile(null); setFilePreview(""); setUploadRights(false); setUploadError("Choose one file at a time."); if (fileInput.current) fileInput.current.value = ""; return; }
    const next = files?.[0] ?? null; setFile(next); setFilePreview(next?.type.startsWith("image/") && allowed(next) ? URL.createObjectURL(next) : ""); setUploadRights(false); setUploadError("");
  }
  async function upload(event: FormEvent) {
    event.preventDefault(); if (!canCreate || !file || !allowed(file) || !uploadAlt.trim() || busy) return;
    const controller = new AbortController(); mutation.current = controller; setBusy(true); setUploadError(""); const body = new FormData(); body.set("file", file); body.set("altText", uploadAlt.trim()); body.set("source", uploadSource.trim()); if (file.name.toLowerCase().endsWith(".glb")) body.set("publicUseAllowed", String(uploadRights));
    try { await request("/api/admin/media", { method: "POST", body, signal: controller.signal }); if (!active.current || controller.signal.aborted) return; setFile(null); setFilePreview(""); setUploadRights(false); setUploadAlt(""); setUploadSource(""); if (fileInput.current) fileInput.current.value = ""; toast.success("Private media uploaded."); setOffset(0); refreshList(); }
    catch (reason) { if (!controller.signal.aborted && active.current) setUploadError(reason instanceof Error ? reason.message : "Upload failed."); }
    finally { if (mutation.current === controller) mutation.current = null; if (!controller.signal.aborted && active.current) setBusy(false); }
  }
  async function change(action: "save" | "publish" | "unpublish" | "archive") {
    if (!selected || !usage || !canUpdate || busy || conflict || detailLoading || (action === "publish" || action === "unpublish") && !canPublish) return;
    const controller = new AbortController(); mutation.current = controller; setBusy(true); setDetailError("");
    try {
      if (action === "archive") await request(`/api/admin/media/${encodeURIComponent(selected.id)}/archive`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ expectedVersion: selected.version }), signal: controller.signal });
      else await request(`/api/admin/media/${encodeURIComponent(selected.id)}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ expectedVersion: selected.version, altText: alt.trim(), source: source.trim(), published: action === "publish" ? true : action === "unpublish" ? false : selected.published, ...(selected.mimeType === "model/gltf-binary" ? { publicUseAllowed: rights } : {}) }), signal: controller.signal });
      if (!active.current || controller.signal.aborted) return;
      toast.success(action === "archive" ? "Media archived." : action === "save" ? "Metadata saved." : action === "publish" ? "Media published." : "Media unpublished."); setConfirmArchive(false); if (action === "archive") { setResult((current) => current ? { ...current, items: current.items.filter((item) => item.id !== selected.id) } : current); close(); } refreshList(); if (action !== "archive") { setDetailLoading(true); setDetailReload((n) => n + 1); }
    } catch (reason) { if (!controller.signal.aborted && active.current) { if ((reason as Problem).status === 409) setConflict(true); setDetailError(reason instanceof Error ? reason.message : "Media could not be updated."); } }
    finally { if (mutation.current === controller) mutation.current = null; if (!controller.signal.aborted && active.current) setBusy(false); }
  }
  async function copy(item: Media) { try { await navigator.clipboard.writeText(`${window.location.origin}/api/media/${encodeURIComponent(item.id)}`); toast.success("Public URL copied."); } catch { toast.error("Could not copy the public URL."); } }
  if (!canRead) return <AdminAccessDeniedScreen title="Media library" />;
  const stats = result?.stats;
  return <div className={ui.screen} ref={setPortal}>
    <div className={ui.pageHeading}><div><h1>Media library</h1><p className={ui.lede}>Manage images, documents and 3D models used across your site.</p></div>{canCreate && <button type="button" className={ui.primaryButton} aria-expanded={uploadOpen} aria-controls="media-upload-panel" disabled={busy} onClick={() => setUploadOpen((open) => !open)}><Upload size={16} aria-hidden="true" /> Upload media</button>}</div>
    <div className={css.stats}>{[["Total files", stats?.total], ["Images", stats?.images], ["Documents", stats?.documents], ["3D models", stats?.models], ["Published", stats?.published], ["Private", stats?.private]].map(([name, count]) => <div className={css.stat} key={name}><span>{name}</span><strong>{count ?? "—"}</strong></div>)}</div>
    {canCreate && <section id="media-upload-panel" className={ui.panel} hidden={!uploadOpen}><div className={ui.sectionHeading}><div><h2>Upload media</h2><p>New uploads are private. Images and GLB: 4 MiB; PDF: 2 MiB; DOCX: 4 MiB; SVG: 256 KiB. Files are validated before use.</p></div></div><form className={css.upload} onSubmit={upload}>
      <div className={`${css.drop} ${dragActive ? css.dragActive : ""}`} onDragEnter={(event) => { event.preventDefault(); if (!busy) setDragActive(true); }} onDragOver={(event) => { event.preventDefault(); if (!busy) setDragActive(true); }} onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragActive(false); }} onDrop={(event) => { event.preventDefault(); setDragActive(false); chooseFiles(event.dataTransfer.files); }}>{filePreview ? <Image className={css.uploadPreview} src={filePreview} alt="" width={112} height={80} unoptimized /> : <Upload aria-hidden="true" size={22} />}<p>Drop a file here or choose one from your device</p><label className={ui.secondaryButton}>Choose file<input ref={fileInput} className={ui.visuallyHidden} type="file" multiple disabled={busy} accept="image/png,image/jpeg,image/webp,image/svg+xml,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,model/gltf-binary,.glb,.docx" onChange={(event) => chooseFiles(event.target.files)} /></label><span>{file?.name || "No file selected"}</span></div>
      {file && !allowed(file) && <p className={ui.inlineError} role="alert">This file type or size is not supported.</p>}
      <label className={ui.field}><span className={ui.fieldLabel}>Alt text</span><input className={ui.input} value={uploadAlt} onChange={(event) => setUploadAlt(event.target.value)} maxLength={300} required disabled={busy} /></label><label className={ui.field}><span className={ui.fieldLabel}>Source / rights note</span><input className={ui.input} value={uploadSource} onChange={(event) => setUploadSource(event.target.value)} maxLength={500} disabled={busy} /></label>
      {file?.name.toLowerCase().endsWith(".glb") && <label className={ui.inlineCheck}><input type="checkbox" checked={uploadRights} disabled={!canPublish || busy} onChange={(event) => setUploadRights(event.target.checked)} /> Redistribution permission confirmed</label>}
      {uploadError && <AdminNotice key={uploadError} tone="error" onDismiss={() => setUploadError("")}>{uploadError}</AdminNotice>}<button className={ui.primaryButton} type="submit" disabled={busy || !allowed(file) || !uploadAlt.trim()}>{busy ? "Uploading…" : "Upload private asset"}</button>
    </form></section>}
    <section className={ui.panel}><div className={ui.sectionHeading}><div><h2>Files</h2><p>{stats ? `${size(stats.totalBytes)} stored across ${stats.total} assets` : "Browse your library."}</p></div></div>
      <form className={css.filters} role="search" onSubmit={(event) => { event.preventDefault(); setLoading(true); setOffset(0); setSearch(query.trim()); setReload((n) => n + 1); }}><label><span className={ui.visuallyHidden}>Search media</span><input className={ui.input} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search filename or alt text" /></label><button className={ui.secondaryButton}>Search</button><label><span className={ui.visuallyHidden}>File type</span><select className={ui.input} value={type} onChange={(event) => { setLoading(true); setOffset(0); setType(event.target.value); }}><option value="all">All types</option><option value="image">Images</option><option value="document">Documents</option><option value="model">3D models</option></select></label><label><span className={ui.visuallyHidden}>Visibility</span><select className={ui.input} value={status} onChange={(event) => { setLoading(true); setOffset(0); setStatus(event.target.value); }}><option value="all">All visibility</option><option value="private">Private</option><option value="published">Published</option></select></label><label><span className={ui.visuallyHidden}>Sort</span><select className={ui.input} value={sort} onChange={(event) => { setLoading(true); setOffset(0); setSort(event.target.value); }}><option value="newest">Newest</option><option value="oldest">Oldest</option><option value="name">Name</option></select></label></form>
      {error && <AdminNotice key={error + reload} tone="error" actions={<button type="button" className={ui.secondaryButton} onClick={refreshList}>Retry</button>}>{error}</AdminNotice>}
      <div className={`${ui.tableFrame} ${css.tableFrame}`} role="region" aria-label="Media files" tabIndex={0}><table className={`${ui.table} ${css.table}`}><thead><tr><th scope="col">File</th><th scope="col">Type</th><th scope="col">Size</th><th scope="col">Visibility</th><th scope="col">Updated</th><th scope="col">Action</th></tr></thead><tbody>
      {loading && !result ? <tr><td colSpan={6} className={ui.tableMessage}>Loading media…</td></tr> : error ? <tr><td colSpan={6} className={ui.tableMessage}>Media could not be loaded.</td></tr> : !result?.items.length ? <tr><td colSpan={6} className={ui.tableMessage}>No media matches these filters.</td></tr> : result.items.map((item) => <tr key={item.id}><td><div className={css.file}><span className={css.thumb}>{item.mimeType.startsWith("image/") ? <Image src={`${item.url}?w=96`} alt="" width={80} height={64} unoptimized /> : item.mimeType === "model/gltf-binary" ? <Box size={21} aria-hidden="true" /> : <FileText size={21} aria-hidden="true" />}</span><span><strong>{item.filename}</strong><small>{item.altText || "No alt text"}</small></span></div></td><td>{typeLabel(item.mimeType)}</td><td>{size(item.byteSize)}</td><td><span className={ui.statusPill}>{item.published ? "Published" : "Private"}</span></td><td>{date(item.updatedAt)}</td><td>
        <MorphingDialog onOpenChange={(isOpen) => { if (isOpen) open(item); else close(); }}><MorphingDialogCard className={css.source}><MorphingDialogTrigger className={css.iconButton} disabled={busy} aria-label={`View ${item.filename}`} title="View" onClick={() => { archiveRequested.current = false; }}><Eye size={17} aria-hidden="true" /></MorphingDialogTrigger>{canUpdate && <MorphingDialogTrigger className={`${css.iconButton} ${css.archiveIcon}`} disabled={busy} aria-label={`Review archive for ${item.filename}`} title="Review archive" onClick={() => { archiveRequested.current = true; }}><Trash2 size={17} aria-hidden="true" /></MorphingDialogTrigger>}</MorphingDialogCard><MorphingDialogContainer container={portal}>{selected?.id === item.id && <MorphingDialogContent className={css.dialog}><header className={css.dialogHeader}><div><MorphingDialogTitle expanded>{selected.filename}</MorphingDialogTitle><p>{typeLabel(selected.mimeType)} · {size(selected.byteSize)}</p></div><MorphingDialogClose className={css.close} disabled={busy} aria-label="Close media details"><X size={20} /></MorphingDialogClose></header><MorphingDialogDescription className={ui.visuallyHidden}>Review media, usage and publication controls.</MorphingDialogDescription>
          {detailLoading ? <p role="status">Loading details…</p> : <><div className={[css.preview, selected.mimeType === "model/gltf-binary" ? css.modelPreview : ""].join(" ")}>{selected.mimeType.startsWith("image/") ? <Image src={`${selected.url}?w=960`} alt={selected.altText || "Media preview"} width={selected.width || 600} height={selected.height || 400} unoptimized /> : selected.mimeType === "model/gltf-binary" ? modelActive ? <ModelEngine src={`/api/media/${encodeURIComponent(selected.id)}`} alt={selected.altText} compact={false} onClose={() => setModelActive(false)} /> : <button type="button" className={ui.secondaryButton} onClick={() => setModelActive(true)}>Preview 3D model</button> : <div><FileText size={28} aria-hidden="true" /><p>{typeLabel(selected.mimeType)}</p><a href={selected.url} target="_blank" rel="noreferrer">Open file</a></div>}</div>
          <dl className={css.metadata}><div><dt>Uploaded</dt><dd>{date(selected.createdAt)}</dd></div><div><dt>Updated</dt><dd>{date(selected.updatedAt)}</dd></div><div><dt>File type</dt><dd>{selected.mimeType}</dd></div><div><dt>Size</dt><dd>{size(selected.byteSize)}</dd></div>{selected.width && selected.height && <div><dt>Dimensions</dt><dd>{selected.width} × {selected.height}</dd></div>}{selected.triangles !== null && <div><dt>Triangles</dt><dd>{selected.triangles.toLocaleString()}</dd></div>}<div><dt>Visibility</dt><dd>{selected.published ? "Published" : "Private"}</dd></div></dl>
          <label className={ui.field}><span className={ui.fieldLabel}>Alt text</span><input className={ui.input} value={alt} onChange={(event) => setAlt(event.target.value)} maxLength={300} disabled={!canUpdate || busy} /></label><label className={ui.field}><span className={ui.fieldLabel}>Source / rights note</span><textarea className={ui.textarea} value={source} onChange={(event) => setSource(event.target.value)} maxLength={500} disabled={!canUpdate || busy} /></label>
          {selected.mimeType === "model/gltf-binary" && <label className={ui.inlineCheck}><input type="checkbox" checked={rights} disabled={!canPublish || busy} onChange={(event) => setRights(event.target.checked)} /> Redistribution permission confirmed</label>}
          <section className={css.usage}><h3>Attached records</h3><p>Includes current and historical references. Referenced assets cannot be archived.</p>{usage ? usage.items.length ? <ul>{usage.items.map((record, index) => <li key={`${record.kind}-${record.slug}-${index}`}>{record.url ? <a href={record.url}>{record.title}</a> : record.title} {record.kind && <span>· {record.kind}</span>} {record.status && <span>· {record.status}</span>}</li>)}</ul> : <p>{selected.referenced ? "This asset is used in content or saved revisions, including sections you may not be able to access." : "No references recorded."}</p> : <p>References unavailable.</p>}{usage?.truncated && <p>Showing {usage.items.length} of {usage.total} references.</p>}</section>
          {detailError && <AdminNotice key={detailError + detailReload} tone="error" actions={<button className={ui.secondaryButton} type="button" onClick={() => { setDetailLoading(true); setDetailReload((n) => n + 1); }}>Reload details</button>}>{detailError}</AdminNotice>}
          <div className={css.actions}>{selected.published && !selected.archived && (selected.mimeType !== "model/gltf-binary" || selected.publicUseAllowed) && <button className={ui.secondaryButton} type="button" onClick={() => void copy(selected)}><Copy size={16} aria-hidden="true" /> Copy public URL</button>}{canUpdate && <><button className={ui.secondaryButton} type="button" disabled={busy || conflict || !usage || !alt.trim()} onClick={() => void change("save")}>Save metadata</button>{canPublish && <button className={ui.primaryButton} type="button" disabled={busy || conflict || !usage || !alt.trim() || (!selected.published && selected.mimeType === "model/gltf-binary" && !rights)} onClick={() => void change(selected.published ? "unpublish" : "publish")}>{selected.published ? "Unpublish" : "Publish"}</button>}<button className={ui.dangerButton} type="button" disabled={busy || conflict || !usage || selected.referenced || Boolean(usage?.total)} onClick={() => setConfirmArchive(true)}>Archive</button></>}</div>
          {confirmArchive && <div className={css.warning} role="group" aria-label="Confirm archive"><p>Archive <strong>{selected.filename}</strong>? It will be removed from active use and public delivery. The file and history are retained. Assets with references cannot be archived; review their usage above.</p><div className={css.actions}><button className={ui.secondaryButton} type="button" onClick={() => setConfirmArchive(false)} disabled={busy}>Cancel</button><button className={ui.dangerButton} type="button" disabled={busy || conflict || !usage || selected.referenced || Boolean(usage?.total)} onClick={() => void change("archive")}>Confirm archive</button></div></div>}
          </>}
        </MorphingDialogContent>}</MorphingDialogContainer></MorphingDialog>
      </td></tr>)}
      </tbody></table></div><div className={ui.pagination}><span>{result?.total ? `${offset + 1}–${Math.min(offset + result.items.length, result.total)} of ${result.total}` : ""}</span><div><button className={ui.secondaryButton} type="button" disabled={loading || offset === 0} onClick={() => { setLoading(true); setOffset(Math.max(0, offset - 20)); }}>Previous</button><button className={ui.secondaryButton} type="button" disabled={loading || !result || offset + 20 >= result.total} onClick={() => { setLoading(true); setOffset(offset + 20); }}>Next</button></div></div>
    </section>
  </div>;
}
