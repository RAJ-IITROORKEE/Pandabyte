import { webSearchSection } from "../search/citation-url.ts";

type Cited = { sourceUrl?: string | null; url?: string | null; title: string; sectionPath?: readonly string[] };

const productPage = /^https:\/\/(www\.)?pandabyte\.in\/product-page\/[^/?#]+/i;
const priceWords = /\b(price|prices|pricing|cost|costs|how much (?:is|are|for) (?:it|this|that|the|an?)\b(?!.*\b(?:flash|memory|ram|psram|current|power|voltage|storage)\b)|stock|in stock|availability|buy)\b/i;

const urlOf = (c: Cited) => c.sourceUrl ?? c.url ?? "";

// Manufacturer datasheet excerpts are stored under the product page but carry this section marker (migration 20261113120000).
const manufacturerSection = /^Espressif .+ datasheet$/;
const isManufacturerExcerpt = (c: Cited) => !!c.sectionPath?.some(s => manufacturerSection.test(s));

/** True only when every citation is PandaByte's own listing text on a pandabyte.in product page. */
export function isListingVerified(citations: readonly Cited[]): boolean {
  return citations.length > 0 && citations.every(c => productPage.test(urlOf(c)) && !c.sectionPath?.includes(webSearchSection) && !isManufacturerExcerpt(c));
}

/** True when an answer cites the module maker's datasheet (alone or together with the listing). */
export function citesManufacturerDatasheet(citations: readonly Cited[]): boolean {
  return citations.some(c => productPage.test(urlOf(c)) && isManufacturerExcerpt(c));
}

export function isPriceQuestion(question: string | null | undefined): boolean {
  return !!question && priceWords.test(question);
}

/** One entry per distinct product page, for the price pointer links. */
export function distinctProductPages(citations: readonly Cited[]): { href: string; title: string }[] {
  const seen = new Set<string>();
  return citations.flatMap(c => { const href = urlOf(c); if (seen.has(href)) return []; seen.add(href); return [{ href, title: c.title }]; });
}
