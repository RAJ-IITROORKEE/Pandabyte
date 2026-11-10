import 'server-only';
import { createHash } from 'node:crypto';
import { strictJson } from '../lightweight/client.ts';
import { BasicRagProviderError } from './basic-rag-openrouter.ts';
import { approvedLunaEndpoint, lunaChatSystemPrompt, lunaRagModel, lunaRagProvider, lunaRagReportedModel, readLunaJSON } from './luna-rag-openrouter.ts';

const api = 'https://openrouter.ai/api/v1';
// Fixed labels only: never log provider payloads or request identifiers.
export function directDiagnostic(stage: string, status?: number) {
  if (process.env.PANDA_AGENT_DIRECT_DIAGNOSTICS === 'true') console.info('[direct-chat]', stage, ...(status === undefined ? [] : [status]));
}
const maxInput = 8024, maxOutput = 700, reservation = 1492312;
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const zero = (v: unknown, keys: string[]) => v === undefined || object(v) && Object.entries(v).every(([key, n]) => keys.includes(key) && n === 0);

function boundedPrice(value: unknown, nano: number): boolean {
  if (typeof value !== 'string' || value.length > 40 || !/^(?:0|0\.\d+)$/.test(value)) return false;
  const [whole, fraction = ''] = value.split('.');
  return BigInt(whole + fraction) * BigInt(1000000000) <= BigInt(nano) * BigInt(10) ** BigInt(fraction.length);
}

export function approvedDirectLunaEndpoint(catalog: unknown, zdr: unknown): boolean {
  if (!approvedLunaEndpoint(catalog, zdr) || !object(catalog) || !object(catalog.data) || !Array.isArray(catalog.data.endpoints)) return false;
  const endpoint = catalog.data.endpoints.find(e => object(e) && e.tag === lunaRagProvider);
  if (!object(endpoint) || !object(endpoint.pricing)) return false;
  return ['input_cache_read', 'input_cache_write'].every(k => endpoint.pricing && object(endpoint.pricing) && boundedPrice(endpoint.pricing[k], 138));
}

function costNano(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > reservation / 1e9) return null;
  const [decimal, exponent = '0'] = String(value).toLowerCase().split('e'), [whole, fraction = ''] = decimal.split('.');
  const digits = BigInt(whole + fraction), power = Number(exponent) - fraction.length + 9;
  const result = power >= 0 ? digits * BigInt(10) ** BigInt(power) : (digits + BigInt(10) ** BigInt(-power) - BigInt(1)) / BigInt(10) ** BigInt(-power);
  return result <= BigInt(reservation) ? Number(result) : null;
}

export function validateDirectLunaResponse(value: unknown) {
  if (!object(value) || Object.hasOwn(value, 'error') || ![lunaRagModel, lunaRagReportedModel].includes(value.model as string)
    || value.provider !== 'Azure' || !Array.isArray(value.choices) || value.choices.length !== 1 || !object(value.choices[0])
    || value.choices[0].finish_reason !== 'stop' || !object(value.choices[0].message) || !object(value.usage)) throw new BasicRagProviderError('outcome_unknown');
  const message = value.choices[0].message, usage = value.usage, cost = costNano(usage.cost);
  if (typeof message.content !== 'string' || message.content.length > 10000 || message.tool_calls != null || message.function_call != null
    || message.reasoning || (message.reasoning_content != null && message.reasoning_content !== '')
    || (message.reasoning_details != null && (!Array.isArray(message.reasoning_details) || message.reasoning_details.length !== 0))
    || !Number.isSafeInteger(usage.prompt_tokens) || (usage.prompt_tokens as number) < 0 || (usage.prompt_tokens as number) > maxInput
    || !Number.isSafeInteger(usage.completion_tokens) || (usage.completion_tokens as number) < 0 || (usage.completion_tokens as number) > maxOutput
    || !zero(usage.completion_tokens_details, ['reasoning_tokens','image_tokens','audio_tokens','accepted_prediction_tokens','rejected_prediction_tokens']) || cost === null)
    throw new BasicRagProviderError('outcome_unknown');
  if (usage.prompt_tokens_details !== undefined) {
    if (!object(usage.prompt_tokens_details)) throw new BasicRagProviderError('outcome_unknown');
    let cached = 0;
    for (const [key, n] of Object.entries(usage.prompt_tokens_details)) {
      if (!['cached_tokens','cache_write_tokens','audio_tokens','video_tokens'].includes(key) || !Number.isSafeInteger(n) || (n as number) < 0) throw new BasicRagProviderError('outcome_unknown');
      if (key === 'cached_tokens' || key === 'cache_write_tokens') cached += n as number;
      else if (n !== 0) throw new BasicRagProviderError('outcome_unknown');
    }
    if (cached > (usage.prompt_tokens as number)) throw new BasicRagProviderError('outcome_unknown');
  }
  let parsed: unknown;
  try { parsed = strictJson(message.content); } catch { throw new BasicRagProviderError('outcome_unknown'); }
  if (!object(parsed) || Object.keys(parsed).join(',') !== 'answer' || typeof parsed.answer !== 'string' || !parsed.answer.trim()
    || !parsed.answer.isWellFormed() || parsed.answer.length > 8000 || /\[S\d+\]/i.test(parsed.answer)) throw new BasicRagProviderError('outcome_unknown');
  return { answer: parsed.answer, usage: { inputTokens: usage.prompt_tokens as number, outputTokens: usage.completion_tokens as number, costNanoUsd: cost } };
}

/** One admitted text-only request. The caller durably claims and reserves before POST. */
export function createDirectLunaCompletion(options: { apiKey: string; policyCurrent(): Promise<boolean>; dispatchCurrent(): boolean; claim(fingerprint: string): Promise<boolean>; fetcher?: typeof fetch }) {
  const fetcher = options.fetcher ?? fetch; let used = false;
  return async (input: { question: string }, beforeSend: () => Promise<boolean>, signal: AbortSignal) => {
    if (used) throw new BasicRagProviderError('not_admitted');
    used = true; let sent = false;
    const deadline = AbortSignal.any([signal, AbortSignal.timeout(45000)]);
    try {
      if (!options.apiKey || /[\r\n]/.test(options.apiKey) || !object(input) || Object.keys(input).join(',') !== 'question'
        || typeof input.question !== 'string' || !input.question.trim() || !input.question.isWellFormed() || input.question.length > 2000 || deadline.aborted)
        throw new BasicRagProviderError('not_admitted');
      const messages = [{ role:'system', content:lunaChatSystemPrompt }, { role:'user', content:input.question }];
      const wire = JSON.stringify({ model:lunaRagModel, stream:false, max_completion_tokens:maxOutput, reasoning:{enabled:false}, include_reasoning:false,
        tool_choice:'none', response_format:{type:'json_object'}, usage:{include:true}, plugins:[],
        provider:{only:[lunaRagProvider],allow_fallbacks:false,require_parameters:true,zdr:true,data_collection:'deny',max_price:{prompt:0.11,completion:0.55,request:0,image:0}}, messages });
      if (Buffer.byteLength(wire, 'utf8') > 7000 || !options.dispatchCurrent()) throw new BasicRagProviderError('not_admitted');
      const get = async (path: string) => {
        const response = await fetcher(api + path, { method:'GET', redirect:'error', cache:'no-store', credentials:'omit', signal:deadline });
        if (!response.ok || response.redirected) throw Error();
        return readLunaJSON(response, 4000000);
      };
      directDiagnostic('metadata-start');
      const [catalog, zdr] = await Promise.all([get('/models/' + lunaRagModel + '/endpoints'), get('/endpoints/zdr')]);
      directDiagnostic('metadata-received');
      if (!approvedDirectLunaEndpoint(catalog, zdr) || deadline.aborted || !await options.policyCurrent() || !options.dispatchCurrent()) throw new BasicRagProviderError('not_admitted');
      directDiagnostic('claim-start');
      if (!await options.claim(createHash('sha256').update(wire).digest('hex'))) throw new BasicRagProviderError('not_admitted');
      directDiagnostic('claim-recorded');
      if (deadline.aborted || !await options.policyCurrent() || !await beforeSend() || !options.dispatchCurrent() || deadline.aborted) throw new BasicRagProviderError('not_admitted');
      directDiagnostic('claim-and-send-gates-passed');
      sent = true;
      const response = await fetcher(api + '/chat/completions', { method:'POST', redirect:'error', cache:'no-store', credentials:'omit', signal:deadline,
        headers:{ Authorization:'Bearer ' + options.apiKey, 'Content-Type':'application/json', 'X-OpenRouter-Cache':'false' },
        body:wire });
      directDiagnostic('provider-http', response.status);
      if (!response.ok || response.redirected) { void response.body?.cancel().catch(()=>{}); throw new BasicRagProviderError(response.status === 429 ? 'rate_limited' : 'outcome_unknown'); }
      const result = await readLunaJSON(response, 64000);
      directDiagnostic('provider-json-read');
      if (deadline.aborted) throw Error();
      const validated = validateDirectLunaResponse(result);
      directDiagnostic('provider-response-validated');
      return validated;
    } catch (error) {
      directDiagnostic(deadline.aborted ? 'provider-aborted' : sent ? 'provider-outcome-unknown' : 'provider-not-sent');
      if (error instanceof BasicRagProviderError) throw error;
      throw new BasicRagProviderError(sent ? 'outcome_unknown' : 'unavailable');
    }
  };
}
