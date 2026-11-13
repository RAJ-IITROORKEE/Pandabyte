"use client";

import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from "react";
import { Plus, X } from "lucide-react";
import type { McpServerView } from "@/Panda-agent/src/server/mcp-admin-api";
import type { McpTool } from "@/Panda-agent/src/mcp/client";
import styles from "./mcp-registry.module.css";

const API = "/api/admin/panda-agent/mcp-servers";
const NAME = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const HEADER = /^[A-Za-z][A-Za-z0-9-]{0,39}$/;
type Load = "loading" | "ready" | "unavailable" | "denied";
type Result = { ok: boolean; status: number; data: Record<string, unknown> };

async function call(method: string, body?: unknown): Promise<Result> {
  try {
    const response = await fetch(API, { method, cache: "no-store", headers: body ? { "content-type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
    const data = await response.json().catch(() => ({}));
    return { ok: response.ok, status: response.status, data: data && typeof data === "object" ? data : {} };
  } catch { return { ok: false, status: 0, data: {} }; }
}

function failure(result: Result): string {
  const message = typeof result.data.message === "string" ? result.data.message : "";
  if (result.status === 401 || result.status === 403) return "An active administrator account is required.";
  if (result.status === 409) return "This server changed elsewhere. Reloaded the latest version.";
  if (result.status === 429) return "Limit reached: at most 10 MCP servers.";
  if (result.status === 400) return message || "The request was not valid.";
  if (result.status === 404) return "That server no longer exists.";
  return message || "MCP registry is unavailable. Try again.";
}

const when = (value: string | null) => value ? new Date(value).toLocaleString() : "Never";
const host = (url: string) => { try { return new URL(url).host; } catch { return url; } };
const allowed = (server: McpServerView) => server.tools.filter(tool => tool.mode !== "never").length;
const modeLabel = { allow: "Allow", ask: "Ask", never: "Never" } as const;
function status(server: McpServerView) {
  if (server.enabled) return "Enabled";
  if (server.lastTestOk === false) return "Test failed";
  if (server.lastTestOk === null) return "Needs test";
  return "Disabled";
}

function Modal({ open, onClose, label, children }: { open: boolean; onClose: () => void; label: string; children: React.ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (dialog && open && !dialog.open) dialog.showModal();
    if (dialog && !open && dialog.open) dialog.close();
  }, [open]);
  return <dialog ref={ref} className={styles.dialog} aria-label={label} onClose={onClose}>{open && children}</dialog>;
}

function Editor({ server, onSaved, onClose }: { server: McpServerView | null; onSaved: (name: string, isNew: boolean, conflict: string) => void; onClose: () => void }) {
  const [name, setName] = useState("");
  const [url, setUrl] = useState(server?.url ?? "");
  const [header, setHeader] = useState(server?.authHeader ?? "");
  const [secret, setSecret] = useState("");
  const [keep, setKeep] = useState(!!server?.hasSecret);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const hasKey = !!server?.hasSecret;

  function check(): string {
    if (!server && (name.length > 20 || !NAME.test(name))) return "Name: lowercase letters, digits and hyphens, up to 20 characters.";
    if (!url.startsWith("https://")) return "URL must start with https://.";
    if (header && !HEADER.test(header)) return "Auth header name may use letters, digits and hyphens, and must start with a letter (max 40).";
    if (keep && hasKey) return header ? "" : "Keeping the saved key needs its auth header name.";
    if (!!header !== !!secret) return "Provide both an auth header name and an API key, or neither.";
    return "";
  }

  async function save() {
    if (saving) return;
    const problem = check();
    if (problem) { setError(problem); return; }
    setSaving(true); setError("");
    const keepSecret = keep && hasKey;
    const result = await call("POST", { action: "save", name: server?.name ?? name, url, authHeader: header || null, secret: keepSecret || !secret ? null : secret, keepSecret, expectedVersion: server?.version ?? 0 });
    setSaving(false);
    if (result.ok) onSaved(server?.name ?? name, !server, "");
    else if (result.status === 409) onSaved(server?.name ?? name, false, failure(result));
    else setError(failure(result));
  }

  return <form className={styles.editor} noValidate onSubmit={event => { event.preventDefault(); void save(); }} onKeyDown={(event: KeyboardEvent) => { if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) { event.preventDefault(); void save(); } }}>
    <div className={styles.dialogHead}><h3>{server ? `Edit ${server.name}` : "Add MCP server"}</h3><button type="button" className={styles.iconButton} aria-label="Close editor" onClick={onClose}><X size={18} aria-hidden="true" /></button></div>
    {!server && <div className={styles.field}><label htmlFor="mcp-name">Name</label><input id="mcp-name" className={styles.input} value={name} maxLength={20} autoComplete="off" spellCheck={false} aria-describedby="mcp-name-hint" onChange={event => setName(event.target.value)} /><span id="mcp-name-hint">Lowercase letters, digits and hyphens, max 20.</span></div>}
    <div className={styles.field}><label htmlFor="mcp-url">URL</label><input id="mcp-url" type="url" className={styles.input} value={url} autoComplete="off" spellCheck={false} aria-describedby="mcp-url-hint" onChange={event => setUrl(event.target.value)} /><span id="mcp-url-hint">https only. Changing the URL, header or key clears tested tools and disables the server.</span></div>
    <div className={styles.field}><label htmlFor="mcp-header">Auth header name (optional)</label><input id="mcp-header" className={styles.input} value={header} placeholder="Authorization or X-API-Key" autoComplete="off" spellCheck={false} onChange={event => setHeader(event.target.value)} /></div>
    {hasKey && <label className={styles.check}><input type="checkbox" checked={keep} onChange={event => setKeep(event.target.checked)} /> Keep the saved key</label>}
    {!(hasKey && keep) && <div className={styles.field}><label htmlFor="mcp-secret">API key (optional)</label><input id="mcp-secret" type="password" className={styles.input} value={secret} autoComplete="new-password" aria-describedby="mcp-secret-hint" onChange={event => setSecret(event.target.value)} /><span id="mcp-secret-hint">{hasKey ? "Leave the header and key empty to remove authentication." : "Stored server-side and never shown again."}</span></div>}
    {error && <p role="alert" className={styles.invalid}>{error}</p>}
    <div className={styles.dialogActions}><span className={styles.spacer} /><button type="button" className={styles.button} onClick={onClose}>Cancel</button><button type="submit" className={styles.primary} disabled={saving}>{saving ? "Saving…" : "Save"}</button></div>
  </form>;
}

function ToolRow({ tool, busy, onMode }: { tool: McpTool; busy: boolean; onMode: (tool: McpTool, mode: "allow" | "ask" | "never") => void }) {
  return <li className={styles.tool}>
    <div className={styles.toolText}>
      <span className={`${styles.mono} ${styles.name}`}>{tool.name}</span>
      {tool.description && <details className={styles.toolDesc}><summary><span>{tool.description}</span></summary><p>{tool.description}</p></details>}
    </div>
    <div className={styles.segment} role="group" aria-label={`Access for ${tool.name}`}>
      {(["allow", "ask", "never"] as const).map(mode => <button key={mode} type="button" aria-pressed={tool.mode === mode} disabled={busy} onClick={() => tool.mode !== mode && onMode(tool, mode)}>{modeLabel[mode]}</button>)}
    </div>
  </li>;
}

export function McpRegistry() {
  const [servers, setServers] = useState<McpServerView[]>([]);
  const [load, setLoad] = useState<Load>("loading");
  const [selected, setSelected] = useState<string | null>(null);
  const [editing, setEditing] = useState<"new" | "edit" | null>(null);
  const [removing, setRemoving] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [testing, setTesting] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{ name: string; ok: boolean; message: string } | null>(null);
  const [notice, setNotice] = useState("");
  const [problem, setProblem] = useState("");

  const refresh = useCallback(async () => {
    const result = await call("GET");
    if (result.ok && Array.isArray(result.data.servers)) { setServers(result.data.servers as McpServerView[]); setLoad("ready"); }
    else setLoad(result.status === 401 || result.status === 403 ? "denied" : "unavailable");
  }, []);
  useEffect(() => { void Promise.resolve().then(refresh); }, [refresh]);

  const current = servers.find(server => server.name === selected) ?? null;

  async function patch(server: McpServerView, body: Record<string, unknown>, done: string, key = server.name) {
    setBusy(key); setProblem("");
    const result = await call("PATCH", { name: server.name, expectedVersion: server.version, ...body });
    setBusy(null);
    if (result.ok) { setNotice(done); if (body.action === "remove") setSelected(null); } else setProblem(failure(result));
    await refresh();
  }
  const toggle = (server: McpServerView) => patch(server, { action: server.enabled ? "disable" : "enable" }, `${server.enabled ? "Disabled" : "Enabled"} ${server.name}`);

  async function test(server: McpServerView) {
    setTesting(server.name); setProblem(""); setTestResult(null);
    const result = await call("POST", { action: "test", name: server.name, expectedVersion: server.version });
    setTesting(null);
    const outcome = result.data.test as { ok?: boolean; message?: string } | undefined;
    if (result.ok && outcome) { setTestResult({ name: server.name, ok: !!outcome.ok, message: outcome.message ?? "" }); setNotice(outcome.ok ? `Test passed for ${server.name}` : `Test failed for ${server.name}`); }
    else setProblem(failure(result));
    await refresh();
  }

  function saved(name: string, isNew: boolean, conflict: string) {
    setEditing(null); setTestResult(null);
    if (conflict) setProblem(conflict); else { setNotice(isNew ? `Added ${name}. Use Test connection next.` : "Saved"); setProblem(""); setSelected(name); }
    void refresh();
  }

  const detail = current && <aside className={styles.detail} aria-label={`${current.name} details`}>
    <div className={styles.detailHead}><h3 className={styles.mono}>{current.name}</h3><span className={styles.badge}>{status(current)}</span></div>
    <dl className={styles.facts}>
      <div className={styles.wide}><dt>URL</dt><dd>{current.url}</dd></div>
      <div><dt>Auth header</dt><dd>{current.authHeader ?? "None"}</dd></div><div><dt>API key</dt><dd>{current.hasSecret ? "set" : "not set"}</dd></div>
      <div><dt>Version</dt><dd>{current.version}</dd></div><div><dt>Calls</dt><dd>{current.calls}</dd></div>
      <div><dt>Last called</dt><dd>{when(current.lastCalledAt)}</dd></div>
      <div><dt>Last test</dt><dd>{current.lastTestAt ? `${when(current.lastTestAt)} · ${current.lastTestOk ? "passed" : "failed"}` : "Never"}</dd></div>
    </dl>
    {current.lastError && <p className={styles.errorText}>Last error: {current.lastError}</p>}
    <div className={styles.actions}>
      <button type="button" className={styles.button} disabled={testing !== null} onClick={() => void test(current)}>{testing === current.name ? "Testing…" : "Test connection"}</button>
      <button type="button" className={styles.button} onClick={() => setEditing("edit")}>Edit</button>
      <button type="button" className={styles.button} disabled={busy === current.name || (!current.enabled && current.lastTestOk !== true)} onClick={() => void toggle(current)}>{current.enabled ? "Disable" : "Enable"}</button>
      <button type="button" className={styles.danger} onClick={() => setRemoving(true)}>Remove</button>
    </div>
    {testResult?.name === current.name && <p className={styles.result}>{testResult.ok ? "Passed" : "Failed"}: {testResult.message}</p>}
    <h4>Tools ({current.tools.length})</h4>
    {current.tools.length === 0 ? <p>No tools yet. Run Test connection to list them.</p> : <ul className={styles.tools}>{current.tools.map(tool => <ToolRow key={tool.name} tool={tool} busy={busy === `${current.name}:${tool.name}`} onMode={(t, mode) => void patch(current, { action: "tool", tool: t.name, mode }, `${t.name}: ${modeLabel[mode]}`, `${current.name}:${t.name}`)} />)}</ul>}
    <p className={styles.note}>New or changed tools start as Never. Allowed tools are offered to the agent on Admin chats.</p>
  </aside>;

  return <section className={styles.registry} aria-labelledby="mcp-registry-title">
    <div className={styles.head}>
      <div><h2 id="mcp-registry-title">MCP servers</h2><p>Remote tools the agent can call on Admin chats. Allow runs a tool when the agent needs it; Ask shows the user each call to approve first; Never hides it. Every result is treated as untrusted data.</p></div>
      <button type="button" className={styles.primary} onClick={() => setEditing("new")} disabled={load !== "ready"}><Plus size={16} aria-hidden="true" /> Add server</button>
    </div>
    <div className={styles.live} role="status" aria-live="polite">{testing ? "Testing connection…" : notice}</div>
    {problem && <p className={styles.banner} role="alert">{problem}</p>}
    {load === "loading" && <p className={styles.state}>Loading MCP servers…</p>}
    {(load === "unavailable" || load === "denied") && <div className={styles.banner} role="alert"><p>{load === "denied" ? "An active administrator account is required." : "MCP registry is unavailable."}</p><button type="button" className={styles.button} onClick={() => { setLoad("loading"); void refresh(); }}>Retry</button></div>}
    {load === "ready" && servers.length === 0 && <div className={styles.state}><p>No MCP servers yet</p><button type="button" className={styles.primary} onClick={() => setEditing("new")}>Add server</button></div>}
    {load === "ready" && servers.length > 0 && <div className={styles.layout}>
      <ul className={styles.cards}>{servers.map(server => {
        const blocked = !server.enabled && server.lastTestOk !== true;
        return <li key={server.name} className={styles.card} data-selected={server.name === selected}>
          <button type="button" className={styles.cardMain} aria-pressed={server.name === selected} onClick={() => { setSelected(server.name); setTestResult(null); }}>
            <span className={`${styles.mono} ${styles.name}`}>{server.name}</span>
            <span className={styles.desc}>{host(server.url)}</span>
            <span className={styles.meta}><span className={styles.badge}>{status(server)}</span><span>{allowed(server)} of {server.tools.length} tools allowed</span><span>{server.calls} {server.calls === 1 ? "call" : "calls"}</span></span>
          </button>
          <button type="button" role="switch" aria-checked={server.enabled} aria-label={`Enable ${server.name}`} aria-describedby={blocked ? `mcp-block-${server.name}` : undefined} disabled={busy === server.name || blocked} className={styles.switch} onClick={() => void toggle(server)}>
            <span className={styles.track} aria-hidden="true"><span className={styles.thumb} /></span>
            <span className={styles.switchText}>{busy === server.name ? "Saving…" : server.enabled ? "On" : "Off"}</span>
          </button>
          {blocked && <span id={`mcp-block-${server.name}`} className={styles.blocked}>Run a passing test to enable.</span>}
        </li>;
      })}</ul>
      {detail}
    </div>}
    <Modal open={editing !== null} onClose={() => setEditing(null)} label="MCP server editor">
      {editing && <Editor key={`${editing}:${current?.name}:${current?.version}`} server={editing === "edit" ? current : null} onSaved={saved} onClose={() => setEditing(null)} />}
    </Modal>
    <Modal open={removing} onClose={() => setRemoving(false)} label="Remove MCP server">
      {current && <div className={styles.editor}>
        <h3>Remove {current.name}?</h3><p>Remove {current.name}? Its API key is deleted; history is kept.</p>
        <div className={styles.dialogActions}><span className={styles.spacer} /><button type="button" className={styles.button} onClick={() => setRemoving(false)}>Cancel</button><button type="button" className={styles.danger} onClick={() => { setRemoving(false); void patch(current, { action: "remove" }, "Removed"); }}>Remove</button></div>
      </div>}
    </Modal>
  </section>;
}
