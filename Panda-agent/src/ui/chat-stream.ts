export const stages = ['routing_question', 'resolving_product', 'reading_sources', 'searching_sources', 'searching_web', 'opencode_queued', 'opencode_working', 'checking_citations', 'saving_answer'] as const;
export type Stage = typeof stages[number];
const limit = 4 * 1024 * 1024;
export type ToolActivity = { tool: 'rag_search' | 'web_search' | 'espressif_docs'; status: 'started' | 'completed' | 'failed' };
type StreamUpdates = { onText?: (text: string) => void; onReset?: () => void; onTool?: (event: ToolActivity) => void };
type Final = { type: 'complete'; data: unknown } | { type: 'error'; error: string };

// A malformed or incomplete stream has an unknown outcome; callers must not resend it.
export async function readChatStream(body: ReadableStream<Uint8Array>, onActivity: (stage: Stage) => void, onContext?: (context: ContextSummary) => void, updates: StreamUpdates = {}): Promise<Final> {
  const reader = body.getReader();
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let buffer = '', size = 0, count = 0, final: Final | undefined;
  let contextSeen = false, draft = '', textEvents = 0, textBytes = 0, toolEvents = 0;
  const encoder = new TextEncoder();
  const frame = (raw: string) => {
    const data: string[] = [];
    for (const line of raw.split(/\r\n|\r|\n/)) {
      if (!line || line.startsWith(':')) continue;
      const colon = line.indexOf(':');
      const field = colon < 0 ? line : line.slice(0, colon);
      let value = colon < 0 ? '' : line.slice(colon + 1);
      if (value.startsWith(' ')) value = value.slice(1);
      if (field !== 'data') throw new Error('Invalid stream field');
      data.push(value);
    }
    if (!data.length) return;
    if (final) throw new Error('Event after final');
    const event: unknown = JSON.parse(data.join('\n'));
    if (!event || typeof event !== 'object' || Array.isArray(event)) throw new Error('Invalid event');
    const value = event as Record<string, unknown>;
    if (value.type === 'activity' && Object.keys(value).length === 2 && typeof value.stage === 'string' && stages.includes(value.stage as Stage)) {
      if (++count > 64) throw new Error('Too many events');
      onActivity(value.stage as Stage);
    } else if (value.type === 'context') {
      const summary = { ...value };
      delete summary.type;
      if (contextSeen || !isContextSummary(summary) || ++count > 64) throw new Error('Invalid context event');
      contextSeen = true;
      onContext?.(summary);
    } else if (value.type === 'text_delta') {
      if (Object.keys(value).length !== 2 || typeof value.text !== 'string' || !value.text || value.text.length > 4096 || /[\uD800-\uDFFF]/u.test(value.text.replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]/g, ''))) throw new Error('Invalid text event');
      textEvents++; textBytes += encoder.encode(value.text).byteLength;
      const next = draft + value.text;
      if (textEvents > 10000 || textBytes > 256 * 1024 || next.length > 6000 || encoder.encode(JSON.stringify({ outcome: 'conversation', text: next, citations: [] })).byteLength > 23000) throw new Error('Text event limit exceeded');
      draft = next; updates.onText?.(value.text);
    } else if (value.type === 'text_reset') {
      if (Object.keys(value).length !== 1 || ++textEvents > 10000) throw new Error('Invalid text reset');
      draft = ''; updates.onReset?.();
    } else if (value.type === 'tool_activity') {
      if (Object.keys(value).length !== 3 || !['rag_search', 'web_search', 'espressif_docs'].includes(String(value.tool)) || !['started', 'completed', 'failed'].includes(String(value.status)) || ++toolEvents > 64) throw new Error('Invalid tool event');
      updates.onTool?.({ tool: value.tool as ToolActivity['tool'], status: value.status as ToolActivity['status'] });
    } else if (value.type === 'complete'  && Object.keys(value).length === 2 && value.data && typeof value.data === 'object' && !Array.isArray(value.data)) {
      final = { type: 'complete', data: value.data };
    } else if (value.type === 'error' && Object.keys(value).length === 2 && typeof value.error === 'string' && ['conflict', 'unauthenticated', 'quota', 'unavailable'].includes(value.error)) {
      final = { type: 'error', error: value.error };
    } else throw new Error('Invalid event');
  };
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.byteLength;
      if (size > limit) throw new Error('Stream too large');
      buffer += decoder.decode(part.value, { stream: true });
      // Normalize only complete CRLF pairs, preserving a trailing CR across chunks.
      buffer = buffer.replace(/\r\n/g, '\n').replace(/\r(?!$)/g, '\n');
      let end: number;
      while ((end = buffer.indexOf('\n\n')) !== -1) { frame(buffer.slice(0, end)); buffer = buffer.slice(end + 2); }
    }
    buffer += decoder.decode();
    buffer = buffer.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    let end: number;
    while ((end = buffer.indexOf('\n\n')) !== -1) { frame(buffer.slice(0, end)); buffer = buffer.slice(end + 2); }
    if (buffer || !final) throw new Error('Incomplete stream');
    return final;
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
}
import { isContextSummary, type ContextSummary } from '../retrieval/context-summary.ts';
export type { ContextSummary } from '../retrieval/context-summary.ts';
