"use client";

import { useCallback, useEffect, useState } from "react";
import type { ToolEntry } from "@/Panda-agent/src/agent-loop/tool-catalog";
import type { TavilyUsage } from "@/Panda-agent/src/search/tavily-usage";
import styles from "./tools-registry.module.css";

const API = "/api/admin/panda-agent/agent-tools";
type Tool = ToolEntry & { enabled: boolean; version: number | null };
type Month = { searches?: number; users?: number } | null;
type Data = { settingsAvailable: boolean; tools: Tool[]; webSearch: { tavilyConfigured: boolean; usage: TavilyUsage | null; usageError: string | null; month: Month; dailyCapPerUser: number } };
type Load = "loading" | "ready" | "unavailable" | "denied";
const GROUPS = ["Core", "Product data", "Web", "Skills and MCP", "Device", "Display"] as const;

async function call(method: string, body?: unknown): Promise<{ ok: boolean; status: number; data: unknown }> {
  try {
    const response = await fetch(API, { method, cache: "no-store", headers: body ? { "content-type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
    return { ok: response.ok, status: response.status, data: await response.json().catch(() => null) };
  } catch { return { ok: false, status: 0, data: null }; }
}

const fmt = (n: number | null) => n === null ? "unknown" : n.toLocaleString("en-IN", { maximumFractionDigits: 1 });

function Switch({ tool, busy, onToggle }: { tool: Tool; busy: boolean; onToggle: () => void }) {
  return <button type="button" role="switch" aria-checked={tool.enabled} aria-label={`${tool.label} enabled`} disabled={busy || tool.version === null} className={styles.switch} onClick={onToggle}>
    <span className={styles.track} aria-hidden="true"><span className={styles.thumb} /></span>
    <span className={styles.switchText}>{busy ? "Saving…" : tool.enabled ? "On" : "Off"}</span>
  </button>;
}

function WebCard({ data, tool, busy, onToggle }: { data: Data["webSearch"]; tool: Tool | undefined; busy: boolean; onToggle: () => void }) {
  const u = data.usage;
  const used = u?.planUsage ?? u?.keyUsage ?? null, limit = u?.planLimit ?? u?.keyLimit ?? null;
  const pct = used !== null && limit ? Math.min(100, Math.round(used / limit * 100)) : null;
  return <section className={styles.card} aria-label="Web search (Tavily)">
    <div className={styles.cardHead}><h3>Web search (Tavily)</h3>{tool && <Switch tool={tool} busy={busy} onToggle={onToggle} />}</div>
    {pct !== null ? <div className={styles.meter}>
      <span>Credits used this cycle: {fmt(used)} / {fmt(limit)} ({pct}%)</span>
      <div className={styles.bar} role="progressbar" aria-label="Tavily credits used" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}><div className={styles.fill} style={{ width: `${pct}%` }} /></div>
    </div> : <p>{data.usageError ?? "Tavily did not report a credit limit for this key."}</p>}
    <dl className={styles.facts}>
      {u?.plan && <div><dt>Plan</dt><dd>{u.plan}</dd></div>}
      {u?.searchUsage != null && <div><dt>Search requests (this key)</dt><dd>{fmt(u.searchUsage)}</dd></div>}
      <div><dt>Searches by signed-in users this month</dt><dd>{data.month ? `${data.month.searches ?? 0} (${data.month.users ?? 0} users)` : "unavailable"}</dd></div>
      <div><dt>Per-user daily cap</dt><dd>{data.dailyCapPerUser} searches (Admins are not capped)</dd></div>
    </dl>
    {!data.tavilyConfigured ? <p className={styles.note}>No Tavily key is configured on the server, so web search cannot run.</p> : data.usageError && pct !== null ? <p className={styles.note}>{data.usageError}</p> : null}
  </section>;
}

export function ToolsRegistry() {
  const [load, setLoad] = useState<Load>("loading");
  const [data, setData] = useState<Data | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const refresh = useCallback(async () => {
    const r = await call("GET");
    if (r.status === 401 || r.status === 403) { setLoad("denied"); return; }
    const d = r.data as Data | null;
    if (!r.ok || !d || !Array.isArray(d.tools)) { setLoad("unavailable"); return; }
    setData(d); setLoad("ready");
  }, []);
  useEffect(() => { void Promise.resolve().then(refresh); }, [refresh]);

  async function toggle(tool: Tool) {
    if (!tool.setting || tool.version === null || busy) return;
    setBusy(tool.name); setErrors(e => ({ ...e, [tool.name]: "" }));
    const r = await call("PATCH", { name: tool.setting, enabled: !tool.enabled, expectedVersion: tool.version });
    if (r.ok) await refresh();
    else {
      setErrors(e => ({ ...e, [tool.name]: r.status === 409 ? "This setting changed elsewhere. Reloaded the latest value." : r.status === 401 || r.status === 403 ? "An active administrator account is required." : "Could not save. Try again." }));
      if (r.status === 409) await refresh();
    }
    setBusy(null);
  }

  if (load === "loading") return <div className={styles.state} role="status"><p>Loading tools…</p></div>;
  if (load !== "ready" || !data) return <div className={styles.state}><p>{load === "denied" ? "An active administrator account is required." : "Tool settings are unavailable."}</p>{load !== "denied" && <button type="button" className={styles.button} onClick={() => { setLoad("loading"); void refresh(); }}>Try again</button>}</div>;

  const web = data.tools.find(t => t.name === "web_search");
  return <div className={styles.registry}>
    <div className={styles.head}><h2>Agent tools</h2><p>Switch optional tools on or off for every Panda Agent chat. A disabled tool is hidden from the model on its next turn. Required tools cannot be turned off.</p></div>
    {!data.settingsAvailable && <p className={styles.banner} role="status">Tool switches are not available yet, so every tool shows its default and cannot be changed.</p>}
    <WebCard data={data.webSearch} tool={web} busy={busy === "web_search"} onToggle={() => web && void toggle(web)} />
    {errors.web_search && <p className={styles.errorText} role="alert">{errors.web_search}</p>}
    {GROUPS.map(group => {
      const rows = data.tools.filter(t => t.group === group);
      if (!rows.length) return null;
      return <section key={group} className={styles.group} aria-label={group}><h3>{group}</h3>
        <ul className={styles.list}>{rows.map(tool => <li key={tool.name} className={styles.row}>
          <div className={styles.text}><span className={styles.name}>{tool.label}</span><span className={styles.desc}>{tool.description}</span><span className={styles.runs}>Runs on: {tool.runsOn}</span></div>
          {tool.required ? <span className={styles.badge}>Required</span> : <Switch tool={tool} busy={busy === tool.name} onToggle={() => void toggle(tool)} />}
          {errors[tool.name] && <p className={styles.errorText} role="alert">{errors[tool.name]}</p>}
        </li>)}</ul></section>;
    })}
  </div>;
}
