import 'server-only';
import { createHash, createHmac } from 'node:crypto';
import type { ChatActor, ChatAnswer } from './chat-contracts.ts';
import { uuid } from './chat-contracts.ts';
import type { BasicRagChatBridge } from './basic-rag-chat-contracts.ts';
import { ChatStoreError, cleanAnswer, parseChatRead } from './chat-store.ts';
import { BasicRagProviderError } from './basic-rag-openrouter.ts';
import { createLunaPrototypePolicy } from './basic-rag-runtime.ts';
import { createLunaChatCompletion, lunaChatSystemPrompt } from './luna-rag-openrouter.ts';
import { currentLightweightSession } from './lightweight-connection';

type State = { question: string; status: 'pending' | 'complete'; claimed: boolean; cancelled: boolean };
export function createPlainLlmStore(actor: ChatActor, key: string) {
  if (!/^[a-f0-9]{64}$/.test(key)) throw new ChatStoreError('unavailable');
  async function rpc(action: string, input: Record<string, unknown>, signed = true) {
    const payload = JSON.stringify({ v: 1, action, subject: actor.subject, exp: Math.floor(Date.now() / 1000) + 60, input });
    const args = signed ? { p_payload: payload, p_mac: createHmac('sha256', Buffer.from(key, 'hex')).update('panda-llm-db-v1\n' + payload).digest('hex') } : input;
    const { data, error } = await actor.client.database.rpc('panda_agent_llm_' + action, args);
    if (error) {
      const e = error as { code?: string; details?: string };
      const known = ['not_found', 'conflict', 'invalid', 'unauthenticated', 'quota'] as const;
      throw new ChatStoreError(e.code === 'P0001' ? known.find(c => c === e.details) ?? 'unavailable' : 'unavailable');
    }
    return data;
  }
  return {
    async attach(thread: string, request: string, admission: unknown) {
      const v = await rpc('attach', { thread, request, admission });
      if (!v || typeof v !== 'object' || Object.keys(v).join(',') !== 'attached' || typeof v.attached !== 'boolean') throw new ChatStoreError('unavailable');
      return v.attached as boolean;
    },
    async nativeClaim(thread: string, request: string, admission: unknown, stage: 'create' | 'prompt') {
      if (stage !== 'create' && stage !== 'prompt') throw new ChatStoreError('invalid');
      const v = await rpc('native_claim', { thread, request, admission, stage });
      if (!v || typeof v !== 'object' || Object.keys(v).join(',') !== 'execute' || typeof v.execute !== 'boolean') throw new ChatStoreError('unavailable');
      return v.execute as boolean;
    },
    async admissionCurrent(thread: string, request: string, admission: unknown) {
      const v = await rpc('admission_current', { thread, request, admission });
      if (!v || typeof v !== 'object' || Object.keys(v).join(',') !== 'current' || typeof v.current !== 'boolean') throw new ChatStoreError('unavailable');
      return v.current as boolean;
    },
    async recordReceipt(thread: string, request: string, admission: unknown, bodyHash: string, usage: { inputTokens: number; outputTokens: number; costNanoUsd: number }) {
      const v = await rpc('record_receipt', { thread, request, admission, bodyHash, usage });
      if (!v || typeof v !== 'object' || Object.keys(v).join(',') !== 'recorded' || typeof v.recorded !== 'boolean') throw new ChatStoreError('unavailable');
      return v.recorded as boolean;
    },
    async retire(thread: string, request: string, admission: unknown) {
      const v = await rpc('retire', { thread, request, admission });
      if (!v || typeof v !== 'object' || Object.keys(v).join(',') !== 'retired' || typeof v.retired !== 'boolean') throw new ChatStoreError('unavailable');
      return v.retired as boolean;
    },
    async state(thread: string, request: string): Promise<State | null> {
      const v = await rpc('state', { p_thread: thread, p_request: request }, false);
      if (v === null) return null;
      if (!v || typeof v !== 'object' || Object.keys(v).sort().join(',') !== 'cancelled,claimed,question,status'
        || typeof v.question !== 'string' || !v.question.trim() || v.question.length > 2000 || !v.question.isWellFormed()
        || !['pending', 'complete'].includes(v.status) || typeof v.claimed !== 'boolean' || typeof v.cancelled !== 'boolean'
        || v.cancelled && v.status !== 'complete') throw new ChatStoreError('unavailable');
      return v as State;
    },
    async begin(thread: string, request: string, question: string) {
      const v = await rpc('begin', { thread, request, question });
      if (!v || typeof v !== 'object' || typeof v.admitted !== 'boolean') throw new ChatStoreError('unavailable');
      return { ...parseChatRead(v), admitted: v.admitted as boolean };
    },
    async claim(thread: string, request: string) {
      const v = await rpc('claim', { thread, request });
      if (!v || typeof v !== 'object' || Object.keys(v).join(',') !== 'execute' || typeof v.execute !== 'boolean') throw new ChatStoreError('unavailable');
      return v.execute as boolean;
    },
    async finish(thread: string, request: string, answer: ChatAnswer, cancel = false) {
      return parseChatRead(await rpc('finish', { thread, request, answer: cleanAnswer(answer), cancel }));
    },
  };
}

export function createPlainLlmChatService(deps: {
  store: ReturnType<typeof createPlainLlmStore>; current(): Promise<boolean>; enabled(): Promise<boolean>;
  complete(request: string, question: string, claim: () => Promise<boolean>, thread: string): (input: { question: string }, beforeSend: () => Promise<boolean>, signal: AbortSignal) => Promise<{ answer: string; usage: { inputTokens: number; outputTokens: number; costNanoUsd: number }; persisted?: true }>;
}): BasicRagChatBridge {
  const valid = (thread: string, request: string) => { if (!uuid(thread) || !uuid(request) || request !== request.toLowerCase()) throw new ChatStoreError('invalid'); };
  const requireCurrent = async () => { if (!await deps.current()) throw new ChatStoreError('unauthenticated'); };
  const statusFor = (s: State) => ({ status: s.status === 'complete' ? 'saved' as const : s.claimed ? 'unknown' as const : 'pending' as const });
  const read = async (thread: string, request: string) => { valid(thread, request); await requireCurrent(); return deps.store.state(thread, request); };
  return {
    async state(thread, request) { return await read(thread, request) !== null; },
    async status(ref, signal) {
      if (signal.aborted) throw new ChatStoreError('unavailable');
      const s = await read(ref.thread, ref.request); if (!s) throw new ChatStoreError('not_found');
      await requireCurrent(); return statusFor(s);
    },
    async cancel(ref, signal) {
      const s = await read(ref.thread, ref.request); if (!s) throw new ChatStoreError('not_found');
      if (s.status === 'complete') return { status: 'saved' };
      if (signal.aborted) throw new ChatStoreError('unavailable');
      await deps.store.finish(ref.thread, ref.request, { outcome: 'insufficient', text: 'Cancelled.', citations: [] }, true);
      await requireCurrent(); return { status: 'saved' };
    },
    async start(turn, signal, progress) {
      valid(turn.thread, turn.request);
      if (typeof turn.question !== 'string' || turn.question !== turn.question.trim() || !turn.question || turn.question.length > 2000 || !turn.question.isWellFormed()) throw new ChatStoreError('invalid');
      const old = await read(turn.thread, turn.request);
      if (old) { if (old.question !== turn.question) throw new ChatStoreError('conflict'); return statusFor(old); }
      if (signal.aborted || !await deps.enabled()) throw new ChatStoreError('unavailable');
      const begun = await deps.store.begin(turn.thread, turn.request, turn.question);
      if (!begun.admitted) {
        const s = await read(turn.thread, turn.request); if (!s) throw new ChatStoreError('unavailable'); return statusFor(s);
      }
      let claimed = false;
      const claim = async () => {
        if (claimed || signal.aborted) return false;
        claimed = true; await requireCurrent();
        return deps.store.claim(turn.thread, turn.request);
      };
      const beforeSend = async () => {
        if (signal.aborted || !await deps.current()) return false;
        const s = await deps.store.state(turn.thread, turn.request);
        return !!s && s.status === 'pending' && !s.cancelled && s.question === turn.question && !signal.aborted && await deps.current();
      };
      let answer: ChatAnswer;
      try {
        try { progress?.('routing_question'); } catch { /* Presentation only. */ }
        const result = await deps.complete(turn.request, turn.question, claim, turn.thread)({ question: turn.question }, beforeSend, signal);
        // Native completion may commit before retiring its isolated context.
        if (result.persisted === true) {
          await requireCurrent();
          const state = await deps.store.state(turn.thread, turn.request);
          return state?.status === 'complete' && !state.cancelled ? { status: 'saved' } : { status: 'unknown' };
        }
        if (!await beforeSend()) return { status: 'unknown' };
        answer = { outcome: 'conversation', text: result.answer, citations: [] };
      } catch (error) {
        if (signal.aborted || error instanceof BasicRagProviderError && error.code === 'outcome_unknown') return { status: 'unknown' };
        answer = { outcome: 'insufficient', text: 'The model is unavailable right now. No automatic retry was made.', citations: [] };
      }
      if (signal.aborted) return { status: 'unknown' };
      await requireCurrent();
      try { progress?.('saving_answer'); } catch { /* Presentation only. */ }
      try { await deps.store.finish(turn.thread, turn.request, answer); }
      catch { const s = await read(turn.thread, turn.request); return s ? statusFor(s) : { status: 'unknown' }; }
      await requireCurrent(); return { status: 'saved' };
    },
  };
}

export function plainLlmForActor(actor: ChatActor, request: Request) {
  const current = () => actor.sessionId ? currentLightweightSession(actor.subject, actor.sessionId) : Promise.resolve(false);
  const policy = createLunaPrototypePolicy({ env: process.env, subject: actor.subject, requestOrigin: new URL(request.url).origin, actor, current });
  return createPlainLlmChatService({ store: createPlainLlmStore(actor, process.env.PANDA_AGENT_LIGHTWEIGHT_DB_KEY ?? ''), current, enabled: policy.enabled,
    complete: (id, question, claim) => createLunaChatCompletion({ apiKey: policy.key(), policyCurrent: policy.current, dispatchCurrent: policy.dispatchCurrent,
      preClaimCurrent: policy.dispatchCurrent,
      claim: async () => await claim() && policy.claimBudget({ request: id, surface: 'chat', fingerprint: createHash('sha256').update(JSON.stringify([lunaChatSystemPrompt, question])).digest('hex') }),
    }),
  });
}
