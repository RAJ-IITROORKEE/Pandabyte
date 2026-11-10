import 'server-only';
import { createHmac } from 'node:crypto';
import { uuid, type ChatActor } from './chat-contracts.ts';
import { ChatStoreError } from './chat-store.ts';

export type PrototypeRagBudgetStatus = Readonly<{
  enabled: boolean;
  limitNanoUsd: 1000000000;
  reservedNanoUsd: number;
  remainingNanoUsd: number;
  reservationNanoUsd: 1597640;
  model: 'openai/gpt-6-luna';
  provider: 'azure/us';
}>;

type Reservation = { request: string; surface: 'chat' | 'playground' | 'diagnostic'; fingerprint: string };
const hex = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const canonicalUuid = (value: unknown): value is string => uuid(value) && value === value.toLowerCase();
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const unavailable = () => new ChatStoreError('unavailable');

/** The database owns the cap and never grants a second dispatch for a reservation. */
export function createPrototypeRagBudget(options: {
  actor: ChatActor; key: string; budgetId: string; keySha256: string; workspaceSha256: string;
}) {
  const { actor, key, budgetId, keySha256, workspaceSha256 } = options;
  if (!actor || typeof actor.subject !== 'string' || !actor.subject.trim() || actor.subject.length > 512
    || !actor.subject.isWellFormed() || !actor.client || !hex(key) || !canonicalUuid(budgetId)
    || !hex(keySha256) || !hex(workspaceSha256)) throw unavailable();

  async function rpc(action: 'status' | 'reserve', fields: Record<string, unknown> = {}): Promise<unknown> {
    const p_payload = JSON.stringify({ v: 1, action, subject: actor.subject, exp: Math.floor(Date.now() / 1000) + 60,
      budget: budgetId, keySha256, workspaceSha256, ...fields });
    const p_mac = createHmac('sha256', Buffer.from(key, 'hex')).update(`panda-rag-budget-db-v1\n${p_payload}`).digest('hex');
    try {
      const { data, error } = await actor.client.database.rpc('panda_agent_rag_budget_' + action, { p_payload, p_mac });
      if (error) {
        const e = error as { code?: string; details?: string };
        const known = ['not_found', 'conflict', 'invalid', 'unauthenticated', 'quota'] as const;
        throw new ChatStoreError(e.code === 'P0001' ? known.find(code => code === e.details) ?? 'unavailable' : 'unavailable');
      }
      return data;
    } catch (error) { throw error instanceof ChatStoreError ? error : unavailable(); }
  }

  return {
    async status(): Promise<PrototypeRagBudgetStatus> {
      const value = await rpc('status');
      if (!object(value) || Object.keys(value).sort().join(',') !== 'enabled,limitNanoUsd,model,provider,remainingNanoUsd,reservationNanoUsd,reservedNanoUsd'
        || typeof value.enabled !== 'boolean' || value.limitNanoUsd !== 1000000000 || value.reservationNanoUsd !== 1597640
        || value.model !== 'openai/gpt-6-luna' || value.provider !== 'azure/us'
        || !Number.isSafeInteger(value.reservedNanoUsd) || (value.reservedNanoUsd as number) < 0 || (value.reservedNanoUsd as number) > 1000000000
        || !Number.isSafeInteger(value.remainingNanoUsd) || value.remainingNanoUsd !== 1000000000 - (value.reservedNanoUsd as number)) throw unavailable();
      return Object.freeze({ enabled: value.enabled, limitNanoUsd: 1000000000, reservedNanoUsd: value.reservedNanoUsd as number,
        remainingNanoUsd: value.remainingNanoUsd as number, reservationNanoUsd: 1597640, model: 'openai/gpt-6-luna', provider: 'azure/us' });
    },
    async reserve(input: Reservation): Promise<boolean> {
      if (!input || !canonicalUuid(input.request) || !['chat', 'playground', 'diagnostic'].includes(input.surface)
        || !hex(input.fingerprint) || Object.keys(input).sort().join(',') !== 'fingerprint,request,surface') throw new ChatStoreError('invalid');
      const value = await rpc('reserve', input);
      if (!object(value) || Object.keys(value).join(',') !== 'execute' || typeof value.execute !== 'boolean') throw unavailable();
      return value.execute;
    },
  };
}
