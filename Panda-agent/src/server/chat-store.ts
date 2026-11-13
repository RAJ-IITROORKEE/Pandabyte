import type { InsForgeClient } from '@insforge/sdk';
import {parseVendorCitation,parseCompositeVendorCitation} from '../diagnostics/contracts.ts';
import { publicSearchCitationUrl, webSearchSection } from '../search/citation-url.ts';
import { citationImages, ownMediaImages, type CitationImage } from '../search/citation-image.ts';
import {parseProjectMemory} from '../guide/contracts.ts';
import { uuid, type ChatAnswer, type ChatCitation, type ChatMessage, type ChatRead, type ChatThread, type ChatTurn } from './chat-contracts.ts';

export class ChatStoreError extends Error {
  code: 'not_found' | 'conflict' | 'invalid' | 'unauthenticated' | 'quota' | 'unavailable';
  constructor(code: ChatStoreError['code']) { super(code); this.code = code; }
}
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const string = (v: unknown, max: number): v is string => typeof v === 'string' && v.trim().length > 0 && v.length <= max;
const date = (v: unknown): v is string => string(v, 50) && Number.isFinite(Date.parse(v));
const bad = (): never => { throw new ChatStoreError('unavailable'); };
function citations(value: unknown): ChatCitation[] {
  if (!Array.isArray(value) || value.length > 4) return bad();
  return value.map(c => {
    if(record(c) && Object.hasOwn(c,'kind')) { const vendor=parseVendorCitation(c)??parseCompositeVendorCitation(c);return vendor??bad(); }
    if (!record(c) || !string(c.id, 40) || !string(c.title, 300) || !string(c.sourceUrl, 500) || !date(c.capturedAt) || !string(c.quote, 600) || !Array.isArray(c.sectionPath) || c.sectionPath.length > 12 || c.sectionPath.some((p: unknown) => !string(p, 200))) return bad();
    let images: CitationImage[] = [];
    try {
      const u = new URL(c.sourceUrl);
      const product = ['pandabyte.in', 'www.pandabyte.in'].includes(u.hostname) && /^\/product-page\/[a-zA-Z0-9_-]+\/?$/.test(u.pathname);
      const manufacturer = u.hostname === 'docs.espressif.com' && /^\/projects\/(?:esp8266-rtos-sdk\/en\/latest\/get-started\/index\.html|esp-idf\/en\/stable\/(?:esp32|esp32c3|esp32c6|esp32s3)\/get-started\/index\.html)$/.test(u.pathname);
      // Web sources: the older Tavily path labels them with webSearchSection; research-harness answers (D1 journal, verified
      // by the host and the DB before saving) carry an empty sectionPath. Both must be a public https page.
      const web = (c.sectionPath.length === 0 || (c.sectionPath.length === 1 && c.sectionPath[0] === webSearchSection)) && publicSearchCitationUrl(c.sourceUrl);
      if (u.protocol !== 'https:' || u.port || u.username || u.password || u.search || u.hash || !(product || manufacturer || web)) return bad();
      if (web) images = citationImages(c.sourceUrl, c.images);
      else if (product) images = ownMediaImages(c.images);
    } catch { return bad(); }
    return { id: c.id, title: c.title, sourceUrl: c.sourceUrl, capturedAt: c.capturedAt, quote: c.quote, sectionPath: c.sectionPath as string[], ...(images.length ? { images } : {}) };
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
  if(v.toolCards!==undefined&&(!Array.isArray(v.toolCards)||v.toolCards.length>4||v.role!=='assistant'||v.toolCards.some(c=>!record(c)||Object.keys(c).sort().join(',')!=='state,toolId'||!['panda_scoped_rag','fetch_public_docs_mcp','convert_units','format_bom'].includes(c.toolId as string)||!['complete','unknown'].includes(c.state as string))))return bad();
  if(v.terminalReason!==undefined&&(v.role!=='assistant'||!['answered','clarification','insufficient','unavailable','budget_exhausted','cancelled'].includes(v.terminalReason as string)))return bad();
  return { id: v.id, role: v.role as ChatMessage['role'], text: v.text, createdAt: v.createdAt, citations: cs,...(v.toolCards===undefined?{}:{toolCards:v.toolCards as ChatMessage['toolCards']}),...(v.terminalReason===undefined?{}:{terminalReason:v.terminalReason as ChatMessage['terminalReason']}) };
}
function turn(v: unknown): ChatTurn {
  if (!record(v) || !uuid(v.requestId) || !string(v.question, 2000) || !date(v.createdAt) || !['pending', 'complete'].includes(v.status as string)) return bad();
  if ((v.status === 'pending') !== (v.response === null)) return bad();
  if(v.workflow!==undefined&&v.workflow!=='agentic')return bad();
  return { requestId: v.requestId, question: v.question, status: v.status as ChatTurn['status'], response: v.response === null ? null : cleanAnswer(v.response), createdAt: v.createdAt,...(v.workflow===undefined?{}:{workflow:'agentic' as const}) };
}
export function parseChatRead(v: unknown): ChatRead {
  if (!record(v) || !Array.isArray(v.messages) || v.messages.length > 200 || !Array.isArray(v.turns) || v.turns.length > 100) return bad();
  const memory=v.projectMemory===undefined?undefined:parseProjectMemory(v.projectMemory);
  if(memory===null)return bad();
  return { thread: thread(v.thread), messages: v.messages.map(message), turns: v.turns.map(turn),...(memory===undefined?{}:{projectMemory:memory}) };
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
    async deleteAll() { const v = await rpc('chats_delete_all', {}); if (!record(v) || !Number.isSafeInteger(v.deleted) || !Number.isSafeInteger(v.skipped) || (v.deleted as number) < 0 || (v.skipped as number) < 0) return bad(); return { deleted: v.deleted as number, skipped: v.skipped as number }; },
    async create(title: string) { const v = await rpc('chat_create', { p_title: title }); if (!record(v)) return bad(); return { thread: thread(v.thread) }; },
    async read(id: string) { return parseChatRead(await rpc('chat_read', { p_thread: id })); },
  };
}
