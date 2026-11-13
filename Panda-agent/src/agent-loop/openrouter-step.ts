import 'server-only';
import { createHash, randomUUID } from 'node:crypto';
import type { HostedDirectModelId } from '../hosted-model.ts';
import { approvedEndpoint, encrypted, observe, profiles, receiptUsage, type Observation } from '../server/hosted-model-openrouter.ts';
import { readLunaJSON } from '../server/luna-rag-openrouter.ts';
import { BasicRagProviderError } from '../server/basic-rag-openrouter.ts';
import { CONTEXT_BYTES } from './history.ts';
import { STEP_OUTPUT_MAX, type LoopMessage, type StepFn, type ToolCall } from './loop.ts';

const api = 'https://openrouter.ai/api/v1';
/** Per step: input tokens declared to the endpoint check and receipt, output room for a complete code answer. */
export const LOOP_MAX_INPUT = 24000, LOOP_MAX_OUTPUT = STEP_OUTPUT_MAX, LOOP_STEP_MS = 40000, LOOP_WIRE_BYTES = CONTEXT_BYTES;
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const fail = (code: BasicRagProviderError['code']): never => { throw new BasicRagProviderError(code); };

type Options = { model: HostedDirectModelId; apiKey: string; fetcher?: typeof fetch;
  policyCurrent(): Promise<boolean>; dispatchCurrent(): boolean;
  /** Called once, before the first provider call, with that request body's hash; the journal claim. */
  claim(bodyHash: string): Promise<boolean>;
  /** The journal still shows this turn pending, claimed and not cancelled. Checked before every call. */
  beforeSend(): Promise<boolean>;
  observe?: (observation: Readonly<Observation>) => unknown };

function toolCalls(value: unknown): ToolCall[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.length > 4) return fail('response_rejected');
  return value.map(c => {
    if (!record(c) || Object.keys(c).some(k => !['id', 'type', 'function', 'index'].includes(k)) || typeof c.id !== 'string' || !/^[A-Za-z0-9_.:-]{1,200}$/.test(c.id)
      || (c.type !== undefined && c.type !== 'function') || !record(c.function) || Object.keys(c.function).some(k => !['name', 'arguments'].includes(k))
      || typeof c.function.name !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(c.function.name) || typeof c.function.arguments !== 'string'
      || c.function.arguments.length > 24000 || !c.function.arguments.isWellFormed()) return fail('response_rejected');
    return { id: c.id, name: c.function.name, arguments: c.function.arguments };
  });
}

/** Claude caches only at explicit breakpoints: the system prompt (with the tool list before it) and the latest user message
 *  (history and question before it). Both stay identical across a turn's steps, so steps 2+ read them at the cached price. */
export function cacheBreakpoints(list: readonly LoopMessage[]): readonly unknown[] {
  let question = -1; list.forEach((msg, i) => { if (msg.role === 'user') question = i; });
  return list.map((msg, i) => ((i === 0 && msg.role === 'system') || i === question) && typeof msg.content === 'string' && msg.content
    ? { ...msg, content: [{ type: 'text', text: msg.content, cache_control: { type: 'ephemeral' } }] } : msg);
}

/** One non-streamed tool-calling request per step on the same pinned zero-retention endpoint and receipt checks as the hosted chat. */
export function createOpenRouterStep(options: Options): StepFn {
  const m = profiles[options.model], fetcher = options.fetcher ?? fetch;
  // Receipt ceiling per step: this model's worst case for the declared token bounds.
  // Cache writes can cost more than plain input (Claude: 1.25x), so the ceiling uses the higher input price.
  const reservation = (maxOutput: number) => Math.ceil((LOOP_MAX_INPUT * Math.max(m.nano2.prompt, m.nano2.write) + maxOutput * m.nano2.completion) / 2) + 1;
  const cacheable = m.id.startsWith('anthropic/');
  const withCache = (list: readonly LoopMessage[]): readonly unknown[] => cacheable ? cacheBreakpoints(list) : list;
  // Endpoint and privacy metadata are checked on the first step and reused for this turn; policy and journal checks still run every step.
  // 'required' (after sources were read) is sent only when the pinned endpoint publishes support for it (13 Nov 2026: Claude
  // Haiku endpoints do not, GPT-6 Luna endpoints do); otherwise 'auto', and the loop's one-time nudge remains the fallback.
  let claimed = false, approved: string | null = null, requiredOk = false;
  return async (messages: readonly LoopMessage[], tools, signal, maxOutput, toolChoice = 'auto') => {
    const started = performance.now(), observation: Observation = { observationId: randomUUID(), model: m.id, provider: m.tag, stage: 'unavailable', totalMs: 0 };
    const deadline = AbortSignal.any([signal, AbortSignal.timeout(LOOP_STEP_MS)]);
    let sent = false;
    try {
      if (!Number.isSafeInteger(maxOutput) || maxOutput < 1 || maxOutput > LOOP_MAX_OUTPUT || !options.apiKey || /[\r\n]/.test(options.apiKey) || !messages.length || deadline.aborted) return fail('not_admitted');
      const wire = (tokenParam: string) => JSON.stringify({ model: m.id, stream: false, [tokenParam]: maxOutput, reasoning: m.reasoning, include_reasoning: false,
        tools, tool_choice: toolChoice === 'required' && requiredOk ? 'required' : 'auto', usage: { include: true }, plugins: [],
        provider: { only: [m.tag], allow_fallbacks: false, require_parameters: true, zdr: true, data_collection: 'deny', max_price: { prompt: m.maxPrice.prompt, completion: m.maxPrice.completion, request: 0, image: 0 } },
        messages: withCache(messages) });
      if (Buffer.byteLength(wire('max_tokens'), 'utf8') > LOOP_WIRE_BYTES || options.dispatchCurrent() !== true) return fail('not_admitted');
      if (!approved) {
        const get = async (path: string) => { const response = await fetcher(api + path, { method: 'GET', redirect: 'error', cache: 'no-store', credentials: 'omit', signal: deadline });
          if (!response.ok || response.redirected) { void response.body?.cancel().catch(() => {}); return fail('not_admitted'); } return readLunaJSON(response, 4000000); };
        const [catalog, zdr, policy] = await Promise.all([get('/models/' + m.id + '/endpoints'), get('/endpoints/zdr'), options.policyCurrent()]);
        observation.metadataMs = Math.round(performance.now() - started);
        const parameter = approvedEndpoint(m, catalog, zdr, LOOP_MAX_INPUT, LOOP_MAX_OUTPUT, true);
        if (!parameter || !policy || deadline.aborted) return fail('not_admitted');
        approved = parameter;
        const endpoints = record(catalog) && record(catalog.data) && Array.isArray(catalog.data.endpoints) ? catalog.data.endpoints : [];
        const pinned = endpoints.find((e: unknown) => record(e) && e.tag === m.tag);
        requiredOk = record(pinned) && record(pinned.supports_tool_choice) && pinned.supports_tool_choice.required === true;
      }
      const parameter = approved;
      const body = wire(parameter);
      if (Buffer.byteLength(body, 'utf8') > LOOP_WIRE_BYTES) return fail('not_admitted');
      if (!claimed) {
        if (!options.dispatchCurrent() || !await options.claim(createHash('sha256').update(body).digest('hex'))) return fail('not_admitted');
        claimed = true;
      }
      const [current, allowed] = await Promise.all([options.policyCurrent(), options.beforeSend()]);
      if (!current || !allowed || deadline.aborted || !options.dispatchCurrent()) return fail('not_admitted');
      observation.admissionMs = Math.round(performance.now() - started); sent = true;
      const response = await fetcher(api + '/chat/completions', { method: 'POST', redirect: 'error', cache: 'no-store', credentials: 'omit', signal: deadline,
        headers: { Authorization: 'Bearer ' + options.apiKey, 'Content-Type': 'application/json', 'X-OpenRouter-Cache': 'false' }, body });
      observation.httpStatus = response.status;
      if (!response.ok || response.redirected) { void response.body?.cancel().catch(() => {}); return fail(response.status === 429 ? 'rate_limited' : 'outcome_unknown'); }
      const item = await readLunaJSON(response, 1000000);
      observation.providerRoundTripMs = Math.round(performance.now() - started);
      if (!record(item) || Object.hasOwn(item, 'error') || typeof item.id !== 'string' || !/^gen-[A-Za-z0-9_-]{1,160}$/.test(item.id)
        || !m.reported.includes(String(item.model)) || item.provider !== m.providerName || !Array.isArray(item.choices) || item.choices.length !== 1) return fail('outcome_unknown');
      observation.generationId = item.id;
      const usage = receiptUsage(m, item.usage, LOOP_MAX_INPUT, maxOutput, reservation(maxOutput));
      Object.assign(observation, usage.usage, { reasoningTokens: usage.reasoningTokens, cachedTokens: usage.cachedTokens });
      // The receipt is valid from here, so a malformed message still counts its usage; the loop treats it as an empty reply.
      let calls: ToolCall[] = [], content: string | null = null, finish: string | undefined;
      try {
        const choice = item.choices[0], message = record(choice) ? choice.message : undefined;
        if (!record(choice) || (choice.index !== undefined && choice.index !== 0) || !['stop', 'tool_calls'].includes(choice.finish_reason as string) || !record(message)
          || Object.keys(message).some(k => !['role', 'content', 'tool_calls', 'reasoning', 'reasoning_content', 'reasoning_details', 'refusal', 'function_call'].includes(k))
          || message.role !== 'assistant' || message.function_call != null || (message.refusal != null && message.refusal !== '')
          || (message.reasoning != null && message.reasoning !== '') || (message.reasoning_content != null && message.reasoning_content !== '')
          || (message.reasoning_details != null && (!Array.isArray(message.reasoning_details) || (message.reasoning_details.length > 0 && !(m.encryptedReasoning && encrypted(message.reasoning_details)))))
          || (message.content != null && (typeof message.content !== 'string' || message.content.length > 20000 || !message.content.isWellFormed()))) throw Error();
        finish = choice.finish_reason as string; calls = toolCalls(message.tool_calls); content = typeof message.content === 'string' && message.content.trim() ? message.content : null;
      } catch { calls = []; content = null; }
      observation.stage = calls.length || content ? 'validated' : 'response_rejected';
      return { content, toolCalls: calls, usage: usage.usage, ...(finish ? { finish } : {}) };
    } catch (error) {
      const safe = error instanceof BasicRagProviderError ? error : new BasicRagProviderError(sent ? 'outcome_unknown' : 'unavailable');
      observation.stage = safe.code; throw safe;
    } finally { observation.totalMs = Math.round(performance.now() - started); observe(options, observation); }
  };
}
