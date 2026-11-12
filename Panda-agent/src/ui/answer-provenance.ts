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

/** Saved by the research harness when its daily privacy attestation has lapsed. */
export const researchPausedText = "The research agent is paused until its privacy review is renewed.";
// Every fixed failure text the research harness saves (migration 20261112090000), with a plain notice for the chat.
const researchFailures: Record<string, string> = {
  [researchPausedText]: "Web search is paused until its privacy review is renewed.",
  "Today's research budget is used up. Please try again tomorrow.": "Today's web search budget is used up.",
  "The research agent is busy with another request. Please try again shortly.": "Web search is busy with another request.",
  "The research agent could not start its search tool. Please try again.": "Web search could not start its search tool.",
  "The research agent returned an answer that could not be verified, so it was not saved.": "Web search returned an answer that could not be verified.",
};
/** The notice for a saved research failure, or null when the text is an ordinary answer. */
export const researchFailureNotice = (text: string | null | undefined): string | null => text && Object.hasOwn(researchFailures, text) ? researchFailures[text] : null;
const vagueRetry = /^(?:(?:ok(?:ay)?|now|so|please|pls|then|hi|hey)[,\s]+)*(?:tell me(?: (?:about it|now|again|please))?|answer(?: (?:it|that|this))?(?: (?:now|please))?|try again|again|retry|go on|continue|go ahead|do it)[\s.!?]*$/i;

/** After a paused web-search reply, a vague nudge ("now tell me", "try again") re-asks the question that was paused. */
export function retryAfterPause(text: string, history: readonly { role: string; text: string }[]): string {
  const last = history.at(-1), previous = history.at(-2);
  return last?.role === "assistant" && researchFailureNotice(last.text) !== null && previous?.role === "user" && vagueRetry.test(text.trim()) ? previous.text : text;
}
