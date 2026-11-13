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
