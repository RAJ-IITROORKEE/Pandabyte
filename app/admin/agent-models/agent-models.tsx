"use client";

import { useCallback, useEffect, useState } from "react";
import { ArrowDown, ArrowUp, Plus } from "lucide-react";
import type { ModelRowView } from "@/Panda-agent/src/server/models-admin-api";
import { DailyLimits } from "./daily-limits";
import { AddModelDialog } from "./add-model-dialog";
import { Modal, Switch, call, failure, price, tokens } from "./model-ui";
import styles from "./agent-models.module.css";

type Load = "loading" | "ready" | "unavailable" | "denied";
type Test = { ok: boolean; latencyMs: number; toolCall: boolean; servedBy: string | null; error: string | null };
const usd = (nano: number) => `$${(nano / 1e9).toFixed(nano >= 1e9 ? 2 : 4)}`;
const num = (n: number) => n.toLocaleString("en-IN");
const poolOf = (rows: ModelRowView[]) => rows.filter(r => r.tier === "free" && r.enabled).sort((a, b) => (a.poolOrder ?? 99) - (b.poolOrder ?? 99) || a.label.localeCompare(b.label));

export function AgentModels() {
  const [rows, setRows] = useState<ModelRowView[]>([]);
  const [load, setLoad] = useState<Load>("loading");
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [problem, setProblem] = useState("");
  const [tests, setTests] = useState<Record<string, Test | "running">>({});
  const [adding, setAdding] = useState(false);
  const [renaming, setRenaming] = useState<ModelRowView | null>(null);
  const [removing, setRemoving] = useState<ModelRowView | null>(null);
  const [name, setName] = useState("");
  const [note, setNote] = useState("");

  const refresh = useCallback(async () => {
    const result = await call("GET");
    if (result.ok && Array.isArray(result.data.models)) { setRows(result.data.models as ModelRowView[]); setLoad("ready"); }
    else setLoad(result.status === 401 || result.status === 403 ? "denied" : "unavailable");
  }, []);
  useEffect(() => { void Promise.resolve().then(refresh); }, [refresh]);

  async function patch(row: ModelRowView, body: Record<string, unknown>, done: string, key = row.id) {
    setBusy(key); setProblem("");
    const result = await call("PATCH", { id: row.id, expectedVersion: row.version, ...body });
    setBusy(null);
    if (result.ok) setNotice(done); else setProblem(failure(result));
    await refresh();
    return result.ok;
  }
  const set = (row: ModelRowView, change: Partial<Pick<ModelRowView, "enabled" | "members" | "poolOrder">>, done: string) => {
    const next = { enabled: row.enabled, members: row.members, poolOrder: row.poolOrder, ...change };
    // A free model joins the end of the pool when switched on and leaves it when switched off.
    if (row.tier === "free" && change.enabled !== undefined) next.poolOrder = change.enabled ? Math.max(0, ...poolOf(rows).map(r => r.poolOrder ?? 0)) + 1 : null;
    return patch(row, { action: "set", ...next }, done);
  };

  async function move(row: ModelRowView, delta: -1 | 1) {
    const pool = poolOf(rows); const from = pool.findIndex(r => r.id === row.id); const to = from + delta;
    if (from < 0 || to < 0 || to >= pool.length) return;
    [pool[from], pool[to]] = [pool[to], pool[from]];
    setBusy("pool"); setProblem("");
    for (const [i, r] of pool.entries()) {
      if (r.poolOrder === i + 1) continue;
      const result = await call("PATCH", { action: "set", id: r.id, expectedVersion: r.version, enabled: r.enabled, members: r.members, poolOrder: i + 1 });
      if (!result.ok) { setProblem(failure(result)); break; }
    }
    setBusy(null); setNotice(`Moved ${row.label} ${delta < 0 ? "up" : "down"}`); await refresh();
  }

  async function test(row: ModelRowView) {
    setTests(t => ({ ...t, [row.id]: "running" })); setProblem("");
    const result = await call("POST", { id: row.id }, "/test");
    const outcome = result.data.test as Test | undefined;
    if (result.ok && outcome) { setTests(t => ({ ...t, [row.id]: outcome })); setNotice(`${row.label}: ${outcome.ok ? "reachable" : "test failed"}`); }
    else { setTests(t => { const { [row.id]: _gone, ...rest } = t; void _gone; return rest; }); setProblem(failure(result)); }
  }

  const pool = poolOf(rows);
  const total = rows.reduce((s, r) => ({ turns: s.turns + (r.usage30d?.turns ?? 0), tokens: s.tokens + (r.usage30d ? r.usage30d.inputTokens + r.usage30d.outputTokens : 0), cost: s.cost + (r.usage30d?.costNano ?? 0),
    failovers: s.failovers + (r.usage30d?.failovers ?? 0), failures: s.failures + (r.usage30d?.failures ?? 0) }), { turns: 0, tokens: 0, cost: 0, failovers: 0, failures: 0 });
  const stats: [string, string][] = [["Enabled models", String(rows.filter(r => r.enabled).length)], ["Free pool size", String(pool.length)], ["Turns, 30 days", num(total.turns)], ["Tokens, 30 days", tokens(total.tokens)],
    ["Cost, 30 days", usd(total.cost)], ["Failovers", num(total.failovers)], ["Failures", num(total.failures)]];

  return <div className={styles.screen}>
    <header className={styles.heading}>
      <div><p className={styles.eyebrow}>Admin / Panda Agent</p><h1>Models</h1><p>Choose which OpenRouter models the agent can use, who sees them and the order of the free pool.</p></div>
      <button type="button" className={styles.primary} onClick={() => setAdding(true)} disabled={load !== "ready"}><Plus size={16} aria-hidden="true" /> Add model</button>
    </header>
    <div className={styles.live} role="status" aria-live="polite">{notice}</div>
    {problem && <p className={styles.banner} role="alert">{problem}</p>}
    {load === "loading" && <p className={styles.state}>Loading models…</p>}
    {(load === "unavailable" || load === "denied") && <div className={styles.banner} role="alert"><p>{load === "denied" ? "An active administrator account is required." : "The model registry is unavailable. It may not be set up yet."}</p>
      <button type="button" className={styles.button} onClick={() => { setLoad("loading"); void refresh(); }}>Retry</button></div>}
    {load === "ready" && <>
      <dl className={styles.stats}>{stats.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
      <section className={styles.card} aria-labelledby="pool-title">
        <h2 id="pool-title">Free pool</h2>
        <p>Free models are tried in this order when a signed-in user picks the free pool. Free endpoints may log prompts, so they never see more than the user typed and the agent tool results. If every free model fails (for example the daily free quota is used up), DeepSeek V4.1 Flash answers while it is switched on; it is paid and still counts against the free daily limit.</p>
        {pool.length === 0 ? <div className={styles.state}><p>No free model is switched on. Add one with Add model and the Free filter.</p></div> : <ol className={styles.pool}>{pool.map((r, i) => <li key={r.id}>
          <span className={styles.rank}>{i + 1}.</span><span className={styles.poolName}><span className={styles.name}>{r.label}</span> <span className={styles.mono}>{r.id}</span></span>
          <button type="button" className={styles.button} aria-label={`Move ${r.label} up`} disabled={i === 0 || busy !== null} onClick={() => void move(r, -1)}><ArrowUp size={16} aria-hidden="true" /></button>
          <button type="button" className={styles.button} aria-label={`Move ${r.label} down`} disabled={i === pool.length - 1 || busy !== null} onClick={() => void move(r, 1)}><ArrowDown size={16} aria-hidden="true" /></button>
        </li>)}</ol>}
      </section>
      <section className={styles.card} aria-labelledby="models-title">
        <h2 id="models-title">All models</h2>
        <div className={styles.tableWrap}><table className={styles.table}>
          <thead><tr><th scope="col">Model</th><th scope="col">Tier</th><th scope="col">Privacy</th><th scope="col">Provider tag</th><th scope="col">Context</th><th scope="col">Price per 1M (in / out)</th><th scope="col">30 days</th><th scope="col">Enabled</th><th scope="col">Signed-in users</th><th scope="col">Actions</th></tr></thead>
          <tbody>{rows.map(r => { const t = tests[r.id]; const free = r.tier === "free";
            return <tr key={r.id}>
              <td data-label="Model"><span className={styles.cell}><span className={styles.name}>{r.label}</span><span className={styles.mono}>{r.id}</span>{r.builtin && <span className={styles.badge}>Built-in</span>}</span></td>
              <td data-label="Tier"><span className={styles.badge}>{free ? "Free" : "Paid"}</span></td>
              <td data-label="Privacy"><span className={`${styles.badge} ${r.view?.privacy === "zdr" ? styles.badgeOn : ""}`}>{r.view?.privacy === "logged" ? "May log prompts" : "Zero retention"}</span></td>
              <td data-label="Provider tag"><span className={styles.mono}>{r.view?.tag ?? "n/a"}</span></td>
              <td data-label="Context">{tokens(r.contextWindow)}</td>
              <td data-label="Price per 1M">{r.view ? (free ? "Free" : `${price(r.view.promptPerM)} / ${price(r.view.completionPerM)}`) : "n/a"}</td>
              <td data-label="30 days">{r.usage30d ? `${num(r.usage30d.turns)} turns, ${usd(r.usage30d.costNano)}` : "No use"}</td>
              <td data-label="Enabled"><Switch checked={r.enabled} label={`Enable ${r.label}`} disabled={busy !== null} text={r.enabled ? "On" : "Off"} onChange={() => void set(r, { enabled: !r.enabled }, `${r.enabled ? "Switched off" : "Switched on"} ${r.label}`)} /></td>
              <td data-label="Signed-in users"><Switch checked={r.members} label={`Show ${r.label} to signed-in users`} disabled={busy !== null} text={r.members ? "Shown" : "Admins only"} onChange={() => void set(r, { members: !r.members }, `${r.label} ${r.members ? "now Admins only" : "now shown to signed-in users"}`)} /></td>
              <td data-label="Actions"><div className={styles.actions}>
                <button type="button" className={styles.button} disabled={t === "running" || Object.values(tests).includes("running")} onClick={() => void test(r)}>{t === "running" ? "Testing…" : "Test"}</button>
                <button type="button" className={styles.button} onClick={() => { setRenaming(r); setName(r.label); setNote(r.note ?? ""); }}>Rename</button>
                {!r.builtin && <button type="button" className={styles.danger} onClick={() => setRemoving(r)}>Remove</button>}
              </div>{t && t !== "running" && <p className={styles.result} role="status">{t.ok ? `Reachable in ${t.latencyMs} ms. ${t.toolCall ? "Called the tool." : "Answered without calling the tool."}${t.servedBy ? ` Served by ${t.servedBy}.` : ""}` : `Failed: ${t.error ?? "unknown error"}`}</p>}</td>
            </tr>; })}</tbody>
        </table></div>
        {rows.length === 0 && <div className={styles.state}><p>No models yet.</p></div>}
      </section>
      <DailyLimits />
    </>}
    <Modal open={adding} onClose={() => setAdding(false)} label="Add model">
      {adding && <AddModelDialog onClose={() => setAdding(false)} onAdded={label => { setAdding(false); setNotice(`Added ${label}. It is off until you test and enable it.`); void refresh(); }} />}
    </Modal>
    <Modal open={renaming !== null} onClose={() => setRenaming(null)} label="Rename model">
      {renaming && <form className={styles.editor} onSubmit={event => { event.preventDefault(); const row = renaming; setRenaming(null); void patch(row, { action: "rename", label: name.trim(), note: note.trim() || null }, "Saved"); }}>
        <h3>Rename {renaming.label}</h3>
        <label className={styles.field}>Name<input className={styles.input} value={name} minLength={2} maxLength={60} onChange={event => setName(event.target.value)} /></label>
        <label className={styles.field}>Note (optional)<input className={styles.input} value={note} maxLength={300} onChange={event => setNote(event.target.value)} /></label>
        <div className={styles.dialogActions}><span className={styles.spacer} /><button type="button" className={styles.button} onClick={() => setRenaming(null)}>Cancel</button><button type="submit" className={styles.primary} disabled={name.trim().length < 2}>Save</button></div>
      </form>}
    </Modal>
    <Modal open={removing !== null} onClose={() => setRemoving(null)} label="Remove model">
      {removing && <div className={styles.editor}>
        <h3>Remove {removing.label}?</h3><p>It disappears from the chat. Usage history is kept. You can add it again later.</p>
        <div className={styles.dialogActions}><span className={styles.spacer} /><button type="button" className={styles.button} onClick={() => setRemoving(null)}>Cancel</button><button type="button" className={styles.danger} onClick={() => { const row = removing; setRemoving(null); void patch(row, { action: "remove" }, `Removed ${row.label}`); }}>Remove</button></div>
      </div>}
    </Modal>
  </div>;
}
