// Live events of one agent turn beyond activity stages (14 Nov 2026): tool steps for the thinking panel and a compiled firmware
// image for the firmware card. Shared by the server (sender) and the browser (validator), like plan.ts. Never stored.
import type { PlanStep } from './plan.ts';

export type ToolStep = { id: string; name: string; label: string; state: 'running' | 'done' | 'error'; ms?: number };
export type Firmware = { id: string; board: string; fqbn: string; address: number; size: number; sha256: string; binBase64: string; durationMs: number };
/** Where a turn's live events go (the streamed chat); every member is optional and presentation only. */
export type TurnSink = { plan?(steps: readonly PlanStep[]): void; tool?(step: ToolStep): void; firmware?(firmware: Firmware): void };

export const MAX_STREAM_FIRMWARE_BYTES = 2 * 1024 * 1024;
const clean = (s: string, max: number) => s.replace(/[\p{Cc}\p{Cf}]/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const int = (v: unknown, min: number, max: number): v is number => Number.isSafeInteger(v) && (v as number) >= min && (v as number) <= max;

export function parseToolStep(v: unknown): ToolStep | null {
  if (!record(v) || Object.keys(v).some(k => !['id', 'name', 'label', 'state', 'ms'].includes(k))) return null;
  const { id, name, label, state, ms } = v;
  if (typeof id !== 'string' || !/^[A-Za-z0-9_-]{1,40}$/.test(id) || typeof name !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(name)
    || typeof label !== 'string' || !label.isWellFormed() || !clean(label, 120) || (state !== 'running' && state !== 'done' && state !== 'error')
    || (ms !== undefined && !int(ms, 0, 600000))) return null;
  return { id, name, label: clean(label, 120), state, ...(ms === undefined ? {} : { ms }) };
}

export function parseFirmware(v: unknown): Firmware | null {
  if (!record(v) || Object.keys(v).some(k => !['id', 'board', 'fqbn', 'address', 'size', 'sha256', 'binBase64', 'durationMs'].includes(k))) return null;
  const { id, board, fqbn, address, size, sha256, binBase64, durationMs } = v;
  if (typeof id !== 'string' || !/^[A-Za-z0-9_-]{1,40}$/.test(id) || typeof board !== 'string' || !/^[A-Z0-9-]{2,20}$/.test(board)
    || typeof fqbn !== 'string' || !/^[a-z0-9_]+:[a-z0-9_]+:[a-z0-9_]+$/.test(fqbn) || !int(address, 0, 16 * 1024 * 1024 - 1) || (address as number) % 0x1000 !== 0
    || !int(size, 1, MAX_STREAM_FIRMWARE_BYTES) || typeof sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(sha256) || !int(durationMs, 0, 600000)
    || typeof binBase64 !== 'string' || binBase64.length !== Math.ceil((size as number) / 3) * 4 || !/^[A-Za-z0-9+/]*={0,2}$/.test(binBase64)) return null;
  return { id, board, fqbn, address: address as number, size: size as number, sha256, binBase64, durationMs: durationMs as number };
}

/** What the thinking panel shows for one tool call, or null for calls it does not list (the checklist, the answer itself). */
export function toolStepLabel(name: string, args: Record<string, unknown>): string | null {
  const s = (v: unknown, max = 60) => typeof v === 'string' ? clean(v, max) : '';
  switch (name) {
    case 'search_catalog': return `Searching the PandaByte catalog${s(args.query) ? `: ${s(args.query)}` : ''}`;
    case 'read_product': return `Reading the ${s(args.sku, 20) || 'product'} listing`;
    case 'find_pinout': return `Reading the ${s(args.sku, 20) || 'board'} pin labels and pin table`;
    case 'web_search': return `Searching the web${s(args.query) ? `: ${s(args.query)}` : ''}`;
    case 'load_skill': return `Loading skill ${s(args.name, 64)}`;
    case 'open_mcp_server': return `Opening ${s(args.server, 20)} tools`;
    case 'compile_sketch': return `Compiling the sketch for ${s(args.board, 20) || 'the board'}`;
    case 'plan': case 'final_answer': case 'ask_user': return null;
    default: return name.startsWith('mcp_') ? `Calling ${name.slice(4).replace('__', ' · ')}` : null;
  }
}
