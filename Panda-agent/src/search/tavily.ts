import { createHash, randomUUID } from 'node:crypto';
import { lookup } from 'node:dns/promises';
import { mkdir, open, readFile, rename, rm } from 'node:fs/promises';
import { BlockList, isIP } from 'node:net';
import path from 'node:path';
import { publicSearchCitationUrl } from './citation-url.ts';

type Address = { address: string; family: number };
type Options = {
  apiKey: string;
  enabled: boolean;
  freeOnly: boolean;
  fetchImpl?: typeof fetch;
  lookupImpl?: (host: string) => Promise<Address[]>;
  ledgerDir?: string;
  now?: () => Date;
};
export type WebSource = { handle: string; url: string; title: string; content: string; capturedAt: string };
export type HostedTavilyOptions = Pick<Options, 'apiKey' | 'fetchImpl' | 'lookupImpl' | 'now'> & {
  beforeSend: () => Promise<boolean>;
  signal?: AbortSignal;
};
export type TavilySearchReceipt = {
  version: 1; provider: 'tavily' | 'pandabyte_site'; operation: 'search'; requestHash: string; requestId: string | null;
  startedAt: string; completedAt: string; durationMs: number;
  usage: { credits: number | null; costNanoUsd: null }; sources: WebSource[];
};
export class TavilySearchError extends Error {
  readonly stage: 'not_sent' | 'unknown';
  readonly code: 'invalid_query' | 'unavailable' | 'denied' | 'search_failed';
  constructor(stage: TavilySearchError['stage'], code: TavilySearchError['code']) {
    super(code); this.name = 'TavilySearchError'; this.stage = stage; this.code = code;
  }
}
const blocked = new BlockList();
for (const [network, prefix] of [['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.0.2.0', 24], ['192.88.99.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15], ['198.51.100.0', 24], ['203.0.113.0', 24], ['224.0.0.0', 4], ['240.0.0.0', 4]] as const) blocked.addSubnet(network, prefix, 'ipv4');
// Only ordinary global unicast IPv6 is admitted; exclude special-use allocations.
for (const [network, prefix] of [['2001::', 23], ['2001:db8::', 32], ['2002::', 16], ['3fff::', 20]] as const) blocked.addSubnet(network, prefix, 'ipv6');
const global6 = new BlockList(); global6.addSubnet('2000::', 3, 'ipv6');
function publicAddress({ address, family }: Address): boolean {
  if (family === 4 && isIP(address) === 4) return !blocked.check(address, 'ipv4');
  if (family === 6 && isIP(address) === 6) return global6.check(address, 'ipv6') && !blocked.check(address, 'ipv6');
  return false;
}
function hash(value: string): string { return createHash('sha256').update(value).digest('hex'); }
function safeQuery(query: string): boolean {
  return query.length > 0 && query.length <= 400 && !/[\r\n\x00-\x1f]/.test(query) &&
    !/(?:https?:\/\/|www\.|\b(?:localhost|private|internal)\b|[\w.+-]+@[\w.-]+\.[a-z]{2,}|\b(?:tvly|sk|pk|api)[-_][a-z0-9_-]{8,}|\b(?:token|password|secret|api[_ -]?key)\s*[:=]|\b\d{10,}\b)/i.test(query);
}
async function reserve(dir: string): Promise<void> {
  await mkdir(dir, { recursive: true });
  const lock = path.join(dir, 'lock');
  try { await mkdir(lock); } catch { throw new Error('Search quota ledger unavailable'); }
  try {
    const ledger = path.join(dir, 'quota.json');
    let count = 0;
    try {
      const parsed: unknown = JSON.parse(await readFile(ledger, 'utf8'));
      if (typeof parsed !== 'object' || parsed === null || !('count' in parsed) || !Number.isInteger(parsed.count) || (parsed.count as number) < 0 || (parsed.count as number) > 10) throw new Error();
      count = parsed.count as number;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw new Error('Search quota ledger unavailable');
    }
    if (count >= 10) throw new Error('Search quota exhausted');
    const temp = path.join(dir, `quota-${randomUUID()}.tmp`);
    const file = await open(temp, 'wx', 0o600);
    try { await file.writeFile(JSON.stringify({ count: count + 1 })); await file.sync(); } finally { await file.close(); }
    await rename(temp, ledger);
  } finally { await rm(lock, { recursive: true, force: true }); }
}
async function abortable<T>(pending: Promise<T>, signal: AbortSignal): Promise<T> {
  let abort: () => void = () => undefined;
  try {
    return await new Promise<T>((resolve, reject) => {
      pending.then(resolve, reject);
      abort = () => reject(signal.reason);
      if (signal.aborted) abort(); else signal.addEventListener('abort', abort, { once: true });
    });
  } finally { signal.removeEventListener('abort', abort); }
}
async function validUrl(value: string, resolve: (host: string) => Promise<Address[]>, signal?: AbortSignal): Promise<string | null> {
  if (value.length > 500) return null;
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    if (url.protocol !== 'https:' || url.username || url.password || url.port || url.hash || url.search || isIP(host) || !/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(host) || /(?:^|\.)(?:localhost|local|internal|test|example|invalid)$/.test(host)) return null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const pending = Promise.race([
      resolve(host),
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('DNS timeout')), 3000); }),
    ]);
    const addresses = await (signal ? abortable(pending, signal) : pending).finally(() => clearTimeout(timer));
    signal?.throwIfAborted();
    if (!addresses.length || !addresses.every(publicAddress)) return null;
    return url.href.length <= 500 ? url.href : null;
  } catch { return null; }
}
function providerBody(query: string, hosted: boolean) {
  return { query: query.trim(), search_depth: 'basic', max_results: 3, include_answer: false, include_raw_content: false, include_images: false, auto_parameters: false, ...(hosted ? { include_usage: true } : {}) };
}
function hostedQuery(query: string): void {
  if (typeof query !== 'string' || !query.isWellFormed() || /[\p{Cc}\p{Cf}]/u.test(query) || !safeQuery(query.trim())) throw new TavilySearchError('not_sent', 'invalid_query');
}
export function hostedTavilyRequestHash(query: string): string {
  hostedQuery(query);
  const body = providerBody(query, true);
  return hash(JSON.stringify(Object.fromEntries(Object.entries(body).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0))));
}
async function requestTavily(query: string, options: Pick<Options, 'apiKey' | 'fetchImpl' | 'lookupImpl' | 'now'>,
  signal: AbortSignal, hosted = false, authorize?: () => Promise<void>) {
    const body = JSON.stringify(providerBody(query, hosted));
    if (hosted) { signal.throwIfAborted(); await authorize!(); signal.throwIfAborted(); }
    const pending = (options.fetchImpl ?? fetch)('https://api.tavily.com/search', {
      method: 'POST', redirect: 'error', signal,
      ...(hosted ? { credentials: 'omit' as const, cache: 'no-store' as const } : {}),
      headers: { Authorization: `Bearer ${options.apiKey}`, 'Content-Type': 'application/json' },
      body,
    });
    const response = await (hosted ? abortable(pending, signal) : pending);
    if (!response.ok || hosted && response.redirected || !response.body || !/^application\/json(?:\s*;|\s*$)/i.test(response.headers.get('content-type') ?? '') || Number(response.headers.get('content-length') ?? 0) > 1024 * 1024) {
      if (hosted) void response.body?.cancel().catch(() => undefined); else await response.body?.cancel();
      throw new Error();
    }
    const reader = response.body.getReader(); const chunks: Uint8Array[] = []; let size = 0;
    try {
      while (true) {
        const pending = reader.read();
        const { done, value } = await (hosted ? abortable(pending, signal) : pending);
        if (done) break; size += value.byteLength;
        if (size > 1024 * 1024) {
          if (hosted) void reader.cancel().catch(() => undefined); else await reader.cancel();
          throw new Error();
        } chunks.push(value);
      }
    } catch (error) {
      if (hosted) void reader.cancel().catch(() => undefined);
      throw error;
    } finally { reader.releaseLock(); }
    if (hosted) signal.throwIfAborted();
    const data: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks)));
    if (hosted) signal.throwIfAborted();
    if (typeof data !== 'object' || data === null || !('results' in data) || !Array.isArray(data.results) || data.results.length > 3) throw new Error();
    let requestId: string | null = null, credits: number | null = null;
    if (hosted) {
      if ('request_id' in data) {
        if (typeof data.request_id !== 'string' || !data.request_id.trim() || !/^[\x20-\x7e]{1,200}$/.test(data.request_id)) throw new Error();
        requestId = data.request_id;
      }
      if ('usage' in data) {
        if (typeof data.usage !== 'object' || data.usage === null || Array.isArray(data.usage) || !('credits' in data.usage)
          || typeof data.usage.credits !== 'number' || !Number.isFinite(data.usage.credits) || data.usage.credits < 0 || data.usage.credits > 100) throw new Error();
        credits = data.usage.credits;
      }
    }
    const capturedAt = (options.now ?? (() => new Date()))().toISOString();
    const resolve = options.lookupImpl ?? ((host: string) => lookup(host, { all: true, verbatim: true }));
    const sources: WebSource[] = []; const seenUrls = new Set<string>(); const seenHandles = new Set<string>(); let total = 0;
    for (const item of data.results as unknown[]) {
      if (typeof item !== 'object' || item === null || !('url' in item) || !('title' in item) || !('content' in item) || typeof item.url !== 'string' || typeof item.title !== 'string' || typeof item.content !== 'string' || !item.title.trim() || !item.content.trim() || item.title.length > 300 || item.content.length > 6000) throw new Error();
      if (hosted && (!item.url.isWellFormed() || !item.title.isWellFormed() || !item.content.isWellFormed())) throw new Error();
      total += item.content.length; if (total > 16000) throw new Error();
      if (hosted) { signal.throwIfAborted(); if (!publicSearchCitationUrl(item.url)) continue; }
      const url = await validUrl(item.url, resolve, hosted ? signal : undefined);
      if (hosted) signal.throwIfAborted();
      if (!url || hosted && !publicSearchCitationUrl(url)) continue;
      const handle = `web:${hash(url)}:${hash(item.content)}:${hash(item.content)}`;
      if (seenUrls.has(url) || seenHandles.has(handle)) continue;
      seenUrls.add(url); seenHandles.add(handle);
      sources.push({ handle, url, title: item.title, content: item.content, capturedAt });
    }
    return { sources, requestId, credits };
}
export async function searchPublicWeb(query: string, options: Options): Promise<WebSource[]> {
  if (process.env.NODE_ENV === 'production' || options.enabled !== true || options.freeOnly !== true) throw new Error('Web search disabled');
  if (typeof query !== 'string' || !safeQuery(query.trim())) throw new Error('Invalid public search query');
  if (typeof options.apiKey !== 'string' || !options.apiKey.trim() || /[\r\n]/.test(options.apiKey)) throw new Error('Web search unavailable');
  await reserve(options.ledgerDir ?? path.resolve(process.cwd(), 'Panda-agent/artifacts/tavily-local'));
  try { return (await requestTavily(query, options, AbortSignal.timeout(20_000))).sources; }
  catch { throw new Error('Web search failed'); }
}
export async function searchHostedPublicWeb(query: string, options: HostedTavilyOptions): Promise<TavilySearchReceipt> {
  const requestHash = hostedTavilyRequestHash(query);
  if (!options || typeof options.beforeSend !== 'function' || typeof options.apiKey !== 'string' || !options.apiKey.trim() || /[\r\n]/.test(options.apiKey)) throw new TavilySearchError('not_sent', 'unavailable');
  let sent = false;
  try {
    // Validate header construction before a durable send grant can be consumed.
    new Headers({ Authorization: `Bearer ${options.apiKey}` });
    const signal = options.signal ? AbortSignal.any([options.signal, AbortSignal.timeout(20_000)]) : AbortSignal.timeout(20_000);
    signal.throwIfAborted();
    const now = options.now ?? (() => new Date());
    const startedAt = now().toISOString(), start = performance.now();
    const result = await requestTavily(query, options, signal, true, async () => {
      let allowed: boolean;
      try { allowed = await options.beforeSend(); }
      catch { throw new TavilySearchError('not_sent', 'denied'); }
      if (allowed !== true) throw new TavilySearchError('not_sent', 'denied');
      sent = true;
    });
    signal.throwIfAborted();
    return { version: 1, provider: 'tavily', operation: 'search', requestHash, requestId: result.requestId,
      startedAt, completedAt: now().toISOString(), durationMs: performance.now() - start,
      usage: { credits: result.credits, costNanoUsd: null }, sources: result.sources };
  } catch (error) {
    if (sent) throw new TavilySearchError('unknown', 'search_failed');
    if (error instanceof TavilySearchError) throw error;
    throw new TavilySearchError('not_sent', 'unavailable');
  }
}
