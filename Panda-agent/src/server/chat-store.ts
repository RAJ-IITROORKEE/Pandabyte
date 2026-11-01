import type { InsForgeClient } from '@insforge/sdk';
import type { Citation } from '../retrieval/contracts.ts';
import { publicSearchCitationUrl, webSearchSection } from '../search/citation-url.ts';
import { uuid, type ChatAnswer, type ChatMessage, type ChatRead, type ChatThread, type ChatTurn } from './chat-contracts.ts';

export class ChatStoreError extends Error {
  code: 'not_found' | 'conflict' | 'invalid' | 'unauthenticated' | 'quota' | 'unavailable';
  constructor(code: ChatStoreError['code']) { super(code); this.code = code; }
}
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const string = (v: unknown, max: number): v is string => typeof v === 'string' && v.trim().length > 0 && v.length <= max;
const date = (v: unknown): v is string => string(v, 50) && Number.isFinite(Date.parse(v));
const bad = (): never => { throw new ChatStoreError('unavailable'); };
function citations(value: unknown): Citation[] {
  if (!Array.isArray(value) || value.length > 4) return bad();
  return value.map(c => {
    if (!record(c) || !string(c.id, 40) || !string(c.title, 300) || !string(c.sourceUrl, 500) || !date(c.capturedAt) || !string(c.quote, 600) || !Array.isArray(c.sectionPath) || c.sectionPath.length > 12 || c.sectionPath.some((p: unknown) => !string(p, 200))) return bad();
    try {
      const u = new URL(c.sourceUrl);
      const product = ['pandabyte.in', 'www.pandabyte.in'].includes(u.hostname) && /^\/product-page\/[a-zA-Z0-9_-]+\/?$/.test(u.pathname);
      const manufacturer = u.hostname === 'docs.espressif.com' && /^\/projects\/(?:esp8266-rtos-sdk\/en\/latest\/get-started\/index\.html|esp-idf\/en\/stable\/(?:esp32|esp32c3|esp32c6|esp32s3)\/get-started\/index\.html)$/.test(u.pathname);
      const web = c.sectionPath.length === 1 && c.sectionPath[0] === webSearchSection && publicSearchCitationUrl(c.sourceUrl);
      if (u.protocol !== 'https:' || u.port || u.username || u.password || u.search || u.hash || !(product || manufacturer || web)) return bad();
    } catch { return bad(); }
    return { id: c.id, title: c.title, sourceUrl: c.sourceUrl, capturedAt: c.capturedAt, quote: c.quote, sectionPath: c.sectionPath as string[] };
  });
}
export function cleanAnswer(v: unknown): ChatAnswer {
  if (!record(v) || !['evidence', 'conversation', 'clarification', 'insufficient', 'conflict'].includes(v.outcome as string) || !string(v.text, 8000)) return bad();
  const cs = citations(v.citations);
  if ((v.outcome === 'evidence') !== (cs.length > 0)) return bad();
  return { outcome: v.outcome as ChatAnswer['outcome'], text: v.text, citations: cs };
}
function thread(v: unknown): ChatThread {
  if (!record(v) || !uuid(v.id) || !string(v.title, 100) || !date(v.updatedAt) || !['idle', 'pending', 'blocked'].includes(v.status as string)) return bad();
  if (v.archivedAt !== undefined && v.archivedAt !== null && !date(v.archivedAt)) return bad();
  return { id: v.id, title: v.title, updatedAt: v.updatedAt, status: v.status as ChatThread['status'], ...(v.archivedAt !== undefined ? { archivedAt: v.archivedAt as string | null } : {}) };
}
function message(v: unknown): ChatMessage {
  if (!record(v) || !uuid(v.id) || !['user', 'assistant'].includes(v.role as string) || !string(v.text, 8000) || !date(v.createdAt)) return bad();
  const cs = citations(v.citations);
  if (v.role === 'user' && cs.length) return bad();
  return { id: v.id, role: v.role as ChatMessage['role'], text: v.text, createdAt: v.createdAt, citations: cs };
}
function turn(v: unknown): ChatTurn {
  if (!record(v) || !uuid(v.requestId) || !string(v.question, 2000) || !date(v.createdAt) || !['pending', 'complete'].includes(v.status as string)) return bad();
  if ((v.status === 'pending') !== (v.response === null)) return bad();
  return { requestId: v.requestId, question: v.question, status: v.status as ChatTurn['status'], response: v.response === null ? null : cleanAnswer(v.response), createdAt: v.createdAt };
}
function read(v: unknown): ChatRead {
  if (!record(v) || !Array.isArray(v.messages) || v.messages.length > 200 || !Array.isArray(v.turns) || v.turns.length > 100) return bad();
  return { thread: thread(v.thread), messages: v.messages.map(message), turns: v.turns.map(turn) };
}
export function createChatStore(client: InsForgeClient) {
  async function rpc(name: string, args: Record<string, unknown>): Promise<unknown> {
    const { data, error } = await client.database.schema('public').rpc(`panda_agent_${name}`, args);
    if (error) {
      const e = error as { code?: string; message?: string; details?: string };
      const known = ['not_found', 'conflict', 'invalid', 'unauthenticated', 'quota'] as const;
      const code = e.code === 'P0001' ? known.find(k => k === e.details) : undefined;
      throw new ChatStoreError(code ?? 'unavailable');
    }
    return data;
  }
  return {
    async list(archived = false) { const v = await rpc('chats_list_v2', { p_archived: archived }); if (!record(v) || !Array.isArray(v.threads) || v.threads.length > 100) return bad(); return { threads: v.threads.map(thread) }; },
    async archive(id: string, archived: boolean) { const v = await rpc('chat_archive', { p_thread: id, p_archived: archived }); if (!record(v) || v.ok !== true) return bad(); return { ok: true as const }; },
    async delete(id: string) { const v = await rpc('chat_delete', { p_thread: id }); if (!record(v) || v.ok !== true) return bad(); return { ok: true as const }; },
    async create(title: string) { const v = await rpc('chat_create', { p_title: title }); if (!record(v)) return bad(); return { thread: thread(v.thread) }; },
    async read(id: string) { return read(await rpc('chat_read', { p_thread: id })); },
    async begin(id: string, requestId: string, question: string, webSearch = false) {
      const v = await rpc('chat_begin_v2', { p_thread: id, p_request: requestId, p_question: question, p_web_search: webSearch });
      if (!record(v) || typeof v.admitted !== 'boolean' || (v.admitted && (typeof v.finishToken !== 'string' || !/^[0-9a-f]{64}$/.test(v.finishToken))) || (!v.admitted && v.finishToken !== undefined && v.finishToken !== null)) return bad();
      if (!record(v.turn) || v.turn.webSearch !== webSearch || !uuid(v.turn.requestId) || !string(v.turn.question, 2000) || !['pending', 'complete'].includes(v.turn.status as string) || ((v.turn.status === 'pending') !== (v.turn.response === null))) return bad();
      const currentTurn = { requestId: v.turn.requestId, question: v.turn.question, status: v.turn.status as 'pending' | 'complete', response: v.turn.response === null ? null : cleanAnswer(v.turn.response) };
      return { ...read(v), admitted: v.admitted, turn: currentTurn, finishToken: v.admitted ? v.finishToken as string : undefined };
    },
    async finish(id: string, requestId: string, finishToken: string, answer: ChatAnswer) { return read(await rpc('chat_finish', { p_thread: id, p_request: requestId, p_finish_token: finishToken, p_response: cleanAnswer(answer) })); },
  };
}
