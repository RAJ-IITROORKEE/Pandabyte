import { createHash } from 'node:crypto';
import sharp from 'sharp';
import type { AdmittedResearchImage, ResearchImageMediaType } from '../opencode/research-image-binding.ts';

// C4 host admission (phase-c4-plan.md D3 S3): own single-flight lock and deadline, independent of the diagnostics normalizer.
const maxInput = 8 * 1024 * 1024, maxOutput = 49152, maxSide = 1568, maxPixels = 1_500_000, minSide = 64, deadlineMs = 10_000;
const jpegLadder = [85, 75, 65, 55] as const;

export type ResearchImageErrorCode = 'image_unsupported' | 'image_too_large' | 'image_busy' | 'image_timeout';
export class ResearchImageError extends Error {
  readonly code: ResearchImageErrorCode;
  constructor(code: ResearchImageErrorCode) { super(code); this.name = 'ResearchImageError'; this.code = code; }
}

let busy = false;
const startsWith = (data: Uint8Array, hex: string) => hex.length / 2 <= data.length && Buffer.from(data.subarray(0, hex.length / 2)).toString('hex') === hex;
function sniff(data: Uint8Array): 'png' | 'jpeg' | 'webp' | null {
  if (startsWith(data, '89504e470d0a1a0a')) return 'png';
  if (startsWith(data, 'ffd8ff')) return 'jpeg';
  if (data.length >= 12 && startsWith(data, '52494646') && Buffer.from(data.subarray(8, 12)).toString('latin1') === 'WEBP') return 'webp';
  return null;
}
/** APNG: an acTL chunk before the first IDAT. */
function animatedPng(data: Buffer): boolean {
  for (let offset = 8; offset + 8 <= data.length;) {
    const length = data.readUInt32BE(offset), type = data.toString('latin1', offset + 4, offset + 8);
    if (type === 'acTL') return true;
    if (type === 'IDAT' || type === 'IEND') return false;
    offset += length + 12;
  }
  return false;
}
function animatedWebp(data: Buffer): boolean {
  for (let offset = 12; offset + 8 <= data.length;) {
    const type = data.toString('latin1', offset, offset + 4), length = data.readUInt32LE(offset + 4);
    if (type === 'ANIM' || type === 'ANMF' || (type === 'VP8X' && offset + 9 <= data.length && (data[offset + 8] & 0x02) !== 0)) return true;
    offset += 8 + length + (length & 1);
  }
  return false;
}

async function normalize(input: Buffer, kind: 'png' | 'jpeg' | 'webp', limit: number): Promise<AdmittedResearchImage> {
  const options = { limitInputPixels: 24_000_000, failOn: 'error' as const };
  let meta;
  try { meta = await sharp(input, options).metadata(); }
  catch (error) { throw new ResearchImageError(/pixel limit/i.test(String((error as Error)?.message)) ? 'image_too_large' : 'image_unsupported'); }
  if (!meta.width || !meta.height || (meta.pages ?? 1) > 1) throw new ResearchImageError('image_unsupported');
  if (meta.width * meta.height > options.limitInputPixels) throw new ResearchImageError('image_too_large');
  const swap = (meta.orientation ?? 1) >= 5, width = swap ? meta.height : meta.width, height = swap ? meta.width : meta.height;
  const clamp = Math.min(1, maxSide / Math.max(width, height), Math.sqrt(maxPixels / (width * height)));
  const baseWidth = Math.max(1, Math.floor(width * clamp)), baseHeight = Math.max(1, Math.floor(height * clamp));
  const tryPng = kind === 'png' || (kind === 'webp' && meta.hasAlpha === true);
  const finish = (bytes: Buffer, mediaType: ResearchImageMediaType): AdmittedResearchImage => ({ bytes, mediaType, sha256: createHash('sha256').update(bytes).digest('hex'),
    dataUri: 'data:' + mediaType + ';base64,' + bytes.toString('base64'), name: mediaType === 'image/png' ? 'image.png' : 'image.jpg' });
  const resized = (w: number, h: number) => sharp(input, options).rotate().resize({ width: w, height: h, fit: 'inside', withoutEnlargement: true });
  try {
    // The first scale is always tried; further scales continue while the short side stays at least 64 px.
    for (let scale = 1; scale === 1 || Math.min(baseWidth, baseHeight) * scale >= minSide; scale *= 0.75) {
      const w = Math.max(1, Math.floor(baseWidth * scale)), h = Math.max(1, Math.floor(baseHeight * scale));
      if (tryPng) { const png = await resized(w, h).png({ compressionLevel: 9 }).toBuffer(); if (png.length <= limit) return finish(png, 'image/png'); }
      for (const quality of jpegLadder) {
        const jpeg = await resized(w, h).flatten({ background: '#ffffff' }).jpeg({ quality, mozjpeg: false }).toBuffer();
        if (jpeg.length <= limit) return finish(jpeg, 'image/jpeg');
      }
    }
  } catch (error) { if (error instanceof ResearchImageError) throw error; throw new ResearchImageError('image_unsupported'); }
  throw new ResearchImageError('image_too_large');
}

/** Host-side admission of one image: PNG/JPEG/WebP in, normalized PNG or JPEG of at most 49,152 B out. */
export async function admitResearchImage(bytes: Uint8Array, options: { maxOutput?: number } = {}): Promise<AdmittedResearchImage> {
  // shortcut: options.maxOutput can only lower the 49,152 B bound; it exists so the final-rejection path is testable.
  const limit = Math.min(maxOutput, Number.isSafeInteger(options.maxOutput) ? options.maxOutput as number : maxOutput);
  if (!(bytes instanceof Uint8Array)) throw new ResearchImageError('image_unsupported');
  const kind = sniff(bytes);
  if (!kind) throw new ResearchImageError('image_unsupported');
  if (bytes.length > maxInput) throw new ResearchImageError('image_too_large');
  const input = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (kind === 'png' && animatedPng(input) || kind === 'webp' && animatedWebp(input)) throw new ResearchImageError('image_unsupported');
  if (busy) throw new ResearchImageError('image_busy');
  busy = true;
  const work = normalize(input, kind, limit);
  // The lock is held until the work really ends, even if the deadline already answered the caller.
  work.then(() => { busy = false; }, () => { busy = false; });
  let timer: ReturnType<typeof setTimeout> | undefined;
  try { return await Promise.race([work, new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new ResearchImageError('image_timeout')), deadlineMs); })]); }
  finally { clearTimeout(timer); }
}
