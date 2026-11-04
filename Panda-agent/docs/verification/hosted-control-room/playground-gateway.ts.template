import 'server-only';
import { uuid } from '../server/chat-contracts.ts';
import { parseProductPlaygroundIntent } from './playground-intent.ts';

// Unmounted protocol candidate; never mount until a matching receiver and admission ledger are reviewed.
type SignedRequest = Readonly<{ url: string; method: 'POST'; headers: Record<string, string>; body: string }>;
type Config = { enabled: boolean; endpoint: string; serviceToken: string; signer: (request: SignedRequest) => Promise<Record<string, string>>; fetcher?: typeof fetch };
type Turn = { profile?: 'product-playground-v1'; question: string; productSku?: string; userToken: string; requestId: string; contextDigest: string; signal?: AbortSignal };
export class PlaygroundGatewayError extends Error {
  readonly code: 'not_admitted' | 'quota' | 'outcome_unknown';
  constructor(code: 'not_admitted' | 'quota' | 'outcome_unknown') { super(code); this.code = code; }
}
const unknown = () => new PlaygroundGatewayError('outcome_unknown');
const exact = (value: object, keys: string[]) => Object.keys(value).sort().join(',') === keys.sort().join(',');
const bounded = (value: unknown, limit: number): value is string => typeof value === 'string' && value.isWellFormed() && !!value.trim() && value === value.trim() && value.length <= limit;

function withAbort<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) { reject(unknown()); return; }
    const aborted = () => { signal.removeEventListener('abort', aborted); reject(unknown()); };
    signal.addEventListener('abort', aborted, { once: true });
    promise.then(value => { signal.removeEventListener('abort', aborted); resolve(value); }, error => { signal.removeEventListener('abort', aborted); reject(error); });
  });
}

export function createPlaygroundGatewayClient(config?: Config) {
  return async (turn: Turn): Promise<string> => {
    if ((turn?.profile !== undefined && turn.profile !== 'product-playground-v1') || (turn?.profile === 'product-playground-v1' && !parseProductPlaygroundIntent({requestId:turn.requestId,question:turn.question,productSku:turn.productSku})) || !config || config.enabled !== true || !/^[a-f0-9]{64}$/.test(config.serviceToken) || typeof config.signer !== 'function' || !/^[A-Za-z0-9._~-]{16,8192}$/.test(turn?.userToken ?? '') || !uuid(turn?.requestId) || !/^[a-f0-9]{64}$/.test(turn?.contextDigest ?? '') || !bounded(turn?.question, 2000) || (turn.productSku !== undefined && !bounded(turn.productSku, 128)) || turn.signal?.aborted) throw unknown();
    let endpoint: URL;
    try { endpoint = new URL(config.endpoint); } catch { throw unknown(); }
    if (endpoint.protocol !== 'https:' || !/^[a-z0-9]{10}\.execute-api\.ap-south-1\.amazonaws\.com$/.test(endpoint.hostname) || endpoint.pathname !== '/agent/v1/turns' || endpoint.port || endpoint.username || endpoint.password || endpoint.search || endpoint.hash) throw unknown();
    const signal = turn.signal ? AbortSignal.any([turn.signal, AbortSignal.timeout(135000)]) : AbortSignal.timeout(135000);
    try {
      const body = JSON.stringify({ version: 3, mode: 'playground', ...(turn.profile === 'product-playground-v1' ? { profile:turn.profile } : {}), requestId: turn.requestId, question: turn.question, ...(turn.productSku === undefined ? {} : { productSku: turn.productSku }), contextDigest: turn.contextDigest });
      if (Buffer.byteLength(body) > 16384) throw unknown();
      const headers = { 'Content-Type': 'application/json', Accept: 'application/json', 'X-Panda-User-Token': turn.userToken, 'X-Panda-Service-Token': config.serviceToken };
      const signed = await withAbort(config.signer({ url: endpoint.href, method: 'POST', headers: { ...headers }, body }), signal);
      const normalized = Object.fromEntries(Object.entries(signed).map(([key, value]) => [key.toLowerCase(), value]));
      if (!/^AWS4-HMAC-SHA256 /.test(normalized.authorization ?? '') || normalized.host !== endpoint.hostname || normalized['x-panda-service-token'] !== config.serviceToken || normalized['x-panda-user-token'] !== turn.userToken || normalized['content-type'] !== 'application/json' || normalized.accept !== 'application/json' || Object.keys(normalized).length !== Object.keys(signed).length) throw unknown();
      const response = await withAbort((config.fetcher ?? fetch)(endpoint, { method: 'POST', headers: signed, body, redirect: 'error', cache: 'no-store', signal }), signal);
      if (!response.ok || !response.body || !/^application\/json(?:\s*;|$)/i.test(response.headers.get('content-type') ?? '')) { void response.body?.cancel().catch(() => {}); throw unknown(); }
      const reader = response.body.getReader(), chunks: Uint8Array[] = []; let size = 0;
      try {
        for (;;) { const part = await withAbort(reader.read(), signal); if (part.done) break; size += part.value.byteLength; if (size > 32768) throw unknown(); chunks.push(part.value); }
      } catch (error) { void reader.cancel().catch(() => {}); throw error; } finally { reader.releaseLock(); }
      signal.throwIfAborted();
      const value: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks)));
      if (!value || typeof value !== 'object' || Array.isArray(value)) throw unknown();
      const result = value as Record<string, unknown>;
      if (exact(result, ['version', 'requestId', 'status']) && result.version === 3 && result.requestId === turn.requestId && result.status === 'not_admitted') throw new PlaygroundGatewayError('not_admitted');
      if (exact(result, ['version', 'requestId', 'status']) && result.version === 3 && result.requestId === turn.requestId && result.status === 'quota') throw new PlaygroundGatewayError('quota');
      if (!exact(result, ['version', 'requestId', 'status', 'contextDigest', 'rawModel']) || result.version !== 3 || result.requestId !== turn.requestId || result.status !== 'complete' || result.contextDigest !== turn.contextDigest || typeof result.rawModel !== 'string' || !result.rawModel.isWellFormed() || result.rawModel.length > 10000) throw unknown();
      return result.rawModel;
    } catch (error) { if (error instanceof PlaygroundGatewayError && (error.code === 'not_admitted' || error.code === 'quota')) throw error; throw unknown(); }
  };
}
