import { createHash } from "node:crypto";
import sharp from "sharp";

export const INQUIRY_BUCKET = "private-inquiry-attachments";
export const MAX_INQUIRY_ATTACHMENT_BYTES = 1024 * 1024;
export const MAX_INQUIRY_REQUEST_BYTES = 3 * MAX_INQUIRY_ATTACHMENT_BYTES + 64 * 1024;
export type InquiryAttachment = { filename: string; mimeType: string; size: number; sha256: string; key: string; bytes: Uint8Array };

export async function prepareInquiryAttachment(file: File, requestId: string, index: number): Promise<InquiryAttachment | null> {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9 _.-]{0,115}\.(pdf|jpe?g|png|webp)$/i.test(file.name) || file.size < 1 || file.size > MAX_INQUIRY_ATTACHMENT_BYTES) return null;
  const bytes = new Uint8Array(await file.arrayBuffer());
  const ext = file.name.split(".").pop()!.toLowerCase();
  const type = file.type.toLowerCase();
  const sig = (...values: number[]) => values.every((value, i) => bytes[i] === value);
  const valid = ext === "pdf" ? type === "application/pdf" && sig(0x25, 0x50, 0x44, 0x46, 0x2d)
    : ext === "png" ? type === "image/png" && sig(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)
    : ext === "webp" ? type === "image/webp" && sig(0x52, 0x49, 0x46, 0x46) && bytes.length >= 12 && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP"
    : type === "image/jpeg" && sig(0xff, 0xd8, 0xff);
  if (!valid || bytes.length !== file.size) return null;
  if (type.startsWith("image/")) {
    try {
      const image = sharp(bytes, { limitInputPixels: 16_000_000, failOn: "error" });
      const metadata = await image.metadata();
      const expected = type === "image/jpeg" ? "jpeg" : type.slice(6);
      if (metadata.format !== expected || !metadata.width || !metadata.height || metadata.width > 4096 || metadata.height > 4096 || (metadata.pages ?? 1) !== 1) return null;
      await image.raw().toBuffer();
    } catch { return null; }
  }
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  return { filename: file.name, mimeType: type, size: bytes.length, sha256, key: `inquiries/${requestId.toLowerCase()}/${index}-${sha256}`, bytes };
}
