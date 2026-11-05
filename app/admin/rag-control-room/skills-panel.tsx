"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import styles from "./rag-control-room.module.css";

type SkillVersion = { version: number; hash: string; source: string; content: string; reviewed: boolean; permissions: string[]; budget: { modelCalls: number; workers: number; nodes: number; deadlineMs: number; fragments: number; contextUnits: number } };
type Skill = { id: string; title: string; enabled: boolean; activeVersion: number | null; version: number; versions: SkillVersion[]; history: { action: string; bundleVersion: number | null; at: string; reason: string }[] };
type Action = "review" | "enable" | "disable" | "rollback";
const endpoint = "/api/admin/panda-agent/skills";

export function SkillsPanel() {
  const [skills, setSkills] = useState<Skill[] | null>(null);
  const [selection, setSelection] = useState("");
  const [bundleVersion, setBundleVersion] = useState("");
  const [action, setAction] = useState<Action>("review");
  const [reason, setReason] = useState("");
  const [notice, setNotice] = useState("Loading skills…");
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [blocked, setBlocked] = useState(false);
  const refresh = useCallback(async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    try {
      const response = await fetch(endpoint, { cache: "no-store" });
      if (!response.ok) throw new Error();
      const data = await response.json();
      if (!Array.isArray(data.skills)) throw new Error();
      setSkills(data.skills); setBlocked(false); setNotice("");
    } catch { setBlocked(true); setNotice("Skills are unavailable. Refresh before making changes."); }
    finally { busyRef.current = false; setBusy(false); }
  }, []);
  useEffect(() => { const timer = window.setTimeout(() => void refresh(), 0); return () => window.clearTimeout(timer); }, [refresh]);
  const selected = skills?.find(skill => skill.id === selection);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected || busyRef.current || blocked || !eligible || !reason.trim()) return;
    busyRef.current = true;
    setBusy(true); setNotice("");
    try {
      const response = await fetch(endpoint, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ skillId: selected.id, action, bundleVersion: Number(bundleVersion), expectedVersion: selected.version, reason: reason.trim() }), cache: "no-store" });
      if (!response.ok) { setBlocked(true); setNotice(response.status === 409 ? "This skill changed. Refresh and review the latest version before trying again." : "The change could not be confirmed. Refresh before trying again."); return; }
      const data = await response.json();
      if (!Array.isArray(data.skills)) throw new Error();
      setSkills(data.skills); setReason(""); setNotice("Skill change saved.");
    } catch { setBlocked(true); setNotice("The change outcome is unknown. Refresh before trying again."); }
    finally { busyRef.current = false; setBusy(false); }
  }
  const chosen = selected?.versions.find(version => version.version === Number(bundleVersion));
  const eligible = !!selected && !!chosen && (action === "review" || (action === "enable" && chosen.reviewed) || (action === "disable" && selected.enabled && chosen.version === selected.activeVersion) || (action === "rollback" && chosen.reviewed && chosen.version !== selected.activeVersion && selected.history.some(entry => (entry.action === "enable" || entry.action === "rollback") && entry.bundleVersion === chosen.version)));
  return <section className={`${styles.panel} ${styles.wide}`} id="skills">
    <div className={styles.panelHead}><div><h2>Skills</h2><p>Review bundled versions and manage their availability.</p></div><button type="button" disabled={busy} onClick={() => void refresh()}>Refresh</button></div>
    {notice && <p role={blocked ? "alert" : "status"}>{notice}</p>}
    {skills?.length === 0 && <p>No skills are available.</p>}
    {skills && skills.length > 0 && <div className={styles.form}><label>Skill<select value={selection} disabled={busy} onChange={event => { setSelection(event.target.value); setBundleVersion(""); setReason(""); }}><option value="">Choose a skill</option>{skills.map(skill => <option key={skill.id} value={skill.id}>{skill.title}</option>)}</select></label></div>}
    {selected && <><p>{selected.enabled ? "Enabled" : "Disabled"} · active version {selected.activeVersion ?? "none"} · record version {selected.version}</p>
      <ul className={styles.list}>{selected.versions.map(version => <li key={version.version}><div><strong>Version {version.version}</strong><p>{version.reviewed ? "Reviewed" : "Not reviewed"} · {version.source}</p><p>Content hash: {version.hash}</p><p>Permissions: {version.permissions.join(", ") || "none"}</p><p>Budget: {version.budget.modelCalls} model calls · {version.budget.workers} workers · {version.budget.nodes} nodes · {version.budget.deadlineMs} ms · {version.budget.fragments} fragments · {version.budget.contextUnits} context units</p><details><summary>Review bundled content</summary><pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{version.content}</pre></details></div></li>)}</ul>
      <form className={styles.form} onSubmit={submit}><label>Action<select value={action} disabled={busy || blocked} onChange={event => setAction(event.target.value as Action)}><option value="review">Review</option><option value="enable">Enable</option><option value="disable">Disable</option><option value="rollback">Roll back</option></select></label><label>Bundled version<select required value={bundleVersion} disabled={busy || blocked} onChange={event => setBundleVersion(event.target.value)}><option value="">Choose a version</option>{selected.versions.map(version => <option key={version.version} value={version.version}>{version.version}{version.reviewed ? " · reviewed" : " · not reviewed"}</option>)}</select></label><p>Enable requires review; rollback requires a previously active reviewed version. Disable targets the active version.</p><label>Reason<textarea required maxLength={300} value={reason} disabled={busy || blocked} onChange={event => setReason(event.target.value)} /></label><button type="submit" disabled={busy || blocked || !eligible || !reason.trim()}>{busy ? "Saving…" : "Save change"}</button></form>
      <details><summary>Change history</summary>{selected.history.length ? <ul className={styles.list}>{selected.history.map((entry, index) => <li key={index}><div><strong>{entry.action} · {entry.bundleVersion}</strong><p>{entry.at} · {entry.reason}</p></div></li>)}</ul> : <p>No recorded changes.</p>}</details>
    </>}
  </section>;
}
