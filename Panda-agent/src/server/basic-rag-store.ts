import { createHmac } from 'node:crypto';
import type { ChatActor } from './chat-contracts.ts';
import { ChatStoreError, cleanAnswer, parseChatRead } from './chat-store.ts';
import { createLightweightStore } from './lightweight-store.ts';

export type BasicRagState = { question: string; status: 'pending' | 'complete'; prepared: boolean; cancelled: boolean };
export function createBasicRagStore(actor: ChatActor, key: string) {
  const legacy = createLightweightStore(actor, key);
  async function rpc(action: string, args: Record<string, unknown>): Promise<unknown> {
    const { data, error } = await actor.client.database.rpc('panda_agent_basic_rag_' + action, args);
    if (error) {
      const e = error as { code?: string; details?: string };
      const known = ['not_found', 'conflict', 'invalid', 'unauthenticated', 'quota'] as const;
      throw new ChatStoreError(e.code === 'P0001' ? known.find(code => code === e.details) ?? 'unavailable' : 'unavailable');
    }
    return data;
  }
  function signed(action: string, fields: Record<string, unknown>) {
    const p_payload = JSON.stringify({ v: 1, action, subject: actor.subject, exp: Math.floor(Date.now() / 1000) + 60, ...fields });
    return { p_payload, p_mac: createHmac('sha256', Buffer.from(key, 'hex')).update(`panda-lightweight-db-v1\n${p_payload}`).digest('hex') };
  }
  return {
    scope: legacy.scope,
    async state(thread: string, request: string): Promise<BasicRagState | null> {
      const v = await rpc('state', { p_thread: thread, p_request: request });
      if (v === null) return null;
      if (!v || typeof v !== 'object' || Array.isArray(v)) throw new ChatStoreError('unavailable');
      const row = v as Record<string, unknown>;
      if (Object.keys(row).sort().join(',') !== 'cancelled,prepared,question,status' || typeof row.question !== 'string' || !row.question.trim()
        || row.question.length > 2000 || !row.question.isWellFormed() || !['pending', 'complete'].includes(row.status as string)
        || typeof row.prepared !== 'boolean' || typeof row.cancelled !== 'boolean' || (row.cancelled && row.status !== 'complete')) throw new ChatStoreError('unavailable');
      return { question: row.question, status: row.status as BasicRagState['status'], prepared: row.prepared, cancelled: row.cancelled };
    },
    async begin(thread: string, request: string, question: string) {
      const value = await rpc('begin', signed('begin', { thread, request, question }));
      if (!value || typeof value !== 'object' || typeof (value as { admitted?: unknown }).admitted !== 'boolean') throw new ChatStoreError('unavailable');
      return { ...parseChatRead(value), admitted: (value as { admitted: boolean }).admitted };
    },
    async prepare(thread: string, request: string, question: string, scope: { productId: string; sku: string; scopeHash: string }, digest: string) {
      const value = await rpc('prepare', signed('prepare', { thread, request, question, product: scope.productId, sku: scope.sku, scopeHash: scope.scopeHash, digest }));
      if (!value || typeof value !== 'object' || typeof (value as { execute?: unknown }).execute !== 'boolean') throw new ChatStoreError('unavailable');
      return (value as { execute: boolean }).execute;
    },
    async complete(thread: string, request: string, answer: Parameters<typeof cleanAnswer>[0]) {
      return parseChatRead(await rpc('complete', signed('complete', { thread, request, answer: cleanAnswer(answer) })));
    },
    async cancel(thread: string, request: string) {
      return parseChatRead(await rpc('cancel', signed('cancel', { thread, request, digest: null })));
    },
  };
}
