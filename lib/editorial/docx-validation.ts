import { createHash } from "node:crypto";
import { crc32, inflateRawSync } from "node:zlib";
import { posix } from "node:path";
import { SaxesParser } from "saxes";
import sharp from "sharp";
import { MAX_MEDIA_BYTES } from "./validation.ts";

export const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const MAX_EXPANDED = 24 * 1024 * 1024;

// Inspect directory sizes before inflating; the inflater independently enforces those limits.
export async function validateProductDocx(input: Buffer): Promise<{ sha256: string } | null> {
  try {
    if (input.length < 22 || input.length > MAX_MEDIA_BYTES) return null;
    let end = input.length - 22;
    for (; end >= Math.max(0, input.length - 65557); end--) if (input.readUInt32LE(end) === 0x06054b50 && end + 22 + input.readUInt16LE(end + 20) === input.length) break;
    if (end < 0 || input.readUInt32LE(end) !== 0x06054b50 || end + 22 + input.readUInt16LE(end + 20) !== input.length || input.readUInt16LE(end + 4) || input.readUInt16LE(end + 6)) return null;
    const count = input.readUInt16LE(end + 10), centralSize = input.readUInt32LE(end + 12), centralStart = input.readUInt32LE(end + 16);
    if (!count || count > 256 || count !== input.readUInt16LE(end + 8) || centralStart + centralSize !== end) return null;
    const entries = new Map<string, Buffer>(), spans: [number, number][] = [];
    let offset = centralStart, expanded = 0, imagePixels = 0, imageCount = 0;
    for (let i = 0; i < count; i++) {
      if (offset + 46 > end || input.readUInt32LE(offset) !== 0x02014b50) return null;
      const flags = input.readUInt16LE(offset + 8), method = input.readUInt16LE(offset + 10), crc = input.readUInt32LE(offset + 16);
      const compressed = input.readUInt32LE(offset + 20), size = input.readUInt32LE(offset + 24), nameLength = input.readUInt16LE(offset + 28), extraLength = input.readUInt16LE(offset + 30), commentLength = input.readUInt16LE(offset + 32), local = input.readUInt32LE(offset + 42);
      const name = new TextDecoder("utf-8", { fatal: true }).decode(input.subarray(offset + 46, offset + 46 + nameLength));
      offset += 46 + nameLength + extraLength + commentLength;
      if (offset > end || (flags & ~0x0808) || ![0, 8].includes(method) || !name || name.length > 240 || !/^[A-Za-z0-9_[\]. /()-]+$/.test(name) || name.startsWith("/") || name.includes("//") || name.split("/").some(p => p === ".." || p === ".") || entries.has(name) || local + 30 > centralStart || input.readUInt32LE(local) !== 0x04034b50 || input.readUInt16LE(local + 6) !== flags || input.readUInt16LE(local + 8) !== method) return null;
      if (size > 8 * 1024 * 1024 || (expanded += size) > MAX_EXPANDED || compressed > MAX_MEDIA_BYTES) return null;
      const localNameLength = input.readUInt16LE(local + 26), start = local + 30 + localNameLength + input.readUInt16LE(local + 28), finish = start + compressed;
      if (finish > centralStart || input.subarray(local + 30, local + 30 + localNameLength).toString("utf8") !== name || spans.some(([a,b]) => local < b && finish > a)) return null;
      spans.push([local, finish]);
      const bytes = method === 0 ? input.subarray(start, finish) : inflateRawSync(input.subarray(start, finish), { maxOutputLength: Math.max(1, Math.min(size, MAX_EXPANDED)) });
      if (bytes.length !== size || crc32(bytes) !== crc) return null;
      entries.set(name, bytes);
    }
    if (offset !== end || !entries.has("[Content_Types].xml") || !entries.has("word/document.xml") || !entries.has("_rels/.rels")) return null;
    let wordType = false, documentRoot = false, officeRelation = false, xmlElements = 0, documentParagraphs = 0, documentText = 0;
    for (const [name, bytes] of entries) {
      if (name.endsWith("/")) { if (bytes.length) return null; continue; }
      if (/\.(xml|rels)$/i.test(name)) {
        if (bytes.length > 2 * 1024 * 1024) return null;
        const xml = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
        const parser = new SaxesParser({ xmlns: true });
        parser.on("doctype", () => { throw new Error("doctype"); });
        parser.on("opentag", tag => {
          if (++xmlElements > 50000 || (name === "word/document.xml" && tag.local === "p" && ++documentParagraphs > 2000)) throw new Error("document complexity");
          if (["altChunk", "object", "OLEObject"].includes(tag.local)) throw new Error("embedded content");
          const attr = (key: string) => Object.values(tag.attributes).find(a => a.local === key)?.value;
          if (name === "[Content_Types].xml") {
            const contentType = attr("ContentType") ?? "";
            if (/macro|vba|oleObject|activeX|html/i.test(contentType)) throw new Error("active content");
            if (attr("PartName") === "/word/document.xml" && contentType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml") wordType = true;
          }
          if (name === "word/document.xml" && tag.local === "document" && ["http://schemas.openxmlformats.org/wordprocessingml/2006/main", "http://purl.oclc.org/ooxml/wordprocessingml/main"].includes(tag.uri)) documentRoot = true;
          if (name.endsWith(".rels") && tag.local === "Relationship") {
            const target = attr("Target") ?? "", mode = attr("TargetMode"), type = attr("Type") ?? "";
            if (!target || /[\u0000-\u0020\u007f\\]/.test(target)) throw new Error("relationship");
            if (mode === "External") {
              const url = new URL(target);
              if (!type.endsWith("/hyperlink") || url.protocol !== "https:" || url.username || url.password) throw new Error("external resource");
            } else {
              if (mode || target.includes(":") || target.includes("%")) throw new Error("relationship");
              const base = name === "_rels/.rels" ? "" : posix.dirname(posix.dirname(name));
              const resolved = posix.normalize(target.startsWith("/") ? target.slice(1) : posix.join(base, target.split("#")[0]));
              if (resolved.startsWith("../") || !entries.has(resolved)) throw new Error("missing part");
              if (name === "_rels/.rels" && type.endsWith("/officeDocument") && resolved === "word/document.xml") officeRelation = true;
            }
          }
        });
        parser.on("text", text => { if (name === "word/document.xml" && (documentText += text.length) > 500000) throw new Error("document text limit"); });
        parser.write(xml).close();
      } else if (/\.(png|jpe?g|gif|webp)$/i.test(name)) {
        if (++imageCount > 20) return null;
        const meta = await sharp(bytes, { limitInputPixels: 6000000, animated: false }).metadata();
        if (!meta.width || !meta.height || !["png", "jpeg", "gif", "webp"].includes(meta.format ?? "") || (meta.pages ?? 1) !== 1 || (imagePixels += meta.width * meta.height) > 12000000) return null;
      } else if (!/\.(odttf|ttf|woff2?)$/i.test(name)) return null;
    }
    return wordType && documentRoot && officeRelation ? { sha256: createHash("sha256").update(input).digest("hex") } : null;
  } catch { return null; }
}
