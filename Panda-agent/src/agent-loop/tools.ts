// Agent-loop tools. The model chooses which to call; every argument is untrusted and validated here.
// PandaByte product facts reach an answer only as excerpt ids returned by read_product in this turn; the
// application, not the model, turns those ids into exact quotations.
import { buildHostedSourceQuotes } from '../control-room/hosted-source-quotes.ts';
import { agentQuestionText, categoryOf } from '../retrieval/catalog-listing.ts';
import type { ChatAnswer } from '../server/chat-contracts.ts';
import { cleanAnswer } from '../server/chat-store.ts';

export type CatalogRow = { sku: string; title: string; sourceUrl: string };
export type ProductPassage = { text: string; title: string; sourceUrl: string; capturedAt: string; sectionPath: readonly string[] };
export type ProductRead = { kind: 'ready'; passages: ProductPassage[]; revalidate(): Promise<boolean> } | { kind: 'insufficient' | 'unavailable' };
export type ToolDeps = {
  catalog(): Promise<CatalogRow[]>;
  /** Eligible listing passages for one catalog product, ranked by `focus`; revalidate() rechecks the same source scope before saving. */
  readProduct(row: CatalogRow, focus: string, signal: AbortSignal): Promise<ProductRead>;
  progress?(stage: 'searching_sources' | 'reading_sources' | 'checking_citations'): void;
};
export type ToolSpec = { type: 'function'; function: { name: string; description: string; parameters: Record<string, unknown> } };
export type ToolOutcome = { kind: 'result'; content: string } | { kind: 'final' | 'ask'; answer: ChatAnswer; citedSkus: string[] };

export const MAX_PRODUCTS = 3, PRODUCT_EXCERPT_BYTES = 3000, MAX_CITATIONS = 4;
export const GENERAL_HEADING = '### General guidance (not from PandaByte sources)';
// shortcut: a wording heuristic over the model's own prose (code and cited quotes are not checked); a paraphrase can still pass.
const priceOrStock = /[₹$]\s?\d|\b(?:Rs\.?|INR|USD|rupees?)\s?\d|\d[\d,.]*\s?(?:rupees?|Rs\b|INR\b|USD\b|dollars?)|\b(?:in|out[\s-]of)[\s-]stock\b|\bstock (?:level|count|is)\b|\bsold out\b|\bavailable now\b|\bprice (?:is|of)\b|\bcosts\b|\bdiscount/i;
const code = /(```[\s\S]*?```|`[^`\n]*`)/;
const prose = (s: string) => s.split(code).filter((_, i) => i % 2 === 0).join(' ');
const otherLinks = /\b(?:http|javascript|data|vbscript|file|ftp):[^\s)<>\]]+|(?<!https:\/\/)\bwww\.[^\s)<>\]]+/gi;
/** Outside code, only https links survive: any other Markdown link becomes its text, other autolinks and bare URLs are removed. */
export function httpsOnlyLinks(markdown: string): string {
  return markdown.split(code).map((part, i) => i % 2 ? part : part
    .replace(/!?\[([^\]]*)\]\(([^)]*)\)/g, (all: string, text: string, target: string) => /^\s*<?https:\/\//i.test(target) ? all : text)
    .replace(/<([a-z][a-z0-9+.-]*:[^>\s]*)>/gi, (all: string, url: string) => /^https:\/\//i.test(url) ? all : '')
    .replace(otherLinks, '')).join('');
}
const markers = /\[S\d{1,2}\]/;
const bytes = (s: string) => Buffer.byteLength(s, 'utf8');
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const str = (v: unknown, max: number): v is string => typeof v === 'string' && v.length <= max && v.isWellFormed();
const error = (code: string, message: string): ToolOutcome => ({ kind: 'result', content: JSON.stringify({ error: code, message }) });

const fn = (name: string, description: string, properties: Record<string, unknown>, required: string[]): ToolSpec =>
  ({ type: 'function', function: { name, description, parameters: { type: 'object', additionalProperties: false, properties, required } } });
const specs = {
  search_catalog: fn('search_catalog', 'Find PandaByte catalog products by words in their titles (sensor type, chip, board family). Returns SKU, title and category only; no specifications, price or stock.',
    { query: { type: 'string', description: 'A few words, for example "air quality sensor" or "ESP32 board".' } }, ['query']),
  read_product: fn('read_product', `Read excerpts of one product's PandaByte listing (and any maker datasheet excerpt attached to it). Each excerpt has an id to cite. At most ${MAX_PRODUCTS} products per turn.`,
    { sku: { type: 'string', description: 'Exact SKU from search_catalog.' }, focus: { type: 'string', description: 'Optional words that rank the most relevant excerpts first.' } }, ['sku']),
  ask_user: fn('ask_user', 'Ask the user one clarifying question and end your turn. Use only when the answer would change materially and a reasonable assumption is not possible.',
    { question: { type: 'string' }, options: { type: 'array', items: { type: 'string' }, minItems: 2, maxItems: 5, description: '2 to 5 short answers; the user can also type their own.' },
      recommended: { type: 'integer', description: 'Index of the recommended option, if any.' } }, ['question', 'options']),
  final_answer: fn('final_answer', 'Needed only when citing read_product excerpts; otherwise reply in plain text, which is the normal way to answer. Ends your turn. `sourced` holds only facts from read_product excerpts this turn, cited by excerpt id; `general` holds general engineering guidance (plans, wiring, code, libraries), shown under a "not from PandaByte sources" heading.',
    { sourced: { type: 'string', description: 'Markdown. PandaByte product facts only, no URLs or citation markers. Empty when nothing was cited.' },
      citations: { type: 'array', items: { type: 'string' }, maxItems: MAX_CITATIONS, description: 'Excerpt ids supporting `sourced`.' },
      general: { type: 'string', description: 'Markdown. General engineering guidance; never PandaByte product facts, prices or stock.' } }, ['sourced', 'citations', 'general']),
};
export const allToolSpecs: readonly ToolSpec[] = Object.values(specs);
export const finishingToolSpecs: readonly ToolSpec[] = [specs.ask_user, specs.final_answer];

const titleWords = (s: string) => (s.normalize('NFKC').toLowerCase().match(/[a-z0-9]+/g) ?? []).filter(w => w.length > 1 && !['the', 'and', 'for', 'with', 'pandabyte', 'board', 'module', 'sensor'].includes(w));
/** Rows ranked by title words shared with the query (a 4+ letter word also matches inside a title word); every row when none match. */
export function searchCatalog(rows: readonly CatalogRow[], query: string) {
  const words = [...new Set(titleWords(query))];
  const scored = rows.map(row => { const title = titleWords(row.title).concat(titleWords(row.sku));
    return { row, score: words.filter(w => title.includes(w) || (w.length >= 4 && title.some(t => t.includes(w)))).length }; });
  const hits = scored.filter(x => x.score > 0).sort((a, b) => b.score - a.score || a.row.title.localeCompare(b.row.title, 'en')).slice(0, 12);
  const list = (hits.length ? hits.map(x => x.row) : [...rows]).map(r => ({ sku: r.sku, title: r.title, category: categoryOf(r.title) }));
  return { matched: hits.length > 0, products: list };
}

type Excerpt = { text: string; passage: ProductPassage; sku: string };
/** Per-turn tool state: excerpt ids are request-local (E<read>.<n>) and never reveal internal handles. */
export function createToolHost(deps: ToolDeps) {
  const excerpts = new Map<string, Excerpt>(), reads = new Map<string, { ids: string[]; revalidate(): Promise<boolean>; row: CatalogRow }>();
  let catalog: Promise<CatalogRow[]> | undefined, loaded: CatalogRow[] | undefined;
  const rows = () => catalog ??= deps.catalog().then(list => (loaded = list));
  // Product slots are taken before any read is awaited, so parallel calls hit the cap and get read numbers in call order.
  const reading = new Set<string>();
  let readNumber = 0;
  const report = (stage: Parameters<NonNullable<ToolDeps['progress']>>[0]) => { try { deps.progress?.(stage); } catch { /* Presentation only. */ } };

  async function readProduct(args: Record<string, unknown>, signal: AbortSignal): Promise<ToolOutcome> {
    if (!str(args.sku, 128) || !args.sku.trim() || (args.focus !== undefined && !str(args.focus, 300))) return error('invalid_arguments', 'read_product needs a sku string and an optional short focus string.');
    const row = (loaded ?? await rows()).find(r => r.sku.toLowerCase() === (args.sku as string).trim().toLowerCase());
    if (!row) return error('unknown_sku', 'No PandaByte product has that SKU. Use search_catalog to find the exact SKU.');
    const known = reads.get(row.sku);
    if (known) return { kind: 'result', content: JSON.stringify({ sku: row.sku, alreadyRead: true, excerptIds: known.ids }) };
    if (reading.has(row.sku)) return error('already_reading', 'That product is already being read in this step; use the excerpt ids from that result.');
    if (reads.size + reading.size >= MAX_PRODUCTS) return error('product_limit', `At most ${MAX_PRODUCTS} products can be read per turn. Answer with what you have.`);
    reading.add(row.sku); const number = ++readNumber;
    try {
    report('reading_sources');
    const focus = typeof args.focus === 'string' ? args.focus.replace(/[^A-Za-z0-9 .,+-]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 160) : '';
    const read = await deps.readProduct(row, focus, signal);
    if (read.kind !== 'ready') return error(read.kind === 'insufficient' ? 'no_excerpts' : 'unavailable', read.kind === 'insufficient'
      ? 'The listing holds no excerpts for that focus (wiring, pinout and safety proof are never in listings). Read again without that focus, or answer that part as general guidance.'
      : 'This product listing cannot be read right now. Do not state its facts.');
    const quotes = buildHostedSourceQuotes(read.passages.map((p, i) => ({ rank: i + 1, text: p.text }))).quotes;
    const ids: string[] = [], shown: Array<{ id: string; section: string; text: string }> = [];
    let used = 0;
    for (const q of quotes) {
      const passage = read.passages[q.rank - 1];
      // Source-label lines prove nothing; whitespace-only slices cannot be quoted.
      if (!passage || !q.text.trim() || /^\s*source\s*:\s*https?:\/\/\S+\s*$/i.test(q.text) || used + bytes(q.text) > PRODUCT_EXCERPT_BYTES) continue;
      used += bytes(q.text);
      const id = `E${number}.${ids.length + 1}`;
      excerpts.set(id, { text: q.text, passage, sku: row.sku }); ids.push(id);
      shown.push({ id, section: passage.sectionPath.join(' > '), text: q.text });
    }
    if (!ids.length) return error('no_excerpts', 'The listing has no quotable excerpts. Do not state its facts.');
    reads.set(row.sku, { ids, revalidate: read.revalidate, row });
    return { kind: 'result', content: JSON.stringify({ sku: row.sku, title: row.title, productPage: row.sourceUrl, excerpts: shown,
      note: 'Cite excerpt ids in final_answer.citations. Price and stock are never in excerpts; they are on the product page.' }) };
    } finally { reading.delete(row.sku); }
  }

  function finalAnswer(args: Record<string, unknown>): ToolOutcome {
    const sourced = typeof args.sourced === 'string' ? args.sourced.trim() : args.sourced === undefined ? '' : null;
    const general = typeof args.general === 'string' ? httpsOnlyLinks(args.general).trim() : args.general === undefined ? '' : null;
    const ids = args.citations === undefined ? [] : args.citations;
    if (sourced === null || general === null || !str(sourced, 6000) || !str(general, 7000) || !Array.isArray(ids) || ids.length > MAX_CITATIONS || ids.some(id => typeof id !== 'string'))
      return error('invalid_arguments', 'final_answer needs sourced and general strings and at most four excerpt ids.');
    if (!sourced && !general) return error('empty_answer', 'Write the answer in sourced or general.');
    const unique = [...new Set(ids as string[])], missing = unique.filter(id => !excerpts.has(id));
    if (missing.length) return error('unknown_citation', `These ids were not returned by read_product this turn: ${missing.join(', ')}. Cite only excerpt ids you read.`);
    if (sourced && !unique.length) return error('uncited_sourced', 'sourced text needs at least one excerpt id. Move uncited content to general, or read the product first.');
    if (unique.length && !sourced) return error('citations_without_text', 'Put the cited facts in sourced.');
    if (/https?:\/\/|www\./i.test(sourced) || markers.test(sourced) || markers.test(general)) return error('markers', 'Remove URLs from sourced and citation markers from both fields; the application adds citations.');
    if (priceOrStock.test(prose(sourced)) || priceOrStock.test(prose(general))) return error('price_or_stock', 'Never state a price or stock level. Say they are shown on the product page.');
    report('checking_citations');
    const citations = unique.map((id, i) => { const { text, passage } = excerpts.get(id)!;
      return { id: `S${i + 1}`, title: passage.title, sourceUrl: passage.sourceUrl, capturedAt: passage.capturedAt, quote: text, sectionPath: [...passage.sectionPath] }; });
    const parts = [sourced && `${sourced}\n\n${citations.map(c => `[${c.id}]`).join(' ')}`, general && (sourced ? `${GENERAL_HEADING}\n\n${general}` : general)].filter(Boolean);
    const text = parts.join('\n\n');
    if (text.length > 8000) return error('too_long', `The answer is ${text.length} characters; the limit is 8000. Shorten it (keep code minimal and complete).`);
    let answer: ChatAnswer;
    try { answer = cleanAnswer({ outcome: citations.length ? 'evidence' : 'conversation', text, citations }); }
    catch { return error('invalid_answer', 'The answer could not be accepted. Rewrite it in plain Markdown.'); }
    // The journal stores at most 24,000 bytes of answer JSON; Postgres jsonb text adds spaces, so keep a margin.
    if (bytes(JSON.stringify(answer)) > 23000) return error('too_long', 'The answer with its citations is over the 23,000-byte storage limit (non-English text and code count more). Shorten it.');
    return { kind: 'final', answer, citedSkus: [...new Set(unique.map(id => excerpts.get(id)!.sku))] };
  }

  function askUser(args: Record<string, unknown>): ToolOutcome {
    const options = args.options, recommended = args.recommended;
    if (!str(args.question, 600) || !Array.isArray(options) || options.some(o => !str(o, 200))
      || (recommended !== undefined && recommended !== null && (!Number.isSafeInteger(recommended) || (recommended as number) < 0 || (recommended as number) >= options.length)))
      return error('invalid_arguments', 'ask_user needs a question, 2 to 5 option strings and an optional recommended index.');
    const text = agentQuestionText(args.question, options as string[], typeof recommended === 'number' ? recommended : undefined);
    if (!text) return error('invalid_question', 'Use one short plain-text question with 2 to 5 distinct short options.');
    return { kind: 'ask', answer: { outcome: 'clarification', text, citations: [] }, citedSkus: [] };
  }

  return {
    /** Runs one model tool call. Unknown tools and malformed arguments come back to the model as an error result. */
    async call(name: string, rawArguments: string, signal: AbortSignal): Promise<ToolOutcome> {
      let args: unknown;
      try { args = rawArguments.trim() ? JSON.parse(rawArguments) : {}; } catch { return error('invalid_json', 'Tool arguments must be one JSON object.'); }
      if (!record(args)) return error('invalid_json', 'Tool arguments must be one JSON object.');
      if (name === 'search_catalog') {
        if (!str(args.query, 200)) return error('invalid_arguments', 'search_catalog needs a short query string.');
        report('searching_sources');
        try { return { kind: 'result', content: JSON.stringify(searchCatalog(await rows(), args.query)) }; }
        catch { catalog = undefined; signal.throwIfAborted(); return error('unavailable', 'The catalog cannot be read right now. Do not name PandaByte products from memory.'); }
      }
      if (name === 'read_product') {
        try { return await readProduct(args, signal); }
        catch { catalog = undefined; signal.throwIfAborted(); return error('unavailable', 'This product listing cannot be read right now. Do not state its facts.'); }
      }
      if (name === 'final_answer') return finalAnswer(args);
      if (name === 'ask_user') return askUser(args);
      return error('unknown_tool', 'Use only search_catalog, read_product, ask_user or final_answer.');
    },
    /** Loads the catalog once before parallel calls, so each read_product takes its slot synchronously, in call order. */
    async prepare() { try { await rows(); } catch { catalog = undefined; } },
    /** A plain-text reply (no tool call) is accepted as general guidance only. */
    plain(content: string): ToolOutcome { return finalAnswer({ sourced: '', citations: [], general: content }); },
    /** Rechecks the source scope of every product an answer cites, immediately before saving. */
    async revalidate(skus: readonly string[]): Promise<boolean> {
      for (const sku of skus) { const read = reads.get(sku); if (!read || await read.revalidate() !== true) return false; }
      return true;
    },
  };
}
export type ToolHost = ReturnType<typeof createToolHost>;
