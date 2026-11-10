type FreshReadOptions = {
  getToken: (options: { skipCache: true }) => Promise<string | null>;
  readJson: (response: Response) => Promise<unknown>;
  signal: AbortSignal;
  isCurrent: () => boolean;
  fetcher?: typeof fetch;
};
const uuid = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const chatRead = new RegExp(`^/api/panda-agent/chats/${uuid}\\?requestId=${uuid}$`);

/** One bounded authenticated read; this never retries a message or changes a session. */
export async function readWithFreshSession(path: string, options: FreshReadOptions): Promise<unknown | null> {
  if (path !== '/api/panda-agent/capabilities' && !chatRead.test(path)) return null;
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
