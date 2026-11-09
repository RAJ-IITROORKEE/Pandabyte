import { parseMemoryChange, parseMemoryState, type MemoryChange } from '../guide/project-memory.ts';
import type { ChatActor } from './chat-contracts.ts';
import { uuid } from './chat-contracts.ts';
import { ChatStoreError } from './chat-store.ts';
import { strictJson } from '../lightweight/client.ts';

type Dependencies = {
  enabled(): boolean;
  authenticate(): Promise<ChatActor | null>;
  current(actor: ChatActor): Promise<boolean>;
  store(actor: ChatActor): {
    read(thread: string): Promise<unknown>;
    change(thread: string, input: MemoryChange): Promise<unknown>;
  };
};
const json = (status: number, value: unknown) => Response.json(value, {
  status, headers: { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' },
});
const codes = { unauthenticated: 401, not_found: 404, conflict: 409, invalid: 400, quota: 429, unavailable: 503 };

async function readChange(request: Request) {
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get('content-type') ?? '') || !request.body) throw new ChatStoreError('invalid');
  const reader = request.body.getReader(), chunks: Uint8Array[] = [];
  let bytes = 0;
  const timeout = AbortSignal.any([request.signal, AbortSignal.timeout(10_000)]);
  const cancel = () => { void reader.cancel().catch(() => {}); };
  timeout.addEventListener('abort', cancel, { once: true });
  try {
    for (;;) {
      timeout.throwIfAborted();
      const part = await reader.read();
      timeout.throwIfAborted();
      if (part.done) break;
      bytes += part.value.byteLength;
      if (bytes > 8192) throw new ChatStoreError('invalid');
      chunks.push(part.value);
    }
    let value: unknown;
    try { value = strictJson(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks))); }
    catch { throw new ChatStoreError('invalid'); }
    const parsed = parseMemoryChange(value);
    if (!parsed) throw new ChatStoreError('invalid');
    return parsed;
  } finally {
    timeout.removeEventListener('abort', cancel);
    void reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

export function createProjectMemoryHandler(deps: Dependencies) {
  return async (request: Request, thread: string): Promise<Response> => {
    try {
      if (!['GET', 'PATCH'].includes(request.method)) return json(405, { error: 'method_not_allowed' });
      const actor = await deps.authenticate();
      if (!actor?.subject || !actor.sessionId) throw new ChatStoreError('unauthenticated');
      if (!deps.enabled()) throw new ChatStoreError('unavailable');
      const url = new URL(request.url);
      if (!uuid(thread) || url.search) throw new ChatStoreError('invalid');
      if (request.method === 'PATCH' && request.headers.get('origin') !== url.origin) return json(403, { error: 'forbidden' });
      const change = request.method === 'PATCH' ? await readChange(request) : null;
      if (request.signal.aborted || !await deps.current(actor)) throw new ChatStoreError('unauthenticated');
      const store = deps.store(actor);
      const value = parseMemoryState(change ? await store.change(thread, change) : await store.read(thread));
      if (!value) throw new ChatStoreError('unavailable');
      if (request.signal.aborted || !await deps.current(actor)) throw new ChatStoreError('unauthenticated');
      return json(200, value);
    } catch (error) {
      const code = error instanceof ChatStoreError ? error.code : 'unavailable';
      return json(codes[code], { error: code });
    }
  };
}
