// Chat bridge for agent-loop turns: begin -> loop (claim before the first provider call) -> receipt -> finish,
// on the same session/policy checks as the direct chat. A lost or unknown outcome is reported, never retried.
import type { BasicRagChatBridge, BasicRagTurn } from '../server/basic-rag-chat-contracts.ts';
import { uuid, type ActivityStage } from '../server/chat-contracts.ts';
import { ChatStoreError } from '../server/chat-store.ts';
import { turnUsageFor, type HostedDirectModelId } from '../hosted-model.ts';
import { loopHistory } from './history.ts';
import { loopMessages, newLoopTrace, runAgentLoop, type StepFn } from './loop.ts';
import { createToolHost, webHelperMessages, webPicksSpec, type McpAgentTool, type SkillEntry, type ToolDeps } from './tools.ts';
import type { WebSource } from '../search/tavily.ts';
import type { AgentLoopStore, LoopState } from './store.ts';

type Policy = { enabled(): Promise<boolean>; current(): Promise<boolean>; dispatchCurrent(): boolean; key(): string; isUnmetered?(): boolean };
export type StepFactory = (options: { model: HostedDirectModelId; apiKey: string; policyCurrent(): Promise<boolean>; dispatchCurrent(): boolean;
  claim(bodyHash: string): Promise<boolean>; beforeSend(): Promise<boolean> }) => StepFn;
type Tools = Omit<ToolDeps, 'progress' | 'webSearch' | 'skills'> & { webSearch?(query: string, signal: AbortSignal, beforeSend: () => Promise<boolean>): Promise<WebSource[]>;
  /** Enabled skills for this turn; a failure means no skills (the turn still runs). */
  skills?(): Promise<readonly SkillEntry[]>;
  /** Admin-approved MCP tools for this turn (Admin chats only); a failure means no MCP tools. */
  mcp?(): Promise<{ tools: readonly McpAgentTool[]; call: NonNullable<ToolDeps['callMcp']> } | null> };
type Options = { store: AgentLoopStore; current(): Promise<boolean>; policy: Policy; model: HostedDirectModelId; tools: Tools; step: StepFactory; turnMs?: number };

/** The whole turn ends before the route's 300 s limit, so a late step cannot outlive its request. */
export const LOOP_TURN_MS = 230000;
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
    async start(turn, requestSignal, progress, plan) {
      const signal = AbortSignal.any([requestSignal, AbortSignal.timeout(options.turnMs ?? LOOP_TURN_MS)]);
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
      let bodyHash: string | undefined, attempted = false;
      const beforeSend = async () => {
        if (signal.aborted || !policy.dispatchCurrent()) return false;
        const s = await read(turn.thread, turn.request);
        return !!s && s.status === 'pending' && s.claimed && !s.cancelled && s.question === turn.question && !signal.aborted && policy.dispatchCurrent();
      };
      const step = options.step({ model: options.model, apiKey: policy.key(), policyCurrent: policy.current, dispatchCurrent: policy.dispatchCurrent, beforeSend,
        claim: async hash => { if (attempted || signal.aborted) return false; attempted = true; await current(); bodyHash = hash; return store.claimUnmetered(turn.thread, turn.request, hash); } });
      // Web search is offered only on turns the user sent with web search on, and each search passes the same send check as a model step.
      const { webSearch, skills: readSkills, mcp: readMcp, ...catalogTools } = options.tools;
      let skills: readonly SkillEntry[] = [];
      try { skills = readSkills ? await readSkills() : []; } catch { skills = []; }
      let mcp: Awaited<ReturnType<NonNullable<Tools['mcp']>>> = null;
      try { mcp = readMcp ? await readMcp() : null; } catch { mcp = null; }
      const webOn = turn.webSearch === true && !!webSearch;
      // The web-research helper: one guarded call of the same model and endpoint, in its own short context.
      const condenseWeb = async (query: string, results: readonly { id: string; title: string; content: string }[], s: AbortSignal) => {
        const r = await step(webHelperMessages(turn.question, query, results), [webPicksSpec], s, 400);
        const call = r.toolCalls.find(c => c.name === 'web_picks');
        let args: unknown = null; try { args = call ? JSON.parse(call.arguments) : null; } catch { args = null; }
        return { args, usage: r.usage };
      };
      // A server named in the question is opened up front; others are listed in one line each and opened on demand.
      const mcpTools = mcp?.tools ?? [], mcpOpen = [...new Set(mcpTools.map(t => t.server))].filter(s => new RegExp(`\\b${s}\\b`, 'i').test(turn.question));
      const tools = createToolHost({ ...catalogTools, skills, ...(plan ? { plan } : {}), ...(mcp && mcpTools.length ? { mcpTools, callMcp: mcp.call, mcpOpen } : {}), progress: report, ...(webOn ? { webSearch: (q: string, s: AbortSignal) => webSearch!(q, s, async () => await beforeSend() && await store.reserveSearch(turn.thread, turn.request)), condenseWeb } : {}) });
      const fixed = Buffer.byteLength(JSON.stringify([loopMessages(turn.question, [], null, webOn, skills, mcpTools, !!plan), tools.specs(false)]), 'utf8');
      const history = loopHistory(begun, turn.request, fixed);
      const trace = newLoopTrace(); let logged = false;
      // One safe line per turn for the hosting logs: model, step shape, error codes and output tokens; never user text, answers, excerpts or ids.
      const log = (outcome: string, steps = trace.output.length) => { if (logged) return; logged = true; try { console.info('[agent-loop]', JSON.stringify({ model: options.model, outcome, steps, ...trace })); } catch { /* Logging cannot change a turn. */ } };
      try {
        report('routing_question');
        const result = await runAgentLoop({ messages: loopMessages(turn.question, history.messages, history.summary, webOn, skills, mcpTools, !!plan) }, { step, tools, signal, trace });
        log(result.kind, result.steps);
        if (!bodyHash || !await beforeSend()) return { status: 'unknown' };
        // Cited products are rechecked against their live source scope immediately before the answer is saved.
        const answer = result.citedSkus.length && !await tools.revalidate(result.citedSkus) ? { outcome: 'insufficient' as const, text: sourcesChangedText, citations: [] } : result.answer;
        report('saving_answer');
        const recorded = await store.receiptUnmetered(turn.thread, turn.request, bodyHash, answer, { ...result.usage, steps: result.steps });
        if (!recorded || !await beforeSend()) return { status: 'unknown' };
        await store.finish(turn.thread, turn.request, answer); await current();
        // Follow-ups belong to the answer the model wrote; a replaced answer (sources changed) gets none. Not stored.
        return { status: 'saved', usage: turnUsageFor(options.model, result.usage), ...(answer === result.answer && result.kind === 'final' && result.suggestions.length ? { suggestions: result.suggestions } : {}) };
      } catch { log('unknown'); return { status: 'unknown' }; }
    },
  };
}

export { loopModelAllowed } from '../hosted-model.ts';

/** Loop turns keep their own journal for status and cancel; a request another journal already holds stays there.
 *  New requests go to the loop only for an eligible session (Admin, unmetered); everyone else keeps the existing chat. */
export function withAgentLoop(base: BasicRagChatBridge, loop: BasicRagChatBridge, eligible: (turn: BasicRagTurn) => Promise<boolean>): BasicRagChatBridge {
  const isLoop = async (thread: string, id: string) => { try { return await loop.state(thread, id); } catch (error) { if (error instanceof ChatStoreError && error.code === 'unauthenticated') throw error; return false; } };
  const owner = async (thread: string, id: string) => await isLoop(thread, id) ? loop : base;
  return {
    state: async (thread, id) => await isLoop(thread, id) || await base.state(thread, id),
    status: async (ref, signal) => (await owner(ref.thread, ref.request)).status(ref, signal),
    cancel: async (ref, signal) => (await owner(ref.thread, ref.request)).cancel(ref, signal),
    start: async (turn, signal, progress, plan) => {
      if (await isLoop(turn.thread, turn.request)) return loop.start(turn, signal, progress, plan);
      if (await base.state(turn.thread, turn.request)) return base.start(turn, signal, progress);
      let ok = false; try { ok = await eligible(turn) === true; } catch { ok = false; }
      return ok ? loop.start(turn, signal, progress, plan) : base.start(turn, signal, progress);
    },
  };
}
