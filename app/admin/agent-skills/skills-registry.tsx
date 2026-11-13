"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { Plus, Search, Upload, X } from "lucide-react";
import { parseSkillMd, SKILL_MAX_CHARS } from "@/Panda-agent/src/agent-loop/skill-md";
import type { AgentSkill } from "@/Panda-agent/src/server/agent-skills-api";
import styles from "./skills-registry.module.css";

const API = "/api/admin/panda-agent/agent-skills";
const ENABLED_LIMIT = 12;
const TEMPLATE = `---
name: my-skill
description: One line saying when the agent should use this skill.
---

# When to use

Describe the requests this skill applies to.

# Steps

1. First step.
2. Second step.
`;
const filters = ["All", "Enabled", "Disabled"] as const;
type Filter = typeof filters[number];
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
  if (result.status === 401 || result.status === 403) return "An active administrator account is required.";
  if (result.status === 409) return "This skill changed elsewhere. Reloaded the latest version.";
  if (result.status === 429) return `Limit reached: at most ${ENABLED_LIMIT} enabled skills and 30 skills in total.`;
  if (result.status === 400) return typeof result.data.message === "string" ? result.data.message : "The request was not valid.";
  if (result.status === 404) return "That skill no longer exists.";
  return "Skills registry is unavailable. Try again.";
}

const when = (value: string | null) => value ? new Date(value).toLocaleString() : "Never";

function Switch({ skill, busy, onToggle }: { skill: AgentSkill; busy: boolean; onToggle: (skill: AgentSkill) => void }) {
  return <button type="button" role="switch" aria-checked={skill.enabled} aria-label={`Enable ${skill.name}`} disabled={busy} className={styles.switch} onClick={() => onToggle(skill)}>
    <span className={styles.track} aria-hidden="true"><span className={styles.thumb} /></span>
    <span className={styles.switchText}>{busy ? "Saving…" : skill.enabled ? "On" : "Off"}</span>
  </button>;
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

function Editor({ skill, onSaved, onClose }: { skill: AgentSkill | null; onSaved: (message: string) => void; onClose: () => void }) {
  const [text, setText] = useState(skill?.content ?? TEMPLATE);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const parsed = useMemo(() => parseSkillMd(text), [text]);
  const problem = "error" in parsed ? parsed.error : skill && parsed.name !== skill.name ? `The name must stay "${skill.name}".` : "";

  async function save() {
    if (problem || saving) return;
    setSaving(true); setError("");
    const result = await call("POST", { name: skill?.name ?? null, content: text, expectedVersion: skill?.version ?? 0 });
    setSaving(false);
    if (result.ok) onSaved("Saved");
    else if (result.status === 409) onSaved(failure(result));
    else setError(failure(result));
  }

  async function upload(file: File | undefined) {
    if (!file) return;
    setText((await file.slice(0, SKILL_MAX_CHARS * 4).text()).slice(0, SKILL_MAX_CHARS));
  }

  return <form className={styles.editor} onSubmit={event => { event.preventDefault(); void save(); }} onKeyDown={(event: KeyboardEvent) => { if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) { event.preventDefault(); void save(); } }}>
    <div className={styles.dialogHead}><h3>{skill ? `Edit ${skill.name}` : "New skill"}</h3><button type="button" className={styles.iconButton} aria-label="Close editor" onClick={onClose}><X size={18} aria-hidden="true" /></button></div>
    <label htmlFor="skill-md-text">SKILL.md</label>
    <textarea id="skill-md-text" className={styles.textarea} value={text} onChange={event => setText(event.target.value)} spellCheck={false} aria-describedby="skill-md-status" rows={16} />
    <p id="skill-md-status" className={styles.editorStatus}><span>{text.length} / {SKILL_MAX_CHARS}</span><span role={problem ? "alert" : undefined} className={problem ? styles.invalid : styles.valid}>{problem || "SKILL.md is valid."}</span></p>
    {error && <p role="alert" className={styles.invalid}>{error}</p>}
    <div className={styles.dialogActions}>
      <label className={styles.fileButton}><Upload size={16} aria-hidden="true" /> Upload SKILL.md<input type="file" accept=".md,text/markdown,text/plain" onChange={event => { void upload(event.target.files?.[0]); event.target.value = ""; }} /></label>
      <span className={styles.spacer} />
      <button type="button" className={styles.button} onClick={onClose}>Cancel</button>
      <button type="submit" className={styles.primary} disabled={!!problem || saving}>{saving ? "Saving…" : "Save"}</button>
    </div>
  </form>;
}

export function SkillsRegistry() {
  const [skills, setSkills] = useState<AgentSkill[]>([]);
  const [load, setLoad] = useState<Load>("loading");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("All");
  const [selected, setSelected] = useState<string | null>(null);
  const [editing, setEditing] = useState<"new" | "edit" | null>(null);
  const [removing, setRemoving] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [problem, setProblem] = useState("");
  const search = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    const result = await call("GET");
    if (result.ok && Array.isArray(result.data.skills)) { setSkills(result.data.skills as AgentSkill[]); setLoad("ready"); }
    else setLoad(result.status === 401 || result.status === 403 ? "denied" : "unavailable");
  }, []);

  useEffect(() => { void Promise.resolve().then(refresh); }, [refresh]);

  useEffect(() => {
    function key(event: globalThis.KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (event.key !== "/" || event.ctrlKey || event.metaKey || event.altKey || target?.closest("input, textarea, select, [contenteditable]")) return;
      event.preventDefault(); search.current?.focus();
    }
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);

  const enabledCount = skills.filter(skill => skill.enabled).length;
  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return skills.filter(skill => (filter === "All" || (filter === "Enabled") === skill.enabled) && (!needle || `${skill.name} ${skill.description}`.toLowerCase().includes(needle)));
  }, [skills, query, filter]);
  const current = skills.find(skill => skill.name === selected) ?? null;

  async function act(skill: AgentSkill, action: "enable" | "disable" | "remove", done: string) {
    setBusy(skill.name); setProblem("");
    const result = await call("PATCH", { name: skill.name, action, expectedVersion: skill.version });
    setBusy(null);
    if (result.ok) { setNotice(done); if (action === "remove") setSelected(null); } else setProblem(failure(result));
    await refresh();
  }

  const toggle = (skill: AgentSkill) => act(skill, skill.enabled ? "disable" : "enable", `${skill.enabled ? "Disabled" : "Enabled"} ${skill.name}`);

  function saved(message: string) {
    setEditing(null);
    if (message === "Saved") { setNotice(message); setProblem(""); } else setProblem(message);
    void refresh();
  }

  const detail = current && <aside className={styles.detail} aria-label={`${current.name} details`}>
    <div className={styles.detailHead}><h3 className={styles.mono}>{current.name}</h3><span className={styles.badge}>{current.source === "built-in" ? "Built-in" : "Custom"}</span></div>
    <p>{current.description}</p>
    <dl className={styles.facts}>
      <div><dt>Version</dt><dd>{current.version}</dd></div><div><dt>Status</dt><dd>{current.enabled ? "Enabled" : "Disabled"}</dd></div>
      <div><dt>Updated</dt><dd>{when(current.updatedAt)}</dd></div><div><dt>Uses</dt><dd>{current.uses}</dd></div>
      <div><dt>Last used</dt><dd>{when(current.lastUsedAt)}</dd></div>
    </dl>
    <pre className={styles.pre} tabIndex={0} aria-label="SKILL.md contents">{current.content}</pre>
    <div className={styles.actions}>
      <button type="button" className={styles.button} onClick={() => setEditing("edit")}>Edit</button>
      <button type="button" className={styles.button} disabled={busy === current.name} onClick={() => void toggle(current)}>{current.enabled ? "Disable" : "Enable"}</button>
      {current.source === "custom" && <button type="button" className={styles.danger} onClick={() => setRemoving(true)}>Remove</button>}
    </div>
  </aside>;

  return <section className={styles.registry} aria-labelledby="skills-registry-title">
    <div className={styles.head}>
      <div><h2 id="skills-registry-title">Agent skills</h2><p>Instructions the agent loads when a request matches. Built-in skills can be edited or turned off; custom skills can also be removed.</p></div>
      <button type="button" className={styles.primary} onClick={() => setEditing("new")} disabled={load !== "ready"}><Plus size={16} aria-hidden="true" /> New skill</button>
    </div>
    <div className={styles.live} role="status" aria-live="polite">{notice}</div>
    {problem && <p className={styles.banner} role="alert">{problem}</p>}

    {load === "loading" && <p className={styles.state}>Loading skills…</p>}
    {(load === "unavailable" || load === "denied") && <div className={styles.banner} role="alert"><p>{load === "denied" ? "An active administrator account is required." : "Skills registry is unavailable."}</p><button type="button" className={styles.button} onClick={() => { setLoad("loading"); void refresh(); }}>Retry</button></div>}
    {load === "ready" && skills.length === 0 && <div className={styles.state}><p>No skills yet</p><button type="button" className={styles.primary} onClick={() => setEditing("new")}>New skill</button></div>}
    {load === "ready" && skills.length > 0 && <>
      <div className={styles.toolbar}>
        <div className={styles.search}><label htmlFor="skill-search">Search skills</label><div><Search size={16} aria-hidden="true" /><input id="skill-search" ref={search} type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Press / to search" /></div></div>
        <div className={styles.chips} role="group" aria-label="Filter skills">{filters.map(item => <button key={item} type="button" aria-pressed={filter === item} onClick={() => setFilter(item)}>{item}</button>)}</div>
      </div>
      <p className={styles.count}>{skills.length} {skills.length === 1 ? "skill" : "skills"} · {enabledCount} enabled (limit {ENABLED_LIMIT})</p>
      <div className={styles.layout}>
        <div className={styles.list}>
          {visible.length === 0 ? <p className={styles.state}>No skills match.</p> : <ul className={styles.cards}>{visible.map(skill => <li key={skill.name} className={styles.card} data-selected={skill.name === selected}>
            <button type="button" className={styles.cardMain} aria-pressed={skill.name === selected} onClick={() => setSelected(skill.name)}>
              <span className={`${styles.mono} ${styles.name}`}>{skill.name}</span>
              <span className={styles.desc}>{skill.description}</span>
              <span className={styles.meta}><span className={styles.badge}>{skill.source === "built-in" ? "Built-in" : "Custom"}</span><span>Used {skill.uses} {skill.uses === 1 ? "time" : "times"}</span></span>
            </button>
            <Switch skill={skill} busy={busy === skill.name} onToggle={s => void toggle(s)} />
          </li>)}</ul>}
        </div>
        {detail}
      </div>
    </>}

    <Modal open={editing !== null} onClose={() => setEditing(null)} label="Skill editor">
      {editing && <Editor key={`${editing}:${current?.name}:${current?.version}`} skill={editing === "edit" ? current : null} onSaved={saved} onClose={() => setEditing(null)} />}
    </Modal>
    <Modal open={removing} onClose={() => setRemoving(false)} label="Remove skill">
      {current && <div className={styles.editor}>
        <h3>Remove {current.name}?</h3><p>Its history is kept.</p>
        <div className={styles.dialogActions}><span className={styles.spacer} /><button type="button" className={styles.button} onClick={() => setRemoving(false)}>Cancel</button><button type="button" className={styles.danger} onClick={() => { setRemoving(false); void act(current, "remove", "Removed"); }}>Remove</button></div>
      </div>}
    </Modal>
  </section>;
}
