"use client";

import Image from "next/image";
import { useEffect, useId, useRef, useState, type DragEvent } from "react";
import { toast } from "sonner";
import styles from "./admin-ui.module.css";
import editorStyles from "./category-image-editor.module.css";

type ApiRequest = <T>(url: string, init?: RequestInit) => Promise<T>;
const MEDIA_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function imageError(file: File) {
  const extensions: Record<string, RegExp> = { "image/png": /\.png$/i, "image/jpeg": /\.jpe?g$/i, "image/webp": /\.webp$/i };
  if (!extensions[file.type]?.test(file.name)) return "Choose a PNG, JPEG, or WebP image with a matching file type.";
  if (file.size < 1 || file.size > 4 * 1024 * 1024) return "Choose a non-empty image that is 4 MB or smaller.";
  return "";
}

export function BlogCoverEditor({ mediaIds, onChange, request, canManageMedia, onUploadDelta }: {
  mediaIds: string[];
  onChange: (next: string[]) => void;
  request: ApiRequest;
  canManageMedia: boolean;
  onUploadDelta: (change: 1 | -1) => void;
}) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const mediaIdsRef = useRef(mediaIds);
  const [file, setFile] = useState<File | null>(null);
  const [altText, setAltText] = useState("");
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState("");
  const [preview, setPreview] = useState("");
  useEffect(() => { mediaIdsRef.current = mediaIds; }, [mediaIds]);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  function selectFile(next: File | undefined) {
    if (!next) return;
    const issue = imageError(next);
    setError(issue);
    setFile(issue ? null : next);
    setPreview(issue ? "" : URL.createObjectURL(next));
  }

  function dropFile(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    if (canManageMedia && !uploading) selectFile(event.dataTransfer.files[0]);
  }

  async function upload() {
    if (!file || !canManageMedia || uploading) return;
    const issue = imageError(file);
    if (issue) { setError(issue); return; }
    if (!altText.trim()) { setError("Add alternative text before uploading the image."); return; }
    const previousCover = mediaIdsRef.current[0];
    setError("");
    setUploading(true);
    onUploadDelta(1);
    try {
      const form = new FormData();
      form.set("file", file);
      form.set("altText", altText.trim());
      form.set("source", "");
      const result = await request<{ media?: { id?: string; mimeType?: string } }>("/api/admin/media", { method: "POST", body: form });
      const uploaded = result?.media;
      if (typeof uploaded?.id !== "string" || !MEDIA_ID_PATTERN.test(uploaded.id) || uploaded.mimeType !== "image/webp") throw new Error("The image upload response was incomplete. Refresh the page before retrying.");
      const latest = mediaIdsRef.current;
      if (latest[0] !== previousCover) throw new Error("The cover changed while the image uploaded. Review the article and try again.");
      onChange([uploaded.id, ...latest.slice(previousCover ? 1 : 0)]);
      setFile(null);
      setAltText("");
      toast.success("Article cover uploaded.");
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : "The article cover could not be uploaded.";
      setError(message);
      toast.error(message);
    } finally {
      setUploading(false);
      onUploadDelta(-1);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return <section className={styles.panel} aria-labelledby={`${inputId}-title`} aria-busy={uploading}>
    <div className={styles.sectionHeading}><div><h2 id={`${inputId}-title`}>Article cover</h2><p>The first attached image is the cover. Other attached images remain unchanged. Removing the cover makes the next attached image the cover.</p></div></div>
    <div className={`${editorStyles.dropSurface} ${dragging ? editorStyles.dropActive : ""}`} aria-disabled={!canManageMedia || uploading}
      onDragEnter={(event) => { event.preventDefault(); if (canManageMedia && !uploading) setDragging(true); }}
      onDragOver={(event) => { event.preventDefault(); if (canManageMedia && !uploading) setDragging(true); }}
      onDragLeave={() => setDragging(false)} onDrop={dropFile}>
      <input ref={inputRef} id={inputId} className={editorStyles.hiddenInput} type="file" accept=".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp" aria-label="Article cover file" disabled={!canManageMedia || uploading} onChange={(event) => selectFile(event.target.files?.[0])} />
      <p className={editorStyles.dropTitle}>Drop an image here, or</p>
      <button className={styles.secondaryButton} type="button" disabled={!canManageMedia || uploading} onClick={() => { if (inputRef.current) { inputRef.current.value = ""; inputRef.current.click(); } }}>{mediaIds.length ? "Choose replacement" : "Choose cover"}</button>
      <p className={styles.fieldHint}>PNG, JPEG or WebP, up to 4 MB.</p>
    </div>
    <p className={styles.fieldHint}>New uploads stay private until published from Media.</p>
    {!canManageMedia && <p className={styles.fieldHint}>Image uploads require the Media manager permission. The cover can still be removed.</p>}
    {file && <div className={editorStyles.imageList}><p className={styles.fieldHint} role="status">Selected: {file.name}</p>{preview && <div className={editorStyles.imageItem}><Image src={preview} alt="Selected cover preview" width={104} height={76} unoptimized /><span className={editorStyles.imageLabel}>Selected cover preview</span></div>}</div>}
    <label className={styles.field} htmlFor={`${inputId}-alt`}><span className={styles.fieldLabel}>Image alternative text</span>
      <input className={styles.input} id={`${inputId}-alt`} value={altText} maxLength={300} disabled={!canManageMedia || uploading} aria-required={Boolean(file)} onChange={(event) => { setAltText(event.target.value); setError(""); }} />
      <span className={styles.fieldHint}>Required before uploading.</span>
    </label>
    <button className={styles.primaryButton} type="button" disabled={!canManageMedia || uploading || !file || !altText.trim()} onClick={() => void upload()}>{uploading ? "Uploading image…" : "Upload cover"}</button>
    {uploading && <p className={styles.fieldHint} role="status">Uploading and preparing image…</p>}
    {error && <p className={styles.inlineError} role="alert">{error}</p>}
    {mediaIds[0] && <div className={editorStyles.imageList}><div className={editorStyles.imageItem}>
      <Image src={`/api/media/${encodeURIComponent(mediaIds[0])}`} alt="" width={104} height={76} unoptimized />
      <span className={editorStyles.imageLabel}>Current article cover</span>
      <button className={styles.secondaryButton} type="button" disabled={uploading} onClick={() => onChange(mediaIds.slice(1))}>Remove cover</button>
    </div></div>}
  </section>;
}



