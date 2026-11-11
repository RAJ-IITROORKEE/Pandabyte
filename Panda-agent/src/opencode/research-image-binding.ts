// C4 image binding (frozen interface, phase-c4-plan.md D1–D3).
// Root owns: the constants, AdmittedResearchImage, decodeResearchImageDataUri, replaceResearchImageUrls.
// Worker B owns: nativeUserImageMatches, parseResearchUserContent, buildResearchPromptBody (and must not edit root's parts).
import { createHash } from 'node:crypto';

export const researchImageMaxBase64 = 65536;
/** Longest accepted prefix 'data:image/jpeg;base64,' (23 chars) plus the base64 bound. */
export const researchImageMaxUrl = 65559;
/** Fixed stand-in used only to measure the text wire bound; never posted or hashed. */
export const researchImagePlaceholder = 'data:image;base64,';
/** Image-turn text bound (S2); text-only prompts keep 96,000 B. */
export const researchImageTextMax = 4000;
export const researchPromptJSONMax = 98304;

export type ResearchImageMediaType = 'image/png' | 'image/jpeg';
/** Produced by admitResearchImage (src/server/research-image.ts, Worker A). */
export type AdmittedResearchImage = Readonly<{ bytes: Buffer; mediaType: ResearchImageMediaType; sha256: string; dataUri: string; name: 'image.png' | 'image.jpg' }>;

const magic: Readonly<Record<ResearchImageMediaType, string>> = { 'image/png': '89504e470d0a1a0a', 'image/jpeg': 'ffd8ff' };
const prefix = /^data:(image\/(?:png|jpeg));base64,/;

/** Canonical base64 only; the decoded magic must match the declared type. */
export function decodeResearchImageDataUri(uri: string, maxBase64: number = researchImageMaxBase64): { mediaType: ResearchImageMediaType; bytes: Buffer; sha256: string } | null {
  if (typeof uri !== 'string' || uri.length > maxBase64 + 23) return null;
  const match = prefix.exec(uri);
  if (!match) return null;
  const mediaType = match[1] as ResearchImageMediaType, data = uri.slice(match[0].length);
  if (!data.length || data.length > maxBase64 || data.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(data)) return null;
  const bytes = Buffer.from(data, 'base64');
  if (bytes.toString('base64') !== data || !bytes.subarray(0, magic[mediaType].length / 2).toString('hex').startsWith(magic[mediaType])) return null;
  return { mediaType, bytes, sha256: createHash('sha256').update(bytes).digest('hex') };
}

/** Deep copy with every OpenAI-compatible image_url URL replaced by the placeholder; for measuring only. */
export function replaceResearchImageUrls(messages: unknown[]): unknown[] {
  const walk = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(walk);
    if (!value || typeof value !== 'object') return value;
    const object = value as Record<string, unknown>, copy: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(object)) copy[key] = walk(child);
    if (object.type === 'image_url' && object.image_url && typeof object.image_url === 'object' && typeof (object.image_url as Record<string, unknown>).url === 'string')
      copy.image_url = { ...(copy.image_url as Record<string, unknown>), url: researchImagePlaceholder };
    return copy;
  };
  return messages.map(walk);
}

// ---- Worker B implements below this line (signatures frozen). ----
const hex = (v: unknown): v is string => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v);
const plain = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const exact = (v: Record<string, unknown>, keys: string[]) => Object.keys(v).sort().join(',') === [...keys].sort().join(',');
const imageName = (mediaType: ResearchImageMediaType) => mediaType === 'image/png' ? 'image.png' : 'image.jpg';

/** imageSha256 absent: `files` absent or []. Present: exactly one {data,mime,name,source:{type:'inline'}} matching the hash and type. */
export function nativeUserImageMatches(row: unknown, imageSha256?: string): boolean {
  if (!plain(row)) return false;
  if (imageSha256 === undefined) return row.files === undefined || Array.isArray(row.files) && row.files.length === 0;
  if (!hex(imageSha256) || !Array.isArray(row.files) || row.files.length !== 1) return false;
  const file = row.files[0];
  if (!plain(file) || !exact(file, ['data', 'mime', 'name', 'source']) || typeof file.data !== 'string' || typeof file.mime !== 'string'
    || !plain(file.source) || !exact(file.source, ['type']) || file.source.type !== 'inline' || (file.mime !== 'image/png' && file.mime !== 'image/jpeg')) return false;
  const decoded = decodeResearchImageDataUri('data:' + file.mime + ';base64,' + file.data);
  return decoded !== null && decoded.mediaType === file.mime && decoded.sha256 === imageSha256 && file.name === imageName(decoded.mediaType);
}

const textPart = (v: unknown): v is { type: 'text'; text: string } => plain(v) && exact(v, ['type', 'text']) && v.type === 'text' && typeof v.text === 'string' && v.text.isWellFormed() && Buffer.byteLength(v.text, 'utf8') <= 24000;

/** String → one text part. Array → ≥1 text parts then at most one trailing image part. vision:false with an image → null. */
export function parseResearchUserContent(value: unknown, vision: boolean): { texts: string[]; image: { sha256: string; mediaType: ResearchImageMediaType; urlLength: number } | null } | null {
  if (typeof value === 'string') return value.isWellFormed() && Buffer.byteLength(value, 'utf8') <= 98304 ? { texts: [value], image: null } : null;
  if (!Array.isArray(value) || !value.length || value.length > 33) return null;
  const texts: string[] = []; let image: { sha256: string; mediaType: ResearchImageMediaType; urlLength: number } | null = null;
  for (const [index, item] of value.entries()) {
    if (textPart(item)) { if (image) return null; texts.push(item.text); continue; }
    if (!vision || index !== value.length - 1 || !texts.length || !plain(item) || !exact(item, ['type', 'image_url']) || item.type !== 'image_url'
      || !plain(item.image_url) || !exact(item.image_url, ['url']) || typeof item.image_url.url !== 'string') return null;
    const decoded = decodeResearchImageDataUri(item.image_url.url);
    if (!decoded) return null;
    image = { sha256: decoded.sha256, mediaType: decoded.mediaType, urlLength: item.image_url.url.length };
  }
  return texts.length <= 32 && Buffer.byteLength(texts.join(''), 'utf8') <= 98304 ? { texts, image } : null;
}

/** S1: size gate and body construction; nothing may be admitted when this returns an error. */
export function buildResearchPromptBody(input: { messageID: string; text: string; image: AdmittedResearchImage | null; vision: boolean }):
  { body: { id: string; text: string } | { id: string; text: string; files: [{ uri: string; name: 'image.png' | 'image.jpg' }] }; imageSha256?: string } | { error: 'prompt_too_large' | 'image_not_allowed' } {
  const { messageID, text, image, vision } = input;
  // shortcut: unrepresentable text (non-string, blank, ill-formed) maps to prompt_too_large because the error union is frozen; upgrade if callers need a distinct code.
  if (typeof text !== 'string' || !text.trim() || !text.isWellFormed()) return { error: 'prompt_too_large' };
  if (image === null) return Buffer.byteLength(text, 'utf8') <= 96000 ? { body: { id: messageID, text } } : { error: 'prompt_too_large' };
  if (!vision) return { error: 'image_not_allowed' };
  const decoded = decodeResearchImageDataUri(image.dataUri);
  if (!decoded || decoded.mediaType !== image.mediaType || decoded.sha256 !== image.sha256 || image.name !== imageName(image.mediaType)) return { error: 'image_not_allowed' };
  if (Buffer.byteLength(text, 'utf8') > researchImageTextMax) return { error: 'prompt_too_large' };
  const body = { id: messageID, text, files: [{ uri: image.dataUri, name: image.name }] as [{ uri: string; name: 'image.png' | 'image.jpg' }] };
  return Buffer.byteLength(JSON.stringify(body), 'utf8') <= researchPromptJSONMax ? { body, imageSha256: image.sha256 } : { error: 'prompt_too_large' };
}
