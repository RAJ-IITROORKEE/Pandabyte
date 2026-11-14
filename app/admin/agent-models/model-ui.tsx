"use client";

import { useEffect, useRef } from "react";
import styles from "./agent-models.module.css";

export const API = "/api/admin/panda-agent/model-registry";
export type Result = { ok: boolean; status: number; data: Record<string, unknown> };

export async function call(method: string, body?: unknown, path = "", signal?: AbortSignal): Promise<Result> {
  try {
    const response = await fetch(API + path, { method, cache: "no-store", signal, headers: body ? { "content-type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
    const data = await response.json().catch(() => ({}));
    return { ok: response.ok, status: response.status, data: data && typeof data === "object" ? data : {} };
  } catch { return { ok: false, status: 0, data: {} }; }
}

export function failure(result: Result): string {
  const message = typeof result.data.message === "string" ? result.data.message : "";
  if (result.status === 401 || result.status === 403) return "An active administrator account is required.";
  if (result.status === 409) return message || "This model changed elsewhere. Reloaded the latest version.";
  if (result.status === 404) return message || "That model no longer exists.";
  if (result.status === 429) return message || "Try again in a moment.";
  if (result.status === 400) return message || "The request was not valid.";
  return message || "Models are unavailable. Try again.";
}

export const price = (perM: number | null) => perM === null ? "n/a" : perM === 0 ? "Free" : `$${perM < 0.01 ? perM.toPrecision(2) : perM.toFixed(perM < 1 ? 3 : 2)}`;
export const tokens = (n: number | null) => n === null ? "n/a" : n >= 1e6 ? `${+(n / 1e6).toFixed(2)}M` : n >= 1e3 ? `${Math.round(n / 1e3)}k` : String(n);

export function Modal({ open, onClose, label, children }: { open: boolean; onClose: () => void; label: string; children: React.ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (dialog && open && !dialog.open) dialog.showModal();
    if (dialog && !open && dialog.open) dialog.close();
  }, [open]);
  return <dialog ref={ref} className={styles.dialog} aria-label={label} onClose={onClose}>{open && children}</dialog>;
}

export function Switch({ checked, label, disabled, onChange, text }: { checked: boolean; label: string; disabled?: boolean; onChange: () => void; text: string }) {
  return <button type="button" role="switch" aria-checked={checked} aria-label={label} disabled={disabled} className={styles.switch} onClick={onChange}>
    <span className={styles.track} aria-hidden="true"><span className={styles.thumb} /></span><span>{text}</span>
  </button>;
}
