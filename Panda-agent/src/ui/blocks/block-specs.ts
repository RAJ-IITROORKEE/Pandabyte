// Strict, model-output schemas for designed answer blocks. Anything that does not match exactly is shown as plain text.
export const WIRE_COLORS = ['red', 'black', 'yellow', 'green', 'blue', 'orange', 'white'] as const;
export type WireColor = (typeof WIRE_COLORS)[number];
export type WiringSpec = { title?: string; parts: { id: string; label: string; pins: string[] }[]; wires: { from: string; to: string; label?: string; color?: WireColor }[] };
export type StepsSpec = { title?: string; steps: { title: string; detail?: string; code?: string; lang?: string }[] };
export const FLOW_KINDS = ['power', 'mcu', 'sensor', 'actuator', 'signal', 'process', 'decision', 'data', 'cloud', 'user', 'storage', 'network'] as const;
export type FlowKind = (typeof FLOW_KINDS)[number];
export const FLOW_EDGE_TYPES = ['power', 'signal', 'data'] as const;
export type FlowEdgeType = (typeof FLOW_EDGE_TYPES)[number];
export type FlowSpec = { title?: string; nodes: { id: string; label: string; kind: FlowKind; detail?: string }[]; edges: { from: string; to: string; label?: string; type?: FlowEdgeType }[] };
export type CalloutSpec = { tone: 'info' | 'tip' | 'warning'; title?: string; text: string };

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const onlyKeys = (v: Record<string, unknown>, keys: string[]) => Object.keys(v).every(key => keys.includes(key));
const text = (v: unknown, max: number): v is string => typeof v === 'string' && v.trim().length > 0 && v.length <= max;
const optText = (v: unknown, max: number) => v === undefined || text(v, max);
const ID = /^[A-Za-z][\w-]{0,23}$/;

function parseJson(source: string, max: number): Record<string, unknown> | null {
  if (source.length > max) return null;
  try { const raw: unknown = JSON.parse(source); return isRecord(raw) ? raw : null; } catch { return null; }
}

export function parseWiringSpec(source: string): WiringSpec | null {
  const raw = parseJson(source, 8000);
  if (!raw || !onlyKeys(raw, ['title', 'parts', 'wires']) || !optText(raw.title, 80)) return null;
  const { parts, wires } = raw;
  if (!Array.isArray(parts) || parts.length < 2 || parts.length > 4) return null;
  if (!Array.isArray(wires) || wires.length < 1 || wires.length > 32) return null;
  const pinSet = new Set<string>();
  const ids = new Set<string>();
  for (const part of parts) {
    if (!isRecord(part) || !onlyKeys(part, ['id', 'label', 'pins']) || typeof part.id !== 'string' || !ID.test(part.id) || ids.has(part.id) || !text(part.label, 40)) return null;
    ids.add(part.id);
    const { pins } = part;
    if (!Array.isArray(pins) || pins.length < 1 || pins.length > 24) return null;
    for (const pin of pins) {
      if (!text(pin, 40) || pin.includes('.') || pinSet.has(`${part.id}.${pin}`)) return null;
      pinSet.add(`${part.id}.${pin}`);
    }
  }
  for (const wire of wires) {
    if (!isRecord(wire) || !onlyKeys(wire, ['from', 'to', 'label', 'color'])) return null;
    if (typeof wire.from !== 'string' || typeof wire.to !== 'string' || !pinSet.has(wire.from) || !pinSet.has(wire.to) || wire.from === wire.to) return null;
    if (!optText(wire.label, 40)) return null;
    if (wire.color !== undefined && !WIRE_COLORS.includes(wire.color as WireColor)) return null;
  }
  return raw as unknown as WiringSpec;
}

export function parseStepsSpec(source: string): StepsSpec | null {
  const raw = parseJson(source, 12000);
  if (!raw || !onlyKeys(raw, ['title', 'steps']) || !optText(raw.title, 80)) return null;
  const { steps } = raw;
  if (!Array.isArray(steps) || steps.length < 1 || steps.length > 12) return null;
  for (const step of steps) {
    if (!isRecord(step) || !onlyKeys(step, ['title', 'detail', 'code', 'lang']) || !text(step.title, 80) || !optText(step.detail, 600) || !optText(step.code, 1500) || !optText(step.lang, 20)) return null;
  }
  return raw as unknown as StepsSpec;
}

export function parseFlowSpec(source: string): FlowSpec | null {
  const raw = parseJson(source, 10000);
  if (!raw || !onlyKeys(raw, ['title', 'nodes', 'edges']) || !optText(raw.title, 80)) return null;
  const { nodes, edges } = raw;
  if (!Array.isArray(nodes) || nodes.length < 2 || nodes.length > 12) return null;
  if (!Array.isArray(edges) || edges.length < 1 || edges.length > 20) return null;
  const ids = new Set<string>();
  for (const n of nodes) {
    if (!isRecord(n) || !onlyKeys(n, ['id', 'label', 'kind', 'detail']) || typeof n.id !== 'string' || !ID.test(n.id) || ids.has(n.id)) return null;
    if (!text(n.label, 32) || !FLOW_KINDS.includes(n.kind as FlowKind) || !optText(n.detail, 400)) return null;
    ids.add(n.id);
  }
  for (const e of edges) {
    if (!isRecord(e) || !onlyKeys(e, ['from', 'to', 'label', 'type']) || typeof e.from !== 'string' || typeof e.to !== 'string') return null;
    if (!ids.has(e.from) || !ids.has(e.to) || e.from === e.to || !optText(e.label, 24)) return null;
    if (e.type !== undefined && !FLOW_EDGE_TYPES.includes(e.type as FlowEdgeType)) return null;
  }
  return raw as unknown as FlowSpec;
}

// Columns by longest path from the sources; back-edges found by DFS are ignored so cycles still lay out.
export function flowLayers(spec: FlowSpec): string[][] {
  const out = new Map<string, string[]>(spec.nodes.map(n => [n.id, []]));
  const hasIn = new Set<string>();
  for (const e of spec.edges) { out.get(e.from)!.push(e.to); hasIn.add(e.to); }
  const state = new Map<string, 1 | 2>(); // 1 = on stack, 2 = done
  const back = new Set<string>();
  const visit = (id: string) => {
    state.set(id, 1);
    for (const t of out.get(id)!) {
      if (state.get(t) === 1) back.add(`${id}>${t}`);
      else if (!state.has(t)) visit(t);
    }
    state.set(id, 2);
  };
  for (const n of spec.nodes) if (!hasIn.has(n.id)) visit(n.id);
  for (const n of spec.nodes) if (!state.has(n.id)) visit(n.id);
  const dag = spec.edges.filter(e => !back.has(`${e.from}>${e.to}`));
  const layer = new Map<string, number>(spec.nodes.map(n => [n.id, 0]));
  for (let i = 0; i < spec.nodes.length; i++) {
    let changed = false;
    for (const e of dag) if (layer.get(e.to)! < layer.get(e.from)! + 1) { layer.set(e.to, layer.get(e.from)! + 1); changed = true; }
    if (!changed) break;
  }
  const cols: string[][] = [];
  for (const n of spec.nodes) (cols[layer.get(n.id)!] ??= []).push(n.id);
  return cols.filter(Boolean);
}

export function parseCalloutSpec(source: string): CalloutSpec | null {
  const raw = parseJson(source, 1500);
  if (!raw || !onlyKeys(raw, ['tone', 'title', 'text']) || !optText(raw.title, 80) || !text(raw.text, 600)) return null;
  if (raw.tone !== 'info' && raw.tone !== 'tip' && raw.tone !== 'warning') return null;
  return raw as unknown as CalloutSpec;
}

// Mermaid renders with securityLevel "strict"; this is an extra pre-filter for interactive/injection syntax.
const MERMAID_BLOCKED = /\bclick\b|href|javascript:|<\s*script|%%\{|@import|\bcallback\b/i;
export function mermaidSourceAllowed(code: string): boolean {
  return code.trim().length > 0 && code.length <= 4000 && !MERMAID_BLOCKED.test(code);
}
