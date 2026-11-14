// Chat bridge for agent-loop turns: begin -> loop (claim before the first provider call) -> receipt -> finish,
// on the same session/policy checks as the direct chat. A lost or unknown outcome is reported, never retried.
import type { BasicRagChatBridge, BasicRagTurn } from '../server/basic-rag-chat-contracts.ts';
import { uuid, type ActivityStage } from '../server/chat-contracts.ts';
import { ChatStoreError } from '../server/chat-store.ts';
import { turnUsageFor, type HostedDirectModelId } from '../hosted-model.ts';
import { loopHistory } from './history.ts';
import { loopMessages, newLoopTrace, runAgentLoop, type LoopMessage, type StepFn } from './loop.ts';
import { createToolHost, webHelperMessages, webPicksSpec, approvalOf, mcpToolName, MCP_ALLOW_LABEL, type McpAgentTool, type SkillEntry, type ToolDeps } from './tools.ts';
import type { WebSource } from '../search/tavily.ts';
import type { AgentLoopStore, LoopState } from './store.ts';
import { parseToolSettings } from './tool-catalog.ts';
import type { TurnSink } from './turn-events.ts';
import type { Profile } from '../server/hosted-model-openrouter.ts';
import { noteAnswered, noteLimited, readyFirst } from '../models/cooldown.ts';

type Policy = { enabled(): Promise<boolean>; current(): Promise<boolean>; dispatchCurrent(): boolean; key(): string; isUnmetered?(): boolean; isAdmin?(): boolean };
/** One model a turn may run on: a built-in (no profile) or an Admin-added model with its validated profile. */
export type PoolEntry = { id: string; profile?: Profile; contextWindow?: number | null };
export type StepFactory = (options: { model: HostedDirectModelId; profile?: Profile; apiKey: string; policyCurrent(): Promise<boolean>; dispatchCurrent(): boolean;
  claim(bodyHash: string): Promise<boolean>; beforeSend(): Promise<boolean> }) => StepFn;
type Tools = Omit<ToolDeps, 'progress' | 'webSearch' | 'skills' | 'plan' | 'pinout' | 'firmware'> & {
  /** Admin tool switches (panda_agent_tool_settings); a failure means the defaults. */
  settings?(): Promise<unknown>; webSearch?(query: string, signal: AbortSignal, beforeSend: () => Promise<boolean>): Promise<WebSource[]>;
  /** Enabled skills for this turn; a failure means no skills (the turn still runs). */
  skills?(): Promise<readonly SkillEntry[]>;
  /** Admin-approved MCP tools for this turn (Admin chats only); a failure means no MCP tools. */
  mcp?(): Promise<{ tools: readonly McpAgentTool[]; call: NonNullable<ToolDeps['callMcp']> } | null> };
type Options = { store: AgentLoopStore; current(): Promise<boolean>; policy: Policy; model: HostedDirectModelId; tools: Tools; step: StepFactory; turnMs?: number;
  /** Web-research helper on web turns (off by default: in 14 Nov replays it was cost-neutral but dropped facts, e.g. which release is latest). */
  webHelper?: boolean;
  /** Compile tool for signed-in users who are not Admin (otherwise Admin only). */
  deviceMembers?: boolean;
  /** The models this turn may use, in order (the free pool, or one Admin-added model); none means `model` alone. Failover moves
   *  to the next only when a model is rate limited, unavailable or refused, so it is used for free models (no cost per call). */
  pool?(): Promise<readonly PoolEntry[]>;
  /** Per-model usage for the Admin Models page (best effort). */
  recordUsage?(model: string, usage: { inputTokens: number; outputTokens: number; costNanoUsd: number }, failed: boolean, failover: boolean): Promise<void> };

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
    async start(turn, requestSignal, progress, sink) {
      const signal = AbortSignal.any([requestSignal, AbortSignal.timeout(options.turnMs ?? LOOP_TURN_MS)]);
      valid(turn.thread, turn.request);
      if (typeof turn.question !== 'string' || !turn.question || turn.question !== turn.question.trim() || turn.question.length > 2000 || !turn.question.isWellFormed()) throw new ChatStoreError('invalid');
      const previous = await read(turn.thread, turn.request);
      if (previous) { if (previous.question !== turn.question) throw new ChatStoreError('conflict'); return status(previous); }
      if (signal.aborted || !await policy.enabled()) throw new ChatStoreError('unavailable');
      await current();
      // shortcut: Admin (unmetered) turns only, like the proposed journal; metered users need a budget reservation sized for every step.
      if (policy.isUnmetered?.() !== true) throw new ChatStoreError('unavailable');
      // The models this turn may use are known before the turn is journaled, so an empty pool refuses instead of hanging.
      let entries: readonly PoolEntry[] = [{ id: options.model }];
      if (options.pool) { try { entries = await options.pool(); } catch { entries = []; } if (!entries.length) throw new ChatStoreError('unavailable'); entries = readyFirst(entries); }
      const begun = await store.begin(turn.thread, turn.request, turn.question);
      if (!begun.admitted) { const old = await read(turn.thread, turn.request); return old ? status(old) : { status: 'unknown' }; }
      const report = (stage: ActivityStage) => { try { progress?.(stage); } catch { /* Presentation only. */ } };
      let bodyHash: string | undefined, attempted = false, claimedOk = false;
      const beforeSend = async () => {
        if (signal.aborted || !policy.dispatchCurrent()) return false;
        const s = await read(turn.thread, turn.request);
        return !!s && s.status === 'pending' && s.claimed && !s.cancelled && s.question === turn.question && !signal.aborted && policy.dispatchCurrent();
      };
      // The journal is claimed once per turn; a failover model reuses that claim (the receipt keeps the first body hash).
      const claim = async (hash: string) => { if (signal.aborted) return false; if (attempted) return claimedOk; attempted = true; await current(); bodyHash = hash; claimedOk = await store.claimUnmetered(turn.thread, turn.request, hash); return claimedOk; };
      let at = 0, failedOver = false;
      const made: (StepFn | undefined)[] = [];
      const make = (i: number) => made[i] ??= options.step({ model: entries[i].id as HostedDirectModelId, ...(entries[i].profile ? { profile: entries[i].profile } : {}), apiKey: policy.key(),
        policyCurrent: policy.current, dispatchCurrent: policy.dispatchCurrent, beforeSend, claim });
      const step: StepFn = async (messages, specs, s, maxOutput, toolChoice) => {
        for (;;) {
          try { const r = await make(at)(messages, specs, s, maxOutput, toolChoice); noteAnswered(entries[at].id); return r; }
          catch (error) {
            const code = (error as { code?: unknown } | null)?.code;
            if (code === 'rate_limited') noteLimited(entries[at].id);
            if (at + 1 < entries.length && !s.aborted && ['rate_limited', 'not_admitted', 'unavailable', 'outcome_unknown'].includes(String(code))) { at++; failedOver = true; continue; }
            throw error;
          }
        }
      };
      const record = (usage: { inputTokens: number; outputTokens: number; costNanoUsd: number }, failed: boolean) => {
        void options.recordUsage?.(entries[at].id, usage, failed, failedOver).catch(() => {}); };
      // Web search is offered only on turns the user sent with web search on, and each search passes the same send check as a model step.
      const { webSearch, skills: readSkills, mcp: readMcp, settings: readSettings, compile, ...catalogTools } = options.tools;
      // Admin switches decide which optional tools this turn offers (defaults when they cannot be read).
      let on = parseToolSettings(null);
      try { on = parseToolSettings(readSettings ? await readSettings() : null); } catch { on = parseToolSettings(null); }
      let skills: readonly SkillEntry[] = [];
      try { skills = readSkills && on.load_skill.enabled ? await readSkills() : []; } catch { skills = []; }
      let mcp: Awaited<ReturnType<NonNullable<Tools['mcp']>>> = null;
      try { mcp = readMcp && on.mcp_tools.enabled ? await readMcp() : null; } catch { mcp = null; }
      const webOn = turn.webSearch === true && !!webSearch && on.web_search.enabled;
      const plan = on.plan.enabled ? sink?.plan : undefined;
      const compileOn = !!compile && on.compile_sketch.enabled && (policy.isAdmin?.() === true || options.deviceMembers === true);
      const firmware = (fw: Parameters<NonNullable<TurnSink['firmware']>>[0]) => { try { sink?.firmware?.(fw); } catch { /* Presentation only. */ } };
      const onTool = (s: Parameters<NonNullable<TurnSink['tool']>>[0]) => { try { sink?.tool?.(s); } catch { /* Presentation only. */ } };
      // The web-research helper: one guarded call of the same model and endpoint, in its own short context.
      const condenseWeb = async (query: string, results: readonly { id: string; title: string; content: string }[], s: AbortSignal) => {
        const r = await step(webHelperMessages(turn.question, query, results), [webPicksSpec], s, 400);
        const call = r.toolCalls.find(c => c.name === 'web_picks');
        let args: unknown = null; try { args = call ? JSON.parse(call.arguments) : null; } catch { args = null; }
        return { args, usage: r.usage };
      };
      // A server named in the question is opened up front; others are listed in one line each and opened on demand.
      const mcpTools = mcp?.tools ?? [], mcpOpen = [...new Set(mcpTools.map(t => t.server))].filter(s => new RegExp(`\\b${s}\\b`, 'i').test(turn.question));
      // "Allow once" answering the previous turn's approval card approves exactly the call that card showed.
      const before = begun.turns.slice(0, Math.max(0, begun.turns.findIndex(t => t.requestId === turn.request))).filter(t => t.status === 'complete').at(-1);
      const approved = turn.question.trim() === MCP_ALLOW_LABEL && before?.response?.outcome === 'clarification' ? approvalOf(before.response.text) : null;
      const tools = createToolHost({ ...catalogTools, skills, pinout: on.find_pinout.enabled, ...(plan ? { plan } : {}), ...(compileOn ? { compile, firmware } : {}), ...(mcp && mcpTools.length ? { mcpTools, callMcp: mcp.call, mcpOpen: approved && mcpTools.some(t => t.server === approved.server) ? [...new Set([...mcpOpen, approved.server])] : mcpOpen, ...(approved ? { mcpApprovedRef: approved.ref } : {}) } : {}), progress: report, ...(webOn ? { webSearch: (q: string, s: AbortSignal) => webSearch!(q, s, async () => await beforeSend() && await store.reserveSearch(turn.thread, turn.request)), ...(options.webHelper || on.web_helper.enabled ? { condenseWeb } : {}) } : {}) });
      const fixed = Buffer.byteLength(JSON.stringify([loopMessages(turn.question, [], null, webOn, skills, mcpTools, !!plan), tools.specs(false)]), 'utf8');
      const history = loopHistory(begun, turn.request, fixed);
      const trace = newLoopTrace(); let logged = false;
      // One safe line per turn for the hosting logs: model, step shape, error codes and output tokens; never user text, answers, excerpts or ids.
      const log = (outcome: string, steps = trace.output.length) => { if (logged) return; logged = true; try { console.info('[agent-loop]', JSON.stringify({ model: options.model, outcome, steps, ...trace })); } catch { /* Logging cannot change a turn. */ } };
      try {
        report('routing_question');
        // The approved call runs first, exactly as the card showed it; the model continues from its result.
        const seeded: LoopMessage[] = [];
        const shown = approved && mcpTools.find(t => t.server === approved.server && t.tool === approved.tool);
        if (approved && shown) {
          const id = `approved-${approved.ref}`, name = mcpToolName(shown), args = JSON.stringify(approved.args);
          const label = `Running the approved ${approved.server} ${approved.tool} call`, started = Date.now();
          onTool({ id: `approved${approved.ref}`, name, label, state: 'running' });
          const out = await tools.call(name, args, signal);
          onTool({ id: `approved${approved.ref}`, name, label, state: out.kind === 'result' ? 'done' : 'error', ms: Date.now() - started });
          if (out.kind === 'result') seeded.push({ role: 'assistant', content: null, tool_calls: [{ id, type: 'function', function: { name, arguments: args } }] }, { role: 'tool', tool_call_id: id, content: out.content });
        }
        const result = await runAgentLoop({ messages: [...loopMessages(turn.question, history.messages, history.summary, webOn, skills, mcpTools, !!plan), ...seeded] }, { step, tools, signal, trace, onTool });
        log(result.kind, result.steps);
        if (!bodyHash || !await beforeSend()) return { status: 'unknown' };
        // Cited products are rechecked against their live source scope immediately before the answer is saved.
        const answer = result.citedSkus.length && !await tools.revalidate(result.citedSkus) ? { outcome: 'insufficient' as const, text: sourcesChangedText, citations: [] } : result.answer;
        report('saving_answer');
        const recorded = await store.receiptUnmetered(turn.thread, turn.request, bodyHash, answer, { ...result.usage, steps: result.steps });
        if (!recorded || !await beforeSend()) return { status: 'unknown' };
        await store.finish(turn.thread, turn.request, answer); await current();
        // Follow-ups belong to the answer the model wrote; a replaced answer (sources changed) gets none. Not stored.
        record(result.usage, false);
        return { status: 'saved', usage: turnUsageFor(entries[at].id, { ...result.usage, contextTokens: result.contextTokens, steps: result.steps }, entries[at].contextWindow), ...(answer === result.answer && result.kind === 'final' && result.suggestions.length ? { suggestions: result.suggestions } : {}) };
      } catch { log('unknown'); record({ inputTokens: 0, outputTokens: 0, costNanoUsd: 0 }, true); return { status: 'unknown' }; }
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
    start: async (turn, signal, progress, sink) => {
      if (await isLoop(turn.thread, turn.request)) return loop.start(turn, signal, progress, sink);
      if (await base.state(turn.thread, turn.request)) return base.start(turn, signal, progress);
      let ok = false; try { ok = await eligible(turn) === true; } catch { ok = false; }
      return ok ? loop.start(turn, signal, progress, sink) : base.start(turn, signal, progress);
    },
  };
}
