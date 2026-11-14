import 'server-only';
import { createHmac } from 'node:crypto';
import type { ChatActor, ChatAnswer } from '../server/chat-contracts.ts';
import { ChatStoreError, cleanAnswer, parseChatRead } from '../server/chat-store.ts';

// Journal for agent-loop turns. Its database functions are in migrations/20261113130000_panda-agent-loop-journal.sql (applied 13 Nov 2026):
// The loop only runs for eligible Admin sessions when PANDA_AGENT_LOOP_ENABLED is true.
export type LoopState = { question: string; status: 'pending' | 'complete'; claimed: boolean; cancelled: boolean };
export type LoopUsage = { inputTokens: number; outputTokens: number; costNanoUsd: number; steps: number };
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

export function createAgentLoopStore(actor: ChatActor, key: string) {
  if (!/^[a-f0-9]{64}$/.test(key)) throw new ChatStoreError('unavailable');
  async function rpc(op: string, thread: string, request: string, fields: Record<string, unknown> = {}) {
    const payload = JSON.stringify({ v: 1, action: 'loop_chat', subject: actor.subject, exp: Math.floor(Date.now() / 1000) + 60, input: { op, thread, request, ...fields } });
    const mac = createHmac('sha256', Buffer.from(key, 'hex')).update('panda-llm-db-v1\n' + payload).digest('hex');
    try {
      const { data, error } = await actor.client.database.rpc('panda_agent_loop_chat_v1', { p_payload: payload, p_mac: mac });
      if (error) { const e = error as { code?: string; details?: string }; const known = ['not_found', 'conflict', 'invalid', 'unauthenticated', 'quota'] as const;
        throw new ChatStoreError(e.code === 'P0001' ? known.find(c => c === e.details) ?? 'unavailable' : 'unavailable'); }
      return data;
    } catch (error) { throw error instanceof ChatStoreError ? error : new ChatStoreError('unavailable'); }
  }
  const flag = (v: unknown, name: 'execute' | 'recorded') => {
    if (!object(v) || Object.keys(v).join(',') !== name || typeof v[name] !== 'boolean') throw new ChatStoreError('unavailable');
    return v[name] as boolean;
  };
  return {
    async state(thread: string, request: string): Promise<LoopState | null> {
      const v = await rpc('state', thread, request); if (v === null) return null;
      if (!object(v) || Object.keys(v).sort().join(',') !== 'cancelled,claimed,question,status' || typeof v.question !== 'string' || !v.question.trim() || v.question.length > 2000
        || !v.question.isWellFormed() || !['pending', 'complete'].includes(v.status as string) || typeof v.claimed !== 'boolean' || typeof v.cancelled !== 'boolean'
        || (v.cancelled && v.status !== 'complete')) throw new ChatStoreError('unavailable');
      return v as LoopState;
    },
    /** tier: which daily limit the turn counts against (the journal treats a missing tier as paid). */
    async begin(thread: string, request: string, question: string, tier?: 'free' | 'paid') {
      const v = await rpc('begin', thread, request, { question, ...(tier ? { tier } : {}) });
      if (!object(v) || typeof v.admitted !== 'boolean') throw new ChatStoreError('unavailable');
      return { ...parseChatRead(v), admitted: v.admitted };
    },
    async claimUnmetered(thread: string, request: string, bodyHash: string) { return flag(await rpc('claim_unmetered', thread, request, { bodyHash }), 'execute'); },
    async receiptUnmetered(thread: string, request: string, bodyHash: string, answer: ChatAnswer, usage: LoopUsage) {
      return flag(await rpc('receipt_unmetered', thread, request, { bodyHash, answer: cleanAnswer(answer), usage }), 'recorded');
    },
    async finish(thread: string, request: string, answer: ChatAnswer) { return parseChatRead(await rpc('finish', thread, request, { answer: cleanAnswer(answer) })); },
    async cancel(thread: string, request: string) { return parseChatRead(await rpc('cancel', thread, request)); },
    /** Reserves one web search for this claimed turn (non-Admins: 20 per India day); false when the daily limit is reached. */
    async reserveSearch(thread: string, request: string) {
      const v = await rpc('web_search', thread, request);
      if (!object(v) || Object.keys(v).join(',') !== 'allowed' || typeof v.allowed !== 'boolean') throw new ChatStoreError('unavailable');
      return v.allowed;
    },
  };
}
export type AgentLoopStore = Pick<ReturnType<typeof createAgentLoopStore>, 'state' | 'begin' | 'claimUnmetered' | 'receiptUnmetered' | 'finish' | 'cancel' | 'reserveSearch'>;
