type FreshReadOptions = {
  getToken: (options: { skipCache: true }) => Promise<string | null>;
  readJson: (response: Response) => Promise<unknown>;
  signal: AbortSignal;
  isCurrent: () => boolean;
  fetcher?: typeof fetch;
};
const uuid = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const chatRead = new RegExp(`^/api/panda-agent/chats/${uuid}(?:\\?requestId=${uuid})?$`);
const sessionReadAllowed = (path: string) => path === '/api/panda-agent/capabilities' || chatRead.test(path);

/** Bound fetch and body parsing together, even when an operation ignores abort. */
export async function boundedOperation<T>(operation: (signal: AbortSignal) => Promise<T>, cleanupSignal: AbortSignal, timeoutMs = 8000): Promise<T> {
  const deadline = new AbortController();
  const timer = setTimeout(() => deadline.abort(), timeoutMs);
  const signal = AbortSignal.any([cleanupSignal, deadline.signal]);
  let onAbort: (() => void) | undefined;
  const aborted = new Promise<never>((_, reject) => {
    onAbort = () => reject(new Error('Operation timed out or superseded'));
    signal.addEventListener('abort', onAbort, { once: true });
  });
  try {
    if (signal.aborted) throw new Error('Operation superseded');
    return await Promise.race([operation(signal), aborted]);
  } finally {
    clearTimeout(timer);
    if (onAbort) signal.removeEventListener('abort', onAbort);
    deadline.abort();
  }
}

/** An ordinary GET may refresh its JWT once on 401; mutations never enter here. */
export async function readSessionJson(path: string, options: FreshReadOptions): Promise<unknown> {
  if (!sessionReadAllowed(path)) throw new Error('Unsupported read');
  return boundedOperation(async signal => {
    if (!options.isCurrent()) throw new Error('Read superseded');
    const response = await (options.fetcher ?? fetch)(path, { method: 'GET', cache: 'no-store', redirect: 'error', signal });
    if (response.status === 401) return readWithFreshSession(path, { ...options, signal });
    if (!response.ok || response.redirected) throw new Error('Read unavailable');
    const data = await options.readJson(response);
    if (!options.isCurrent()) throw new Error('Read superseded');
    return data;
  }, options.signal);
}

/** One bounded authenticated read; this never retries a message or changes a session. */
export async function readWithFreshSession(path: string, options: FreshReadOptions): Promise<unknown | null> {
  if (!sessionReadAllowed(path)) return null;
  const deadline = new AbortController();
  const timer = setTimeout(() => deadline.abort(), 5000);
  const signal = AbortSignal.any([options.signal, deadline.signal]);
  let onAbort: (() => void) | undefined;
  const aborted = new Promise<never>((_, reject) => {
    onAbort = () => reject(new Error('Read superseded'));
    signal.addEventListener('abort', onAbort, { once: true });
  });
  const current = () => !signal.aborted && options.isCurrent();
  try {
    if (!current()) return null;
    const token = await Promise.race([options.getToken({ skipCache: true }), aborted]);
    if (!current() || !token || token.length > 16384 || token.trim() !== token || /[\r\n]/.test(token)) return null;
    const response = await Promise.race([(options.fetcher ?? fetch)(path, {
      method: 'GET', headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
      credentials: 'omit', cache: 'no-store', redirect: 'error', signal,
    }), aborted]);
    if (!current() || !response.ok || response.redirected || !response.headers.get('content-type')?.toLowerCase().startsWith('application/json')) return null;
    const data = await Promise.race([options.readJson(response), aborted]);
    return current() ? data : null;
  } catch { return null; }
  finally {
    clearTimeout(timer);
    if (onAbort) signal.removeEventListener('abort', onAbort);
    deadline.abort();
  }
}

type SavedAnswer = { thread: { id: string; status: string }; messages: unknown[] };
export async function reconcileSavedAnswer<T extends SavedAnswer>(threadId: string, requestId: string, options: FreshReadOptions): Promise<T | null> {
  const data = await readWithFreshSession(`/api/panda-agent/chats/${encodeURIComponent(threadId)}?requestId=${encodeURIComponent(requestId)}`, options);
  if (!data || typeof data !== 'object' || !('attemptStatus' in data) || data.attemptStatus !== 'complete' || !('thread' in data) || !('messages' in data)) return null;
  const { thread, messages } = data;
  if (!thread || typeof thread !== 'object' || !('id' in thread) || thread.id !== threadId || !('status' in thread) || thread.status !== 'idle' || !Array.isArray(messages)) return null;
  if (!messages.every(message => message && typeof message === 'object' && typeof message.id === 'string' && (message.role === 'user' || message.role === 'assistant') && typeof message.text === 'string' && typeof message.createdAt === 'string' && Array.isArray(message.citations)) || !messages.some(message => message.role === 'assistant' && message.text.trim())) return null;
  // attemptStatus is the server's proof for this exact queried request, not a message UUID.
  return data as T;
}
