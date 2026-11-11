import { createHash, randomUUID } from 'node:crypto';
import { strictJson } from '../lightweight/client.ts';
import { canonicalResearchJSON, hashResearchValue, validResearchProviderBody, type ResearchProviderBody, type ResearchProviderToolCall, type ResearchProviderUsage } from '../opencode/research-provider-gateway.ts';
import { researchJSON, researchObject, type ResearchObject } from '../opencode/research-values.ts';
import { researchProfileSelection } from '../../runtime/opencode/research-profile.mjs';
import type { ResearchProfileID } from '../opencode/research-runtime.ts';
import { decodeResearchImageDataUri, replaceResearchImageUrls, researchImageMaxBase64, researchImageMaxUrl, researchImagePlaceholder } from '../opencode/research-image-binding.ts';
import { approvedHostedResearchEndpoint, hostedOutputTokens, hostedResearchModel, validateHostedResearchUsage, type HostedResearchModel } from './hosted-model-policy.ts';

const api = 'https://openrouter.ai/api/v1', streamBytes = 512000;
const sha = (value: string) => createHash('sha256').update(value, 'utf8').digest('hex');
const hex = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const text = (value: unknown, bytes: number): value is string => typeof value === 'string' && value.isWellFormed() && Buffer.byteLength(value, 'utf8') <= bytes;
const only = (value: Record<string, unknown>, keys: readonly string[]) => Object.keys(value).every(key => keys.includes(key));
const exact = (value: Record<string, unknown>, keys: readonly string[]) => Object.keys(value).length === keys.length && only(value, keys);
const generationID = (value: unknown): value is string => typeof value === 'string' && /^gen-[A-Za-z0-9_-]{1,160}$/.test(value);
const callID = (value: unknown): value is string => typeof value === 'string' && /^[\x21-\x7e]{1,256}$/.test(value);
const finiteTime = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0;
const usageKeys = ['prompt_tokens', 'completion_tokens', 'total_tokens', 'cost', 'prompt_tokens_details', 'completion_tokens_details'] as const;

export class ResearchOpenRouterError extends Error {
  readonly outcome: 'not_sent' | 'unknown';
  constructor(outcome: 'not_sent' | 'unknown') { super(outcome); this.name = 'ResearchOpenRouterError'; this.outcome = outcome; }
}
export type PreparedResearchRequest = Readonly<{ nativeRequestHash: string; wireRequestHash: string; policyHash: string }>;
export type ResearchProviderTiming = { metadataMs: number; providerMs: number; totalMs: number; firstDeltaMs?: number };
export type HostedResearchProfileID = Extract<ResearchProfileID, 'tavily-hosted' | 'tavily-hosted-luna' | 'tavily-hosted-terra' | 'tavily-hosted-haiku'>;
export type HostedResearchReceipt = { version: 1; model: HostedResearchModel['id']; provider: string; generationId: string;
  nativeRequestHash: string; wireRequestHash: string; policyHash: string; outputHash: string; usageReceipt: ResearchObject;
  reasoningTokens: number; cachedTokens: number; timing: ResearchProviderTiming };
export type HostedResearchResult = { content?: string; toolCalls?: ResearchProviderToolCall[]; usage: ResearchProviderUsage; receipt: HostedResearchReceipt };
export type ResearchOpenRouterObservation = Readonly<{ observationId: string; model: HostedResearchModel['id']; provider: string; stage: 'prepared' | 'validated' | 'not_sent' | 'unknown';
  metadataMs?: number; providerMs?: number; totalMs: number; firstDeltaMs?: number; inputTokens?: number; outputTokens?: number; costNanoUsd?: number; reasoningTokens?: number; cachedTokens?: number }>;
export type ResearchOpenRouterOptions = { profile?: HostedResearchProfileID; apiKey: string; workspaceSha256: string; privacyProfileHash: string; nativeProfileHash: string;
  policyCurrent(): Promise<boolean>; dispatchCurrent(): boolean; fetcher?: typeof fetch; observe?(observation: ResearchOpenRouterObservation): unknown };
type PreparedState = { wire: string; metadataAt: number; metadataMs: number; started: number; observationId: string; used: boolean };

function freeze<T>(value: T): T {
  if (value && typeof value === 'object') { for (const child of Object.values(value)) freeze(child); Object.freeze(value); }
  return value;
}
/** Every OpenAI-compatible image_url URL anywhere in the messages, in order (non-string or missing URLs surface as undefined). */
function imageUrls(messages: unknown[]): unknown[] {
  const urls: unknown[] = [], walk = (value: unknown): void => {
    if (Array.isArray(value)) { value.forEach(walk); return; }
    if (!value || typeof value !== 'object') return;
    const object = value as Record<string, unknown>;
    if (object.type === 'image_url' || 'image_url' in object) urls.push(object.image_url && typeof object.image_url === 'object' ? (object.image_url as Record<string, unknown>).url : undefined);
    for (const child of Object.values(object)) walk(child);
  };
  walk(messages); return urls;
}
function invalid(): never { throw Error('invalid_research_response'); }
function validInput(value: unknown): value is ResearchObject {
  return researchObject(value) && exact(value, ['query']) && text(value.query, 1600) && value.query.length >= 1 && value.query.length <= 400
    && !!value.query.trim() && !/[\p{Cc}\p{Cf}]/u.test(value.query);
}
function withSignal<T>(pending: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const abort = () => { signal.removeEventListener('abort', abort); reject(Error('aborted')); };
    signal.addEventListener('abort', abort, { once: true });
    pending.then(value => { signal.removeEventListener('abort', abort); resolve(value); }, error => { signal.removeEventListener('abort', abort); reject(error); });
    if (signal.aborted) abort();
  });
}
async function readMetadata(response: Response, signal: AbortSignal): Promise<unknown> {
  if (!response.ok || response.redirected || !response.body || !/^application\/json(?:\s*;|$)/i.test(response.headers.get('content-type') ?? '')) { void response.body?.cancel().catch(() => {}); return invalid(); }
  const reader = response.body.getReader(), decoder = new TextDecoder('utf-8', { fatal: true });
  let raw = '', bytes = 0;
  const cancel = () => { void reader.cancel().catch(() => {}); };
  signal.addEventListener('abort', cancel, { once: true });
  try {
    for (;;) {
      signal.throwIfAborted(); const part = await withSignal(reader.read(), signal); signal.throwIfAborted();
      if (part.done) break;
      bytes += part.value.byteLength; if (bytes > 4194304) return invalid();
      raw += decoder.decode(part.value, { stream: true });
    }
    raw += decoder.decode();
    const value = strictJson(raw);
    // Metadata can contain thousands of endpoints; byte bounds apply to the whole parsed document.
    JSON.parse(raw, (_key, item) => { if (typeof item === 'number' && !Number.isFinite(item)) invalid(); return item; });
    return value;
  } finally { signal.removeEventListener('abort', cancel); cancel(); reader.releaseLock(); }
}

// Observed real GPT-6 Luna (11 Nov 2026): low/exclude reasoning still streams opaque encrypted blocks. They are discarded
// (never rendered, stored or forwarded); any other reasoning_details shape, e.g. visible text or signature-only, stays invalid.
function encryptedReasoning(value: unknown): boolean {
  return Array.isArray(value) && value.length <= 4 && value.every(item => researchObject(item) && exact(item, ['type', 'data', 'format', 'id', 'index'])
    && item.type === 'reasoning.encrypted' && typeof item.data === 'string' && item.data.length <= 65536 && typeof item.format === 'string' && item.format.length <= 64
    && typeof item.id === 'string' && item.id.length <= 256 && Number.isSafeInteger(item.index) && (item.index as number) >= 0 && (item.index as number) < 64);
}
async function readStream(response: Response, signal: AbortSignal, providerStarted: number, toolName: string, model: HostedResearchModel) {
  if (!response.body || !/^text\/event-stream(?:\s*;|$)/i.test(response.headers.get('content-type') ?? '')) { void response.body?.cancel().catch(() => {}); return invalid(); }
  const reader = response.body.getReader(), decoder = new TextDecoder('utf-8', { fatal: true });
  let buffer = '', bytes = 0, content = '', identity: string | undefined, finish: 'stop' | 'tool_calls' | undefined, done = false;
  let usage: unknown, firstDeltaMs: number | undefined;
  const data: string[] = [], calls = new Map<number, { id?: string; name?: string; arguments: string }>();
  const firstDelta = () => { firstDeltaMs ??= Math.round(performance.now() - providerStarted); };
  const frame = () => {
    if (!data.length) return;
    const raw = data.splice(0).join('\n');
    if (done) return invalid();
    if (raw === '[DONE]') { if (!finish || usage === undefined) return invalid(); done = true; return; }
    if (usage !== undefined) return invalid();
    const priorFinish = finish;
    const item = strictJson(raw);
    if (!researchObject(item) || Object.hasOwn(item, 'error')) return invalid();
    if (identity === undefined) {
      if (!generationID(item.id) || typeof item.model !== 'string' || !model.reportedModels.includes(item.model) || item.provider !== model.providerName) return invalid();
      identity = item.id;
    } else if (item.id !== undefined && item.id !== identity || item.model !== undefined && (typeof item.model !== 'string' || !model.reportedModels.includes(item.model)) || item.provider !== undefined && item.provider !== model.providerName) return invalid();
    if (!Array.isArray(item.choices) || item.choices.length > 1) return invalid();
    if (item.choices.length) {
      const choice = item.choices[0];
      if (!researchObject(choice) || choice.index !== 0 || !researchObject(choice.delta)) return invalid();
      const delta = choice.delta;
      if (!only(delta, ['role', 'content', 'tool_calls', 'function_call', 'reasoning', 'reasoning_content', 'reasoning_details'])
        || delta.role !== undefined && delta.role !== 'assistant' || delta.function_call != null || delta.reasoning != null && delta.reasoning !== ''
        || delta.reasoning_content != null && delta.reasoning_content !== '' || delta.reasoning_details != null && !encryptedReasoning(delta.reasoning_details)) return invalid();
      if (finish) {
        if (!researchObject(item.usage) || choice.finish_reason !== finish || delta.content != null && delta.content !== '' || delta.tool_calls != null) return invalid();
      } else {
        if (delta.content != null) {
          if (typeof delta.content !== 'string') return invalid();
          if (delta.content) firstDelta();
          content += delta.content; if (Buffer.byteLength(content, 'utf8') > 24000) return invalid();
        }
        if (delta.tool_calls != null) {
          if (!Array.isArray(delta.tool_calls) || delta.tool_calls.length > 4) return invalid();
          for (const part of delta.tool_calls) {
            if (!researchObject(part) || !only(part, ['index', 'id', 'type', 'function']) || !Number.isSafeInteger(part.index) || (part.index as number) < 0 || (part.index as number) > 3
              || part.type !== undefined && part.type !== 'function' || part.id !== undefined && !callID(part.id) || part.function !== undefined && (!researchObject(part.function) || !only(part.function, ['name', 'arguments']))) return invalid();
            const index = part.index as number, call = calls.get(index) ?? { arguments: '' };
            if (part.id !== undefined) { if (call.id !== undefined && call.id !== part.id) return invalid(); call.id = part.id as string; }
            if (researchObject(part.function)) {
              if (part.function.name !== undefined) { if (part.function.name !== toolName || call.name !== undefined && call.name !== part.function.name) return invalid(); call.name = part.function.name as string; }
              if (part.function.arguments !== undefined) { if (typeof part.function.arguments !== 'string') return invalid(); call.arguments += part.function.arguments; if (Buffer.byteLength(call.arguments, 'utf8') > 24000) return invalid(); }
            }
            calls.set(index, call); firstDelta();
          }
        }
        if (choice.finish_reason != null) { if (choice.finish_reason !== 'stop' && choice.finish_reason !== 'tool_calls') return invalid(); finish = choice.finish_reason; }
      }
    } else if (!researchObject(item.usage)) return invalid();
    if (item.usage != null) { if (!priorFinish || !researchObject(item.usage)) return invalid(); usage = item.usage; }
  };
  const line = (value: string) => {
    if (value.endsWith('\r')) value = value.slice(0, -1);
    if (value === '') { frame(); return; }
    if (done) return invalid();
    if (value.startsWith(':')) return;
    if (!value.startsWith('data:')) return invalid();
    data.push(value.slice(5).replace(/^ /, ''));
  };
  const cancel = () => { void reader.cancel().catch(() => {}); };
  signal.addEventListener('abort', cancel, { once: true });
  try {
    for (;;) {
      signal.throwIfAborted(); const part = await withSignal(reader.read(), signal); signal.throwIfAborted();
      if (part.done) break;
      bytes += part.value.byteLength; if (bytes > streamBytes) return invalid();
      buffer += decoder.decode(part.value, { stream: true }); let at: number;
      while ((at = buffer.indexOf('\n')) >= 0) { line(buffer.slice(0, at)); buffer = buffer.slice(at + 1); }
    }
    buffer += decoder.decode();
    if (buffer.trim() || data.length || !done || !finish || usage === undefined || !identity || !content.isWellFormed()) return invalid();
    const toolCalls: ResearchProviderToolCall[] = [];
    for (let index = 0; index < calls.size; index++) {
      const call = calls.get(index); if (!call || !callID(call.id) || call.name !== toolName) return invalid();
      const args = strictJson(call.arguments); if (!validInput(args)) return invalid();
      toolCalls.push({ id: call.id, name: call.name, arguments: args });
    }
    if (new Set(toolCalls.map(call => call.id)).size !== toolCalls.length || finish === 'stop' && (toolCalls.length || !content.trim()) || finish === 'tool_calls' && !toolCalls.length) return invalid();
    return { ...(content ? { content } : {}), ...(toolCalls.length ? { toolCalls } : {}), generationId: identity, usage, ...(firstDeltaMs === undefined ? {} : { firstDeltaMs }) };
  } finally { signal.removeEventListener('abort', cancel); cancel(); reader.releaseLock(); }
}

/** Host-only transport: native OpenCode chooses and executes the guarded continuation. */
export function createResearchOpenRouter(options: ResearchOpenRouterOptions) {
  const snapshot = Object.freeze({ ...options }), profile: HostedResearchProfileID = snapshot.profile ?? 'tavily-hosted', { apiKey, workspaceSha256, privacyProfileHash, nativeProfileHash, policyCurrent, dispatchCurrent } = snapshot;
  if (typeof apiKey !== 'string' || !/^[\x21-\x7e]{1,4096}$/.test(apiKey) || ![workspaceSha256, privacyProfileHash, nativeProfileHash].every(hex)
    || typeof policyCurrent !== 'function' || typeof dispatchCurrent !== 'function') throw new ResearchOpenRouterError('not_sent');
  const fetcher = snapshot.fetcher ?? fetch;
  let selected: Readonly<ReturnType<typeof researchProfileSelection>>, resolved: HostedResearchModel | null;
  try { selected = Object.freeze({ ...researchProfileSelection(profile) }); resolved = hostedResearchModel(selected.modelID); } catch { throw new ResearchOpenRouterError('not_sent'); }
  if (!resolved || selected.usageMode !== 'hosted') throw new ResearchOpenRouterError('not_sent');
  const descriptor: HostedResearchModel = resolved, reservation = descriptor.reservationNanoUsd, maxInput = descriptor.maxInput;
  const headers = Object.freeze({ Authorization: 'Bearer ' + apiKey, 'Content-Type': 'application/json', 'X-OpenRouter-Cache': 'false' });
  new Headers(headers);
  const wirePolicy = freeze({ model: descriptor.id, stream: true, stream_options: { include_usage: true }, [descriptor.outputParam]: hostedOutputTokens,
    reasoning: descriptor.reasoning === 'disabled' ? { enabled: false } : { effort: 'low', exclude: true }, include_reasoning: false, usage: { include: true }, plugins: [], tool_choice: 'auto',
    provider: { only: [descriptor.endpointTag], allow_fallbacks: false, require_parameters: true, zdr: true, data_collection: 'deny', max_price: { ...descriptor.maxPrice } } });
  const policyHash = hashResearchValue({ wireVersion: 1, descriptor: selected, nativeProfileHash, privacyProfileHash, workspaceSha256, keyHash: sha(apiKey), wirePolicy, ...(descriptor.legacy ? {} : { model: descriptor }),
    ...(descriptor.vision ? { imagePolicy: { maxBase64: researchImageMaxBase64, types: ['image/png', 'image/jpeg'], placeholder: researchImagePlaceholder } } : {}), maxInput, reservation, wireBytes: descriptor.wireMax, streamBytes, maxCalls: 4, metadataEligibilityMs: 8000 });
  const preparations = new WeakMap<PreparedResearchRequest, PreparedState>();
  const observe = (value: ResearchOpenRouterObservation) => { try { void Promise.resolve(snapshot.observe?.(Object.freeze({ ...value }))).catch(() => {}); } catch { /* Observation never changes execution authority. */ } };

  function verifyResult(value: unknown, expectedNativeRequestHash: string): value is HostedResearchResult {
    try {
      if (!hex(expectedNativeRequestHash) || !researchJSON(value, 65536) || !researchObject(value) || !only(value, ['content', 'toolCalls', 'usage', 'receipt'])
        || !researchObject(value.usage) || !exact(value.usage, ['inputTokens', 'outputTokens', 'costNanoUsd']) || !researchObject(value.receipt)) return false;
      const calls = value.toolCalls;
      if (calls !== undefined) {
        if (!Array.isArray(calls) || !calls.length || calls.length > 4 || calls.some(call => !researchObject(call) || !exact(call, ['id', 'name', 'arguments']) || !callID(call.id) || call.name !== selected.toolName || !validInput(call.arguments))
          || new Set(calls.map(call => (call as ResearchObject).id)).size !== calls.length || value.content !== undefined && (!text(value.content, 24000) || !value.content.trim())) return false;
      } else if (!text(value.content, 24000) || !value.content.trim()) return false;
      const r = value.receipt;
      if (!exact(r, ['version', 'model', 'provider', 'generationId', 'nativeRequestHash', 'wireRequestHash', 'policyHash', 'outputHash', 'usageReceipt', 'reasoningTokens', 'cachedTokens', 'timing'])
        || r.version !== 1 || r.model !== descriptor.id || r.provider !== descriptor.providerName || !generationID(r.generationId) || r.nativeRequestHash !== expectedNativeRequestHash || !hex(r.wireRequestHash)
        || r.policyHash !== policyHash || !hex(r.outputHash) || !researchObject(r.usageReceipt) || !only(r.usageReceipt, usageKeys)
        || !researchObject(r.timing) || !only(r.timing, ['metadataMs', 'providerMs', 'totalMs', 'firstDeltaMs']) || !finiteTime(r.timing.metadataMs) || !finiteTime(r.timing.providerMs) || !finiteTime(r.timing.totalMs)
        || r.timing.firstDeltaMs !== undefined && !finiteTime(r.timing.firstDeltaMs)) return false;
      const checked = validateHostedResearchUsage(descriptor, r.usageReceipt);
      const output = { ...(value.content === undefined ? {} : { content: value.content }), ...(calls === undefined ? {} : { toolCalls: calls }), usage: value.usage };
      return hashResearchValue(checked.usage) === hashResearchValue(value.usage) && r.reasoningTokens === checked.reasoningTokens && r.cachedTokens === checked.cachedTokens && r.outputHash === hashResearchValue(output);
    } catch { return false; }
  }

  async function prepare(body: unknown, signal: AbortSignal): Promise<PreparedResearchRequest> {
    const started = performance.now(), observationId = randomUUID(), controller = new AbortController(), deadline = AbortSignal.any([signal, controller.signal, AbortSignal.timeout(8000)]);
    try {
      if (!validResearchProviderBody(body, profile) || !dispatchCurrent() || deadline.aborted) throw Error();
      const reviewed = freeze(structuredClone(body)) as ResearchProviderBody;
      const urls = imageUrls(reviewed.messages);
      // At most one admitted PNG/JPEG data URI, only for vision models; the 14,000 B text bound is measured with a fixed placeholder.
      if (urls.length > 1 || urls.length && !descriptor.vision || urls.some(url => typeof url !== 'string' || url.length > researchImageMaxUrl || !decodeResearchImageDataUri(url))) throw Error();
      const tools = reviewed.tools === undefined ? {} : { tools: reviewed.tools };
      const wire = canonicalResearchJSON({ ...wirePolicy, messages: reviewed.messages, ...tools });
      const measured = urls.length ? canonicalResearchJSON({ ...wirePolicy, messages: replaceResearchImageUrls(reviewed.messages), ...tools }) : wire;
      if (Buffer.byteLength(measured, 'utf8') > descriptor.wireMax || Buffer.byteLength(wire, 'utf8') > descriptor.wireMax + researchImageMaxUrl) throw Error();
      const get = async (path: string, authenticated = false) => readMetadata(await withSignal(fetcher(api + path, { method: 'GET', redirect: 'error', cache: 'no-store', credentials: 'omit', signal: deadline,
        ...(authenticated ? { headers: { Authorization: headers.Authorization } } : {}) }), deadline), deadline);
      const [catalog, zdr, key, current] = await Promise.all([get('/models/' + descriptor.id + '/endpoints'), get('/endpoints/zdr'), get('/key', true), withSignal(policyCurrent(), deadline)]);
      if (!approvedHostedResearchEndpoint(descriptor, catalog, zdr) || !researchObject(catalog) || !researchObject(catalog.data) || !Array.isArray(catalog.data.endpoints)) throw Error();
      const endpoint = catalog.data.endpoints.find(e => researchObject(e) && e.tag === descriptor.endpointTag);
      if (!researchObject(endpoint) || !Array.isArray(endpoint.supported_parameters) || !endpoint.supported_parameters.includes('tools') || !researchObject(endpoint.supports_tool_choice) || endpoint.supports_tool_choice.auto !== true
        || !researchObject(key) || !researchObject(key.data) || !text(key.data.workspace_id, 256) || !key.data.workspace_id.trim() || sha(key.data.workspace_id) !== workspaceSha256
        || !current || !dispatchCurrent() || deadline.aborted) throw Error();
      const metadataAt = performance.now(), metadataMs = Math.round(metadataAt - started);
      const prepared = Object.freeze({ nativeRequestHash: hashResearchValue(reviewed), wireRequestHash: sha(wire), policyHash });
      preparations.set(prepared, { wire, metadataAt, metadataMs, started, observationId, used: false });
      observe({ observationId, model: descriptor.id, provider: descriptor.endpointTag, stage: 'prepared', metadataMs, totalMs: metadataMs });
      return prepared;
    } catch { observe({ observationId, model: descriptor.id, provider: descriptor.endpointTag, stage: 'not_sent', totalMs: Math.round(performance.now() - started) }); throw new ResearchOpenRouterError('not_sent'); }
    finally { controller.abort(); }
  }

  async function complete(prepared: PreparedResearchRequest, beforeSend: () => Promise<boolean>, signal: AbortSignal): Promise<HostedResearchResult> {
    const began = performance.now(), deadline = AbortSignal.any([signal, AbortSignal.timeout(45000)]);
    let granted = false, state: PreparedState | undefined, providerStarted = 0;
    try {
      state = prepared && typeof prepared === 'object' ? preparations.get(prepared) : undefined;
      if (!state || state.used) throw Error();
      state.used = true;
      if (prepared.policyHash !== policyHash || !hex(prepared.nativeRequestHash) || prepared.wireRequestHash !== sha(state.wire) || deadline.aborted || performance.now() - state.metadataAt > 8000
        || !dispatchCurrent() || !await withSignal(policyCurrent(), deadline) || !dispatchCurrent() || deadline.aborted || performance.now() - state.metadataAt > 8000) throw Error();
      new Headers(headers);
      // A lost grant acknowledgement is uncertain even when this transport has not posted yet.
      granted = true;
      const allowed = await withSignal(beforeSend(), deadline);
      if (allowed !== true) { if (allowed === false) granted = false; throw Error(); }
      if (!dispatchCurrent() || deadline.aborted || performance.now() - state.metadataAt > 8000) throw Error();
      providerStarted = performance.now();
      const response = await withSignal(fetcher(api + '/chat/completions', { method: 'POST', redirect: 'error', cache: 'no-store', credentials: 'omit', signal: deadline, headers, body: state.wire }), deadline);
      if (!response.ok || response.redirected) { void response.body?.cancel().catch(() => {}); throw Error(); }
      const streamed = await readStream(response, deadline, providerStarted, selected.toolName, descriptor), checked = validateHostedResearchUsage(descriptor, streamed.usage);
      if (!researchObject(streamed.usage)) throw Error();
      const usageReceipt = Object.fromEntries(usageKeys.filter(key => Object.hasOwn(streamed.usage as object, key)).map(key => [key, (streamed.usage as Record<string, unknown>)[key]]));
      const output = { ...(streamed.content === undefined ? {} : { content: streamed.content }), ...(streamed.toolCalls === undefined ? {} : { toolCalls: streamed.toolCalls }), usage: checked.usage };
      const timing = { metadataMs: state.metadataMs, providerMs: Math.round(performance.now() - providerStarted), totalMs: Math.round(performance.now() - state.started), ...(streamed.firstDeltaMs === undefined ? {} : { firstDeltaMs: streamed.firstDeltaMs }) };
      const result = freeze({ ...output, receipt: { version: 1 as const, model: descriptor.id, provider: descriptor.providerName, generationId: streamed.generationId, nativeRequestHash: prepared.nativeRequestHash,
        wireRequestHash: prepared.wireRequestHash, policyHash, outputHash: hashResearchValue(output), usageReceipt, reasoningTokens: checked.reasoningTokens, cachedTokens: checked.cachedTokens, timing } });
      if (!verifyResult(result, prepared.nativeRequestHash)) throw Error();
      observe({ observationId: state.observationId, model: descriptor.id, provider: descriptor.endpointTag, stage: 'validated', ...timing, ...checked.usage, reasoningTokens: checked.reasoningTokens, cachedTokens: checked.cachedTokens });
      return result;
    } catch {
      const outcome = granted ? 'unknown' : 'not_sent';
      observe({ observationId: state?.observationId ?? randomUUID(), model: descriptor.id, provider: descriptor.endpointTag, stage: outcome, ...(state ? { metadataMs: state.metadataMs } : {}),
        ...(providerStarted ? { providerMs: Math.round(performance.now() - providerStarted) } : {}), totalMs: Math.round(performance.now() - began) });
      throw new ResearchOpenRouterError(outcome);
    }
  }
  return Object.freeze({ prepare, complete, verifyResult });
}
