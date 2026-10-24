"use client";

import { useRef, useState, type FormEvent } from "react";
import styles from "./editorial.module.css";

type FormState = { kind: "idle" | "sending" | "success" | "error"; message: string };
const RECEIPT_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function inquiryReceipt(value: unknown): string | null {
  if (!value || typeof value !== "object" || Array.isArray(value) || !("receipt" in value) ||
    typeof value.receipt !== "string" || !RECEIPT_ID.test(value.receipt)) return null;
  return value.receipt;
}

export function ContactForm() {
  const requestId = useRef<string | null>(null);
  const [state, setState] = useState<FormState>({ kind: "idle", message: "" });

  function resetRequestId() {
    requestId.current = null;
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    requestId.current ??= crypto.randomUUID();
    setState({ kind: "sending", message: "Sending your message…" });
    try {
      const response = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: formData.get("name"),
          email: formData.get("email"),
          phone: formData.get("phone") || "",
          subject: formData.get("subject"),
          message: formData.get("message"),
          idempotencyKey: requestId.current,
        }),
      });
      if (response.ok) {
        const receipt = inquiryReceipt(await response.json());
        if (!receipt) {
          setState({ kind: "error", message: "We could not confirm that your message was saved. Retry safely to check its status." });
          return;
        }
        form.reset();
        requestId.current = null;
        setState({ kind: "success", message: `Your message was saved. Keep this reference for any follow-up: ${receipt}` });
        return;
      }
      const message = response.status === 400 ? "Review the fields and try again."
        : response.status === 429 ? "Too many messages were submitted. Wait a moment, then retry."
          : "We could not save your message. You can retry safely.";
      setState({ kind: "error", message });
    } catch {
      setState({ kind: "error", message: "We could not reach the inquiry service. Retry to reuse this submission safely." });
    }
  }

  const sending = state.kind === "sending";
  return <form className={styles.form} onSubmit={submit} onChange={resetRequestId} aria-busy={sending}>
    <div className={styles.formRow}>
      <label>Name<input name="name" autoComplete="name" maxLength={120} required disabled={sending} /></label>
      <label>Email<input name="email" type="email" autoComplete="email" maxLength={254} required disabled={sending} /></label>
    </div>
    <div className={styles.formRow}>
      <label>Phone <span className={styles.muted}>(optional)</span><input name="phone" type="tel" autoComplete="tel" maxLength={40} disabled={sending} /></label>
      <label>Subject<input name="subject" maxLength={200} required disabled={sending} /></label>
    </div>
    <label>Message<textarea name="message" maxLength={5000} required rows={6} disabled={sending} /></label>
    <button type="submit" disabled={sending}>{sending ? "Sending…" : "Send message"}</button>
    <p className={styles.formStatus} data-state={state.kind} role={state.kind === "error" ? "alert" : "status"} aria-live="polite">{state.message}</p>
  </form>;
}
