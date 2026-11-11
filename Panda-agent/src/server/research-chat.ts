import 'server-only';
// Phase D4: a chat turn with web search goes to the host research harness (native OpenCode + Tavily) through the D3
// gateway. The app is the only InsForge writer (D1 RPC `panda_agent_research_chat_v1`, HMAC-signed like the direct
// path). A host result is saved only after its MAC and every dispatched field verify; anything uncertain stays
// `unknown` and is never re-dispatched (the same request id only replays or reads status).
import { createHmac } from 'node:crypto';
import { uuid, type ActivityReporter, type ChatActor, type ChatAnswer } from './chat-contracts.ts';
import { ChatStoreError } from './chat-store.ts';
import type { BasicRagChatBridge, BasicRagReference, BasicRagTurn } from './basic-rag-chat-contracts.ts';
import { researchChatProfiles, researchPromptHash, researchRunId, researchSubjectHash, type ResearchChatProfile, type ResearchUsage } from './research-envelopes.ts';
import type { ResearchOutcome, ResearchTurnInput } from './research-gateway-client.ts';

type Gateway = { turn(input: ResearchTurnInput, hooks?: { onProgress?(stage: 'searching_web' | 'checking_citations'): void; signal?: AbortSignal }): Promise<ResearchOutcome>;
  status(input: ResearchTurnInput, signal?: AbortSignal): Promise<ResearchOutcome>; cancel(input: ResearchTurnInput, signal?: AbortSignal): Promise<ResearchOutcome> };
export type ResearchState = { question: string; status: 'pending' | 'complete'; claimed: boolean; cancelled: boolean; failed: boolean; unknown: boolean; profile: ResearchChatProfile };
type Options = { actor: ChatActor; key: string; gateway: () => Gateway; current(): Promise<boolean>; profile: ResearchChatProfile;
  searchLimit: number; now?: () => number; sleep?: (ms: number) => Promise<void>; pollMs?: number; deadlineMs?: number };
type Usage = ResearchUsage;
const zero: Usage = { calls: 0, inputTokens: 0, outputTokens: 0, costNanoUsd: 0 };
/** Raised when the caller is not an Admin (D4 research is owner/Admin only). */
class ResearchForbidden extends ChatStoreError { constructor() { super('unavailable'); } }
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/** Maps the chat model picker to a research profile; anything else (GPT-OSS, no header) uses Haiku. */
export function researchProfileFor(modelHeader: string | null): ResearchChatProfile {
  const found = (Object.entries(researchChatProfiles) as [ResearchChatProfile, string][]).find(([, model]) => model === modelHeader);
  return found ? found[0] : 'tavily-hosted-haiku';
}

export function createResearchStore(actor: ChatActor, key: string) {
  if (!/^[a-f0-9]{64}$/.test(key)) throw new ChatStoreError('unavailable');
  async function rpc(op: string, thread: string, request: string, fields: Record<string, unknown> = {}) {
    const payload = JSON.stringify({ v: 1, action: 'research_chat', subject: actor.subject, exp: Math.floor(Date.now() / 1000) + 60, input: { op, thread, request, ...fields } });
    const mac = createHmac('sha256', Buffer.from(key, 'hex')).update('panda-llm-db-v1\n' + payload).digest('hex');
    try {
      const { data, error } = await actor.client.database.rpc('panda_agent_research_chat_v1', { p_payload: payload, p_mac: mac });
      if (error) { const e = error as { code?: string; details?: string }; const known = ['not_found', 'conflict', 'invalid', 'unauthenticated'] as const;
        if (e.code === 'P0001' && e.details === 'forbidden') throw new ResearchForbidden();
        throw new ChatStoreError(e.code === 'P0001' ? known.find(c => c === e.details) ?? 'unavailable' : 'unavailable'); }
      return data;
    } catch (error) { throw error instanceof ChatStoreError ? error : new ChatStoreError('unavailable'); }
  }
  const flag = (v: unknown, name: 'execute' | 'recorded') => {
    if (!object(v) || typeof v[name] !== 'boolean') throw new ChatStoreError('unavailable');
    return v as Record<string, unknown> & { execute?: boolean; recorded?: boolean; reason?: string };
  };
  return {
    async state(thread: string, request: string): Promise<ResearchState | null> {
      let v: unknown;
      try { v = await rpc('state', thread, request); } catch (error) { if (error instanceof ResearchForbidden) return null; throw error; } // non-Admins have no research turns
      if (v === null) return null;
      if (!object(v) || Object.keys(v).sort().join(',') !== 'cancelled,claimed,failed,profile,question,status,unknown' || typeof v.question !== 'string'
        || !['pending', 'complete'].includes(v.status as string) || !Object.hasOwn(researchChatProfiles, v.profile as string)
        || [v.claimed, v.cancelled, v.failed, v.unknown].some(b => typeof b !== 'boolean')) throw new ChatStoreError('unavailable');
      return v as ResearchState;
    },
    async begin(thread: string, request: string, question: string, profile: ResearchChatProfile) {
      const v = await rpc('begin', thread, request, { question, profile });
      if (!object(v) || typeof v.admitted !== 'boolean') throw new ChatStoreError('unavailable');
      return v.admitted;
    },
    claim: async (thread: string, request: string, promptHash: string, runId: string) => flag(await rpc('claim', thread, request, { promptHash, runId }), 'execute'),
    receipt: async (thread: string, request: string, promptHash: string, runId: string, answer: ChatAnswer, usage: Usage) =>
      flag(await rpc('receipt', thread, request, { promptHash, runId, answer, usage }), 'recorded').recorded === true,
    finish: (thread: string, request: string, answer: ChatAnswer) => rpc('finish', thread, request, { answer }),
    fail: (thread: string, request: string, reason: string, usage: Usage) => rpc('fail', thread, request, { reason, usage }),
    cancel: (thread: string, request: string) => rpc('cancel', thread, request),
    /** The per-user daily web-search allowance (owner decision: shared with other web-search features). */
    async consumeSearch(limit: number) {
      const { data, error } = await actor.client.database.rpc('panda_agent_web_search_consume', { p_limit: limit });
      if (error || !object(data) || typeof data.allowed !== 'boolean') throw new ChatStoreError('unavailable');
      return data.allowed;
    },
  };
}

export function createResearchChat(options: Options): BasicRagChatBridge {
  const store = createResearchStore(options.actor, options.key);
  const now = options.now ?? Date.now, sleep = options.sleep ?? (ms => new Promise(r => setTimeout(r, ms)));
  const pollMs = options.pollMs ?? 3000, deadlineMs = options.deadlineMs ?? 330000;
  const valid = (thread: string, request: string) => { if (!uuid(thread) || !uuid(request) || request !== request.toLowerCase()) throw new ChatStoreError('invalid'); };
  const requireCurrent = async () => { if (!await options.current()) throw new ChatStoreError('unauthenticated'); };
  const read = async (thread: string, request: string) => { valid(thread, request); await requireCurrent(); return store.state(thread, request); };
  const result = (s: ResearchState) => ({ status: s.status === 'complete' ? 'saved' as const : s.claimed ? 'unknown' as const : 'pending' as const });
  const input = (ref: BasicRagReference, s: { question: string; profile: ResearchChatProfile }): ResearchTurnInput =>
    ({ subject: options.actor.subject, chatId: ref.thread, requestId: ref.request, profile: s.profile, prompt: s.question });
  const report = (progress: ActivityReporter | undefined, stage: Parameters<ActivityReporter>[0]) => { try { progress?.(stage); } catch { /* presentation only */ } };

  /** Save a terminal, verified host outcome. Returns false when the outcome is not terminal (running/unknown). */
  async function record(ref: BasicRagReference, s: { question: string; profile: ResearchChatProfile }, outcome: ResearchOutcome, progress?: ActivityReporter): Promise<boolean> {
    const promptHash = researchPromptHash(s.question), runId = researchRunId(researchSubjectHash(options.actor.subject), ref.thread, ref.request);
    if (outcome.state === 'evidence' || outcome.state === 'insufficient') {
      report(progress, 'saving_answer'); await requireCurrent();
      await store.receipt(ref.thread, ref.request, promptHash, runId, outcome.answer, outcome.usage);
      await store.finish(ref.thread, ref.request, outcome.answer); return true;
    }
    if (outcome.state === 'failed') { await requireCurrent(); await store.fail(ref.thread, ref.request, outcome.reason, outcome.usage); return true; }
    return false;
  }
  /** Same request id only: status polls until terminal or the deadline; never a second dispatch. */
  async function settle(ref: BasicRagReference, s: { question: string; profile: ResearchChatProfile }, started: number, signal: AbortSignal) {
    const gateway = options.gateway();
    while (now() - started < deadlineMs && !signal.aborted) {
      await sleep(pollMs);
      const outcome = await gateway.status(input(ref, s), signal);
      if (await record(ref, s, outcome)) return true;
      if (outcome.state === 'not_found' || outcome.state === 'conflict') return false;
    }
    return false;
  }

  return {
    async state(thread, request) { return await read(thread, request) !== null; },
    async status(ref, signal) {
      const s = await read(ref.thread, ref.request); if (!s) throw new ChatStoreError('not_found');
      if (s.status === 'complete' || !s.claimed || s.unknown || signal.aborted) return result(s);
      // A claimed turn whose result arrived after the request ended: read it once by the same request id.
      // shortcut: a claimed turn the host never received (lost claim response in another process) stays counted as a possible spend;
      // releasing on host not_found here would race a dispatch still in flight from another tab. Upgrade with a claim-age check.
      if (await record(ref, s, await options.gateway().status(input(ref, s), signal))) return { status: 'saved' };
      return result(s);
    },
    async cancel(ref, signal) {
      const s = await read(ref.thread, ref.request); if (!s) throw new ChatStoreError('not_found');
      if (s.status === 'complete') return { status: 'saved' };
      if (s.claimed && !signal.aborted) { try { await options.gateway().cancel(input(ref, s), signal); } catch { /* the saved cancel text says a late answer is never saved */ } }
      await requireCurrent(); await store.cancel(ref.thread, ref.request);
      return { status: 'saved' };
    },
    async start(turn: BasicRagTurn, signal, progress) {
      valid(turn.thread, turn.request);
      if (typeof turn.question !== 'string' || !turn.question.trim() || turn.question !== turn.question.trim() || turn.question.length > 2000 || !turn.question.isWellFormed()) throw new ChatStoreError('invalid');
      const ref = { thread: turn.thread, request: turn.request };
      const previous = await read(turn.thread, turn.request);
      if (previous) { if (previous.question !== turn.question) throw new ChatStoreError('conflict'); return result(previous); }
      if (signal.aborted) throw new ChatStoreError('unavailable');
      const s = { question: turn.question, profile: options.profile };
      report(progress, 'routing_question');
      if (!await store.begin(turn.thread, turn.request, turn.question, s.profile)) { const old = await read(turn.thread, turn.request); return old ? result(old) : { status: 'unknown' }; }
      try {
        if (!await store.consumeSearch(options.searchLimit)) { await store.fail(turn.thread, turn.request, 'budget', zero); return { status: 'saved' }; }
        await requireCurrent();
        const claimed = await store.claim(turn.thread, turn.request, researchPromptHash(turn.question), researchRunId(researchSubjectHash(options.actor.subject), turn.thread, turn.request));
        if (claimed.execute !== true) { await store.fail(turn.thread, turn.request, 'budget', zero); return { status: 'saved' }; }
      } catch (error) {
        // Nothing was dispatched (this path never reaches the gateway), so even a claim whose response was lost is closed with
        // zero usage, which releases its reservation.
        try { const now2 = await store.state(turn.thread, turn.request); if (now2 && now2.status === 'pending') await store.fail(turn.thread, turn.request, 'invalid', zero); } catch { /* status or cancel later */ }
        throw error instanceof ChatStoreError ? error : new ChatStoreError('unavailable');
      }
      if (signal.aborted) { try { await store.fail(turn.thread, turn.request, 'invalid', zero); return { status: 'saved' }; } catch { return { status: 'unknown' }; } }
      const started = now();
      report(progress, 'searching_web');
      let outcome: ResearchOutcome;
      try { outcome = await options.gateway().turn(input(ref, s), { signal, onProgress: stage => report(progress, stage) }); }
      catch { outcome = { state: 'unknown' }; }
      try {
        if (await record(ref, s, outcome, progress)) return { status: 'saved' };
        if (outcome.state !== 'not_found' && outcome.state !== 'conflict' && await settle(ref, s, started, signal)) return { status: 'saved' };
      } catch { /* a failed save leaves the turn claimed; status reconciles it later by the same request id */ }
      return { status: 'unknown' };
    },
  };
}

/** Routes web-search turns to research and research-owned request ids to research; everything else goes to `base`.
 * A failing research lookup never breaks ordinary chat: it is treated as "not a research turn" (fail closed: a research
 * turn would then report not found, never be re-dispatched). */
export function withResearch(base: BasicRagChatBridge, research: BasicRagChatBridge): BasicRagChatBridge {
  const isResearch = async (thread: string, id: string) => { try { return await research.state(thread, id); } catch (error) { if (error instanceof ChatStoreError && error.code === 'unauthenticated') throw error; return false; } };
  const owner = async (thread: string, id: string) => await isResearch(thread, id) ? research : base;
  return {
    state: async (thread, id) => await isResearch(thread, id) || await base.state(thread, id),
    status: async (ref, signal) => (await owner(ref.thread, ref.request)).status(ref, signal),
    cancel: async (ref, signal) => (await owner(ref.thread, ref.request)).cancel(ref, signal),
    start: async (turn, signal, progress) => turn.webSearch ? research.start(turn, signal, progress) : base.start(turn, signal, progress),
  };
}

export const researchKey32=(v:string|undefined):Buffer|null=>{const b=Buffer.from(v??'','base64');return b.length===32&&b.toString('base64')===v?b:null;};
/** Web search runs on the host research harness (phase D4). Off unless the flag and the complete gateway configuration are present. */
export function researchWebSearchEnabled(env:NodeJS.ProcessEnv=process.env):boolean {
 return env.PANDA_AGENT_RESEARCH_ENABLED==='true'&&!!env.PANDA_RESEARCH_ENDPOINT&&!!env.PANDA_RESEARCH_CALLER_ROLE_ARN&&!!researchKey32(env.PANDA_RESEARCH_DISPATCH_KEY)&&!!researchKey32(env.PANDA_RESEARCH_RESULT_KEY);
}

