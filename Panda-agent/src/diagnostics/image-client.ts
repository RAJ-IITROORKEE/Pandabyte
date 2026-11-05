import { createHash, createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { strictJson } from '../lightweight/client.ts';

type Args = { subject: string; sessionId: string; threadId: string; assetId: string; sha256: string; width: number; height: number; bytes: number; expiresAt: number; signal?: AbortSignal; body?: Uint8Array };
type State = { version: 1; state: 'ready'; assetId: string; expiresAt: number; width: number; height: number; bytes: number; sha256: string } | { version: 1; state: 'pending' | 'missing' | 'expired' | 'deleted' } | { version: 1; state: 'rejected'; code: 'invalid' | 'replayed' | 'conflict' | 'quota' | 'busy' | 'unavailable' };
const hash = (value: string | Uint8Array) => createHash('sha256').update(value).digest('hex');
const uuid = (value: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value);
const exact = (value: Record<string, unknown>, keys: string[]) => Object.keys(value).sort().join(',') === keys.sort().join(',');

export function createImageClient({ baseUrl, secret }: { baseUrl: string; secret: Uint8Array | string }) {
  const url = new URL(baseUrl);
  if ((url.protocol !== 'https:' && !(url.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname))) || url.username || url.password || url.search || url.hash || (url.pathname !== '/' && url.pathname !== '')) throw new Error('invalid endpoint');
  if (Buffer.byteLength(secret) < 32) throw new Error('invalid secret');
  async function invoke(action: 'upload' | 'status' | 'read' | 'delete', args: Args): Promise<State | { version: 1; state: 'ready'; bytes: Uint8Array }> {
    if (!args.subject || !args.sessionId || !uuid(args.threadId) || !uuid(args.assetId) || !/^[0-9a-f]{64}$/.test(args.sha256) || !Number.isSafeInteger(args.width) || !Number.isSafeInteger(args.height) || args.width < 1 || args.height < 1 || args.width > 2048 || args.height > 2048 || args.width * args.height > 4194304 || !Number.isSafeInteger(args.bytes) || args.bytes < 1 || args.bytes > 2097152 || !Number.isSafeInteger(args.expiresAt)) throw new Error('invalid input');
    const body = action === 'upload' ? args.body : Buffer.from(JSON.stringify({ version: 1, threadId: args.threadId, assetId: args.assetId }));
    if (!body || (action === 'upload' && (body.byteLength !== args.bytes || hash(body) !== args.sha256))) throw new Error('invalid body');
    const nonce = randomUUID();
    const claims = { v: 1, aud: 'panda-image-v1', action: `${action}image`, sub: hash(args.subject), sid: hash(args.sessionId), threadId: args.threadId, assetId: args.assetId, bodySha256: hash(body), imageSha256: args.sha256, mediaType: 'image/png', width: args.width, height: args.height, bytes: args.bytes, expiresAt: args.expiresAt, exp: Math.floor(Date.now() / 1000) + 60, nonce };
    const segment = Buffer.from(JSON.stringify(claims)).toString('base64url');
    const signature = createHmac('sha256', secret).update(segment).digest('base64url');
    const controller = new AbortController();
    const abort = () => controller.abort();
    if (args.signal?.aborted) controller.abort(); else args.signal?.addEventListener('abort', abort, { once: true });
    const timer = setTimeout(abort, 5000);
    try {
      const response = await fetch(`${url.origin}/v1/images/${action}`, { method: 'POST', headers: { Authorization: `Bearer ${segment}.${signature}`, 'Content-Type': action === 'upload' ? 'image/png' : 'application/json' }, body: Buffer.from(body), cache: 'no-store', signal: controller.signal, redirect: 'error' });
      const type = response.headers.get('content-type');
      if (type !== 'application/json' && type !== 'image/png') throw new Error('invalid response');
      if (!response.body) throw new Error('invalid response');
      const reader = response.body.getReader(), chunks: Uint8Array[] = []; let size = 0;
      try { while (true) { const part = await reader.read(); if (part.done) break; size += part.value.byteLength; if (size > (type === 'image/png' ? 2097152 : 16384)) throw new Error('response too large'); chunks.push(part.value); } }
      finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
      const raw = Buffer.concat(chunks), expected = createHmac('sha256', secret).update(`panda-image-response-v1\n${nonce}\n${response.status}\n${hash(raw)}\n${type}`).digest();
      const receipt = response.headers.get('x-panda-image-receipt') ?? '';
      if (!/^[0-9a-f]{64}$/.test(receipt) || !timingSafeEqual(expected, Buffer.from(receipt, 'hex'))) throw new Error('invalid receipt');
      if (type === 'image/png') {
        if (action !== 'read' || response.status !== 200 || raw.length !== args.bytes || hash(raw) !== args.sha256 || hash(raw) !== claims.imageSha256) throw new Error('invalid image');
        return { version: 1, state: 'ready', bytes: new Uint8Array(raw) };
      }
      const value = strictJson(new TextDecoder('utf-8', { fatal: true }).decode(raw)) as Record<string, unknown>;
      if (!value || typeof value !== 'object' || Array.isArray(value) || value.version !== 1) throw new Error('invalid response');
      if (value.state === 'ready' && response.status === 200 && (action === 'upload' || action === 'status') && exact(value, ['version','state','assetId','expiresAt','width','height','bytes','sha256']) && value.assetId === args.assetId && value.expiresAt === args.expiresAt && value.width === args.width && value.height === args.height && value.bytes === args.bytes && value.sha256 === args.sha256) return value as State;
      if (exact(value, ['version','state']) && (((action === 'status' || action === 'read') && value.state === 'pending' && response.status === 202) || ((action === 'status' || action === 'read') && ['missing','expired','deleted'].includes(value.state as string) && response.status === 410) || (value.state === 'deleted' && response.status === 200 && action === 'delete'))) return value as State;
      if (exact(value, ['version','state','code']) && value.state === 'rejected' && ({ invalid: 400, replayed: 409, conflict: 409, quota: 429, busy: 503, unavailable: 503 } as Record<string, number>)[value.code as string] === response.status) return value as State;
      throw new Error('invalid response');
    } finally { clearTimeout(timer); args.signal?.removeEventListener('abort', abort); }
  }
  return { upload: (args: Args) => invoke('upload', args), status: (args: Args) => invoke('status', args), read: (args: Args) => invoke('read', args), delete: (args: Args) => invoke('delete', args) };
}
