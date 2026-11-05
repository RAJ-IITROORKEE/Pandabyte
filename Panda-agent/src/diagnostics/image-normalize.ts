import { createHash } from 'node:crypto';
import sharp from 'sharp';

const MAX_BYTES = 2 * 1024 * 1024, MAX_PIXELS = 4194304;
let decoding = false;
function exactContainer(data: Uint8Array, type: string): boolean {
  if (type === 'image/jpeg') {
    if (data.length < 4 || data[0] !== 0xff || data[1] !== 0xd8) return false;
    let offset = 2, scan = false;
    while (offset < data.length) {
      if (scan && data[offset] !== 0xff) { offset++; continue; }
      if (data[offset++] !== 0xff) return false;
      while (offset < data.length && data[offset] === 0xff) offset++;
      if (offset >= data.length) return false;
      const marker = data[offset++];
      if (scan && (marker === 0x00 || (marker >= 0xd0 && marker <= 0xd7))) continue;
      if (marker === 0xd9) return offset === data.length;
      if (marker === 0xd8 || marker === 0x00 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7) || offset + 2 > data.length) return false;
      const length = (data[offset] << 8) | data[offset + 1];
      if (length < 2 || offset + length > data.length) return false;
      offset += length; scan = marker === 0xda;
    }
    return false;
  }
  if (data.length < 20 || ![0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a].every((value, index) => data[index] === value)) return false;
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  let offset = 8;
  while (offset + 12 <= data.length) {
    const length = view.getUint32(offset), end = offset + length + 12;
    if (end > data.length) return false;
    const name = String.fromCharCode(...data.subarray(offset + 4, offset + 8));
    if (name === 'acTL' || name === 'fcTL' || name === 'fdAT') return false;
    if (name === 'IEND') return length === 0 && end === data.length;
    offset = end;
  }
  return false;
}

export async function normalizeDiagnosticImage(bytes: Uint8Array, declaredType: string): Promise<{ bytes: Uint8Array; sha256: string; width: number; height: number; mediaType: 'image/png' }> {
  if (decoding) throw new Error('busy');
  if (!bytes.byteLength || bytes.byteLength > MAX_BYTES || !['image/png', 'image/jpeg'].includes(declaredType) || !exactContainer(bytes, declaredType)) throw new Error('invalid');
  decoding = true;
  const work = (async () => {
    const image = sharp(bytes, { limitInputPixels: MAX_PIXELS, animated: true, failOn: 'error' }).timeout({ seconds: 5 });
    const meta = await image.metadata();
    if (meta.format !== (declaredType === 'image/png' ? 'png' : 'jpeg') || !meta.width || !meta.height || meta.width > 2048 || meta.height > 2048 || meta.width * meta.height > MAX_PIXELS || (meta.pages ?? 1) !== 1) throw new Error('invalid');
    const output = await image.rotate().png().toBuffer({ resolveWithObject: true });
    if (!output.data.length || output.data.length > MAX_BYTES || output.info.width > 2048 || output.info.height > 2048) throw new Error('invalid');
    return { bytes: new Uint8Array(output.data), sha256: createHash('sha256').update(output.data).digest('hex'), width: output.info.width, height: output.info.height, mediaType: 'image/png' as const };
  })().finally(() => { decoding = false; });
  let timer: ReturnType<typeof setTimeout> | undefined;
  try { return await Promise.race([work, new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('timeout')), 5000); })]); }
  finally { if (timer) clearTimeout(timer); }
}
