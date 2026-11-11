// Catalog-wide questions ("tell me about PandaByte boards") cannot be answered by single-product RAG. They get a
// deterministic, zero-model answer built only from live catalog rows (title, SKU, product page): either a clarifying
// question with selectable follow-ups, or a Markdown table. Nothing here infers specs; the chip column is copied
// only when the chip name appears literally in the product title.

export type CatalogRow = { sku: string; title: string; sourceUrl: string };
export type CatalogCategory = 'boards' | 'kits' | 'shields' | 'modules' | 'accessories';
export type CatalogScope = { category: CatalogCategory | 'all'; family?: 'esp32' };
export type CatalogIntent = { kind: 'clarify' } | { kind: 'list'; scope: CatalogScope };

const labels: Record<CatalogCategory, string> = { boards: 'development boards', kits: 'kits', shields: 'shields and expansion boards', modules: 'sensors and modules', accessories: 'accessories' };

export function categoryOf(title: string): CatalogCategory {
  if (/\b(?:shield|hat)\b/i.test(title)) return 'shields';
  if (/\b(?:development board|dev ?kit)\b|\bmaker uno\b/i.test(title)) return 'boards';
  if (/\bkit\b/i.test(title)) return 'kits';
  if (/\b(?:sensor|module|display|screen|oled|lcd|led|buzzer|switch|potentiometer|rs485|max485|scale|unit)\b/i.test(title)) return 'modules';
  return 'accessories';
}
/** Chip names copied only when literally in the title; otherwise the table says to check the product page. */
export const chipFromTitle = (title: string): string | null => /\b(ESP32(?:-[A-Z][0-9A-Z]{1,3})?|ESP8266|RP2040|STM32[A-Z0-9]*|ATmega\d+[A-Z]*)\b/i.exec(title)?.[1]?.toUpperCase() ?? null;

const catalogNoun = /\b(?:boards?|dev(?:elopment)?\s*boards?|products?|items?|catalog(?:ue)?|sensors?|kits?|shields?|modules?|hats?|devices?|range|lineup|offerings?)\b/i;
// Only "what do you have/sell" style questions or explicit listing requests qualify. Advice, comparison, explanation
// and attribute questions ("which board has Bluetooth?") keep their earlier route (product RAG or the direct model).
const possession = /\b(?:do|does)\s+(?:you|panda\s*byte)\s+(?:have|sell|offer|carry|stock)\b|\b(?:what|which)\b.{0,80}\b(?:you|we|panda\s*byte)\s+(?:have|sell|offer|carry|stock)\b/i;
const pandaCatalog = /\b(?:tell\s+me\s+about|what\s+are|show\s+me|list)\b.{0,40}\b(?:panda\s*byte|your|our)\b/i;
const listing = /^(?:please\s+)?(?:list|show)\b|\b(?:all|every)\b/i;
const advice = /\b(?:with|has|have\s+(?:a|an|any)\b.{0,30}\b(?:support|bluetooth|wi-?fi)|supports?|bluetooth|ble|psram|flash|gpio|pins?|pinout|voltage|ram|memory|wi-?fi|lora\w*|zigbee|thread|matter|recommend\w*|best|better|should|explain|how|works?|why|help|pick|choose|compare|differences?|vs\.?|versus|for\s+(?:a|an|my|the)\b)/i;

/** `named` is whether the question resolves to a specific catalog product: those stay on product RAG. */
export function catalogIntent(question: string, named: boolean): CatalogIntent | null {
  const q = question.normalize('NFKC').trim();
  if (named || q.length > 240 || !catalogNoun.test(q) || advice.test(q) || !(possession.test(q) || pandaCatalog.test(q) || (listing.test(q) && /\bpanda\s*byte\b|\byour\b/i.test(q)))) return null;
  const category = /\b(?:shields?|hats?|expansion)\b/i.test(q) ? 'shields' : /\b(?:sensors?|modules?)\b/i.test(q) ? 'modules' : /\bkits?\b/i.test(q) && !/\bdev\s*kit/i.test(q) ? 'kits'
    : /\bboards?\b/i.test(q) ? 'boards' : null;
  // The ESP32 family filter applies to development boards only.
  const family = /\besp32\b/i.test(q) && (category === 'boards' || category === null) ? 'esp32' as const : undefined;
  if (family || (listing.test(q) && category)) return { kind: 'list', scope: { category: category ?? 'boards', ...(family ? { family } : {}) } };
  if (listing.test(q) && /\b(?:products?|items?|catalog(?:ue)?|range|lineup)\b/i.test(q)) return { kind: 'list', scope: { category: 'all' } };
  return { kind: 'clarify' };
}

const optionHeader = 'Pick an option:';
const optionFooter = 'Or type your own question, for example with a board name such as xS3 or x8266.';
const listQuestion = (scope: CatalogScope) => scope.family === 'esp32' ? 'List PandaByte ESP32 development boards'
  : scope.category === 'all' ? 'List all PandaByte products' : `List all PandaByte ${labels[scope.category]}`;

/** A clarifying question whose numbered lines are complete follow-up questions (the UI renders them as buttons). */
export function clarificationText(rows: readonly CatalogRow[]): string {
  const present = new Set(rows.map(r => categoryOf(r.title)));
  const options: string[] = [];
  if (present.has('boards')) options.push(listQuestion({ category: 'boards' }) + ' (recommended)');
  if (rows.some(r => categoryOf(r.title) === 'boards' && chipFromTitle(r.title)?.startsWith('ESP32'))) options.push(listQuestion({ category: 'boards', family: 'esp32' }));
  for (const c of ['kits', 'shields', 'modules'] as const) if (present.has(c)) options.push(listQuestion({ category: c }));
  options.push(listQuestion({ category: 'all' }));
  return ['Which PandaByte products would you like to see?', '', optionHeader, ...options.map((o, i) => `${i + 1}. ${o}`), '', optionFooter].join('\n');
}

// Catalog text is admin-controlled; Markdown control characters are still removed so a title can never form a link, image or emphasis.
const cell = (s: string) => s.replace(/[|\\[\]<>`*_]/g, ' ').replace(/[\r\n]+/g, ' ').trim();
/** A Markdown table of matching catalog rows; every value is a catalog field or a literal title match. */
export function catalogTableText(rows: readonly CatalogRow[], scope: CatalogScope): string {
  const matching = rows.filter(r => (scope.category === 'all' || categoryOf(r.title) === scope.category) && (!scope.family || chipFromTitle(r.title)?.startsWith('ESP32')))
    .slice().sort((a, b) => a.title.localeCompare(b.title, 'en'));
  const name = scope.family === 'esp32' ? 'ESP32 development boards' : scope.category === 'all' ? 'products' : labels[scope.category];
  if (!matching.length) return `PandaByte's current catalog has no ${name} listed.`;
  // "all" spans 42 rows, so it keeps only name, category and link to stay under the 8,000-character answer limit.
  const all = scope.category === 'all';
  const header = all ? '| Product | Category | Product page |\n|---|---|---|' : '| Product | SKU | Chip (from title) | Product page |\n|---|---|---|---|';
  const row = (r: CatalogRow) => all ? `| ${cell(r.title)} | ${labels[categoryOf(r.title)]} | [View](${r.sourceUrl}) |`
    : `| ${cell(r.title)} | ${cell(r.sku)} | ${chipFromTitle(r.title) ?? 'See product page'} | [View](${r.sourceUrl}) |`;
  const intro = `PandaByte currently lists ${matching.length} ${name}:`, outro = 'This list comes from the live PandaByte catalog. Ask about any product by name for its specifications, pinout or documentation.';
  const lines: string[] = [];
  for (const r of matching) { const next = row(r); if ([intro, header, ...lines, next, outro].join('\n').length > 7600) break; lines.push(next); }
  const more = matching.length - lines.length;
  return [intro, '', header, ...lines, ...(more ? ['', `${more} more not shown here; ask for a category to see them.`] : []), '', outro].join('\n');
}

/** UI side: the options of a clarification answer, or null when the text is not one. Each option is a full question. */
export function parseClarificationOptions(text: string): { question: string; options: { label: string; question: string; recommended: boolean }[] } | null {
  const lines = text.split('\n'), at = lines.indexOf(optionHeader);
  if (at < 2 || lines.at(-1) !== optionFooter || lines.length > 16) return null;
  const options = [];
  for (const line of lines.slice(at + 1, -2)) {
    const m = /^(\d)\. (List [A-Za-z0-9 ]{3,80}?)( \(recommended\))?$/.exec(line);
    if (!m || Number(m[1]) !== options.length + 1) return null;
    options.push({ label: m[2], question: m[2], recommended: !!m[3] });
  }
  return options.length >= 1 && options.length <= 8 && lines[lines.length - 2] === '' ? { question: lines[0], options } : null;
}
