import "server-only";
import sharp from "sharp";
import { MAX_MEDIA_BYTES } from "./validation.ts";
import { validateProductGlb } from "./glb-validation.ts";
import { DOCX_MIME, validateProductDocx } from "./docx-validation.ts";
import { prepareSafeCategorySvg } from "./safe-category-svg.ts";
import { prepareEditorialDownload } from "./media-delivery.ts";

export async function prepareEditorialFile(file: File) {
  if (!/^[\p{L}\p{N}][\p{L}\p{N} ._()-]{0,119}$/u.test(file.name) || file.size < 1 || file.size > MAX_MEDIA_BYTES) return null;
  const input = Buffer.from(await file.arrayBuffer());
  if (file.type === "image/svg+xml" && /\.svg$/i.test(file.name)) return prepareSafeCategorySvg(input);
  if (["", "application/octet-stream", DOCX_MIME].includes(file.type) && /\.docx$/i.test(file.name)) {
    const document = await validateProductDocx(input);
    return document ? { bytes: input, mimeType: DOCX_MIME, extension: "docx", width: null, height: null, document } : null;
  }
  if (["", "application/octet-stream", "model/gltf-binary"].includes(file.type) && /\.glb$/i.test(file.name)) {
    const model = await validateProductGlb(input);
    return model ? { bytes: input, mimeType: "model/gltf-binary", extension: "glb", width: null, height: null, model } : null;
  }
  if (file.type === "application/pdf" && /\.pdf$/i.test(file.name)) {
    return file.size <= 2 * 1024 * 1024 && input.subarray(0, 5).toString("ascii") === "%PDF-"
      ? { bytes: input, mimeType: "application/pdf", extension: "pdf", width: null, height: null } : null;
  }
  if (!["image/png", "image/jpeg", "image/webp"].includes(file.type) || !/\.(png|jpe?g|webp)$/i.test(file.name)) return null;
  try {
    const image = sharp(input, { limitInputPixels: 20000000, animated: false, failOn: "error" });
    const metadata = await image.metadata();
    const expectedFormat = file.type === "image/jpeg" ? "jpeg" : file.type.slice(6);
    if (metadata.format !== expectedFormat || !metadata.width || !metadata.height || metadata.width > 8192 || metadata.height > 8192 || (metadata.pages ?? 1) !== 1) return null;
    if (metadata.format === "webp") {
      const original = await prepareEditorialDownload(input, { mimeType: "image/webp", byteSize: input.length, width: metadata.width, height: metadata.height });
      if (original) return original;
    }
    const { data, info } = await image.rotate().webp({ lossless: true, exact: true }).toBuffer({ resolveWithObject: true });
    return data.byteLength <= MAX_MEDIA_BYTES
      ? { bytes: data, mimeType: "image/webp", extension: "webp", width: info.width, height: info.height } : null;
  } catch { return null; }
}
