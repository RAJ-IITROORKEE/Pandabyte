"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { call, failure, price, tokens } from "./model-ui";
import styles from "./agent-models.module.css";

type Filter = "all" | "free" | "paid";
type Found = { id: string; name: string; context: number | null; promptPerM: number | null; completionPerM: number | null; tools: boolean; free: boolean; zdrEndpoints: number };
type Endpoint = { tag: string; provider: string; promptPerM: number | null; completionPerM: number | null; context: number | null; zdr: boolean; tools: boolean };

export function AddModelDialog({ onAdded, onClose }: { onAdded: (label: string) => void; onClose: () => void }) {
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [results, setResults] = useState<Found[] | null>(null);
  const [searchError, setSearchError] = useState("");
  const [model, setModel] = useState<Found | null>(null);
  const [endpoints, setEndpoints] = useState<Endpoint[] | null>(null);
  const [endpointError, setEndpointError] = useState("");
  const [tag, setTag] = useState<string | null>(null);
  const [label, setLabel] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setSearchError(""); setResults(null);
      const result = await call("GET", undefined, `/openrouter?q=${encodeURIComponent(q.trim())}&filter=${filter}`, controller.signal);
      if (controller.signal.aborted) return;
      if (result.ok && Array.isArray(result.data.models)) setResults(result.data.models as Found[]); else setSearchError(failure(result));
    }, q ? 300 : 0);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [q, filter]);

  async function pick(found: Found) {
    setModel(found); setLabel(found.name.slice(0, 60)); setTag(null); setEndpoints(null); setEndpointError(""); setError("");
    const result = await call("GET", undefined, `/openrouter?id=${encodeURIComponent(found.id)}`);
    if (result.ok && Array.isArray(result.data.endpoints)) setEndpoints(result.data.endpoints as Endpoint[]); else setEndpointError(failure(result));
  }

  const endpoint = endpoints?.find(e => e.tag === tag) ?? null;
  const free = endpoint ? endpoint.promptPerM === 0 && endpoint.completionPerM === 0 : false;
  const blocked = !endpoint ? "" : !endpoint.tools ? "This endpoint does not support tool calling, which the agent needs." : !free && !endpoint.zdr ? "Paid models must use a zero-data-retention endpoint." : "";

  async function add() {
    if (!model || !endpoint || saving || blocked || label.trim().length < 2) return;
    setSaving(true); setError("");
    const result = await call("POST", { id: model.id, tag: endpoint.tag, label: label.trim() });
    setSaving(false);
    if (result.ok) onAdded(label.trim()); else setError(failure(result));
  }

  return <div className={styles.editor}>
    <div className={styles.dialogHead}><h3>Add model</h3><button type="button" className={styles.iconButton} aria-label="Close" onClick={onClose}><X size={18} aria-hidden="true" /></button></div>
    <div className={styles.searchRow}>
      <label className={styles.field}>Search OpenRouter<input className={styles.input} value={q} maxLength={80} autoComplete="off" spellCheck={false} placeholder="Model name or id" onChange={event => setQ(event.target.value)} /></label>
      <div className={styles.chips} role="group" aria-label="Price filter">{(["all", "free", "paid"] as const).map(f => <button key={f} type="button" aria-pressed={filter === f} onClick={() => setFilter(f)}>{f === "all" ? "All" : f === "free" ? "Free" : "Paid"}</button>)}</div>
    </div>
    <div aria-live="polite">
      {searchError && <p role="alert" className={styles.invalid}>{searchError}</p>}
      {!searchError && results === null && <p>Searching…</p>}
      {results?.length === 0 && <p>No models match. Try another word.</p>}
    </div>
    {results && results.length > 0 && <ul className={styles.pickList} aria-label="Models">{results.map(found => <li key={found.id}>
      <button type="button" aria-pressed={model?.id === found.id} onClick={() => void pick(found)}>
        <span className={styles.name}>{found.name}</span><span className={styles.mono}>{found.id}</span>
        <span className={styles.meta}><span>{tokens(found.context)} context</span><span>{found.free ? "Free" : `${price(found.promptPerM)} in / ${price(found.completionPerM)} out per 1M`}</span><span>{found.tools ? "Tools" : "No tools"}</span><span>{found.zdrEndpoints} zero-retention {found.zdrEndpoints === 1 ? "endpoint" : "endpoints"}</span></span>
      </button></li>)}</ul>}
    {model && <section aria-label={`Endpoints for ${model.name}`} style={{ display: "grid", gap: 8 }}>
      <h3>Endpoints for {model.name}</h3>
      {endpointError && <p role="alert" className={styles.invalid}>{endpointError}</p>}
      {!endpointError && endpoints === null && <p>Loading endpoints…</p>}
      {endpoints?.length === 0 && <p>This model has no endpoints right now.</p>}
      {endpoints && endpoints.length > 0 && <ul className={styles.pickList}>{endpoints.map(e => <li key={e.tag}>
        <button type="button" aria-pressed={tag === e.tag} onClick={() => { setTag(e.tag); setError(""); }}>
          <span className={styles.name}>{e.provider} <span className={styles.mono}>{e.tag}</span></span>
          <span className={styles.meta}><span className={`${styles.badge} ${e.zdr ? styles.badgeOn : ""}`}>{e.zdr ? "Zero retention" : "May log prompts"}</span><span>{price(e.promptPerM)} in / {price(e.completionPerM)} out per 1M</span><span>{tokens(e.context)} context</span><span>{e.tools ? "Tools" : "No tools"}</span></span>
        </button></li>)}</ul>}
    </section>}
    {endpoint && model && <section aria-label="Preview" style={{ display: "grid", gap: 8 }}>
      <h3>Preview</h3>
      <dl className={styles.facts}>
        <div><dt>Tier</dt><dd>{free ? "Free" : "Paid"}</dd></div>
        <div><dt>Privacy</dt><dd>{endpoint.zdr ? "Zero retention" : "May log prompts"}</dd></div>
        <div><dt>Price per 1M</dt><dd>{price(endpoint.promptPerM)} in / {price(endpoint.completionPerM)} out</dd></div>
        <div><dt>Context</dt><dd>{tokens(endpoint.context ?? model.context)}</dd></div>
        <div><dt>Tool calling</dt><dd>{endpoint.tools ? "Supported" : "Not supported"}</dd></div>
      </dl>
      <label className={styles.field}>Name shown in the chat<input className={styles.input} value={label} maxLength={60} onChange={event => setLabel(event.target.value)} /></label>
      {blocked ? <p role="alert" className={styles.invalid}>{blocked}</p> : <p>The model is added switched off. Run Test, then switch it on.</p>}
      {error && <p role="alert" className={styles.invalid}>{error}</p>}
    </section>}
    <div className={styles.dialogActions}><span className={styles.spacer} /><button type="button" className={styles.button} onClick={onClose}>Cancel</button>
      <button type="button" className={styles.primary} disabled={!endpoint || !!blocked || saving || label.trim().length < 2} onClick={() => void add()}>{saving ? "Adding…" : "Add model"}</button></div>
  </div>;
}
