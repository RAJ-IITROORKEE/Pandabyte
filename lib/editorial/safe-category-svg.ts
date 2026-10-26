import sharp from "sharp";
import { SaxesParser } from "saxes";
import { MAX_MEDIA_BYTES } from "./validation.ts";

export const MAX_CATEGORY_SVG_BYTES = 256 * 1024;
const MAX_PIXELS = 20_000_000;
const MAX_DIMENSION = 8192;
const MAX_NODES = 2048;
const MAX_DEPTH = 32;
const MAX_ATTRIBUTES = 32;
const MAX_ATTRIBUTE_LENGTH = 16_384;
const SVG_NS = "http://www.w3.org/2000/svg";
const XMLNS_NS = "http://www.w3.org/2000/xmlns/";
const NUMBER = "[+-]?(?:\\d+(?:\\.\\d*)?|\\.\\d+)(?:[eE][+-]?\\d+)?";
const NUMBER_LIST = new RegExp(`^\\s*${NUMBER}(?:(?:\\s*,\\s*|\\s+)${NUMBER})*\\s*$`);
const COLOR_NAMES = new Set([
  "black", "white", "red", "green", "blue", "yellow", "orange", "purple", "gray", "grey",
  "silver", "maroon", "olive", "lime", "aqua", "teal", "navy", "fuchsia", "magenta", "cyan",
]);
const SHAPES = new Set(["path", "rect", "circle", "ellipse", "line", "polyline", "polygon"]);
const SVG_ELEMENTS = new Set(["svg", "g", "defs", "path", "rect", "circle", "ellipse", "line", "polyline", "polygon", "linearGradient", "radialGradient", "stop", "clipPath"]);
const PRESENTATION = new Set([
  "fill", "fill-rule", "fill-opacity", "stroke", "stroke-width", "stroke-linecap", "stroke-linejoin",
  "stroke-miterlimit", "stroke-opacity", "opacity", "clip-rule", "clip-path", "transform",
]);
const COORDINATES = new Set(["x", "y", "cx", "cy", "x1", "y1", "x2", "y2"]);
const NONNEGATIVE_LENGTHS = new Set(["width", "height", "rx", "ry", "r", "fr", "stroke-width", "stroke-miterlimit"]);
const GRADIENT_COORDINATES = new Set(["x1", "y1", "x2", "y2", "cx", "cy", "r", "fx", "fy", "fr"]);
const ATTRIBUTES: Record<string, Set<string>> = {
  svg: new Set(["xmlns", "width", "height", "viewBox", "version", ...PRESENTATION]),
  g: new Set(["id", ...PRESENTATION]),
  defs: new Set(),
  path: new Set(["id", "d", ...PRESENTATION]),
  rect: new Set(["id", "x", "y", "width", "height", "rx", "ry", ...PRESENTATION]),
  circle: new Set(["id", "cx", "cy", "r", ...PRESENTATION]),
  ellipse: new Set(["id", "cx", "cy", "rx", "ry", ...PRESENTATION]),
  line: new Set(["id", "x1", "y1", "x2", "y2", ...PRESENTATION]),
  polyline: new Set(["id", "points", ...PRESENTATION]),
  polygon: new Set(["id", "points", ...PRESENTATION]),
  linearGradient: new Set(["id", "gradientUnits", "gradientTransform", "x1", "y1", "x2", "y2", "spreadMethod"]),
  radialGradient: new Set(["id", "gradientUnits", "gradientTransform", "cx", "cy", "r", "fx", "fy", "fr", "spreadMethod"]),
  stop: new Set(["offset", "stop-color", "stop-opacity"]),
  clipPath: new Set(["id", "clipPathUnits", "transform"]),
};
type SvgSize = { width: number; height: number };

function numberList(value: string): number[] | null {
  if (!NUMBER_LIST.test(value)) return null;
  const values = value.trim().split(/[\s,]+/).map(Number);
  return values.every(Number.isFinite) ? values : null;
}

function validLength(value: string, mode: "positive" | "nonnegative" | "coordinate"): number | null {
  const match = new RegExp(`^(${NUMBER})(?:px)?$`, "i").exec(value.trim());
  if (!match) return null;
  const parsed = Number(match[1]);
  if (!Number.isFinite(parsed) ||
    (mode === "positive" && parsed <= 0) || (mode === "nonnegative" && parsed < 0) ||
    (mode === "coordinate" && Math.abs(parsed) > 1_000_000) ||
    (mode !== "coordinate" && parsed > MAX_DIMENSION)) return null;
  return parsed;
}

function validColor(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  return normalized === "none" || normalized === "currentcolor" || normalized === "transparent" || COLOR_NAMES.has(normalized) ||
    /^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(normalized);
}

function localReference(value: string): string | null {
  return /^url\(\s*#([A-Za-z_][A-Za-z0-9_.-]{0,63})\s*\)$/i.exec(value.trim())?.[1] ?? null;
}

function validTransform(value: string): boolean {
  let rest = value.trim();
  let count = 0;
  while (rest) {
    const match = /^(matrix|translate|scale|rotate|skewX|skewY)\s*\(([^()]*)\)\s*(?:,\s*)?/i.exec(rest);
    if (!match || ++count > 32) return false;
    const values = numberList(match[2]);
    if (!values || values.some((item) => Math.abs(item) > 1_000_000)) return false;
    const name = match[1].toLowerCase();
    const validCount = name === "matrix" ? values.length === 6
      : name === "translate" || name === "scale" ? values.length === 1 || values.length === 2
        : name === "rotate" ? values.length === 1 || values.length === 3 : values.length === 1;
    if (!validCount) return false;
    rest = rest.slice(match[0].length).trim();
    if (!rest && /,\s*$/.test(match[0])) return false;
  }
  return count > 0;
}

function validPath(value: string): boolean {
  const tokens: (string | number)[] = [];
  const matcher = /[A-Za-z]|[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?/g;
  let last = 0;
  for (const match of value.matchAll(matcher)) {
    const gap = value.slice(last, match.index);
    const previous = tokens[tokens.length - 1];
    if (!/^(?:\s*,?\s*)?$/.test(gap) || (gap === "" && typeof previous === "number" && !/^[+-]/.test(match[0]))) return false;
    const token = match[0];
    if (/^[A-Za-z]$/.test(token)) tokens.push(token);
    else {
      const number = Number(token);
      if (!Number.isFinite(number) || Math.abs(number) > 1_000_000) return false;
      tokens.push(number);
    }
    if (tokens.length > 16_384) return false;
    last = match.index! + token.length;
  }
  if (!tokens.length || !/^\s*$/.test(value.slice(last)) || tokens[0] !== "M" && tokens[0] !== "m") return false;
  const arity: Record<string, number> = { M: 2, L: 2, H: 1, V: 1, C: 6, S: 4, Q: 4, T: 2, A: 7 };
  let index = 0, segments = 0;
  while (index < tokens.length) {
    const command = tokens[index++];
    if (typeof command !== "string" || !(command.toUpperCase() in arity) && command.toUpperCase() !== "Z") return false;
    const upper = command.toUpperCase();
    if (upper === "Z") continue;
    const start = index;
    while (index < tokens.length && typeof tokens[index] === "number") index++;
    const count = index - start, group = arity[upper];
    if (count < group || count % group !== 0) return false;
    for (let offset = start; offset < index; offset += group) {
      if (upper === "A" && ((tokens[offset] as number) < 0 || (tokens[offset + 1] as number) < 0 ||
        ![0, 1].includes(tokens[offset + 3] as number) || ![0, 1].includes(tokens[offset + 4] as number))) return false;
      if (++segments > 4096) return false;
    }
  }
  return true;
}

function validPoints(value: string): boolean {
  const values = numberList(value);
  return Boolean(values && values.length >= 4 && values.length % 2 === 0 && values.length <= 8192 && values.every((item) => Math.abs(item) <= 1_000_000));
}

function validateSvg(input: Buffer): SvgSize | null {
  if (!Buffer.isBuffer(input) || input.length < 1 || input.length > MAX_CATEGORY_SVG_BYTES) return null;
  let xml: string;
  try { xml = new TextDecoder("utf-8", { fatal: true }).decode(input); } catch { return null; }

  const stack: { name: string; insideClip: boolean }[] = [];
  const ids = new Set<string>();
  const referenceTargets = new Map<string, "gradient" | "clipPath">();
  const references: { id: string; type: "gradient" | "clipPath" }[] = [];
  let rootSize: SvgSize | null = null, nodeCount = 0, failed = false, rootSeen = false;
  const parser = new SaxesParser({ xmlns: true, fragment: false, forceXMLVersion: true, defaultXMLVersion: "1.0" });
  const reject = (): never => { throw new Error("invalid_svg"); };

  parser.on("error", () => { failed = true; });
  parser.on("doctype", reject);
  parser.on("processinginstruction", reject);
  parser.on("cdata", reject);
  parser.on("xmldecl", (declaration) => {
    if (declaration.version !== "1.0" || declaration.encoding && declaration.encoding.toLowerCase() !== "utf-8" ||
      declaration.standalone && !["yes", "no"].includes(declaration.standalone)) reject();
  });
  parser.on("text", (text) => { if (text.trim()) reject(); });
  parser.on("opentag", (tag) => {
    if (++nodeCount > MAX_NODES || stack.length >= MAX_DEPTH || !SVG_ELEMENTS.has(tag.name) || tag.uri !== SVG_NS || tag.prefix) reject();
    const parent = stack[stack.length - 1]?.name;
    if (!parent) {
      if (rootSeen || tag.name !== "svg") reject();
      rootSeen = true;
    } else if (
      parent === "svg" ? !["g", "defs", ...SHAPES].includes(tag.name) :
        parent === "g" ? !["g", ...SHAPES].includes(tag.name) :
          parent === "defs" ? !["linearGradient", "radialGradient", "clipPath"].includes(tag.name) :
            parent === "linearGradient" || parent === "radialGradient" ? tag.name !== "stop" :
              parent === "clipPath" ? !["g", ...SHAPES].includes(tag.name) : true
    ) reject();
    const attrs = Object.values(tag.attributes);
    if (attrs.length > MAX_ATTRIBUTES) reject();
    const values: Record<string, string> = Object.create(null);
    for (const raw of attrs) {
      const attr = raw as { name: string; value: string; uri: string; prefix?: string };
      if (attr.name === "xmlns" && tag.name === "svg" && !parent && attr.value === SVG_NS && attr.uri === XMLNS_NS) continue;
      if (attr.prefix || attr.uri || !ATTRIBUTES[tag.name].has(attr.name) || attr.value.length > MAX_ATTRIBUTE_LENGTH) reject();
      values[attr.name] = attr.value;
    }
    if (tag.name === "svg") {
      if (tag.ns[""] !== SVG_NS) reject();
      const hasWidth = Object.prototype.hasOwnProperty.call(values, "width");
      const hasHeight = Object.prototype.hasOwnProperty.call(values, "height");
      if (hasWidth !== hasHeight) reject();
      let box: number[] | null = null;
      if (values.viewBox !== undefined) {
        box = numberList(values.viewBox);
        if (!box || box.length !== 4 || box[2] <= 0 || box[3] <= 0 || box.slice(0, 2).some((item) => Math.abs(item) > 1_000_000) || box[2] > 1_000_000 || box[3] > 1_000_000) reject();
      }
      const width = hasWidth ? validLength(values.width, "positive") : box?.[2] ?? null;
      const height = hasHeight ? validLength(values.height, "positive") : box?.[3] ?? null;
      if (width === null || height === null || width > MAX_DIMENSION || height > MAX_DIMENSION || width * height > MAX_PIXELS) throw new Error("invalid_svg");
      if (values.version && values.version !== "1.1") reject();
      if (!hasWidth && !box) reject();
      rootSize = { width, height };
    }
    if (tag.name === "defs" && parent !== "svg" || (tag.name === "linearGradient" || tag.name === "radialGradient" || tag.name === "clipPath") && parent !== "defs") reject();
    if (tag.name === "stop" && parent !== "linearGradient" && parent !== "radialGradient") reject();
    if ("id" in values) {
      const id = values.id;
      if (!id || !["g", ...SHAPES, "linearGradient", "radialGradient", "clipPath"].includes(tag.name) ||
        !/^[A-Za-z_][A-Za-z0-9_.-]{0,63}$/.test(id) || ids.has(id)) reject();
      ids.add(id);
      if (tag.name === "clipPath") referenceTargets.set(id, "clipPath");
      else if (tag.name === "linearGradient" || tag.name === "radialGradient") referenceTargets.set(id, "gradient");
    }
    for (const [name, value] of Object.entries(values)) {
      if ((tag.name === "linearGradient" || tag.name === "radialGradient") && GRADIENT_COORDINATES.has(name)) {
        const match = new RegExp(`^(${NUMBER})(%)?$`).exec(value.trim());
        if (!match || !Number.isFinite(Number(match[1])) || Math.abs(Number(match[1])) > 1_000_000 ||
          (name === "r" || name === "fr") && Number(match[1]) < 0 || match[2] && Math.abs(Number(match[1])) > 100) reject();
      } else if (COORDINATES.has(name) || NONNEGATIVE_LENGTHS.has(name)) {
        if (validLength(value, COORDINATES.has(name) ? "coordinate" : (name === "width" || name === "height") && tag.name === "svg" ? "positive" : "nonnegative") === null) reject();
      } else if (["fill", "stroke"].includes(name)) {
        if (!validColor(value)) {
          const id = localReference(value);
          if (!id || stack.some((frame) => frame.insideClip)) throw new Error("invalid_svg");
          references.push({ id, type: "gradient" });
        }
      } else if (name === "clip-path") {
        if (value !== "none") {
          const id = localReference(value);
          if (!id || stack.some((frame) => frame.insideClip)) throw new Error("invalid_svg");
          references.push({ id, type: "clipPath" });
        }
      } else if (["opacity", "fill-opacity", "stroke-opacity", "stop-opacity"].includes(name)) {
        const match = /^((?:\d+(?:\.\d*)?|\.\d+))(%)?$/.exec(value.trim());
        if (!match || Number(match[1]) > (match[2] ? 100 : 1)) reject();
      } else if (["stop-color"].includes(name)) {
        if (!validColor(value)) reject();
      } else if (name === "offset") {
        const match = /^((?:\d+(?:\.\d*)?|\.\d+))(%)?$/.exec(value.trim());
        if (!match || Number(match[1]) > (match[2] ? 100 : 1)) reject();
      } else if (["transform", "gradientTransform"].includes(name)) {
        if (!validTransform(value)) reject();
      } else if (name === "d") {
        if (!validPath(value)) reject();
      } else if (name === "points") {
        if (!validPoints(value)) reject();
      } else if (["fill-rule", "clip-rule"].includes(name)) {
        if (!["nonzero", "evenodd"].includes(value)) reject();
      } else if (name === "stroke-linecap") {
        if (!["butt", "round", "square"].includes(value)) reject();
      } else if (name === "stroke-linejoin") {
        if (!["miter", "round", "bevel"].includes(value)) reject();
      } else if (name === "gradientUnits") {
        if (!["objectBoundingBox", "userSpaceOnUse"].includes(value)) reject();
      } else if (name === "clipPathUnits") {
        if (!["userSpaceOnUse", "objectBoundingBox"].includes(value)) reject();
      } else if (name === "spreadMethod") {
        if (!["pad", "reflect", "repeat"].includes(value)) reject();
      }
    }
    stack.push({ name: tag.name, insideClip: tag.name === "clipPath" || Boolean(stack[stack.length - 1]?.insideClip) });
  });
  parser.on("closetag", () => { stack.pop(); });

  try { parser.write(xml).close(); } catch { return null; }
  if (failed || !rootSeen || stack.length || !rootSize || references.some(({ id, type }) => referenceTargets.get(id) !== type)) return null;
  return rootSize;
}

export async function prepareSafeCategorySvg(input: Buffer) {
  const size = validateSvg(input);
  if (!size) return null;
  try {
    const image = sharp(input, { limitInputPixels: MAX_PIXELS, animated: false, failOn: "error" });
    const metadata = await image.metadata();
    if (metadata.format !== "svg" || !metadata.width || !metadata.height || metadata.width > MAX_DIMENSION || metadata.height > MAX_DIMENSION || metadata.width * metadata.height > MAX_PIXELS) return null;
    const { data, info } = await image.webp({ quality: 90, alphaQuality: 100 }).toBuffer({ resolveWithObject: true });
    if (info.format !== "webp" || !info.width || !info.height || info.width > MAX_DIMENSION || info.height > MAX_DIMENSION ||
      info.width * info.height > MAX_PIXELS || data.byteLength < 1 || data.byteLength > MAX_MEDIA_BYTES) return null;
    return { bytes: data, mimeType: "image/webp" as const, extension: "webp" as const, width: info.width, height: info.height };
  } catch { return null; }
}
