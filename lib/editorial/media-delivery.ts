import sharp from "sharp";
import { MAX_MEDIA_BYTES } from "./validation.ts";

type StoredMedia = { mimeType: string; byteSize: number; width: number | null; height: number | null };
type EditorialImageSize = 96 | 960;

export function parseEditorialImageSize(params: URLSearchParams): EditorialImageSize | undefined | null {
  const sizes = params.getAll("w");
  if (sizes.length === 0) return undefined;
  if (sizes.length !== 1) return null;
  return sizes[0] === "96" ? 96 : sizes[0] === "960" ? 960 : null;
}

// Original reads validate normalized upload bytes; only requested previews are re-encoded.
export async function prepareEditorialDownload(input: Buffer, media: StoredMedia, size?: EditorialImageSize) {
  if (size !== undefined && size !== 96 && size !== 960) return null;
  if (!Number.isSafeInteger(media.byteSize) || media.byteSize < 1 || media.byteSize > MAX_MEDIA_BYTES || input.length !== media.byteSize) return null;
  if (media.mimeType === "application/pdf") {
    return size === undefined && input.length <= 2 * 1024 * 1024 && input.subarray(0, 5).toString("latin1") === "%PDF-" && media.width === null && media.height === null
      ? { bytes: input, mimeType: "application/pdf", extension: "pdf", width: null, height: null } : null;
  }
  if (media.mimeType !== "image/webp" || !Number.isInteger(media.width) || !Number.isInteger(media.height) ||
    media.width! < 1 || media.height! < 1 || media.width! > 8192 || media.height! > 8192 || media.width! * media.height! > 20000000 ||
    input.length < 20 || input.toString("latin1", 0, 4) !== "RIFF" || input.toString("latin1", 8, 12) !== "WEBP" ||
    input.readUInt32LE(4) !== input.length - 8) return null;

  // Reject metadata/animation/unknown chunks and trailing payloads before preserving a container.
  const chunks = new Set<string>();
  for (let offset = 12; offset < input.length;) {
    if (offset + 8 > input.length) return null;
    const kind = input.toString("latin1", offset, offset + 4);
    if (!["VP8 ", "VP8L", "VP8X", "ALPH"].includes(kind) || chunks.has(kind) ||
      (["VP8 ", "VP8L"].includes(kind) && (chunks.has("VP8 ") || chunks.has("VP8L")))) return null;
    chunks.add(kind);
    const length = input.readUInt32LE(offset + 4);
    offset += 8 + length + (length % 2);
    if (offset > input.length) return null;
  }
  if (!chunks.has("VP8 ") && !chunks.has("VP8L")) return null;
  try {
    const image = sharp(input, { limitInputPixels: 20000000, animated: false, failOn: "error" });
    const metadata = await image.metadata();
    if (metadata.format !== "webp" || (metadata.pages ?? 1) !== 1 || metadata.width !== media.width || metadata.height !== media.height ||
      metadata.exif || metadata.icc || metadata.iptc || metadata.xmp) return null;
    // Statistics force pixel decoding without returning a full raw pixel Buffer to JavaScript.
    await image.stats();
    if (size === undefined || (metadata.width <= size && metadata.height <= size)) {
      return { bytes: input, mimeType: "image/webp", extension: "webp", width: metadata.width, height: metadata.height };
    }
    const { data, info } = await image.clone().resize(size, size, { fit: "inside", withoutEnlargement: true }).webp({ quality: 85 }).toBuffer({ resolveWithObject: true });
    if (info.format !== "webp" || info.width < 1 || info.height < 1 || info.width > size || info.height > size || data.byteLength > MAX_MEDIA_BYTES) return null;
    return { bytes: data, mimeType: "image/webp", extension: "webp", width: info.width, height: info.height };
  } catch { return null; }
}
