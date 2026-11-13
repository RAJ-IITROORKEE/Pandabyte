// Chat bridge for agent-loop turns: begin -> loop (claim before the first provider call) -> receipt -> finish,
// on the same session/policy checks as the direct chat. A lost or unknown outcome is reported, never retried.
import type { BasicRagChatBridge } from '../server/basic-rag-chat-contracts.ts';
import { uuid, type ActivityStage } from '../server/chat-contracts.ts';
import { ChatStoreError } from '../server/chat-store.ts';
import { turnUsageFor, type HostedDirectModelId } from '../hosted-model.ts';
import { loopHistory } from './history.ts';
import { loopMessages, runAgentLoop, type StepFn } from './loop.ts';
import { allToolSpecs, createToolHost, type ToolDeps } from './tools.ts';
import type { AgentLoopStore, LoopState } from './store.ts';

type Policy = { enabled(): Promise<boolean>; current(): Promise<boolean>; dispatchCurrent(): boolean; key(): string; isUnmetered?(): boolean };
export type StepFactory = (options: { model: HostedDirectModelId; apiKey: string; policyCurrent(): Promise<boolean>; dispatchCurrent(): boolean;
  claim(bodyHash: string): Promise<boolean>; beforeSend(): Promise<boolean> }) => StepFn;
type Options = { store: AgentLoopStore; current(): Promise<boolean>; policy: Policy; model: HostedDirectModelId; tools: Omit<ToolDeps, 'progress'>; step: StepFactory };

export const sourcesChangedText = 'The PandaByte sources for this answer changed while I was writing it, so it was not saved as cited. Please ask again.';

export function createAgentLoopChat(options: Options): BasicRagChatBridge {
  const { store, policy } = options;
  const valid = (thread: string, request: string) => { if (!uuid(thread) || !uuid(request) || request !== request.toLowerCase()) throw new ChatStoreError('invalid'); };
  const current = async () => { if (!await options.current()) throw new ChatStoreError('unauthenticated'); };
  const read = async (thread: string, request: string) => { valid(thread, request); const [, state] = await Promise.all([current(), store.state(thread, request)]); await current(); return state; };
  const status = (s: LoopState) => ({ status: s.status === 'complete' ? 'saved' as const : s.claimed ? 'unknown' as const : 'pending' as const });
  return {
    async state(thread, request) { return await read(thread, request) !== null; },
    async status(ref, signal) { if (signal.aborted) throw new ChatStoreError('unavailable'); const s = await read(ref.thread, ref.request); if (!s) throw new ChatStoreError('not_found'); return status(s); },
    async cancel(ref, signal) {
      if (signal.aborted) throw new ChatStoreError('unavailable'); const s = await read(ref.thread, ref.request); if (!s) throw new ChatStoreError('not_found');
      if (s.status === 'complete') return { status: 'saved' }; await store.cancel(ref.thread, ref.request); await current(); return { status: 'saved' };
    },
    async start(turn, signal, progress) {
      valid(turn.thread, turn.request);
      if (typeof turn.question !== 'string' || !turn.question || turn.question !== turn.question.trim() || turn.question.length > 2000 || !turn.question.isWellFormed()) throw new ChatStoreError('invalid');
      const previous = await read(turn.thread, turn.request);
      if (previous) { if (previous.question !== turn.question) throw new ChatStoreError('conflict'); return status(previous); }
      if (signal.aborted || !await policy.enabled()) throw new ChatStoreError('unavailable');
      await current();
      // shortcut: Admin (unmetered) turns only, like the proposed journal; metered users need a budget reservation sized for every step.
      if (policy.isUnmetered?.() !== true) throw new ChatStoreError('unavailable');
      const begun = await store.begin(turn.thread, turn.request, turn.question);
      if (!begun.admitted) { const old = await read(turn.thread, turn.request); return old ? status(old) : { status: 'unknown' }; }
      const report = (stage: ActivityStage) => { try { progress?.(stage); } catch { /* Presentation only. */ } };
      const fixed = Buffer.byteLength(JSON.stringify([loopMessages(turn.question, [], null), allToolSpecs]), 'utf8');
      const history = loopHistory(begun, turn.request, fixed);
      let bodyHash: string | undefined, attempted = false;
      const beforeSend = async () => {
        if (signal.aborted || !policy.dispatchCurrent()) return false;
        const s = await read(turn.thread, turn.request);
        return !!s && s.status === 'pending' && s.claimed && !s.cancelled && s.question === turn.question && !signal.aborted && policy.dispatchCurrent();
      };
      const step = options.step({ model: options.model, apiKey: policy.key(), policyCurrent: policy.current, dispatchCurrent: policy.dispatchCurrent, beforeSend,
        claim: async hash => { if (attempted || signal.aborted) return false; attempted = true; await current(); bodyHash = hash; return store.claimUnmetered(turn.thread, turn.request, hash); } });
      const tools = createToolHost({ ...options.tools, progress: report });
      try {
        report('routing_question');
        const result = await runAgentLoop({ messages: loopMessages(turn.question, history.messages, history.summary) }, { step, tools, signal });
        if (!bodyHash || !await beforeSend()) return { status: 'unknown' };
        // Cited products are rechecked against their live source scope immediately before the answer is saved.
        const answer = result.citedSkus.length && !await tools.revalidate(result.citedSkus) ? { outcome: 'insufficient' as const, text: sourcesChangedText, citations: [] } : result.answer;
        report('saving_answer');
        const recorded = await store.receiptUnmetered(turn.thread, turn.request, bodyHash, answer, { ...result.usage, steps: result.steps });
        if (!recorded || !await beforeSend()) return { status: 'unknown' };
        await store.finish(turn.thread, turn.request, answer); await current();
        return { status: 'saved', usage: turnUsageFor(options.model, result.usage) };
      } catch { return { status: 'unknown' }; }
    },
  };
}

/** Loop turns keep their own journal for status and cancel; a request another journal already holds stays there. */
export function withAgentLoop(base: BasicRagChatBridge, loop: BasicRagChatBridge): BasicRagChatBridge {
  const isLoop = async (thread: string, id: string) => { try { return await loop.state(thread, id); } catch (error) { if (error instanceof ChatStoreError && error.code === 'unauthenticated') throw error; return false; } };
  const owner = async (thread: string, id: string) => await isLoop(thread, id) ? loop : base;
  return {
    state: async (thread, id) => await isLoop(thread, id) || await base.state(thread, id),
    status: async (ref, signal) => (await owner(ref.thread, ref.request)).status(ref, signal),
    cancel: async (ref, signal) => (await owner(ref.thread, ref.request)).cancel(ref, signal),
    start: async (turn, signal, progress) => !await isLoop(turn.thread, turn.request) && await base.state(turn.thread, turn.request) ? base.start(turn, signal, progress) : loop.start(turn, signal, progress),
  };
}
