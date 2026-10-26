"use client";

import Image from "next/image";
import { useEffect, useId, useRef, useState, type DragEvent } from "react";
import { toast } from "sonner";
import styles from "./admin-ui.module.css";
import editorStyles from "./category-image-editor.module.css";

const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
const MAX_SVG_BYTES = 256 * 1024;
const MAX_CATEGORY_IMAGES = 100;
const MEDIA_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type UploadResponse = { media?: { id?: string; mimeType?: string } };
type ApiRequest = <T>(url: string, init?: RequestInit) => Promise<T>;

function imageError(file: File) {
  const name = file.name.toLowerCase();
  const isPng = name.endsWith(".png") && file.type === "image/png";
  const isSvg = name.endsWith(".svg") && file.type === "image/svg+xml";
  if (!isPng && !isSvg) return "Choose a PNG or SVG image with a matching file type.";
  if (file.size < 1) return "Choose an image that is not empty.";
  if (isPng && file.size > MAX_IMAGE_BYTES) return "Choose a PNG image that is 4 MB or smaller.";
  if (isSvg && file.size > MAX_SVG_BYTES) return "Choose a simple SVG image that is 256 KiB or smaller.";
  return "";
}

export function CategoryImageEditor({ mediaIds, onChange, request, canManageMedia, onUploadDelta }: {
  mediaIds: string[];
  onChange: (next: string[]) => void;
  request: ApiRequest;
  canManageMedia: boolean;
  onUploadDelta: (change: 1 | -1) => void;
}) {
  const inputId = useId();
  const helpId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const mediaIdsRef = useRef(mediaIds);
  const [file, setFile] = useState<File | null>(null);
  const [altText, setAltText] = useState("");
  const [replaceId, setReplaceId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => { mediaIdsRef.current = mediaIds; }, [mediaIds]);

  function chooseFile(targetId: string | null = null) {
    if (!canManageMedia || uploading) return;
    setError("");
    setFile(null);
    setReplaceId(targetId);
    if (inputRef.current) {
      inputRef.current.value = "";
      inputRef.current.click();
    }
  }

  function selectFile(next: File | undefined, targetId = replaceId) {
    if (!next) return;
    const issue = imageError(next);
    setError(issue);
    if (issue) {
      setFile(null);
      setReplaceId(null);
      return;
    }
    setFile(next);
    setReplaceId(targetId);
  }

  function dropFile(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    if (!canManageMedia || uploading) return;
    selectFile(event.dataTransfer.files[0], mediaIdsRef.current[0] ?? null);
  }

  async function upload() {
    if (!file || !canManageMedia || uploading) return;
    const issue = imageError(file);
    if (issue) { setError(issue); return; }
    if (!altText.trim()) { setError("Add alternative text before uploading the image."); return; }
    const before = mediaIdsRef.current;
    if (replaceId ? !before.includes(replaceId) : before.length >= MAX_CATEGORY_IMAGES) {
      setError(replaceId ? "That category image changed. Choose it again before replacing it." : "The category has 100 images. Replace one to add another.");
      return;
    }

    setError("");
    setUploading(true);
    onUploadDelta(1);
    try {
      const form = new FormData();
      form.set("file", file);
      form.set("altText", altText.trim());
      form.set("source", "");
      const result = await request<UploadResponse>("/api/admin/media", { method: "POST", body: form });
      const uploaded = result?.media;
      if (typeof uploaded?.id !== "string" || !MEDIA_ID_PATTERN.test(uploaded.id) || uploaded.mimeType !== "image/webp") {
        throw new Error("The image upload response was incomplete. Refresh the page before retrying.");
      }

      const latest = mediaIdsRef.current;
      let next: string[];
      if (replaceId) {
        const index = latest.indexOf(replaceId);
        if (index < 0) throw new Error("That category image changed while the replacement uploaded. Review the category and try again.");
        next = [...latest];
        next[index] = uploaded.id;
      } else {
        if (latest.length >= MAX_CATEGORY_IMAGES) throw new Error("The category has 100 images. Remove one before adding another.");
        next = [...latest, uploaded.id];
      }
      onChange(next);
      setFile(null);
      setAltText("");
      setReplaceId(null);
      toast.success(replaceId ? "Category image replaced." : "Category image uploaded.");
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : "The category image could not be uploaded.";
      setError(message);
      toast.error(message);
    } finally {
      setUploading(false);
      onUploadDelta(-1);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return <section className={styles.panel} aria-labelledby="category-images-title" aria-busy={uploading}>
    <div className={styles.sectionHeading}><div><h2 id="category-images-title">Category images</h2><p>The first image is the main category image. Choosing or dropping here replaces only it; other attached images stay as they are.</p><p>PNG up to 4 MB. Simple SVG up to 256 KiB; it is validated and converted to WebP before storage. Embedded resources, styles, and scripts are not supported.</p></div></div>
    <div className={`${editorStyles.dropSurface} ${dragging ? editorStyles.dropActive : ""}`} aria-disabled={!canManageMedia || uploading}
      onDragEnter={(event) => { event.preventDefault(); if (canManageMedia && !uploading) setDragging(true); }}
      onDragOver={(event) => { event.preventDefault(); if (canManageMedia && !uploading) setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={dropFile}>
      <input ref={inputRef} id={inputId} className={editorStyles.hiddenInput} type="file" accept=".png,.svg,image/png,image/svg+xml" aria-label="Category image file" disabled={!canManageMedia || uploading}
        onChange={(event) => selectFile(event.target.files?.[0])} />
      <p className={editorStyles.dropTitle}>{mediaIds.length ? "Drop an image to replace the main category image, or" : "Drop the main category image here, or"}</p>
      <button className={styles.secondaryButton} type="button" disabled={!canManageMedia || uploading} onClick={() => chooseFile(mediaIds[0] ?? null)} aria-describedby={helpId}>{mediaIds.length ? "Replace main image" : "Choose main image"}</button>
      <p id={helpId} className={styles.fieldHint}>Preferred: image with no background.</p>
    </div>
    <p className={styles.fieldHint}>Only published media appears publicly. New uploads stay private until published from Media.</p>
    <button className={styles.secondaryButton} type="button" disabled={!canManageMedia || uploading || mediaIds.length >= MAX_CATEGORY_IMAGES} onClick={() => chooseFile(null)}>Add additional image</button>
    {!canManageMedia && <p className={styles.fieldHint}>Image uploads require the Media manager permission. Existing category images can still be removed.</p>}
    {file && <p className={styles.fieldHint} role="status">Selected: {file.name}{replaceId ? replaceId === mediaIds[0] ? " · this will replace the main category image" : " · this will replace the selected category image" : mediaIds.length ? " · this will be added after the existing images" : " · this will become the main category image"}</p>}
    <label className={styles.field} htmlFor={`${inputId}-alt`}>
      <span className={styles.fieldLabel}>Image alternative text</span>
      <input className={styles.input} id={`${inputId}-alt`} value={altText} maxLength={300} disabled={!canManageMedia || uploading} aria-required={Boolean(file)} onChange={(event) => { setAltText(event.target.value); setError(""); }} />
      <span className={styles.fieldHint}>Required before an image can be uploaded.</span>
    </label>
    <button className={styles.primaryButton} type="button" disabled={!canManageMedia || uploading || !file || !altText.trim()} onClick={() => void upload()}>
      {uploading ? "Uploading image…" : replaceId ? "Upload replacement" : mediaIds.length ? `Add image (${mediaIds.length}/${MAX_CATEGORY_IMAGES})` : "Upload main image"}
    </button>
    {uploading && <p className={styles.fieldHint} role="status">Uploading and preparing image…</p>}
    {error && <p className={styles.inlineError} role="alert">{error}</p>}
    {mediaIds.length > 0 && <div className={editorStyles.imageList} role="list" aria-label="Attached category images">
      {mediaIds.map((id, index) => <div className={editorStyles.imageItem} role="listitem" key={`${id}-${index}`}>
        <Image src={`/api/media/${encodeURIComponent(id)}`} alt="" width={104} height={76} unoptimized />
        <span className={editorStyles.imageLabel}>{index === 0 ? "Main category image" : `Additional category image ${index + 1}`}</span>
        <button className={styles.secondaryButton} type="button" disabled={!canManageMedia || uploading} onClick={() => chooseFile(id)}>Replace</button>
        <button className={styles.secondaryButton} type="button" disabled={uploading} aria-label={`Remove category image ${index + 1} from category`} onClick={() => onChange(mediaIds.filter((_, current) => current !== index))}>Remove</button>
      </div>)}
    </div>}
  </section>;
}
