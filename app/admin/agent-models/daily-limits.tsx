"use client";

import { useCallback, useEffect, useState } from "react";
import { LIMIT_NAMES, parseLimitRows, type LimitName, type LimitRow } from "@/Panda-agent/src/agent-loop/daily-limits";
import styles from "./agent-models.module.css";

const API = "/api/admin/panda-agent/daily-limits";
const labels: Record<LimitName, string> = { paid_messages: "Paid-model messages", free_messages: "Free-model messages", web_searches: "Web searches", compiles: "Compiles" };

export function DailyLimits() {
  const [rows, setRows] = useState<LimitRow[]>([]);
  const [drafts, setDrafts] = useState<Partial<Record<LimitName, string>>>({});
  const [state, setState] = useState<"loading" | "ready" | "unavailable">("loading");
  const [busy, setBusy] = useState<LimitName | null>(null);
  const [message, setMessage] = useState("");
  const [problem, setProblem] = useState("");

  const refresh = useCallback(async () => {
    try {
      const response = await fetch(API, { cache: "no-store" });
      const next = response.ok ? parseLimitRows(((await response.json()) as { limits?: unknown }).limits) : null;
      if (next) { setRows(next); setDrafts({}); setState("ready"); } else setState("unavailable");
    } catch { setState("unavailable"); }
  }, []);
  useEffect(() => { void Promise.resolve().then(refresh); }, [refresh]);

  async function save(row: LimitRow) {
    const perDay = Number(drafts[row.name] ?? row.perDay);
    if (!Number.isInteger(perDay) || perDay < 0 || perDay > 10000) { setProblem("Enter a whole number from 0 to 10,000."); return; }
    setBusy(row.name); setProblem(""); setMessage("");
    try {
      const response = await fetch(API, { method: "PATCH", cache: "no-store", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: row.name, perDay, expectedVersion: row.version }) });
      if (response.ok) setMessage(`Saved ${labels[row.name].toLowerCase()}: ${perDay} per day.`);
      else setProblem(response.status === 409 ? "Someone else changed this limit. Reloaded the latest value; check it and save again." : response.status === 401 || response.status === 403 ? "An active administrator account is required." : "The limit could not be saved. Try again.");
    } catch { setProblem("The limit could not be saved. Try again."); }
    setBusy(null);
    await refresh();
  }

  return <section className={styles.card} aria-labelledby="limits-title">
    <h2 id="limits-title">Daily limits per user</h2>
    <p>Admins are unlimited. Counts reset at midnight India time.</p>
    <div role="status" aria-live="polite">{message}</div>
    {problem && <p className={styles.banner} role="alert">{problem}</p>}
    {state === "loading" && <p className={styles.state}>Loading limits…</p>}
    {state === "unavailable" && <div className={styles.banner} role="alert"><p>Daily limits are unavailable. They may not be set up yet.</p><button type="button" className={styles.button} onClick={() => { setState("loading"); void refresh(); }}>Retry</button></div>}
    {state === "ready" && <ul className={styles.limits}>{LIMIT_NAMES.map(name => {
      const row = rows.find(r => r.name === name)!;
      return <li key={name}><form onSubmit={event => { event.preventDefault(); void save(row); }}>
        <label className={styles.field}>{labels[name]}<input className={styles.input} type="number" inputMode="numeric" min={0} max={10000} step={1} value={drafts[name] ?? String(row.perDay)} disabled={busy !== null} onChange={event => setDrafts(d => ({ ...d, [name]: event.target.value }))} /></label>
        <button type="submit" className={styles.primary} disabled={busy !== null || drafts[name] === undefined || drafts[name] === String(row.perDay)}>{busy === name ? "Saving…" : "Save"}</button>
      </form></li>;
    })}</ul>}
  </section>;
}
