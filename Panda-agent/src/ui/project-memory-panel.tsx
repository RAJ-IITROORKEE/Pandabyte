"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import type { ProjectMemory } from "../guide/contracts";
import { parseMemoryChange, parseMemoryState, type MemoryChange } from "../guide/project-memory";
import styles from "./workspace.module.css";

type Receipt = Pick<MemoryChange, "requestId" | "expectedVersion">;
export function ProjectMemoryPanel({ thread, owner, memory, disabled, onMemory }: {
  thread: string; owner: string; memory: ProjectMemory | null; disabled: boolean;
  onMemory(memory: ProjectMemory | null): void;
}) {
  const [mode, setMode] = useState<"edit" | "clear" | null>(null);
  const [goal, setGoal] = useState("");
  const [board, setBoard] = useState("");
  const [revision, setRevision] = useState("");
  const [components, setComponents] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [blocked, setBlocked] = useState(true);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const active = useRef(false);
  const locked = useRef(false);
  const pending = useRef<Receipt | null>(null);
  const request = useRef<AbortController | null>(null);
  const editAction = useRef<HTMLButtonElement | null>(null);
  const clearAction = useRef<HTMLButtonElement | null>(null);
  const title = useRef<HTMLHeadingElement | null>(null);
  const key = `panda-project-memory:${owner}:${thread}`;
  const endpoint = `/api/panda-agent/chats/${thread}/memory`;

  function storedReceipt(): Receipt | null {
    const raw = sessionStorage.getItem(key);
    if (raw === null) return null;
    const value = JSON.parse(raw);
    const parsed = parseMemoryChange({ ...value, intent: null });
    if (!parsed || Object.keys(value).sort().join(",") !== "expectedVersion,requestId") throw Error();
    return { requestId: parsed.requestId, expectedVersion: parsed.expectedVersion };
  }
  function clearReceipt() {
    sessionStorage.removeItem(key);
    if (sessionStorage.getItem(key) !== null) throw Error();
    pending.current = null;
  }
  async function refresh() {
    if (locked.current) return;
    locked.current = true;
    setBusy(true);
    setError("");
    setStatus("Checking project context…");
    const controller = new AbortController();
    request.current = controller;
    try {
      pending.current = storedReceipt();
      const response = await fetch(endpoint, { cache: "no-store", signal: AbortSignal.any([controller.signal, AbortSignal.timeout(20_000)]) });
      if (!response.ok) throw Error();
      const value = parseMemoryState(await response.json());
      if (!value) throw Error();
      if (!active.current) return;
      onMemory(value.memory);
      const receipt = pending.current;
      const resolved = !receipt || value.lastRequestId === receipt.requestId || (value.memory?.version ?? 0) > receipt.expectedVersion;
      if (resolved) {
        clearReceipt();
        setBlocked(false);
        setStatus("Project context is current.");
      } else {
        setBlocked(true);
        setStatus("The last change is still unconfirmed. Check its status before making another change.");
      }
    } catch {
      if (active.current) { setBlocked(true); setStatus(""); setError("Project context could not be checked. Confirm your access and check its status again."); }
    } finally {
      locked.current = false;
      if (active.current) setBusy(false);
    }
  }
  useEffect(() => {
    active.current = true;
    queueMicrotask(() => {
      if (!active.current) return;
      try {
        pending.current = storedReceipt();
        setBlocked(pending.current !== null);
        if (pending.current) setStatus("A previous context change is unconfirmed. Check its status.");
      } catch { setError("Browser recovery storage is unavailable. Project context changes are blocked."); }
    });
    return () => { active.current = false; request.current?.abort(); };
    // Each selected owner/thread receives a fresh keyed panel.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function begin(next: "edit" | "clear") {
    setGoal(memory?.intent?.goal ?? "");
    setBoard(memory?.intent?.board ?? "");
    setRevision(memory?.intent?.revision ?? "");
    setComponents(memory?.intent?.components.join("\n") ?? "");
    setConfirmation("");
    setError("");
    setStatus("");
    setMode(next);
  }
  function close(focusTitle = false) {
    const returnTarget = mode === "clear" ? clearAction : editAction;
    setMode(null);
    setConfirmation("");
    requestAnimationFrame(() => {
      if (!active.current) return;
      if (focusTitle) title.current?.focus();
      else (returnTarget.current ?? title.current)?.focus();
    });
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    if (locked.current || blocked || disabled || !mode || (mode === "clear" && confirmation !== "CLEAR")) return;
    const value = parseMemoryChange({
      requestId: crypto.randomUUID(), expectedVersion: memory?.version ?? 0,
      intent: mode === "clear" ? null : {
        goal, board, ...(revision.trim() ? { revision } : {}),
        components: components.trim() ? components.split("\n").map(value => value.trim()).filter(Boolean) : [],
      },
    });
    if (!value) { setError("Enter a goal, board or model, and at most eight components within the field limits."); return; }
    locked.current = true;
    setBusy(true);
    setBlocked(true);
    setError("");
    setStatus("Saving project context…");
    const controller = new AbortController();
    request.current = controller;
    try {
      const receipt = { requestId: value.requestId, expectedVersion: value.expectedVersion };
      sessionStorage.setItem(key, JSON.stringify(receipt));
      if (JSON.stringify(storedReceipt()) !== JSON.stringify(receipt)) throw Error();
      pending.current = receipt;
      const response = await fetch(endpoint, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(value),
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(30_000)]),
      });
      if (!active.current) return;
      if (!response.ok) {
        if ([400, 403, 404, 409].includes(response.status)) {
          clearReceipt();
          setStatus("");
          setError(response.status === 409
            ? "This chat has changed or has an active request. Reload context and review your edit."
            : "This change was rejected. Check your access and reload context.");
          return;
        }
        throw Error();
      }
      const saved = parseMemoryState(await response.json());
      if (!active.current) return;
      if (!saved || saved.lastRequestId !== value.requestId || !saved.memory || saved.memory.version !== value.expectedVersion + 1) throw Error();
      onMemory(saved.memory);
      clearReceipt();
      setBlocked(false);
      setStatus(value.intent === null ? "Project context cleared." : "Project context saved.");
      close(true);
    } catch {
      if (active.current) { setStatus(""); setError("The change could not be confirmed. Check its status before making another change."); }
    } finally {
      locked.current = false;
      if (active.current) setBusy(false);
    }
  }

  const intent = memory?.intent;
  return <div className={styles.memoryCard}>
    <h2 ref={title} tabIndex={-1}>Current chat project context</h2>
    <p>These are details you supply for this chat. Product facts require current approved sources.</p>
    {intent ? <dl><dt>Goal</dt><dd>{intent.goal}</dd><dt>Board or model</dt><dd>{intent.board}</dd>
      {intent.revision && <><dt>Revision</dt><dd>{intent.revision}</dd></>}
      {intent.components.length > 0 && <><dt>Components</dt><dd>{intent.components.join(", ")}</dd></>}
    </dl> : <p>No project context is saved for this chat.</p>}
    {!!memory?.questions.length && <><h3>Open questions</h3><ul>{memory.questions.map((question, index) => <li key={index}>{question}</li>)}</ul></>}
    <p>Changes apply to this chat. Chat messages remain in history. An active request must finish before context can change.</p>
    {!mode ? <div className={styles.memoryActions}>
      <button ref={editAction} type="button" disabled={disabled || blocked || busy} onClick={() => begin("edit")}>{intent ? "Edit project context" : "Add project context"}</button>
      {intent && <button ref={clearAction} type="button" disabled={disabled || blocked || busy} onClick={() => begin("clear")}>Clear project context</button>}
    </div> : <form className={styles.memoryForm} onSubmit={save} aria-label={mode === "edit" ? "Edit project context" : "Clear project context"}>
      {mode === "edit" ? <>
        <label>Goal<textarea value={goal} onChange={event => setGoal(event.target.value)} maxLength={600} required disabled={busy} /></label>
        <label>Board or model<input value={board} onChange={event => setBoard(event.target.value)} maxLength={128} required disabled={busy} /></label>
        <label>Revision (optional)<input value={revision} onChange={event => setRevision(event.target.value)} maxLength={80} disabled={busy} /></label>
        <label>Components (one per line, up to eight)<textarea value={components} onChange={event => setComponents(event.target.value)} maxLength={647} disabled={busy} /></label>
      </> : <label>Type CLEAR to remove the saved project context<input value={confirmation} onChange={event => setConfirmation(event.target.value)} autoComplete="off" disabled={busy} /></label>}
      <div className={styles.memoryActions}><button type="submit" disabled={disabled || blocked || busy || (mode === "clear" && confirmation !== "CLEAR")}>{busy ? "Saving…" : mode === "clear" ? "Confirm clear" : "Save project context"}</button>
        <button type="button" disabled={busy} onClick={() => close()}>Cancel</button></div>
    </form>}
    <p role="status" aria-live="polite">{status}</p>
    {error && <p role="alert">{error}</p>}
    <button type="button" disabled={busy} onClick={() => void refresh()}>{blocked ? "Check context status" : "Reload context"}</button>
  </div>;
}
