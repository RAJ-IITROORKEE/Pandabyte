import 'server-only';
import { createHash } from 'node:crypto';
import { controlRoomAdminAccess } from './clerk';

export const toolFixtureOrigin = 'http://localhost:3001';

function configuration(subject: string) {
  const { NODE_ENV, VERCEL, PANDA_PLAYGROUND_FIXTURE_PORT: port,
    PANDA_PLAYGROUND_FIXTURE_TOKEN: token, PANDA_PLAYGROUND_FIXTURE_OWNER: owner,
    PANDA_PLAYGROUND_FIXTURE_EXPIRES: expires } = process.env;
  const expiry = Number(expires);
  const now = Date.now();
  if (NODE_ENV !== 'development' || VERCEL || !port || !/^[1-9]\d{0,4}$/.test(port)
    || Number(port) < 1024 || Number(port) > 65535 || !token || !/^[a-f0-9]{64}$/.test(token)
    || !Number.isSafeInteger(expiry) || expiry <= now || expiry - now > 30 * 60_000
    || owner !== createHash('sha256').update(subject).digest('hex')) return null;
  return { port, token };
}

export function playgroundToolFixtureVisible(subject: string, host: string | null): boolean {
  return host === new URL(toolFixtureOrigin).host && configuration(subject) !== null;
}

export async function playgroundToolFixturePOST(request: Request): Promise<Response> {
  const json = (status: number, value: object) => Response.json(value, {
    status, headers: { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' },
  });
  const url = new URL(request.url);
  if (url.origin !== toolFixtureOrigin || request.headers.get('origin') !== toolFixtureOrigin)
    return json(403, { error: 'origin' });
  const mode = url.search === '?case=allow' ? 'allow' : url.search === '?case=deny' ? 'deny' : null;
  // Next.js exposes a stream on POST even when the HTTP request has no body.
  if (!mode || request.headers.has('transfer-encoding') || (request.headers.get('content-length') ?? '0') !== '0')
    return json(400, { error: 'invalid_case' });
  const access = await controlRoomAdminAccess();
  if (!access.allowed) return json(access.status, { error: 'access' });
  const config = configuration(access.subject);
  if (!config) return json(404, { error: 'unavailable' });
  try {
    const response = await fetch(`http://127.0.0.1:${config.port}/${mode}`, {
      method: 'POST', headers: { Authorization: `Bearer ${config.token}` },
      redirect: 'error', cache: 'no-store', credentials: 'omit', signal: AbortSignal.timeout(125_000),
    });
    if (!response.ok) {
      await response.body?.cancel();
      return response.status === 409 ? json(409, { error: 'already_started' }) : json(503, { error: 'unverified' });
    }
    const length = response.headers.get('content-length');
    if (!length || !/^\d{1,3}$/.test(length) || response.headers.has('content-encoding')) {
      await response.body?.cancel();
      return json(503, { error: 'unverified' });
    }
    const value = await response.json();
    const allowed = mode === 'allow';
    const toolStatus = allowed ? 'completed' : 'error';
    const toolCalls = allowed ? 1 : 0;
    if (value?.toolStatus !== toolStatus || value?.toolCalls !== toolCalls)
      return json(503, { error: 'unverified' });
    const current = await controlRoomAdminAccess();
    if (!current.allowed || current.subject !== access.subject || current.sessionId !== access.sessionId || !configuration(current.subject))
      return json(403, { error: 'access' });
    return json(200, { toolStatus, toolCalls });
  } catch {
    return json(503, { error: 'unverified' });
  }
}
