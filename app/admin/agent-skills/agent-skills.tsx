"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import Link from "next/link";
import { projectNativeInspection } from "@/Panda-agent/src/opencode/inspection-client";
import styles from "./agent-skills.module.css";

const tabs = ["Skills", "MCP Servers", "Tools", "Configuration"] as const;
type Tab = typeof tabs[number];
type Counts = { skills: number; mcpServers: number; models: number };
type State = { kind: "loading" } | { kind: "unavailable" } | { kind: "denied" } | { kind: "ready"; counts: Counts; version: string };

export function AgentSkills() {
  const [tab, setTab] = useState<Tab>("Skills");
  const [revision, setRevision] = useState(0);
  const [state, setState] = useState<State>({ kind: "loading" });
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/admin/panda-agent/runtime", { cache: "no-store", signal: controller.signal }).then(async (response): Promise<State> => {
      if (response.status === 401 || response.status === 403) return { kind: "denied" } as State;
      if (!response.ok) return { kind: "unavailable" } as State;
      const data = projectNativeInspection(await response.json());
      return { kind: "ready", version: data.version, counts: data.counts };
    }).catch(() => ({ kind: "unavailable" } as State)).then(result => { if (!controller.signal.aborted) setState(result); });
    return () => controller.abort();
  }, [revision]);

  function selectTab(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let next = index;
    if (event.key === "ArrowRight") next = (index + 1) % tabs.length;
    else if (event.key === "ArrowLeft") next = (index + tabs.length - 1) % tabs.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = tabs.length - 1;
    else return;
    event.preventDefault(); setTab(tabs[next]); tabRefs.current[next]?.focus();
  }

  return <div className={styles.screen}>
    <header className={styles.heading}><div><p className={styles.eyebrow}>Admin / Panda Agent</p><h1>Agent Skills</h1><p>Review discovery and available controls for agent capabilities.</p></div><button type="button" disabled={state.kind === "loading"} onClick={() => { setState({ kind: "loading" }); setRevision(value => value + 1); }}>Refresh discovery</button></header>
    <div className={styles.tabs} role="tablist" aria-label="Agent Skills sections">{tabs.map((item, index) => <button key={item} ref={node => { tabRefs.current[index] = node; }} role="tab" id={`skill-tab-${index}`} aria-controls={`skill-panel-${index}`} aria-selected={tab === item} tabIndex={tab === item ? 0 : -1} onClick={() => setTab(item)} onKeyDown={event => selectTab(event, index)}>{item}</button>)}</div>
    <div className={styles.notice} role="status">{state.kind === "loading" ? "Loading discovery…" : state.kind === "denied" ? "Access denied. An active administrator account is required." : state.kind === "unavailable" ? "Discovery is unavailable. Refresh to check again." : `Discovery only · version ${state.version}. Counts do not establish execution readiness or permissions.`}</div>
    {tabs.map((item, index) => <section key={item} className={styles.panel} role="tabpanel" id={`skill-panel-${index}`} aria-labelledby={`skill-tab-${index}`} hidden={tab !== item} tabIndex={0}>
      {item === "Skills" && <><h2>Skills</h2><p>Discoverable native skills {state.kind === "ready" ? `: ${state.counts.skills}` : "are not currently available"}.</p><p>Discovery returns a count only. Skill names, origin and validation are not available here.</p><Link href="/admin/rag-control-room#skills">Open existing RAG skill controls</Link><div className={styles.actions}><button disabled type="button">Install skill</button><button disabled type="button">Configure skill</button></div><p>Installation and configuration are not available through discovery.</p></>}
      {item === "MCP Servers" && <><h2>MCP Servers</h2><p>Discoverable MCP servers {state.kind === "ready" ? `: ${state.counts.mcpServers}` : "are not currently available"}.</p><p>Discovery returns a count only. Server details, connectivity and discovered tools are not available here.</p><div className={styles.actions}><button disabled type="button">Add server</button><button disabled type="button">Connect or discover tools</button></div><p>Server configuration and connection tests are unavailable.</p></>}
      {item === "Tools" && <><h2>Tools</h2><p>Native tool details and effective permissions are not available through this discovery view.</p><Link href="/admin/rag-control-room#tools">Open existing RAG tool controls</Link><div className={styles.actions}><button disabled type="button">Configure tools</button></div><p>Native tool configuration is unavailable.</p></>}
      {item === "Configuration" && <><h2>Configuration</h2><p>Discoverable models {state.kind === "ready" ? `: ${state.counts.models}` : "are not currently available"}. Model names and settings are not exposed here.</p><p>Discovery does not establish that a model, skill or tool can execute.</p><div className={styles.actions}><button disabled type="button">Edit configuration</button></div><p>Configuration changes are unavailable.</p></>}
    </section>)}
  </div>;
}
