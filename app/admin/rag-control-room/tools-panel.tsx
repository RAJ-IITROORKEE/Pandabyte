"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import styles from "./rag-control-room.module.css";
import { parseTools, type Tool } from "./tools-dto";

const endpoint = "/api/admin/panda-agent/tools";
const names: Record<string, string> = { panda_scoped_rag: "Approved product sources", fetch_public_docs_mcp: "Official documentation MCP", convert_units: "Unit conversion", format_bom: "Bill of materials formatting" };

export function ToolsPanel() {
  const [tools, setTools] = useState<Tool[] | null>(null);
  const [selection, setSelection] = useState("");
  const [enabled, setEnabled] = useState("enable");
  const [reason, setReason] = useState("");
  const [notice, setNotice] = useState("Loading tools…");
  const [blocked, setBlocked] = useState(false);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const refresh = useCallback(async () => {
    if (busyRef.current) return;
    busyRef.current = true; setBusy(true);
    try {
      const response = await fetch(endpoint, { cache: "no-store" });
      if (response.status === 401 || response.status === 403) { setTools(null); setBlocked(true); setNotice("Access denied. An active ADMIN membership is required."); return; }
      if (!response.ok) throw new Error();
      const data = parseTools(await response.json());
      if (!data) throw new Error();
      setTools(data); setBlocked(false); setNotice("");
    } catch { setBlocked(true); setNotice("Tools are unavailable. Refresh before making changes."); }
    finally { busyRef.current = false; setBusy(false); }
  }, []);
  useEffect(() => { const timer = window.setTimeout(() => void refresh(), 0); return () => window.clearTimeout(timer); }, [refresh]);
  const selected = tools?.find(tool => tool.id === selection);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected || busyRef.current || blocked || !reason.trim() || selected.enabled === (enabled === "enable")) return;
    busyRef.current = true; setBusy(true); setNotice("");
    try {
      const response = await fetch(endpoint, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ toolId: selected.id, enabled: enabled === "enable", expectedVersion: selected.version, reason: reason.trim() }), cache: "no-store" });
      if (!response.ok) { if (response.status === 401 || response.status === 403) setTools(null); setBlocked(true); setNotice(response.status === 401 || response.status === 403 ? "Access denied. An active ADMIN membership is required." : response.status === 409 ? "This tool changed. Refresh and review its current version before trying again." : "The change could not be confirmed. Refresh before trying again."); return; }
      const data = parseTools(await response.json());
      if (!data) throw new Error();
      setTools(data); setReason(""); setNotice("Tool change saved.");
    } catch { setBlocked(true); setNotice("The change outcome is unknown. Refresh before trying again."); }
    finally { busyRef.current = false; setBusy(false); }
  }
  return <section className={`${styles.panel} ${styles.wide}`} id="tools">
    <div className={styles.panelHead}><div><h2>Tools</h2><p>Inspect fixed manifests and manage their availability. Enabling a tool does not grant a skill permission to use it.</p></div><button type="button" disabled={busy} onClick={() => void refresh()}>Refresh</button></div>
    {notice && <div role={blocked ? "alert" : "status"}><p>{notice}</p><button type="button" onClick={() => setNotice("")}>Dismiss notification</button></div>}
    {blocked && <p>Changes are blocked until a successful refresh confirms current access and versions.</p>}
    {tools && <><ul className={styles.list}>{tools.map(tool => <li key={tool.id}><div><strong>{names[tool.id] ?? tool.id}</strong><p>{tool.enabled ? "Enabled" : "Disabled"} · manifest v{tool.manifest.version} · record version {tool.version} · health: {tool.health === "not_checked" ? "Not checked" : tool.health}</p><details><summary>Inspect fixed manifest</summary>
      <p>Transport: {tool.manifest.transport === "stdio" ? "MCP stdio" : tool.manifest.transport} · cost class: {tool.manifest.costClass} · {tool.manifest.modelCalls} model calls</p>
      <p>Permitted tools: {tool.manifest.allowedTools.join(", ") || "none"} · hosts: {tool.manifest.allowedHosts.join(", ") || "none"}</p>
      {tool.manifest.catalog && <p>Catalog: {tool.manifest.catalog.join(", ")} · ESP-IDF 5.5.1, ESP32 GPIO · path: /projects/esp-idf/en/v5.5.1/esp32/api-reference/peripherals/gpio.html</p>}
      {tool.manifest.sdk && <p>SDK: {tool.manifest.sdk}</p>}
      <p>Limits: {tool.manifest.maxCallsPerTurn} calls per turn · {tool.manifest.concurrency} concurrent · {tool.manifest.deadlineMs} ms deadline · {tool.manifest.timeoutMs} ms timeout · {tool.manifest.maxResultBytes} result bytes{tool.manifest.maxHttpRequests !== undefined && ` · ${tool.manifest.maxHttpRequests} HTTP requests · ${tool.manifest.maxHttpBytes} HTTP bytes · ${tool.manifest.redirects} redirects`}</p>
      <p>Manifest hash: {tool.hash}</p></details><details><summary>Change history</summary>{tool.history.length ? <ul>{tool.history.map((entry, index) => <li key={index}><div>{entry.enabled ? "Enabled" : "Disabled"} · {entry.at} · {entry.reason}</div></li>)}</ul> : <p>No recorded changes.</p>}</details></div></li>)}</ul>
      <form className={styles.form} onSubmit={submit}><label>Tool<select value={selection} disabled={busy} onChange={event => setSelection(event.target.value)}><option value="">Choose a tool</option>{tools.map(tool => <option key={tool.id} value={tool.id}>{names[tool.id] ?? tool.id}</option>)}</select></label><label>Action<select value={enabled} disabled={busy || blocked} onChange={event => setEnabled(event.target.value)}><option value="enable">Enable</option><option value="disable">Disable</option></select></label><label>Reason<textarea required maxLength={300} value={reason} disabled={busy || blocked} onChange={event => setReason(event.target.value)} /></label><button type="submit" disabled={busy || blocked || !selected || selected.enabled === (enabled === "enable") || !reason.trim()}>{busy ? "Saving…" : "Save change"}</button></form></>}
    <p>Context7 and MarkItDown are unavailable; they are not configured tools.</p>
  </section>;
}
