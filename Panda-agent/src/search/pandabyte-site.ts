// PandaByte site search for the research agent (text-first slice of the PixelRAG idea: retrieve the live page,
// not a stale copy). A PandaByte query reads the live product or category pages on www.pandabyte.in and returns them
// as citable sources in the same signed receipt shape as Tavily, so citation binding is unchanged.
// Discovery uses the site's own sitemaps; only https://www.pandabyte.in pages are fetched, with size and time caps.
// shortcut: plain-HTML text extraction (Wix pages are server-rendered); add PixelRAG-style rendering only if pages
// stop carrying their text in HTML.
import { createHash } from 'node:crypto';
import { hostedTavilyRequestHash, TavilySearchError, type TavilySearchReceipt, type WebSource } from './tavily.ts';

const host = 'www.pandabyte.in', pageMax = 3 * 1024 * 1024, contentMax = 6000, totalMax = 16000;
const hash = (text: string) => createHash('sha256').update(text).digest('hex');
type Fetch = (url: string, init: { redirect: 'error'; signal: AbortSignal; headers: Record<string, string> }) => Promise<Response>;
export type SiteOptions = { beforeSend(): Promise<boolean>; signal?: AbortSignal; fetchImpl?: Fetch; now?: () => Date };

// Category pages on the live store (store-categories-sitemap.xml) and the query words that select them.
const categories: [path: string, words: RegExp][] = [
  ['category/microcontroller', /\b(?:boards?|dev(?:elopment)?|microcontrollers?|mcus?|esp32\w*|esp8266)\b/],
  ['category/sensors', /\bsensors?\b/], ['category/shields', /\b(?:shields?|hats?|expansion)\b/],
  ['category/iot-kits', /\bkits?\b/], ['category/accessories', /\b(?:accessor\w*|cables?|headers?|jumpers?|holders?)\b/],
  ['category/all-products', /\b(?:products?|catalog(?:ue)?|everything|range|lineup)\b/],
];
/** Product codes from PandaByte titles/slugs (xS3, x8266, xC3m, xLoRa, xPM, Maker UNO, PandaPulse). */
const productCode = /\b(?:x(?:s3|c3m?|c5|c6|32|8266|lora|pm)|maker\s*uno|pandapulse)\b/i;

/** Whether a research query is about PandaByte's own catalog (the host then reads pandabyte.in instead of the web). */
export const isPandabyteQuery = (query: string) => /\bpanda\s*byte\b/i.test(query) || productCode.test(query);

const tokens = (text: string) => text.toLowerCase().replace(/esp32-/g, 'esp32').split(/[^a-z0-9]+/).filter(t => t.length >= 2);
const generic = new Set(['pandabyte', 'panda', 'byte', 'board', 'boards', 'development', 'dev', 'microcontroller', 'arduino', 'compatible', 'the', 'and',
  'for', 'with', 'esp32', 'sensor', 'module', 'grove', 'kit', 'specs', 'specification', 'datasheet', 'pinout', 'docs', 'documentation', 'official',
  'guide', 'manual', 'reference', 'tutorial', 'example', 'examples']);

/** Up to two product pages whose slug carries a distinctive query word; otherwise one matching category page. */
export function selectPandabytePages(query: string, productUrls: readonly string[]): string[] {
  const words = new Set(tokens(query));
  const scored = productUrls.map(url => {
    const slug = new Set(tokens(new URL(url).pathname.replace('/product-page/', '')));
    const hits = [...words].filter(w => slug.has(w));
    return { url, code: hits.some(w => /^x[a-z0-9]{2,}$/.test(w)), distinct: hits.filter(w => !generic.has(w)).length, all: hits.length };
  }).filter(s => s.distinct > 0).sort((a, b) => b.distinct - a.distinct || b.all - a.all || a.url.localeCompare(b.url));
  // A named product code (xS3, xC3) wins over a shared chip word (esp32c3 is in both xC3 and xC3m).
  const coded = scored.filter(s => s.code);
  if (scored.length) return (coded.length ? coded : scored).slice(0, 2).map(s => s.url);
  const q = query.toLowerCase(), category = categories.find(([, re]) => re.test(q));
  return [`https://${host}/${category ? category[0] : 'category/all-products'}`];
}

const entities: Record<string, string> = { '&nbsp;': ' ', '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#x27;': "'", '&#39;': "'" };
// Soft hyphen, zero-width and bidi/line-separator characters, built from code points so the source stays ASCII.
const invisible = new RegExp('[' + String.fromCharCode(0xad) + String.fromCharCode(0x200b)+'-'+String.fromCharCode(0x200f) + String.fromCharCode(0x2028)+'-'+String.fromCharCode(0x202e) + String.fromCharCode(0x2060)+'-'+String.fromCharCode(0x206f) + String.fromCharCode(0xfeff) + ']', 'g');
/** Visible page text between the site header ("Log In") and footer ("Need Help?"), whitespace-collapsed. */
export function pandabytePageText(html: string): { title: string; content: string } | null {
  const title = (/<title>([^<]{1,300})<\/title>/i.exec(html)?.[1] ?? '').replace(/&[#a-z0-9]+;/gi, m => entities[m] ?? ' ').replace(/\s*\|\s*PandaByte\.in\s*$/, '').trim();
  let text = html.replace(/<(script|style|noscript|svg)[\s\S]*?<\/\1>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&[#a-z0-9]+;/gi, m => entities[m] ?? ' ')
    .replace(invisible, '').replace(/\s+/g, ' ');
  const start = text.indexOf(' Log In '), end = text.indexOf(' Need Help? ');
  if (start < 0 || end <= start) return null;
  text = text.slice(start + 8, end).replace(/^Home All Products /, '').replace(/^Browse by [\s\S]*?Sort by: Recommended /, '').trim();
  if (!title || text.length < 40 || /couldn['’]t be found/i.test(text)) return null;
  // Category listings run "Name Price ₹X Name Price ₹Y …" together, which a model can misalign. One line per product
  // ("Name: ₹X.") keeps each price on its own name, and each passage boundary falls between products.
  text = text.replace(/ (?:Regular )?Price (₹[\d,]+\.\d\d)(?: Sale Price (₹[\d,]+\.\d\d))?/g, (_m, price: string, sale?: string) => sale ? `: regular ${price}, sale ${sale}.\n` : `: ${price}.\n`)
    .replace(/\n\s*\d{1,3}$/, '\n').replace(/\n /g, '\n').trim();
  // Cut at the cap on a word boundary so a quote never ends mid-word.
  const content = text.length > contentMax ? text.slice(0, contentMax).replace(/\s\S*$/, '') : text;
  return { title, content: content.trim() };
}

async function readCapped(response: Response, signal: AbortSignal): Promise<string> {
  if (!response.ok || response.redirected || !response.body || !/^(?:text\/html|application\/xml|text\/xml)(?:\s*;|$)/i.test(response.headers.get('content-type') ?? '')) {
    void response.body?.cancel().catch(() => undefined); throw Error('site_unavailable');
  }
  const reader = response.body.getReader(), parts: Uint8Array[] = []; let size = 0;
  try {
    for (;;) {
      signal.throwIfAborted(); const { done, value } = await reader.read(); if (done) break; size += value.byteLength;
      if (size > pageMax) { void reader.cancel().catch(() => undefined); throw Error('site_too_large'); }
      parts.push(value);
    }
  } finally { reader.releaseLock(); }
  return new TextDecoder('utf-8').decode(Buffer.concat(parts));
}

let sitemap: { at: number; urls: string[] } | null = null;
/** Searches pandabyte.in for a research query; same receipt shape as Tavily (provider `pandabyte_site`). */
export async function searchPandabyteSite(query: string, options: SiteOptions): Promise<TavilySearchReceipt> {
  const requestHash = hostedTavilyRequestHash(query); // the same query validation and binding as web search
  if (!isPandabyteQuery(query)) throw new TavilySearchError('not_sent', 'invalid_query');
  const now = options.now ?? (() => new Date()), doFetch: Fetch = options.fetchImpl ?? ((url, init) => fetch(url, { ...init, cache: 'no-store' }));
  let allowed: boolean;
  try { allowed = await options.beforeSend(); } catch { throw new TavilySearchError('not_sent', 'denied'); }
  if (allowed !== true) throw new TavilySearchError('not_sent', 'denied');
  const signal = options.signal ? AbortSignal.any([options.signal, AbortSignal.timeout(20_000)]) : AbortSignal.timeout(20_000);
  const startedAt = now().toISOString(), start = performance.now();
  const get = async (url: string) => {
    const u = new URL(url); if (u.protocol !== 'https:' || u.hostname !== host || u.search || u.hash) throw Error('site_url');
    return readCapped(await doFetch(u.href, { redirect: 'error', signal, headers: { accept: 'text/html,application/xml', 'user-agent': 'PandaByteResearch/1.0 (+https://www.pandabyte.in)' } }), signal);
  };
  try {
    if (!sitemap || Date.now() - sitemap.at > 600_000) {
      const xml = await get(`https://${host}/store-products-sitemap.xml`);
      const urls = [...xml.matchAll(/<loc>(https:\/\/www\.pandabyte\.in\/product-page\/[a-z0-9-]{1,200})<\/loc>/g)].map(m => m[1]).slice(0, 200);
      if (!urls.length) throw Error('site_sitemap');
      sitemap = { at: Date.now(), urls };
    }
    const sources: WebSource[] = []; let total = 0;
    for (const url of selectPandabytePages(query, sitemap.urls)) {
      const page = pandabytePageText(await get(url)); if (!page) continue;
      if (total + page.content.length > totalMax) break;
      total += page.content.length;
      sources.push({ handle: `web:${hash(url)}:${hash(page.content)}:${hash(page.content)}`, url, title: page.title, content: page.content, capturedAt: now().toISOString() });
    }
    signal.throwIfAborted();
    return { version: 1, provider: 'pandabyte_site', operation: 'search', requestHash, requestId: null, startedAt, completedAt: now().toISOString(),
      durationMs: performance.now() - start, usage: { credits: null, costNanoUsd: null }, sources };
  } catch { throw new TavilySearchError('unknown', 'search_failed'); } // a fetch was authorized; its outcome is not retried
}

/** Test seam: forget the cached sitemap. */
export const resetPandabyteSitemap = () => { sitemap = null; };
