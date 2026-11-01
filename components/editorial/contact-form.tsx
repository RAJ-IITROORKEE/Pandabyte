"use client";

import { useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { Paperclip, Send, X } from "lucide-react";
import { buttonClassName } from "@/components/ui/button";
import styles from "./editorial.module.css";

type FormState = { kind: "idle" | "sending" | "success" | "error"; message: string };
const RECEIPT_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_ATTACHMENT_COUNT = 3;
const MAX_ATTACHMENT_BYTES = 1024 * 1024;
const attachmentTypes: Record<string, string[]> = {
  pdf: ["application/pdf"],
  jpg: ["image/jpeg"],
  jpeg: ["image/jpeg"],
  png: ["image/png"],
  webp: ["image/webp"],
};
const countryCallingCodes = [
  ["India", "+91"], ["United States / Canada", "+1"], ["United Kingdom", "+44"],
  ["Australia", "+61"], ["New Zealand", "+64"], ["Singapore", "+65"], ["United Arab Emirates", "+971"],
  ["Germany", "+49"], ["France", "+33"], ["Italy", "+39"], ["Spain", "+34"], ["Netherlands", "+31"],
  ["Ireland", "+353"], ["Japan", "+81"], ["South Korea", "+82"], ["China", "+86"], ["Malaysia", "+60"],
  ["Thailand", "+66"], ["Indonesia", "+62"], ["Philippines", "+63"], ["Bangladesh", "+880"], ["Nepal", "+977"],
  ["Sri Lanka", "+94"], ["Pakistan", "+92"], ["Saudi Arabia", "+966"], ["Brazil", "+55"], ["South Africa", "+27"],
  ["Mexico", "+52"], ["Sweden", "+46"], ["Switzerland", "+41"], ["Poland", "+48"], ["Turkey", "+90"], ["Egypt", "+20"],
] as const;

function inquiryReceipt(value: unknown): string | null {
  if (!value || typeof value !== "object" || Array.isArray(value) || !("receipt" in value) ||
    typeof value.receipt !== "string" || !RECEIPT_ID.test(value.receipt)) return null;
  return value.receipt;
}

function formatPhoneNumber(value: string, callingCode: string) {
  const nationalLimit = 15 - callingCode.replace(/\D/g, "").length;
  const digits = value.replace(/\D/g, "").slice(0, nationalLimit);
  const groupSize = callingCode === "+91" ? 5 : 3;
  return digits.replace(new RegExp(`(.{${groupSize}})(?=.)`, "g"), "$1 ");
}

function attachmentError(file: File) {
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  const supportedTypes = attachmentTypes[extension];
  if (!/^[a-zA-Z0-9][a-zA-Z0-9 _.-]{0,115}\.(pdf|jpe?g|png|webp)$/i.test(file.name)) {
    return "Use a filename with letters, numbers, spaces, periods, underscores or hyphens.";
  }
  if (!supportedTypes || !supportedTypes.includes(file.type.toLowerCase())) {
    return "Choose PDF, JPG, PNG or WebP files only.";
  }
  if (file.size < 1) return "Choose a non-empty file.";
  if (file.size > MAX_ATTACHMENT_BYTES) return "Each attachment must be 1 MB or smaller.";
  return null;
}

function formatFileSize(bytes: number) {
  if (bytes >= MAX_ATTACHMENT_BYTES) return "1 MB";
  return bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(0)} KB`;
}

export function ContactForm() {
  const requestId = useRef<string | null>(null);
  const phoneInput = useRef<HTMLInputElement | null>(null);
  const [callingCode, setCallingCode] = useState("+91");
  const [attachments, setAttachments] = useState<File[]>([]);
  const [state, setState] = useState<FormState>({ kind: "idle", message: "" });

  function resetRequestId() {
    requestId.current = null;
    setState((current) => current.kind === "sending" ? current : { kind: "idle", message: "" });
  }

  function changePhone(event: ChangeEvent<HTMLInputElement>) {
    event.currentTarget.value = formatPhoneNumber(event.currentTarget.value, callingCode);
    event.currentTarget.setCustomValidity("");
  }

  function changeCallingCode(event: ChangeEvent<HTMLSelectElement>) {
    const nextCode = event.currentTarget.value;
    setCallingCode(nextCode);
    if (phoneInput.current) { phoneInput.current.value = formatPhoneNumber(phoneInput.current.value, nextCode); phoneInput.current.setCustomValidity(""); }
  }

  function addAttachments(event: ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(event.currentTarget.files ?? []);
    event.currentTarget.value = "";
    event.stopPropagation();
    requestId.current = null;
    if (!selected.length) return;

    const next = [...attachments];
    const errors: string[] = [];
    for (const file of selected) {
      const invalid = attachmentError(file);
      if (invalid) { errors.push(invalid); continue; }
      if (next.length >= MAX_ATTACHMENT_COUNT) { errors.push("You can attach up to 3 files."); continue; }
      next.push(file);
    }
    setAttachments(next);
    setState(errors.length
      ? { kind: "error", message: [...new Set(errors)].join(" ") }
      : { kind: "idle", message: "" });
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const digits = phoneInput.current?.value.replace(/\D/g, "") ?? "";
    const phoneInvalid = digits.length > 0 && (callingCode === "+91" ? digits.length !== 10 : digits.length < 6);
    if (phoneInvalid && phoneInput.current) {
      phoneInput.current.setCustomValidity(callingCode === "+91" ? "Enter a 10-digit Indian phone number." : "Enter at least 6 digits for the phone number.");
      phoneInput.current.reportValidity();
      return;
    }
    const formData = new FormData(form);
    requestId.current ??= crypto.randomUUID();
    const phone = String(formData.get("phone") || "").trim()
      ? `${callingCode} ${String(formData.get("phone")).trim()}` : "";
    setState({ kind: "sending", message: "Sending your message…" });
    try {
      let body: BodyInit;
      let headers: HeadersInit | undefined;
      if (attachments.length) {
        formData.set("phone", phone);
        formData.set("idempotencyKey", requestId.current);
        for (const file of attachments) formData.append("attachments", file, file.name);
        body = formData;
      } else {
        headers = { "Content-Type": "application/json" };
        body = JSON.stringify({
          name: formData.get("name"),
          email: formData.get("email"),
          phone,
          subject: formData.get("subject"),
          message: formData.get("message"),
          idempotencyKey: requestId.current,
        });
      }
      const response = await fetch("/api/contact", {
        method: "POST",
        signal: AbortSignal.timeout(30_000),
        headers,
        body,
      });
      if (response.ok) {
        const receipt = inquiryReceipt(await response.json());
        if (!receipt) {
          setState({ kind: "error", message: "We could not confirm that your message was saved. Retry safely to check its status." });
          return;
        }
        form.reset();
        setAttachments([]);
        requestId.current = null;
        setState({ kind: "success", message: "Your message was saved for the team to review." });
        return;
      }
      const message = response.status === 400 || response.status === 413
        ? "Review the fields and attachment limits, then try again."
        : response.status === 429 ? "Too many messages were submitted. Wait a moment, then retry."
          : "We could not save your message. Your details and attachments remain available so you can retry safely.";
      setState({ kind: "error", message });
    } catch {
      setState({ kind: "error", message: "We could not confirm that your message was saved. Your details and attachments remain available so you can retry safely." });
    }
  }

  const sending = state.kind === "sending";
  return <form className={styles.form} onSubmit={submit} onChange={resetRequestId} aria-busy={sending}>
    <div className={styles.formRow}>
      <label htmlFor="contact-name">Name<input id="contact-name" name="name" autoComplete="name" maxLength={120} required disabled={sending} /></label>
      <label htmlFor="contact-email">Email<input id="contact-email" name="email" type="email" autoComplete="email" maxLength={254} required disabled={sending} /></label>
    </div>
    <div className={`${styles.formRow} ${styles.phoneRow}`}>
      <label htmlFor="contact-country-code">Country code<select id="contact-country-code" autoComplete="tel-country-code" value={callingCode} onChange={changeCallingCode} disabled={sending}>
        {countryCallingCodes.map(([country, code]) => <option key={`${country}-${code}`} value={code}>{country} ({code})</option>)}
      </select></label>
      <label htmlFor="contact-phone"><span>Phone <span className={styles.muted}>(optional)</span></span><input ref={phoneInput} id="contact-phone" name="phone" type="tel" inputMode="tel" autoComplete="tel-national" maxLength={20} placeholder={callingCode === "+91" ? "98765 43210" : "555 123 4567"} onChange={changePhone} disabled={sending} /><small className={styles.fieldHint}>The selected country code is added when you send.</small></label>
    </div>
    <label htmlFor="contact-subject">Subject<input id="contact-subject" name="subject" maxLength={200} required disabled={sending} /></label>
    <label htmlFor="contact-message">Message<textarea id="contact-message" name="message" maxLength={5000} required rows={6} disabled={sending} /></label>
    <section className={styles.attachments} aria-labelledby="contact-attachments-label">
      <label id="contact-attachments-label" htmlFor="contact-attachments"><span>Attachments <span className={styles.muted}>(optional)</span></span></label>
      <p id="contact-attachments-help" className={styles.fieldHint}>Up to 3 files, 1 MB each: PDF, JPG, PNG or WebP.</p>
      <input id="contact-attachments" type="file" multiple accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp" aria-describedby="contact-attachments-help" onChange={addAttachments} disabled={sending || attachments.length >= MAX_ATTACHMENT_COUNT} />
      {attachments.length > 0 && <ul className={styles.attachmentList} aria-label="Selected attachments">
        {attachments.map((file, index) => <li key={`${file.name}-${file.size}-${file.lastModified}-${index}`}>
          <span><Paperclip aria-hidden="true" size={15} />{file.name}<small>{formatFileSize(file.size)}</small></span>
          <button className={styles.fileRemove} type="button" aria-label={`Remove ${file.name}`} onClick={() => { setAttachments((current) => current.filter((_, itemIndex) => itemIndex !== index)); requestId.current = null; setState({ kind: "idle", message: "" }); }} disabled={sending}><X aria-hidden="true" size={16} /></button>
        </li>)}
      </ul>}
    </section>
    <button className={buttonClassName()} type="submit" disabled={sending}>
      <Send aria-hidden="true" size={16} />{sending ? "Sending…" : "Send message"}
    </button>
    <div id="contact-form-feedback" className={styles.formStatus} data-state={state.kind} role={state.kind === "error" ? "alert" : "status"} aria-live={state.kind === "error" ? "assertive" : "polite"} aria-atomic="true">
      <span>{state.message}</span>
      {(state.kind === "success" || state.kind === "error") && <button className={styles.toastClose} type="button" aria-label="Dismiss message" onClick={() => setState({ kind: "idle", message: "" })}><X size={16} aria-hidden="true" /></button>}
    </div>
  </form>;
}
