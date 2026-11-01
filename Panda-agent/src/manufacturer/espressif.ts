import { createHash } from 'node:crypto';
import { resolve4 } from 'node:dns/promises';
import { request as httpsRequest } from 'node:https';
import { isIP } from 'node:net';
import { Parser } from 'htmlparser2';

export type ManufacturerDescriptor = { chip: 'ESP8266' | 'ESP32' | 'ESP32-C3' | 'ESP32-C6' | 'ESP32-S3'; title: string; sourceUrl: string };
type ResponseData = { status: number; headers: Record<string, string | undefined>; body: Uint8Array };
export type ManufacturerTransport = { resolve(hostname: string): Promise<string[]>; request(url: string, address: string): Promise<ResponseData> };
const catalog: ManufacturerDescriptor[] = [
  { chip: 'ESP8266', title: 'Espressif ESP8266 RTOS SDK: Get Started', sourceUrl: 'https://docs.espressif.com/projects/esp8266-rtos-sdk/en/latest/get-started/index.html' },
  ...(['ESP32', 'ESP32-C3', 'ESP32-C6', 'ESP32-S3'] as const).map(chip => ({ chip, title: `Espressif ${chip} ESP-IDF: Get Started`, sourceUrl: `https://docs.espressif.com/projects/esp-idf/en/stable/${chip.toLowerCase().replace('-', '')}/get-started/index.html` })),
];
const limit = 1048576;
const fail = () => new Error('Manufacturer source unavailable.');
const sha = (data: string | Uint8Array) => createHash('sha256').update(data).digest('hex');
export function findManufacturerSource(question: string): ManufacturerDescriptor | null {
  if (typeof question !== 'string' || question.length > 2000 || !/\bespressif\b|\bofficial\s+(?:manufacturer|espressif)\b/i.test(question)) return null;
  const chips = [...question.matchAll(/\bESP(?:8266(?:EX)?|32(?:[- ]?[A-Z]\d+)?)\b/gi)].map(m => m[0].toUpperCase().replace(/\s/g, '-').replace(/^ESP32([A-Z])/, 'ESP32-$1').replace('ESP8266EX', 'ESP8266'));
  const unique = [...new Set(chips)];
  if (unique.length !== 1) return null;
  const found = catalog.find(item => item.chip === unique[0]);
  return found ? { ...found } : null;
}
export function isPublicIPv4(ip: string): boolean {
  if (isIP(ip) !== 4) return false;
  const [a,b,c] = ip.split('.').map(Number);
  return !(a === 0 || a === 10 || a === 127 || a >= 224 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && (b === 168 || b === 0 || (b === 88 && c === 99) || (b === 31 && c === 196) || (b === 52 && c === 193) || (b === 175 && c === 48))) || (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) || (a === 203 && b === 0 && c === 113));
}
const transport: ManufacturerTransport = {
  resolve: host => resolve4(host),
  request: (url, address) => new Promise((resolve, reject) => {
    const req = httpsRequest(url, { method: 'GET', agent: false, family: 4, servername: 'docs.espressif.com', headers: { Accept: 'text/html', 'Accept-Encoding': 'identity' }, lookup: (_host, _options, callback) => callback(null, address, 4) }, res => {
      const chunks: Buffer[] = []; let size = 0;
      res.on('data', (chunk: Buffer) => { size += chunk.length; if (size > limit) { req.destroy(fail()); return; } chunks.push(chunk); });
      res.on('error', reject);
      res.on('end', () => resolve({ status: res.statusCode ?? 0, headers: { 'content-type': res.headers['content-type'], location: res.headers.location, 'content-encoding': res.headers['content-encoding'] }, body: Buffer.concat(chunks) }));
    });
    const deadline = setTimeout(() => req.destroy(fail()), 10000);
    req.setTimeout(8000, () => req.destroy(fail())); req.on('close', () => clearTimeout(deadline)); req.on('error', reject); req.end();
  }),
};
async function bounded<T>(p: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try { return await Promise.race([p, new Promise<never>((_, reject) => { timer = setTimeout(() => reject(fail()), 10000); })]); }
  finally { if (timer) clearTimeout(timer); }
}
function extract(html: string, question: string): string[] {
  let mainDepth = 0, depth = 0, skipDepth = 0, captureDepth = 0, text = '';
  const blocks: string[] = [];
  const blocked = new Set(['script', 'style', 'template', 'form', 'nav', 'footer', 'header', 'iframe', 'svg', 'noscript']);
  const block = new Set(['p', 'li', 'h1', 'h2', 'h3', 'h4']);
  const flush = () => { const value = text.replace(/\s+/g, ' ').trim(); if (value && value.length <= 3000) blocks.push(value); text = ''; };
  const parser = new Parser({
    onopentag(name, attributes) {
      depth++;
      if (!mainDepth && (name === 'main' || attributes.role === 'main')) mainDepth = depth;
      if (!mainDepth) return;
      if (!skipDepth && (blocked.has(name) || attributes.hidden !== undefined || attributes['aria-hidden'] === 'true')) skipDepth = depth;
      if (!skipDepth && !captureDepth && block.has(name)) { captureDepth = depth; text = ''; }
    },
    ontext(value) { if (mainDepth && !skipDepth && captureDepth) text += value; },
    onclosetag() {
      if (captureDepth === depth) { flush(); captureDepth = 0; }
      if (skipDepth === depth) skipDepth = 0;
      if (mainDepth === depth) mainDepth = 0;
      depth--;
    },
  }, { decodeEntities: true });
  parser.end(html);
  const normalize = (value: string) => value.toLowerCase().replace(/wi[\s-]?fi/g, 'wifi');
  const terms = [...new Set((normalize(question).match(/[a-z0-9]{3,}/g) ?? []).filter(t => !/^esp(?:32|8266)/.test(t) && !['what', 'does', 'about', 'espressif', 'official', 'manufacturer', 'please', 'tell'].includes(t)))];
  return blocks.map((value, index) => ({ value, index, score: terms.reduce((n, term) => n + (normalize(value).includes(term) ? 1 : 0), 0) })).sort((a,b) => b.score - a.score || a.index - b.index).slice(0, 8).sort((a,b) => a.index - b.index).map(x => x.value);
}
export async function fetchManufacturerSource(descriptor: ManufacturerDescriptor, injectedTransport: ManufacturerTransport = transport, question = '') {
  const source = catalog.find(item => item.chip === descriptor?.chip && item.title === descriptor.title && item.sourceUrl === descriptor.sourceUrl);
  if (!source || typeof question !== 'string' || question.length > 2000) throw fail();
  let url = source.sourceUrl;
  for (let redirects = 0; redirects <= 2; redirects++) {
    const parsed = new URL(url);
    if (parsed.href !== source.sourceUrl || parsed.protocol !== 'https:' || parsed.hostname !== 'docs.espressif.com' || parsed.port || parsed.username || parsed.password || parsed.search || parsed.hash) throw fail();
    const addresses = await bounded(injectedTransport.resolve(parsed.hostname));
    if (!Array.isArray(addresses) || !addresses.length || addresses.length > 32 || !addresses.every(isPublicIPv4)) throw fail();
    const response = await bounded(injectedTransport.request(url, addresses[0]));
    if (!response || !(response.body instanceof Uint8Array) || response.body.byteLength > limit) throw fail();
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      if (redirects === 2 || !response.headers.location) throw fail();
      url = new URL(response.headers.location, url).href; continue;
    }
    if (response.status !== 200 || !/^text\/html(?:\s*;|$)/i.test(response.headers['content-type'] ?? '') || (response.headers['content-encoding'] && response.headers['content-encoding'] !== 'identity')) throw fail();
    const body = Buffer.from(response.body);
    const html = new TextDecoder('utf-8', { fatal: true }).decode(body);
    const texts = extract(html, question);
    if (!texts.length || texts.reduce((n, value) => n + value.length, 0) > 20000) throw fail();
    const contentHash = sha(body), urlHash = sha(url);
    return { title: source.title, sourceUrl: url, capturedAt: new Date().toISOString(), contentHash, fragments: texts.map(text => ({ handle: `espressif:${urlHash}:${contentHash}:${sha(text)}`, text })) };
  }
  throw fail();
}
