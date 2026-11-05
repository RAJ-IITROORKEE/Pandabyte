"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { parseDocumentationDTO, type DocumentationDTO, type DocumentationVersion } from "@/Panda-agent/src/diagnostics/documentation-contracts";
import styles from "./documentation.module.css";

const endpoint = "/api/admin/panda-agent/documentation";
const catalogId = "espressif-esp-idf-5.5.1-esp32-gpio";
type Notice = { text: string; error: boolean } | null;
async function request(method: "GET" | "POST" | "PATCH", body: Record<string, unknown> | undefined, controller: AbortController) {
  const timer = window.setTimeout(() => controller.abort(), 35000);
  let onAbort: (() => void) | undefined;
  const interrupted = new Promise<never>((_, reject) => { onAbort = () => reject(new Error("interrupted")); controller.signal.addEventListener("abort", onAbort, { once: true }); });
  try {
    const response = await Promise.race([fetch(endpoint, { method, ...(body ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}), cache: "no-store", signal: controller.signal }), interrupted]);
    return { ok: response.ok, status: response.status, data: response.ok ? await Promise.race([response.json(), interrupted]) : null };
  } finally { window.clearTimeout(timer); if (onAbort) controller.signal.removeEventListener("abort", onAbort); }
}

export function DocumentationPanel() {
  const [data, setData] = useState<DocumentationDTO | null>(null);
  const [notice, setNotice] = useState<Notice>({ text: "Loading documentation…", error: false });
  const [blocked, setBlocked] = useState(false), [busy, setBusy] = useState(false);
  const [rightsEvidence, setRightsEvidence] = useState(""), [attribution, setAttribution] = useState("");
  const [selected, setSelected] = useState(""), [action, setAction] = useState<"approve" | "withdraw">("approve");
  const [rights, setRights] = useState<DocumentationVersion["rights"]>("unknown"), [reviewEvidence, setReviewEvidence] = useState(""), [reason, setReason] = useState("");
  const [toolReason, setToolReason] = useState("");
  const inFlight = useRef(false);
  const controller = useRef<AbortController | null>(null), mounted = useRef(true);
  const apply = (value: unknown) => { const parsed = parseDocumentationDTO(value); if (!parsed) throw new Error("invalid response"); setData(parsed); };
  const refresh = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true; setBusy(true);
    const operation = new AbortController(); controller.current = operation;
    try { const response = await request("GET", undefined, operation); if (!response.ok) throw new Error(); if (!mounted.current) return; apply(response.data); setSelected(""); setBlocked(false); setNotice(null); }
    catch { if (mounted.current) { setBlocked(true); setNotice({ text: "Documentation is unavailable. Refresh before making changes.", error: true }); } }
    finally { controller.current = null; inFlight.current = false; if (mounted.current) setBusy(false); }
  }, []);
  useEffect(() => { mounted.current = true; const timer = window.setTimeout(() => void refresh(), 0); return () => { mounted.current = false; window.clearTimeout(timer); controller.current?.abort(); }; }, [refresh]);
  const document = data?.documents[0], tool = data?.tools[0];
  const version = document?.versions.find(item => item.id === selected);
  async function mutate(method: "POST" | "PATCH", body: Record<string, unknown>) {
    if (inFlight.current || blocked) return;
    inFlight.current = true; setBusy(true); setNotice(null);
    const operation = new AbortController(); controller.current = operation;
    try {
      const response = await request(method, body, operation);
      if (!mounted.current) return;
      if (!response.ok) { setBlocked(true); setNotice({ text: response.status === 409 ? "The record changed or the source no longer matches. Refresh and review before trying again." : "The change could not be confirmed. Refresh before trying again.", error: true }); return; }
      apply(response.data); setNotice({ text: "Change saved.", error: false });
    } catch { if (mounted.current) { setBlocked(true); setNotice({ text: "The outcome is unknown. Refresh before trying again.", error: true }); } }
    finally { controller.current = null; inFlight.current = false; if (mounted.current) setBusy(false); }
  }
  function capture(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!rightsEvidence.trim() || !attribution.trim()) return;
    void mutate("POST", { catalogId, rightsEvidence: rightsEvidence.trim(), attribution: attribution.trim() });
  }
  function review(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!document || !version || !reviewEvidence.trim() || !reason.trim()) return;
    void mutate("PATCH", { target: "document", versionId: version.id, expectedVersion: document.version, action, rights, rightsEvidence: reviewEvidence.trim(), reason: reason.trim() });
  }
  function changeTool(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!tool || !toolReason.trim()) return;
    void mutate("PATCH", { target: "tool", toolId: tool.id, expectedVersion: tool.version, enabled: !tool.enabled, reason: toolReason.trim() });
  }
  const guarded = busy || blocked;
  return <>
    <section className={styles.panel} aria-labelledby="documentation-title">
      <h2 id="documentation-title">Reviewed sources</h2><p>Only the fixed ESP-IDF 5.5.1 ESP32 GPIO catalog entry is available. New captures are pending review.</p>
      <button type="button" disabled={busy} onClick={() => void refresh()}>Refresh</button>
      {blocked && <p role="status">Refresh and review the latest records before making further changes.</p>}
      {notice && <div className={styles.notice} role={notice.error ? "alert" : "status"}><span>{notice.text}</span> <button type="button" aria-label="Dismiss notification" onClick={() => setNotice(null)}>Dismiss</button></div>}
      {!data && !notice && <p>Documentation is unavailable.</p>}
      {data && !document && <p>No captured documentation versions yet.</p>}
      {document && <><h3>{document.title}</h3><p>{document.chip.toUpperCase()} · ESP-IDF {document.frameworkVersion} · record version {document.version}</p><p><a href={document.sourceUrl} target="_blank" rel="noopener noreferrer">Open canonical vendor source</a></p>
        {document.versions.length === 0 ? <p>No versions captured.</p> : <><label>Version<select value={selected} disabled={busy} onChange={event => setSelected(event.target.value)}><option value="">Choose a version</option>{document.versions.map(item => <option key={item.id} value={item.id}>{item.status} · {new Date(item.fetchedAt).toLocaleString()}</option>)}</select></label>
          {version && <><p>Status: {version.status} · rights: {version.rights} · fetched {new Date(version.fetchedAt).toLocaleString()}</p><p>Content hash: {version.contentHash}</p><p>Attribution: {version.attribution}</p><p>Rights evidence: {version.rightsEvidence}</p><details><summary>Review captured excerpt</summary><pre>{version.fragments.join("\n\n")}</pre></details>
            <form onSubmit={review}><label>Action<select value={action} disabled={guarded} onChange={event => setAction(event.target.value as "approve" | "withdraw")}><option value="approve">Approve</option><option value="withdraw">Withdraw</option></select></label><label>Rights<select value={rights} disabled={guarded} onChange={event => setRights(event.target.value as DocumentationVersion["rights"])}><option value="unknown">Unknown</option><option value="permitted">Permitted</option><option value="denied">Denied</option></select></label><label>Rights evidence<textarea required maxLength={2000} value={reviewEvidence} disabled={guarded} onChange={event => setReviewEvidence(event.target.value)} /></label><label>Reason<textarea required maxLength={300} value={reason} disabled={guarded} onChange={event => setReason(event.target.value)} /></label><button type="submit" disabled={guarded || !reason.trim() || !reviewEvidence.trim() || action === "approve" && (version.status === "approved" || rights !== "permitted") || action === "withdraw" && version.status === "withdrawn"}>{busy ? "Saving…" : "Save review"}</button></form></>}
        </>}
        <details><summary>Review history</summary>{document.history.length ? <ul>{document.history.map((entry, index) => <li key={index}>{entry.action} · {new Date(entry.at).toLocaleString()} · {entry.reason}</li>)}</ul> : <p>No review history.</p>}</details></>}
      <details><summary>Capture the fixed catalog source</summary><p>Capturing fetches the fixed official source and creates a pending version; it does not approve it.</p><form onSubmit={capture}><label>Rights evidence<textarea required maxLength={2000} value={rightsEvidence} disabled={guarded} onChange={event => setRightsEvidence(event.target.value)} /></label><label>Attribution<input required maxLength={400} value={attribution} disabled={guarded} onChange={event => setAttribution(event.target.value)} /></label><button type="submit" disabled={guarded || !rightsEvidence.trim() || !attribution.trim()}>{busy ? "Working…" : "Capture for review"}</button></form></details>
    </section>
    <section className={styles.panel} aria-labelledby="tool-title"><h2 id="tool-title">Vendor documentation search</h2>{tool ? <><p>{tool.enabled ? "Enabled" : "Disabled"} · record version {tool.version} · read-only, fixed catalog</p><details><summary>View tool manifest and history</summary><pre>{JSON.stringify(tool.manifest, null, 2)}</pre><p>Manifest hash: {tool.hash}</p>{tool.history.length ? <ul>{tool.history.map((entry, index) => <li key={index}>{entry.enabled ? "Enabled" : "Disabled"} · {new Date(entry.at).toLocaleString()} · {entry.reason}</li>)}</ul> : <p>No recorded changes.</p>}</details><form onSubmit={changeTool}><label>Reason<textarea required maxLength={300} value={toolReason} disabled={guarded} onChange={event => setToolReason(event.target.value)} /></label><button type="submit" disabled={guarded || !toolReason.trim()}>{busy ? "Saving…" : tool.enabled ? "Disable search" : "Enable search"}</button></form></> : <p>Tool status is unavailable.</p>}</section>
  </>;
}
