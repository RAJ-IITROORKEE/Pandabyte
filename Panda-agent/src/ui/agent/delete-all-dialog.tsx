"use client";

import { useEffect, useRef, useState } from "react";
import { Trash2, X } from "lucide-react";
import styles from "./delete-all-dialog.module.css";

export type DeleteAllResult = { deleted: number; skipped: number };

/** Typed confirmation for deleting every saved chat; the server keeps chats with a pending answer and reports them as skipped. */
export function DeleteAllChatsDialog({ open, onClose, onDeleted }: { open: boolean; onClose: () => void; onDeleted: (result: DeleteAllResult) => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [typed, setTyped] = useState("");
  const [state, setState] = useState<{ kind: "idle" | "working" | "error" } | { kind: "done"; result: DeleteAllResult }>({ kind: "idle" });
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);
  function close() { if (state.kind === "working") return; setTyped(""); setState({ kind: "idle" }); onClose(); }
  async function confirm() {
    if (typed !== "DELETE" || state.kind === "working") return;
    setState({ kind: "working" });
    try {
      const response = await fetch("/api/panda-agent/chats", { method: "DELETE", cache: "no-store" });
      if (!response.ok) throw new Error();
      const result = await response.json() as DeleteAllResult;
      if (!Number.isSafeInteger(result.deleted) || !Number.isSafeInteger(result.skipped)) throw new Error();
      setState({ kind: "done", result });
      onDeleted(result);
    } catch { setState({ kind: "error" }); }
  }
  return <dialog ref={ref} className={styles.dialog} aria-labelledby="delete-all-title" onCancel={event => { event.preventDefault(); close(); }}>
    <div className={styles.head}><span className={styles.icon} aria-hidden="true"><Trash2 size={18} /></span><h2 id="delete-all-title">Delete all chats</h2><button type="button" className={styles.close} aria-label="Close" onClick={close}><X size={16} /></button></div>
    {state.kind === "done" ? <>
      <p role="status">Deleted {state.result.deleted} {state.result.deleted === 1 ? "chat" : "chats"}.{state.result.skipped > 0 ? ` ${state.result.skipped} ${state.result.skipped === 1 ? "chat is" : "chats are"} still waiting on an answer and ${state.result.skipped === 1 ? "was" : "were"} kept; cancel ${state.result.skipped === 1 ? "it" : "them"} and try again.` : ""}</p>
      <div className={styles.actions}><button type="button" className={styles.secondary} onClick={close}>Done</button></div>
    </> : <>
      <p>This permanently deletes every saved chat, including archived chats, with their messages and project memory. It cannot be undone.</p>
      <label className={styles.field}><span>Type <strong>DELETE</strong> to confirm</span><input value={typed} onChange={event => setTyped(event.target.value)} autoComplete="off" spellCheck={false} disabled={state.kind === "working"} aria-invalid={typed.length > 0 && typed !== "DELETE" ? true : undefined} /></label>
      {state.kind === "error" && <p className={styles.error} role="alert">Could not delete your chats. Nothing was changed; please try again.</p>}
      <div className={styles.actions}><button type="button" className={styles.secondary} onClick={close} disabled={state.kind === "working"}>Cancel</button><button type="button" className={styles.danger} disabled={typed !== "DELETE" || state.kind === "working"} onClick={() => void confirm()}>{state.kind === "working" ? "Deleting…" : "Delete all chats"}</button></div>
    </>}
  </dialog>;
}
