"use client";

import { useMemo, useState, type ComponentType } from "react";
import { Activity, ArrowLeft, ArrowRight, Battery, ChevronLeft, ChevronRight, Cloud, Cog, Cpu, Database, GitBranch, HardDrive, Thermometer, User, Wifi, Workflow, X, type LucideProps } from "lucide-react";
import { CopyText } from "../ai-elements/code-block";
import { FLOW_EDGE_TYPES, flowLayers, parseFlowSpec, type FlowEdgeType, type FlowKind, type FlowSpec } from "./block-specs";
import styles from "./blocks.module.css";

const ICONS: Record<FlowKind, ComponentType<LucideProps>> = { power: Battery, mcu: Cpu, sensor: Thermometer, actuator: Cog, signal: Activity, process: Workflow, decision: GitBranch, data: Database, cloud: Cloud, user: User, storage: HardDrive, network: Wifi };
const EDGE_NAMES: Record<FlowEdgeType, string> = { power: "Power", signal: "Signal", data: "Data" };
const NW = 112, NH = 68, CG = 80, RG = 18, PAD = 16, CARD_W = 224, CARD_H = 230;

function CardBody({ spec, id, onClose }: { spec: FlowSpec; id: string; onClose: () => void }) {
  const node = spec.nodes.find(n => n.id === id)!;
  const other = (oid: string) => spec.nodes.find(n => n.id === oid)!;
  const row = (oid: string, label: string | undefined) => { const Icon = ICONS[other(oid).kind]; return <li key={oid + (label ?? "")}><Icon size={14} aria-hidden="true" />{other(oid).label}{label && <em>{label}</em>}</li>; };
  const outs = spec.edges.filter(e => e.from === id), ins = spec.edges.filter(e => e.to === id);
  return <>
    <h4>{node.label}<span className={styles.fKind}>{node.kind}</span></h4>
    {node.detail && <p>{node.detail}</p>}
    {outs.length > 0 && <ul className={styles.fRows} aria-label="Connects to"><li><ArrowRight size={14} aria-hidden="true" />connects to</li>{outs.map(e => row(e.to, e.label))}</ul>}
    {ins.length > 0 && <ul className={styles.fRows} aria-label="Fed by"><li><ArrowLeft size={14} aria-hidden="true" />fed by</li>{ins.map(e => row(e.from, e.label))}</ul>}
    <button type="button" className={styles.fClose} aria-label="Close details" onClick={onClose}><X size={14} aria-hidden="true" /></button>
  </>;
}

function Diagram({ spec, selected, onSelect, onClose }: { spec: FlowSpec; selected: string | null; onSelect: (id: string) => void; onClose: () => void }) {
  const layers = useMemo(() => flowLayers(spec), [spec]);
  const pos = useMemo(() => {
    const rows = Math.max(...layers.map(l => l.length));
    const H = PAD * 2 + rows * NH + (rows - 1) * RG;
    const m = new Map<string, { x: number; y: number }>();
    layers.forEach((l, c) => l.forEach((id, r) => m.set(id, { x: PAD + c * (NW + CG), y: (H - (l.length * NH + (l.length - 1) * RG)) / 2 + r * (NH + RG) })));
    return { m, W: PAD * 2 + layers.length * NW + (layers.length - 1) * CG, H };
  }, [layers]);
  const near = new Set<string>(selected ? [selected] : []);
  if (selected) for (const e of spec.edges) { if (e.from === selected) near.add(e.to); if (e.to === selected) near.add(e.from); }
  const sp = selected ? pos.m.get(selected)! : null;
  const cardX = sp ? (sp.x + NW + 8 + CARD_W <= pos.W ? sp.x + NW + 8 : Math.max(0, sp.x - 8 - CARD_W)) : 0;
  const cardY = sp ? Math.max(0, Math.min(sp.y, Math.max(pos.H, CARD_H) - CARD_H)) : 0;
  return <div className={styles.fStage} style={{ width: pos.W, height: selected ? Math.max(pos.H, CARD_H) : pos.H }} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
    <svg viewBox={`0 0 ${pos.W} ${pos.H}`} width={pos.W} height={pos.H} aria-hidden="true">
      <defs>
        <marker id="fa" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto"><path className={styles.fArrow} d="M0,0 L8,4 L0,8 z" /></marker>
        <marker id="fao" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto"><path className={styles.fArrowOn} d="M0,0 L8,4 L0,8 z" /></marker>
      </defs>
      {spec.edges.map((e, i) => {
        const a = pos.m.get(e.from)!, b = pos.m.get(e.to)!;
        const ax = a.x + NW, ay = a.y + NH / 2, bx = b.x, by = b.y + NH / 2;
        const dx = Math.max(30, Math.abs(bx - ax) / 2);
        const d = `M${ax},${ay} C${ax + dx},${ay} ${bx - dx},${by} ${bx},${by}`;
        const on = selected === e.from || selected === e.to, dim = !!selected && !on;
        const lx = (ax + bx) / 2, ly = (ay + by) / 2;
        return <g key={i}>
          <path className={styles.fEdge} d={d} data-type={e.type ?? "signal"} data-on={on} data-dim={dim} markerEnd={`url(#${on ? "fao" : "fa"})`} />
          <circle className={styles.fDot} r={on ? 3.5 : 2.5} data-dim={dim}><animateMotion dur="2.5s" repeatCount="indefinite" path={d} begin={`${(i * 0.45) % 2.5}s`} /></circle>
          {e.label && <g className={styles.fLabel} data-dim={dim}>
            <rect className={styles.fPill} x={lx - e.label.length * 2.9 - 6} y={ly - 8} width={e.label.length * 5.8 + 12} height={16} rx={8} />
            <text x={lx} y={ly + 3.5}>{e.label}</text>
          </g>}
        </g>;
      })}
    </svg>
    {spec.nodes.map(n => {
      const p = pos.m.get(n.id)!, Icon = ICONS[n.kind];
      return <button key={n.id} type="button" className={styles.fNode} style={{ left: p.x, top: p.y, width: NW, height: NH }} aria-pressed={selected === n.id} data-dim={!!selected && !near.has(n.id)} onClick={() => onSelect(n.id)} title={n.label}>
        <Icon size={20} aria-hidden="true" /><span>{n.label}</span>
      </button>;
    })}
    {selected && <div className={`${styles.fCard} ${styles.fFloat}`} role="status" style={{ left: cardX, top: cardY }}><CardBody spec={spec} id={selected} onClose={onClose} /></div>}
  </div>;
}

export function FlowBlock({ code }: { code: string }) {
  const spec = useMemo(() => parseFlowSpec(code), [code]);
  const [selected, setSelected] = useState<string | null>(null);
  if (!spec) return <figure className={styles.block}><pre className={styles.plain}><code>{code}</code></pre><p className={styles.note}>Flow could not be drawn</p></figure>;
  const order = flowLayers(spec).flat();
  const idx = selected ? order.indexOf(selected) : -1;
  const close = () => setSelected(null);
  const used = FLOW_EDGE_TYPES.filter(t => spec.edges.some(e => (e.type ?? "signal") === t));
  return <figure className={styles.block} onKeyDown={e => { if (e.key === "Escape") close(); }}>
    <div className={styles.header}><span>{spec.title ?? "Flow"}</span><span className={styles.fMeta}>{spec.nodes.length} parts · {spec.edges.length} links<CopyText text={code} label="Copy source" /></span></div>
    <div className={styles.scroll}><Diagram spec={spec} selected={selected} onSelect={id => setSelected(s => (s === id ? null : id))} onClose={close} /></div>
    {selected && <div className={`${styles.fCard} ${styles.fBelow}`} role="status"><CardBody spec={spec} id={selected} onClose={close} /></div>}
    <div className={styles.fBar}>
      <button type="button" disabled={idx <= 0} onClick={() => setSelected(order[idx - 1])}><ChevronLeft size={14} aria-hidden="true" />Prev</button>
      <button type="button" disabled={idx === order.length - 1} onClick={() => setSelected(order[idx + 1])}>Next<ChevronRight size={14} aria-hidden="true" /></button>
      <span>{idx >= 0 ? `Step ${idx + 1} of ${order.length}` : "Step through or select a part"}</span>
      <span className={styles.fLegend}>{used.map(t => <span key={t}><svg viewBox="0 0 24 6" aria-hidden="true"><line x1="0" y1="3" x2="24" y2="3" stroke="currentColor" strokeWidth={t === "power" ? 2.5 : 1.5} strokeDasharray={t === "data" ? "5 4" : undefined} /></svg>{EDGE_NAMES[t]}</span>)}</span>
    </div>
  </figure>;
}
