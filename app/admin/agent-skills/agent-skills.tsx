"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import Link from "next/link";
import { projectNativeInspection, type NativeInspection } from "@/Panda-agent/src/opencode/inspection-client";
import { SkillsPanel } from "../rag-control-room/skills-panel";
import { ToolsPanel } from "../rag-control-room/tools-panel";
import { SkillsRegistry } from "./skills-registry";
import { McpRegistry } from "./mcp-registry";
import styles from "./agent-skills.module.css";

const tabs = ["Skills", "MCP Servers", "Tools", "Configuration"] as const;
type Tab = typeof tabs[number];
type State = { kind: "loading" } | { kind: "unavailable" } | { kind: "denied" } | { kind: "ready"; discovery: NativeInspection };
const mcpStatuses = { connected: "Connected", pending: "Pending", disabled: "Disabled", failed: "Failed", needs_auth: "Authentication required" };

export function AgentSkills() {
  const [tab, setTab] = useState<Tab>("Skills");
  const [revision, setRevision] = useState(0);
  const [state, setState] = useState<State>({ kind: "loading" });
  const [visited, setVisited] = useState<Tab[]>(["Skills"]);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/admin/panda-agent/runtime", { cache: "no-store", signal: controller.signal }).then(async (response): Promise<State> => {
      if (response.status === 401 || response.status === 403) return { kind: "denied" } as State;
      if (!response.ok) return { kind: "unavailable" } as State;
      const data = projectNativeInspection(await response.json());
      return { kind: "ready", discovery: data };
    }).catch(() => ({ kind: "unavailable" } as State)).then(result => { if (!controller.signal.aborted) setState(result); });
    return () => controller.abort();
  }, [revision]);

  function activateTab(item: Tab) {
    setTab(item);
    setVisited(current => current.includes(item) ? current : [...current, item]);
  }

  function selectTab(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let next = index;
    if (event.key === "ArrowRight") next = (index + 1) % tabs.length;
    else if (event.key === "ArrowLeft") next = (index + tabs.length - 1) % tabs.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = tabs.length - 1;
    else return;
    event.preventDefault(); activateTab(tabs[next]); tabRefs.current[next]?.focus();
  }

  const discovery = state.kind === "ready" ? state.discovery : null;
  const unavailable = state.kind === "loading" ? "Loading native discovery…" : state.kind === "denied" ? "Native discovery requires an active administrator account." : "Native discovery is unavailable. Refresh to check again.";

  return <div className={styles.screen}>
    <header className={styles.heading}><div><p className={styles.eyebrow}>Admin / Panda Agent</p><h1>Agent Skills</h1><p>Review native discovery and manage existing RAG capabilities.</p></div><div className={styles.actions}><Link href="/admin/rag-control-room#playground">Open RAG Playground</Link><button type="button" disabled={state.kind === "loading"} onClick={() => { setState({ kind: "loading" }); setRevision(value => value + 1); }}>Refresh discovery</button></div></header>
    <div className={styles.tabs} role="tablist" aria-label="Agent Skills sections">{tabs.map((item, index) => <button key={item} ref={node => { tabRefs.current[index] = node; }} role="tab" id={`skill-tab-${index}`} aria-controls={`skill-panel-${index}`} aria-selected={tab === item} tabIndex={tab === item ? 0 : -1} onClick={() => activateTab(item)} onKeyDown={event => selectTab(event, index)}>{item}</button>)}</div>
    <div className={styles.notice} role="status">{discovery ? `OpenCode ${discovery.version} connected for read-only discovery. Native execution is off. Use RAG Playground to test retrieval.` : unavailable}</div>
    {tabs.map((item, index) => <section key={item} className={styles.panel} role="tabpanel" id={`skill-panel-${index}`} aria-labelledby={`skill-tab-${index}`} hidden={tab !== item} tabIndex={0}>
      {item === "Skills" && <><SkillsRegistry /><details className={styles.runtimeControls}><summary>Older skill systems</summary><h2>OpenCode skills</h2>{!discovery ? <p>{unavailable}</p> : discovery.skills.length === 0 ? <p>No skills were returned by native discovery.</p> : <ul className={styles.catalog}>{discovery.skills.map(skill => <li key={skill.id}><strong>{skill.name}</strong>{skill.description && <p>{skill.description}</p>}<p>Reported by OpenCode{skill.autoinvoke === undefined ? "" : ` · Automatic invocation ${skill.autoinvoke ? "on" : "off"}`}</p></li>)}</ul>}<p>Skill origin, review status, configuration requirements and effective permissions are not reported by this discovery interface. Instructions are not exposed here.</p><div className={styles.actions}><button disabled type="button">Install skill</button><button disabled type="button">Configure skill</button></div><p>Native installation, enablement and removal are unavailable in this interface.</p>
        <div className={styles.runtimeControls}><h2>Existing RAG runtime controls</h2><p>Review and manage the existing fixed skill bundles below. These controls are separate from OpenCode discovery; saved availability does not establish native execution.</p>{visited.includes("Skills") && <SkillsPanel includeTools={false} />}</div></details></>}
      {item === "MCP Servers" && <><McpRegistry /><details className={styles.runtimeControls}><summary>OpenCode discovery (read-only)</summary><h2>OpenCode MCP servers</h2>{!discovery ? <p>{unavailable}</p> : discovery.mcpServers.length === 0 ? <p>No MCP servers were returned by native discovery.</p> : <ul className={styles.catalog}>{discovery.mcpServers.map(server => <li key={server.name}><strong>{server.title ?? server.name}</strong>{server.title && <p>{server.name}</p>}<p>Reported connection state: {mcpStatuses[server.status]}</p></li>)}</ul>}<p>Connection states reflect this discovery snapshot. Transport, configuration, discovered tools and raw errors are not exposed. Refresh discovery to read the latest state.</p><div className={styles.actions}><button disabled type="button">Add server</button><button disabled type="button">Connect or discover tools</button></div><p>Server changes and connection tests are unavailable in this interface.</p></details></>}
      {item === "Tools" && <><h2>OpenCode tools</h2><p>A native tool catalog and effective tool permissions are unavailable through the verified discovery interfaces.</p><div className={styles.actions}><button disabled type="button">Configure native tools</button></div>
        <div className={styles.runtimeControls}><h2>Existing RAG runtime controls</h2><p>Inspect and manage the existing fixed tool manifests below. These controls are separate from OpenCode; enabling a manifest does not grant native execution permission.</p>{visited.includes("Tools") && <ToolsPanel />}</div></>}
      {item === "Configuration" && <><h2>OpenCode configuration</h2><h3>Discoverable models</h3>{!discovery ? <p>{unavailable}</p> : discovery.models.length === 0 ? <p>No models were returned by native discovery.</p> : <ul className={styles.catalog}>{discovery.models.map(model => <li key={`${model.providerID}:${model.id}`}><strong>{model.name}</strong><p>{model.providerID} · {model.id}</p><p>Catalog status: {model.status}</p></li>)}</ul>}<p>Catalog status is reported by OpenCode; it does not verify the provider connection, privacy policy, price or permission to run. No active model is established by this list.</p><div className={styles.actions}><button disabled type="button">Edit configuration</button></div><p>General model, skill and permission configuration writes are unsupported by the verified configuration API. Native execution remains unavailable.</p></>}
    </section>)}
  </div>;
}
