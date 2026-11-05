"use client";

import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import Image from "next/image";
import { parseDiagnosticInput, type DiagnosticChip, type DiagnosticInput } from "../diagnostics/contracts";
import { createSelectionGuard, updateMatchingAsset } from "./diagnostic-selection";
import styles from "./diagnostic-form.module.css";

type Attachment = { file: File; preview: string; assetId: string; threadId: string | null; state: "local" | "ready" | "unknown" | "expired"; expiresAt?: string };
type Props = { disabled: boolean; threadId: string | null; ensureThread: (signal?: AbortSignal) => Promise<string>; onSubmit: (input: DiagnosticInput) => Promise<void>; onTransferStateChange: (active: boolean) => void; onClose: () => void };

export function DiagnosticForm({ disabled, threadId, ensureThread, onSubmit, onTransferStateChange, onClose }: Props) {
  const [errorText, setErrorText] = useState("");
  const [chip, setChip] = useState<DiagnosticChip>("esp32");
  const [attachment, setAttachment] = useState<Attachment | null>(null);
  const [consent, setConsent] = useState(false);
  const [withoutImage, setWithoutImage] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const op = useRef(false), selection = useRef(createSelectionGuard()), preview = useRef<string | null>(null), mounted = useRef(true);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => { const selectionRef = selection.current; mounted.current = true; return () => { mounted.current = false; selectionRef.invalidate(); controller.current?.abort(); if (preview.current) URL.revokeObjectURL(preview.current); }; }, []);
  useEffect(() => {
    if (!attachment?.expiresAt || attachment.state === "expired") return;
    const remaining = Date.parse(attachment.expiresAt) - Date.now();
    const timer = window.setTimeout(() => { setAttachment(previous => previous?.assetId === attachment.assetId ? { ...previous, state: "expired" } : previous); setNotice("The screenshot has expired. Continue without it or remove it."); }, Math.max(0, remaining));
    return () => window.clearTimeout(timer);
  }, [attachment]);
  const busyNow = disabled || busy;
  async function choose(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]; event.target.value = "";
    if (!file || busyNow || op.current || attachment?.threadId) return;
    const ticket = selection.current.begin();
    if (!['image/png', 'image/jpeg'].includes(file.type) || !file.size || file.size > 2097152) { setNotice("Choose one PNG or JPEG no larger than 2 MiB."); return; }
    try {
      const bitmap = await createImageBitmap(file);
      const valid = bitmap.width > 0 && bitmap.height > 0 && bitmap.width <= 2048 && bitmap.height <= 2048 && bitmap.width * bitmap.height <= 4194304;
      bitmap.close();
      if (!mounted.current || !selection.current.current(ticket)) return;
      if (!valid) { setNotice("The image must be at most 2048 pixels per side and 4 megapixels."); return; }
      if (preview.current) URL.revokeObjectURL(preview.current);
      const url = URL.createObjectURL(file); preview.current = url;
      setAttachment({ file, preview: url, assetId: crypto.randomUUID(), threadId: null, state: "local" }); setConsent(false); setWithoutImage(false); setNotice("");
    } catch { if (mounted.current && selection.current.current(ticket)) setNotice("This image could not be opened. Paste the error to continue."); }
  }
  async function transfer(action: "upload" | "status" | "delete") {
    if (!attachment || op.current || disabled || (action === "upload" && (!consent || attachment.state !== "local"))) return;
    selection.current.invalidate(); op.current = true; setBusy(true); onTransferStateChange(true);
    const abort = new AbortController(); controller.current = abort;
    const timeout = window.setTimeout(() => abort.abort(), 35000);
    let onAbort: (() => void) | undefined;
    const interrupted = new Promise<never>((_, reject) => { onAbort = () => reject(new Error("interrupted")); abort.signal.addEventListener("abort", onAbort, { once: true }); });
    try {
      const id = attachment.threadId ?? (action === "upload" ? await Promise.race([ensureThread(abort.signal), interrupted]) : null);
      if (!id || abort.signal.aborted) throw new Error("unavailable");
      if (action === "upload") setAttachment(previous => updateMatchingAsset(previous, attachment.assetId, item => ({ ...item, threadId: id, state: "unknown" })));
      const base = `/api/panda-agent/chats/${encodeURIComponent(id)}/screenshots`;
      let response: Response;
      if (action === "upload") {
        const form = new FormData(); form.set("file", attachment.file); form.set("assetId", attachment.assetId); form.set("consent", "private-diagnostic-v1");
        response = await Promise.race([fetch(base, { method: "POST", body: form, cache: "no-store", signal: abort.signal }), interrupted]);
      } else response = await Promise.race([fetch(`${base}/${encodeURIComponent(attachment.assetId)}${action === "status" ? "?status=1" : ""}`, { method: action === "status" ? "GET" : "DELETE", cache: "no-store", signal: abort.signal }), interrupted]);
      if (!mounted.current) return;
      if (action === "delete" && response.ok) {
        if (preview.current) URL.revokeObjectURL(preview.current); preview.current = null; setAttachment(previous => updateMatchingAsset(previous, attachment.assetId, () => null)); setConsent(false);
        setNotice(response.status === 202 ? "Screenshot removed; cleanup is pending." : "Screenshot removed."); return;
      }
      if (response.status === 410) { setNotice("The screenshot is no longer available. Remove it or paste the error to continue."); setAttachment(previous => updateMatchingAsset(previous, attachment.assetId, item => ({ ...item, state: "expired" }))); return; }
      if (!response.ok) throw new Error("unconfirmed");
      const value: unknown = await Promise.race([response.json(), interrupted]);
      const image = value && typeof value === "object" && "image" in value ? (value as { image?: { id?: unknown; state?: unknown; expiresAt?: unknown } }).image : undefined;
      if (!image || image.id !== attachment.assetId || typeof image.expiresAt !== "string" || !Number.isFinite(Date.parse(image.expiresAt)) || typeof image.state !== "string" || !["ready", "unknown", "reserved"].includes(image.state)) throw new Error("unconfirmed");
      setAttachment(previous => updateMatchingAsset(previous, attachment.assetId, item => ({ ...item, threadId: id, state: image.state === "ready" ? "ready" : "unknown", expiresAt: image.expiresAt as string })));
      setNotice(image.state === "ready" ? "Screenshot stored temporarily. It has not been interpreted." : "Upload is unconfirmed. Check status; do not upload it again.");
    } catch {
      if (mounted.current) setNotice(action === "delete" ? "Removal could not be confirmed. Check status or retry removal." : "Upload could not be confirmed. Check status or remove the screenshot; your draft is preserved.");
    } finally { window.clearTimeout(timeout); if (onAbort) abort.signal.removeEventListener("abort", onAbort); op.current = false; controller.current = null; if (mounted.current) setBusy(false); onTransferStateChange(false); }
  }
  async function remove() {
    if (!attachment || op.current || disabled) return;
    if (attachment.threadId) { await transfer("delete"); return; }
    selection.current.invalidate(); if (preview.current) URL.revokeObjectURL(preview.current); preview.current = null; setAttachment(previous => updateMatchingAsset(previous, attachment.assetId, () => null)); setConsent(false); setNotice("");
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busyNow || op.current || (attachment && !withoutImage && (attachment.state !== "ready" || attachment.threadId !== threadId))) { setNotice("Finish or remove the screenshot, or continue without it."); return; }
    const input = parseDiagnosticInput({ errorText, chip, framework: "esp-idf", frameworkVersion: "5.5.1", ...(attachment && !withoutImage ? { screenshotId: attachment.assetId } : {}) });
    if (!input) { setNotice("Enter a valid error message of up to 1,500 characters."); return; }
    op.current = true; setBusy(true);
    try { await onSubmit(input); } catch { if (mounted.current) setNotice("The diagnostic could not be confirmed. Your draft is preserved."); }
    finally { op.current = false; if (mounted.current) setBusy(false); }
  }
  return <form className={styles.form} onSubmit={submit} aria-labelledby="diagnostic-title">
    <div className={styles.heading}><div><h2 id="diagnostic-title">Diagnose error</h2><p>Automatic image reading is unavailable. Paste the error to continue.</p></div><button type="button" disabled={busyNow} onClick={onClose}>Close</button></div>
    <label>Error text<textarea required maxLength={1500} value={errorText} disabled={busyNow} onChange={event => setErrorText(event.target.value)} aria-describedby="diagnostic-notice" /></label>
    <label>Chip<select value={chip} disabled={busyNow} onChange={event => setChip(event.target.value as DiagnosticChip)}><option value="esp32">ESP32</option><option value="esp32c3">ESP32-C3</option><option value="esp32c6">ESP32-C6</option><option value="esp32s3">ESP32-S3</option></select></label>
    <p>Framework: ESP-IDF · pinned version 5.5.1</p>
    <label>Optional screenshot (PNG or JPEG, maximum 2 MiB, 2048 pixels per side and 4 megapixels)<input type="file" accept="image/png,image/jpeg" disabled={busyNow || !!attachment?.threadId} onChange={event => void choose(event)} /></label>
    <p>Destination: private PandaByte/AWS volatile processing cache with InsForge metadata, retained for at most 15 minutes and possibly lost earlier on restart. No external AI receives this image. It is not saved in chat history.</p>
    {attachment && <div className={styles.attachment}><Image unoptimized src={attachment.preview} width={96} height={72} alt="Selected screenshot preview" /><div><p>{attachment.file.name} · {attachment.state === "ready" ? "Stored temporarily" : attachment.state === "unknown" ? "Unconfirmed" : attachment.state === "expired" ? "Expired" : "On this device"}</p>{attachment.expiresAt && <p>Expires {new Date(attachment.expiresAt).toLocaleString()}</p>}<button type="button" disabled={busyNow} onClick={() => void remove()}>Remove screenshot</button>{attachment.state === "unknown" && <button type="button" disabled={busyNow} onClick={() => void transfer("status")}>Check screenshot status</button>}</div></div>}
    {attachment?.state === "local" && <><label className={styles.consent}><input type="checkbox" checked={consent} disabled={busyNow} onChange={event => setConsent(event.target.checked)} /> I consent to temporary private storage as described above.</label><button type="button" disabled={busyNow || !consent} onClick={() => void transfer("upload")}>Store screenshot</button></>}
    {attachment && <label className={styles.consent}><input type="checkbox" checked={withoutImage} disabled={busyNow} onChange={event => setWithoutImage(event.target.checked)} /> Continue with pasted error without this screenshot</label>}
    <p id="diagnostic-notice" role="status">{notice}</p>
    <button type="submit" disabled={busyNow || !!attachment && !withoutImage && attachment.state !== "ready"}>Continue with pasted error</button>
  </form>;
}
