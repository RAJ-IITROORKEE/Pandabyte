/** A reference image found on a cited web page (diagram, pinout, board photo). Shown as a link-preview, never generated. */
export type CitationImage = { url: string; description: string };

export const MAX_CITATION_IMAGES = 2;
const twoPartSuffix = /^(?:co|com|net|org|ac|gov|edu)\.[a-z]{2}$/;
const site = (host: string) => { const labels = host.split('.'); const last2 = labels.slice(-2).join('.'); return twoPartSuffix.test(last2) ? labels.slice(-3).join('.') : last2; };

/** Keeps an image only when it is a public https URL on the same site as the page it was found on (a CDN such as
 * static-cdn.m5stack.com for docs.m5stack.com counts), so a page cannot attach images from unrelated hosts. SVG is refused. */
export function citationImage(sourceUrl: string, value: unknown): CitationImage | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const { url, description } = value as Record<string, unknown>;
  if (typeof url !== 'string' || url.length > 500 || (description !== undefined && typeof description !== 'string')) return null;
  try {
    const image = new URL(url), page = new URL(sourceUrl), host = image.hostname.toLowerCase();
    if (image.protocol !== 'https:' || image.username || image.password || image.port || image.hash || /^[\d.]+$|:/.test(host) || !host.includes('.')
      || site(host) !== site(page.hostname.toLowerCase()) || /\.svgz?$/i.test(image.pathname)) return null;
    const text = (description ?? '').replace(/[\p{Cc}\p{Cf}]/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, 300);
    return { url: image.href, description: text };
  } catch { return null; }
}

/** PandaByte's own published media, served by the app (find_pinout): exactly /api/media/<uuid>, at most two. The database
 *  re-checks that each id is a published media row before an answer with them is saved. */
export const OWN_MEDIA_URL = /^\/api\/media\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export function ownMediaImages(value: unknown): CitationImage[] {
  if (!Array.isArray(value)) return [];
  const out: CitationImage[] = [];
  for (const item of value.slice(0, 4)) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    const { url, description } = item as Record<string, unknown>;
    if (typeof url !== 'string' || !OWN_MEDIA_URL.test(url) || (description !== undefined && typeof description !== 'string') || out.some(o => o.url === url)) continue;
    out.push({ url, description: (description ?? '').replace(/[\p{Cc}\p{Cf}]/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, 300) });
    if (out.length === MAX_CITATION_IMAGES) break;
  }
  return out;
}

/** At most two valid, distinct images per citation; anything invalid is dropped, never an error. */
export function citationImages(sourceUrl: string, value: unknown): CitationImage[] {
  if (!Array.isArray(value)) return [];
  const out: CitationImage[] = [];
  for (const item of value.slice(0, 8)) {
    const image = citationImage(sourceUrl, item);
    if (image && !out.some(o => o.url === image.url)) out.push(image);
    if (out.length === MAX_CITATION_IMAGES) break;
  }
  return out;
}

/** Picks up to two of a board's own published images that show pins: a pinout drawing first, then a photo with pin labels or
 *  silkscreen. Media ids come from the product's public record; their alt text from panda_agent_media_alts (published only). */
export function pickPinoutImages(items: readonly { id: string; alt: string }[]): CitationImage[] {
  const rank = (alt: string) => /pinout/i.test(alt) ? 0 : /pin labels?|silkscreen|header labels?/i.test(alt) ? 1 : -1;
  const seen = new Set<string>();
  return items.map(i => ({ ...i, r: rank(i.alt) })).filter(i => i.r >= 0).sort((a, b) => a.r - b.r)
    .filter(i => { const key = i.alt.toLowerCase(); if (seen.has(key)) return false; seen.add(key); return true; })
    .slice(0, 2).map(i => ({ url: `/api/media/${i.id}`, description: i.alt.replace(/;?\s*preserve-original\.?\s*$/i, '').trim().slice(0, 300) }));
}
