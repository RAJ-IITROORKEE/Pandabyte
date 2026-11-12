import { webSearchSection } from "../search/citation-url.ts";

type Cited = { sourceUrl?: string | null; url?: string | null; title: string; sectionPath?: readonly string[] };

const productPage = /^https:\/\/(www\.)?pandabyte\.in\/product-page\/[^/?#]+/i;
const priceWords = /\b(price|prices|pricing|cost|costs|how much|stock|in stock|availability|buy)\b/i;

const urlOf = (c: Cited) => c.sourceUrl ?? c.url ?? "";

/** True only when every citation is a PandaByte product listing page. */
export function isListingVerified(citations: readonly Cited[]): boolean {
  return citations.length > 0 && citations.every(c => productPage.test(urlOf(c)) && !c.sectionPath?.includes(webSearchSection));
}

export function isPriceQuestion(question: string | null | undefined): boolean {
  return !!question && priceWords.test(question);
}

/** One entry per distinct product page, for the price pointer links. */
export function distinctProductPages(citations: readonly Cited[]): { href: string; title: string }[] {
  const seen = new Set<string>();
  return citations.flatMap(c => { const href = urlOf(c); if (seen.has(href)) return []; seen.add(href); return [{ href, title: c.title }]; });
}
