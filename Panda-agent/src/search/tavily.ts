import { createHash, randomUUID } from 'node:crypto';
import { lookup } from 'node:dns/promises';
import { mkdir, open, readFile, rename, rm } from 'node:fs/promises';
import { BlockList, isIP } from 'node:net';
import path from 'node:path';

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
async function validUrl(value: string, resolve: (host: string) => Promise<Address[]>): Promise<string | null> {
  if (value.length > 500) return null;
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    if (url.protocol !== 'https:' || url.username || url.password || url.port || url.hash || url.search || isIP(host) || !/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(host) || /(?:^|\.)(?:localhost|local|internal|test|example|invalid)$/.test(host)) return null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const addresses = await Promise.race([
      resolve(host),
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('DNS timeout')), 3000); }),
    ]).finally(() => clearTimeout(timer));
    if (!addresses.length || !addresses.every(publicAddress)) return null;
    return url.href.length <= 500 ? url.href : null;
  } catch { return null; }
}
export async function searchPublicWeb(query: string, options: Options): Promise<WebSource[]> {
  if (process.env.NODE_ENV === 'production' || options.enabled !== true || options.freeOnly !== true) throw new Error('Web search disabled');
  if (typeof query !== 'string' || !safeQuery(query.trim())) throw new Error('Invalid public search query');
  if (typeof options.apiKey !== 'string' || !options.apiKey.trim() || /[\r\n]/.test(options.apiKey)) throw new Error('Web search unavailable');
  await reserve(options.ledgerDir ?? path.resolve(process.cwd(), 'Panda-agent/artifacts/tavily-local'));
  const signal = AbortSignal.timeout(20_000);
  let response: Response;
  try {
    response = await (options.fetchImpl ?? fetch)('https://api.tavily.com/search', {
      method: 'POST', redirect: 'error', signal,
      headers: { Authorization: `Bearer ${options.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: query.trim(), search_depth: 'basic', max_results: 3, include_answer: false, include_raw_content: false, include_images: false, auto_parameters: false }),
    });
    if (!response.ok || !response.body || !/^application\/json(?:\s*;|\s*$)/i.test(response.headers.get('content-type') ?? '') || Number(response.headers.get('content-length') ?? 0) > 1024 * 1024) {
      await response.body?.cancel();
      throw new Error();
    }
    const reader = response.body.getReader(); const chunks: Uint8Array[] = []; let size = 0;
    try { while (true) { const { done, value } = await reader.read(); if (done) break; size += value.byteLength; if (size > 1024 * 1024) { await reader.cancel(); throw new Error(); } chunks.push(value); } } finally { reader.releaseLock(); }
    const data: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks)));
    if (typeof data !== 'object' || data === null || !('results' in data) || !Array.isArray(data.results) || data.results.length > 3) throw new Error();
    const capturedAt = (options.now ?? (() => new Date()))().toISOString();
    const resolve = options.lookupImpl ?? ((host: string) => lookup(host, { all: true, verbatim: true }));
    const sources: WebSource[] = []; const seenUrls = new Set<string>(); const seenHandles = new Set<string>(); let total = 0;
    for (const item of data.results as unknown[]) {
      if (typeof item !== 'object' || item === null || !('url' in item) || !('title' in item) || !('content' in item) || typeof item.url !== 'string' || typeof item.title !== 'string' || typeof item.content !== 'string' || !item.title.trim() || !item.content.trim() || item.title.length > 300 || item.content.length > 6000) throw new Error();
      total += item.content.length; if (total > 16000) throw new Error();
      const url = await validUrl(item.url, resolve); if (!url) continue;
      const handle = `web:${hash(url)}:${hash(item.content)}:${hash(item.content)}`;
      if (seenUrls.has(url) || seenHandles.has(handle)) continue;
      seenUrls.add(url); seenHandles.add(handle);
      sources.push({ handle, url, title: item.title, content: item.content, capturedAt });
    }
    return sources;
  } catch { throw new Error('Web search failed'); }
}
