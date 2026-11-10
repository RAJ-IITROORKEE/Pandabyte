import 'server-only';
import { BasicRagProviderError } from './basic-rag-openrouter.ts';
import { approvedLunaEndpoint, lunaRagMaxOutputTokens, lunaRagModel, lunaRagProvider, readLunaJSON, validateLunaEnvelope } from './luna-rag-openrouter.ts';

const api = 'https://openrouter.ai/api/v1';
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);

/** One instance per reserved native call; the gateway owns durable reservation and attribution. */
export function createLunaNativeCompletion(options: {
  apiKey: string; fetcher?: typeof fetch;
  policyCurrent(): Promise<boolean>;
  dispatchCurrent(): boolean;
}) {
  let used = false;
  const fetcher = options.fetcher ?? fetch;
  return async (input: unknown[], beforeSend: () => Promise<boolean>, signal: AbortSignal) => {
    if (used) throw new BasicRagProviderError('not_admitted');
    used = true;
    let sent = false;
    const deadline = AbortSignal.any([signal, AbortSignal.timeout(45_000)]);
    try {
      if (!options.apiKey || /[\r\n]/.test(options.apiKey) || !Array.isArray(input) || !input.length
        || input.some(m => !object(m) || !['system', 'user', 'assistant'].includes(m.role as string)
          || Object.keys(m).some(k => !['role', 'content'].includes(k)) || !(typeof m.content === 'string' && m.content.isWellFormed()
            || Array.isArray(m.content) && m.content.every((p: unknown) => object(p) && Object.keys(p).sort().join(',') === 'text,type'
              && p.type === 'text' && typeof p.text === 'string' && p.text.isWellFormed())))) throw new BasicRagProviderError('not_admitted');
      const serialized = JSON.stringify({ messages: input, tools: [] });
      if (Buffer.byteLength(serialized, 'utf8') > 10000 || deadline.aborted || !options.dispatchCurrent()
        || !await options.policyCurrent() || deadline.aborted) throw new BasicRagProviderError('not_admitted');
      const messages = JSON.parse(serialized).messages as unknown[];
      const get = async (path: string) => {
        const response = await fetcher(api + path, { method: 'GET', redirect: 'error', cache: 'no-store', credentials: 'omit', signal: deadline });
        if (!response.ok || response.redirected) { void response.body?.cancel().catch(() => {}); throw Error(); }
        return readLunaJSON(response, 4_000_000);
      };
      const [catalog, policy] = await Promise.all([get('/models/' + lunaRagModel + '/endpoints'), get('/endpoints/zdr')]);
      if (!approvedLunaEndpoint(catalog, policy) || deadline.aborted || !await options.policyCurrent()
        || deadline.aborted || !await beforeSend() || deadline.aborted || !options.dispatchCurrent() || deadline.aborted)
        throw new BasicRagProviderError('not_admitted');
      sent = true;
      const response = await fetcher(api + '/chat/completions', {
        method: 'POST', redirect: 'error', credentials: 'omit', cache: 'no-store', signal: deadline,
        headers: { Authorization: 'Bearer ' + options.apiKey, 'Content-Type': 'application/json', 'X-OpenRouter-Cache': 'false' },
        body: JSON.stringify({ model: lunaRagModel, stream: false, max_completion_tokens: lunaRagMaxOutputTokens,
          reasoning: { enabled: false }, include_reasoning: false, tool_choice: 'none', usage: { include: true }, plugins: [],
          provider: { only: [lunaRagProvider], allow_fallbacks: false, require_parameters: true, zdr: true, data_collection: 'deny', max_price: { prompt: 0.11, completion: 0.55, request: 0, image: 0 } }, messages }),
      });
      if (!response.ok || response.redirected) {
        void response.body?.cancel().catch(() => {});
        throw new BasicRagProviderError(response.status === 429 ? 'rate_limited' : 'outcome_unknown', response.status);
      }
      const value = await readLunaJSON(response, 64000);
      if (object(value) && Object.hasOwn(value, 'error')) {
        if (Object.keys(value).length === 1 && object(value.error) && value.error.code === 429) throw new BasicRagProviderError('rate_limited', response.status);
        throw new BasicRagProviderError('outcome_unknown', response.status);
      }
      if (deadline.aborted) throw Error();
      return validateLunaEnvelope(value);
    } catch (error) {
      if (error instanceof BasicRagProviderError) throw error;
      throw new BasicRagProviderError(sent ? 'outcome_unknown' : 'unavailable');
    }
  };
}
