// PandaByte site search for the research agent. A named product is answered from the published catalog's stored listing
// passages (when the host has the catalog configured); category queries and any catalog failure read the live product
// or category pages on www.pandabyte.in. Both return citable sources in the same signed receipt shape as Tavily, so
// citation binding is unchanged. Prices are removed from both.
// Discovery uses the site's own sitemaps; only https://www.pandabyte.in pages are fetched, with size and time caps.
// shortcut: plain-HTML text extraction (Wix pages are server-rendered); add PixelRAG-style rendering only if pages
// stop carrying their text in HTML.
import { createHash } from 'node:crypto';
import { hostedTavilyRequestHash, TavilySearchError, type TavilySearchReceipt, type WebSource } from './tavily.ts';

const host = 'www.pandabyte.in', pageMax = 3 * 1024 * 1024, contentMax = 6000, totalMax = 16000, catalogTotalMax = 12000;
const hash = (text: string) => createHash('sha256').update(text).digest('hex');
type Fetch = (url: string, init: { redirect: 'error'; signal: AbortSignal; headers: Record<string, string>; method?: 'POST'; body?: string }) => Promise<Response>;
export type CatalogProduct = { sku: string; title: string; sourceUrl: string };
export type CatalogPassages = { title: string; text: string };
/** Read-only reader of the published catalog (panda_agent_public_* RPCs, public key). */
export type CatalogReader = { products(signal: AbortSignal): Promise<CatalogProduct[]>; passages(sku: string, signal: AbortSignal): Promise<CatalogPassages | null> };
export type SiteOptions = { beforeSend(): Promise<boolean>; signal?: AbortSignal; fetchImpl?: Fetch; now?: () => Date; catalog?: CatalogReader };

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
/** Removes rupee amounts ("₹1,299.00", "₹ 250/-", "Rs. 499", "250 INR", "MRP 499", "Price 250"); case-sensitive so "RS485" stays. */
export const stripPrices = (text: string) => text
  .replace(/\b(?:(?:Regular |Sale )?Price|MRP)[ \t]*:?[ \t]*(?:₹|Rs\.?|INR)?[ \t]*\d[\d,]*(?:\.\d+)?(?:\/-)?/g, '')
  .replace(/(?:₹|\bRs\.?(?=[ \t]?\d)|\bINR(?=[ \t]?\d))[ \t]?\d[\d,]*(?:\.\d+)?(?:\/-)?/g, '').replace(/\b\d[\d,]*(?:\.\d+)?\s?INR\b/g, '').replace(/[ \t]{2,}/g, ' ');

/** Visible page text between the site header ("Log In") and footer ("Need Help?"), whitespace-collapsed. */
export function pandabytePageText(html: string): { title: string; content: string } | null {
  const title = (/<title>([^<]{1,300})<\/title>/i.exec(html)?.[1] ?? '').replace(/&[#a-z0-9]+;/gi, m => entities[m] ?? ' ').replace(/\s*\|\s*PandaByte\.in\s*$/, '').trim();
  let text = html.replace(/<(script|style|noscript|svg)[\s\S]*?<\/\1>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&[#a-z0-9]+;/gi, m => entities[m] ?? ' ')
    .replace(invisible, '').replace(/\s+/g, ' ');
  const start = text.indexOf(' Log In '), end = text.indexOf(' Need Help? ');
  if (start < 0 || end <= start) return null;
  text = text.slice(start + 8, end).replace(/^Home All Products /, '').replace(/^Browse by [\s\S]*?Sort by: Recommended /, '').trim();
  if (!title || text.length < 40 || /couldn['’]t be found/i.test(text)) return null;
  // Category listings run "Name Price ₹X Name Price ₹Y …" together; one line per product keeps each passage boundary
  // between products. Prices are removed everywhere: the agent never states a price (owner decision, 12 Nov 2026).
  text = stripPrices(text.replace(/ (?:Regular )?Price ₹[\d,]+\.\d\d(?: Sale Price ₹[\d,]+\.\d\d)?/g, '.\n'))
    .replace(/\n\s*\d{1,3}$/, '\n').replace(/\n /g, '\n').trim();
  // Cut at the cap on a word boundary so a quote never ends mid-word.
  const content = text.length > contentMax ? text.slice(0, contentMax).replace(/\s\S*$/, '') : text;
  return { title, content: content.trim() };
}

async function readCapped(response: Response, signal: AbortSignal, types = /^(?:text\/html|application\/xml|text\/xml)(?:\s*;|$)/i, max = pageMax): Promise<string> {
  if (!response.ok || response.redirected || !response.body || !types.test(response.headers.get('content-type') ?? '')) {
    void response.body?.cancel().catch(() => undefined); throw Error('site_unavailable');
  }
  const reader = response.body.getReader(), parts: Uint8Array[] = []; let size = 0;
  try {
    for (;;) {
      signal.throwIfAborted(); const { done, value } = await reader.read(); if (done) break; size += value.byteLength;
      if (size > max) { void reader.cancel().catch(() => undefined); throw Error('site_too_large'); }
      parts.push(value);
    }
  } finally { reader.releaseLock(); }
  return new TextDecoder('utf-8').decode(Buffer.concat(parts));
}

const productUrl = /^https:\/\/www\.pandabyte\.in\/product-page\/[a-z0-9-]{1,200}$/;
const text = (v: unknown, max: number): v is string => typeof v === 'string' && v.trim().length > 0 && v.length <= max;
/** Catalog passages as one listing text: control and format characters removed (the citation check refuses them), prices stripped. */
export function catalogContent(passages: readonly { text: string }[]): string {
  const joined = passages.flatMap(p => stripPrices(p.text.toWellFormed().replace(/\r\n?/g, '\n').replace(/[\p{Cc}\p{Cf}]/gu, c => c === '\n' || c === '\t' ? c : '')).split('\n'))
    .map(line => line.replace(/[ \t]+/g, ' ').trim()).filter(Boolean).join('\n');
  return joined.length > contentMax ? joined.slice(0, contentMax).replace(/\s\S*$/, '').trim() : joined;
}
/** The published catalog over InsForge's RPC API with the public (anon) key; any unexpected shape is an error. */
export function createPandabyteCatalog(config: { baseUrl: string; anonKey: string; fetchImpl?: Fetch }): CatalogReader {
  const base = new URL(config.baseUrl); if (base.protocol !== 'https:' || base.pathname !== '/' || base.search || base.hash || !/^[\x21-\x7e]{20,4096}$/.test(config.anonKey)) throw Error('catalog_config');
  const doFetch: Fetch = config.fetchImpl ?? ((url, init) => fetch(url, { ...init, cache: 'no-store' }));
  const rpc = async (fn: string, args: Record<string, string>, signal: AbortSignal) => {
    const r = await doFetch(new URL('/api/database/rpc/' + fn, base).href, { method: 'POST', redirect: 'error', signal, body: JSON.stringify(args),
      headers: { authorization: 'Bearer ' + config.anonKey, 'content-type': 'application/json', accept: 'application/json' } });
    // An unknown SKU is a 400 with details "not_found" (phase3_fail); the error body is small.
    if (r.status === 400 && fn === 'panda_agent_public_passages' && r.body) {
      const body = await readCapped(new Response(r.body, { headers: { 'content-type': 'application/json' } }), signal, /^application\/json/, 4096);
      if (JSON.parse(body)?.details === 'not_found') return null; throw Error('catalog_error');
    }
    return JSON.parse(await readCapped(r, signal, /^application\/json(?:\s*;|$)/i)) as unknown;
  };
  return {
    async products(signal) {
      const v = await rpc('panda_agent_public_products', {}, signal) as { items?: unknown };
      if (!v || !Array.isArray(v.items) || !v.items.length || v.items.length > 500) throw Error('catalog_shape');
      // A malformed item is skipped (as a non-matching sitemap URL is); none valid is an error.
      const items = v.items.filter((i: any) => text(i?.sku, 128) && text(i?.title, 300) && productUrl.test(i?.sourceUrl ?? ''))
        .map((i: any) => ({ sku: i.sku as string, title: i.title as string, sourceUrl: i.sourceUrl as string }));
      if (!items.length) throw Error('catalog_shape'); return items;
    },
    async passages(sku, signal) {
      const v = await rpc('panda_agent_public_passages', { p_sku: sku }, signal) as any; if (v === null) return null;
      if (!v || !text(v.title, 300) || !Array.isArray(v.passages) || !v.passages.length || v.passages.length > 64 || v.passages.some((p: any) => typeof p?.text !== 'string')) throw Error('catalog_shape');
      return { title: v.title, text: catalogContent(v.passages) };
    },
  };
}

let sitemap: { at: number; urls: string[] } | null = null, catalogCache: { at: number; reader: CatalogReader; products: CatalogProduct[] } | null = null;
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
  // Catalog first: a named product's stored listing passages. A category query, or any catalog failure, reads the live
  // pages below instead (inside the same authorised send; nothing is retried).
  // The catalog gets at most 6 s of the 20 s budget, so a slow catalog still leaves time for the live fallback.
  if (options.catalog) try {
    const catalogSignal = AbortSignal.any([signal, AbortSignal.timeout(6000)]);
    if (!catalogCache || catalogCache.reader !== options.catalog || Date.now() - catalogCache.at > 600_000) catalogCache = { at: Date.now(), reader: options.catalog, products: await options.catalog.products(catalogSignal) };
    const bySource = new Map(catalogCache.products.map(p => [p.sourceUrl, p])), urls = selectPandabytePages(query, [...bySource.keys()]);
    if (urls.every(url => bySource.has(url))) {
      const sources: WebSource[] = []; let total = 0;
      const found = await Promise.all(urls.map(url => options.catalog!.passages(bySource.get(url)!.sku, catalogSignal)));
      for (const [i, url] of urls.entries()) {
        const product = found[i]; if (!product || product.text.length < 40) continue;
        if (total + product.text.length > catalogTotalMax) break;
        total += product.text.length;
        // capturedAt is the read time: the broker requires it inside this search's started/completed window.
        sources.push({ handle: `web:${hash(url)}:${hash(product.text)}:${hash(product.text)}`, url, title: product.title, content: product.text, capturedAt: now().toISOString() });
      }
      signal.throwIfAborted();
      if (sources.length) return { version: 1, provider: 'pandabyte_site', operation: 'search', requestHash, requestId: null, startedAt, completedAt: now().toISOString(),
        durationMs: performance.now() - start, usage: { credits: null, costNanoUsd: null }, sources };
    }
  } catch { catalogCache = null; if (signal.aborted) throw new TavilySearchError('unknown', 'search_failed'); }
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

/** Test seam: forget the cached sitemap and catalog list. */
export const resetPandabyteSitemap = () => { sitemap = null; catalogCache = null; };
