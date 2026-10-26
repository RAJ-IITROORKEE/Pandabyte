"use client";

import { useId, useRef, useState } from "react";
import { toast } from "sonner";
import { ProductDocumentPreview } from "@/components/catalog/product-document-preview";
import styles from "./admin-ui.module.css";
import editorStyles from "./product-document-editor.module.css";

const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const MAX_DOCX_BYTES = 4 * 1024 * 1024;

type UploadResponse = { media?: { id?: string; mimeType?: string } };
type ApiProblem = { error?: { message?: string } };

async function uploadProductDocument(file: File) {
  const form = new FormData();
  form.append("file", file);
  form.append("altText", file.name.slice(0, 300));
  form.append("source", "");
  const response = await fetch("/api/admin/media", { method: "POST", cache: "no-store", body: form });
  const body = await response.json().catch(() => null) as UploadResponse | ApiProblem | null;
  if (!response.ok) {
    const message = body && typeof body === "object" && "error" in body ? body.error?.message : undefined;
    throw new Error(message || "The Word document could not be uploaded. Try again.");
  }
  const media = body && typeof body === "object" && "media" in body ? body.media : undefined;
  if (typeof media?.id !== "string" || media.mimeType !== DOCX_MIME) throw new Error("The Word document upload response was incomplete. Refresh the page before retrying.");
  return media.id;
}

export function ProductDocumentEditor({ value, onChange, canManageMedia, onUploadDelta }: {
  value?: string;
  onChange: (next?: string) => void;
  canManageMedia: boolean;
  onUploadDelta: (change: 1 | -1) => void;
}) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");

  async function upload(file: File) {
    if (!file.name.toLowerCase().endsWith(".docx") || (file.type && file.type !== DOCX_MIME)) {
      setError("Choose a DOCX Word document.");
      return;
    }
    if (file.size < 1 || file.size > MAX_DOCX_BYTES) {
      setError("Choose a DOCX file that is 4 MB or smaller.");
      return;
    }
    setError("");
    setUploading(true);
    onUploadDelta(1);
    try {
      onChange(await uploadProductDocument(file));
      toast.success("Word document uploaded.");
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : "The Word document could not be uploaded.";
      setError(message);
      toast.error(message);
    } finally {
      setUploading(false);
      onUploadDelta(-1);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return <section className={styles.panel} aria-label="Product Word document">
    <div className={styles.sectionHeading}><div><h2>Word document</h2><p>Attach an optional DOCX for a separate layout preview alongside the product description.</p></div></div>
    {value ? <div className={editorStyles.documentAttachment}>
      <p className={styles.fieldHint}>A Word document is attached. Publication follows the media and product controls.</p>
      <ProductDocumentPreview mediaId={value} />
      <button className={styles.secondaryButton} disabled={uploading} onClick={() => onChange(undefined)} type="button">Remove document from product</button>
    </div> : <div className={styles.field}>
      <label htmlFor={inputId}><span className={styles.fieldLabel}>Upload DOCX, up to 4 MB</span></label>
      <input accept={`.docx,${DOCX_MIME}`} aria-label="Product DOCX file" className={styles.input} disabled={!canManageMedia || uploading} id={inputId} onChange={(event) => { const file = event.target.files?.[0]; if (file) void upload(file); }} ref={inputRef} type="file" />
      {!canManageMedia && <p className={styles.fieldHint}>DOCX uploads require the Media manager permission.</p>}
    </div>}
    {uploading && <p role="status" className={styles.fieldHint}>Uploading Word document…</p>}
    {error && <p className={styles.inlineError} role="alert">{error}</p>}
  </section>;
}
