import { createHash } from "node:crypto";
import sharp from "sharp";
import { MAX_MEDIA_BYTES } from "./validation.ts";

export const MAX_PRODUCT_GLB_BYTES = MAX_MEDIA_BYTES;
export const MAX_PRODUCT_GLB_TRIANGLES = 2_000_000;

const MAX_JSON_BYTES = 1024 * 1024;
const MAX_NODES = 2048;
const MAX_MESHES = 256;
const MAX_MATERIALS = 128;
const MAX_ACCESSORS = 4096;
const MAX_BUFFER_VIEWS = 4096;
const MAX_IMAGES = 32;
const MAX_TEXTURES = 64;
const MAX_SAMPLERS = 16;
const MAX_SCENES = 16;
const MAX_IMAGE_PIXELS = 20_000_000;
const MAX_FLOAT_MAGNITUDE = 1_000_000_000;
const MAX_ACCESSOR_COMPONENTS = 8_000_000;
const ALLOWED_EXTENSIONS = new Set(["KHR_mesh_quantization", "EXT_texture_webp"]);
const COMPONENT_BYTES = new Map([[5120, 1], [5121, 1], [5122, 2], [5123, 2], [5125, 4], [5126, 4]]);
const TYPE_COMPONENTS = new Map([["SCALAR", 1], ["VEC2", 2], ["VEC3", 3], ["VEC4", 4]]);

type JsonObject = Record<string, unknown>;
type BufferView = { byteOffset: number; byteLength: number; byteStride?: number; target?: number };
type Accessor = {
  bufferView: number;
  byteOffset: number;
  componentType: number;
  count: number;
  type: string;
  normalized: boolean;
};

function isObject(value: unknown): value is JsonObject {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isIndex(value: unknown, length: number): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0 && (value as number) < length;
}

function integer(value: unknown, minimum = 0, maximum = Number.MAX_SAFE_INTEGER): value is number {
  return Number.isSafeInteger(value) && (value as number) >= minimum && (value as number) <= maximum;
}

function numberArray(value: unknown, length: number, minimum = -Infinity, maximum = Infinity): value is number[] {
  return Array.isArray(value) && value.length === length && value.every((item) =>
    typeof item === "number" && Number.isFinite(item) && item >= minimum && item <= maximum);
}

function onlyKeys(value: JsonObject, keys: readonly string[]): boolean {
  return Object.keys(value).every((key) => keys.includes(key));
}

function hasUri(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(hasUri);
  if (!isObject(value)) return false;
  return Object.entries(value).some(([key, child]) => /uri/i.test(key) || hasUri(child));
}

function readComponent(bytes: Buffer, offset: number, componentType: number): number | null {
  if (offset < 0 || offset + (COMPONENT_BYTES.get(componentType) ?? Infinity) > bytes.length) return null;
  switch (componentType) {
    case 5120: return bytes.readInt8(offset);
    case 5121: return bytes.readUInt8(offset);
    case 5122: return bytes.readInt16LE(offset);
    case 5123: return bytes.readUInt16LE(offset);
    case 5125: return bytes.readUInt32LE(offset);
    case 5126: {
      const value = bytes.readFloatLE(offset);
      return Number.isFinite(value) ? value : null;
    }
    default: return null;
  }
}

async function validateImage(bytes: Buffer, mimeType: unknown): Promise<number | null> {
  const allowed = new Map([
    ["image/png", "png"],
    ["image/jpeg", "jpeg"],
    ["image/webp", "webp"],
  ]);
  const format = typeof mimeType === "string" ? allowed.get(mimeType) : undefined;
  if (!format || bytes.length === 0) return null;
  try {
    const image = sharp(bytes, { limitInputPixels: MAX_IMAGE_PIXELS, animated: false, failOn: "error" });
    const metadata = await image.metadata();
    if (metadata.format !== format || (metadata.pages ?? 1) !== 1 || !metadata.width || !metadata.height ||
      metadata.width > 4096 || metadata.height > 4096 || metadata.width * metadata.height > MAX_IMAGE_PIXELS ||
      metadata.exif || metadata.iptc || metadata.xmp) return null;
    await image.stats();
    return metadata.width * metadata.height;
  } catch {
    return null;
  }
}

function parseJsonChunk(input: Buffer, length: number): JsonObject | null {
  if (length < 4 || length > MAX_JSON_BYTES || length % 4 !== 0 || 20 + length > input.length) return null;
  try {
    const json = new TextDecoder("utf-8", { fatal: true }).decode(input.subarray(20, 20 + length));
    const parsed: unknown = JSON.parse(json);
    return isObject(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function checkExtensions(document: JsonObject): boolean {
  const used = document.extensionsUsed ?? [];
  const required = document.extensionsRequired ?? [];
  if (!Array.isArray(used) || !Array.isArray(required) || used.some((value) => typeof value !== "string" || !ALLOWED_EXTENSIONS.has(value)) ||
    required.some((value) => typeof value !== "string" || !used.includes(value)) ||
    new Set(used).size !== used.length || new Set(required).size !== required.length) return false;

  let valid = true;
  const declared = new Set(used as string[]);
  const visit = (value: unknown, parentKey = "") => {
    if (Array.isArray(value)) {
      for (const child of value) visit(child, parentKey);
      return;
    }
    if (!isObject(value)) return;
    if (Object.hasOwn(value, "extensions")) {
      if (parentKey !== "textures" || !isObject(value.extensions) || !onlyKeys(value.extensions, ["EXT_texture_webp"]) ||
        Object.keys(value.extensions).some((name) => !declared.has(name))) valid = false;
      else {
        const webp = value.extensions.EXT_texture_webp;
        if (!isObject(webp) || !onlyKeys(webp, ["source"]) || !integer(webp.source)) valid = false;
      }
    }
    for (const [key, child] of Object.entries(value)) visit(child, key);
  };
  visit(document);
  return valid;
}

function validateContainer(input: Buffer): { document: JsonObject; binary: Buffer } | null {
  if (!Buffer.isBuffer(input) || input.length < 28 || input.length > MAX_PRODUCT_GLB_BYTES ||
    input.toString("latin1", 0, 4) !== "glTF" || input.readUInt32LE(4) !== 2 || input.readUInt32LE(8) !== input.length) return null;
  const jsonLength = input.readUInt32LE(12);
  if (input.readUInt32LE(16) !== 0x4e4f534a) return null;
  const document = parseJsonChunk(input, jsonLength);
  if (!document) return null;
  let offset = 20 + jsonLength;
  if (offset + 8 > input.length || input.readUInt32LE(offset + 4) !== 0x004e4942) return null;
  const binaryLength = input.readUInt32LE(offset);
  offset += 8;
  if (binaryLength === 0 || offset + binaryLength !== input.length) return null;
  const binary = input.subarray(offset, offset + binaryLength);
  if (hasUri(document) || !checkExtensions(document)) return null;
  return { document, binary };
}

function validateNumberArray(value: unknown, expected: number, minimum: number, maximum: number): boolean {
  return numberArray(value, expected, minimum, maximum);
}

async function validateDocument(document: JsonObject, binary: Buffer): Promise<number | null> {
  const allowedRoot = ["asset", "scene", "scenes", "nodes", "meshes", "materials", "textures", "images", "samplers", "accessors", "bufferViews", "buffers", "extensionsUsed", "extensionsRequired"];
  if (!onlyKeys(document, allowedRoot) || !isObject(document.asset) || !onlyKeys(document.asset, ["version", "minVersion", "generator", "copyright"]) ||
    document.asset.version !== "2.0" || (document.asset.minVersion !== undefined && document.asset.minVersion !== "2.0")) return null;

  const arrays = ["scenes", "nodes", "meshes", "materials", "textures", "images", "samplers", "accessors", "bufferViews", "buffers"] as const;
  for (const name of arrays) if (document[name] !== undefined && !Array.isArray(document[name])) return null;
  const scenes = (document.scenes ?? []) as unknown[];
  const nodes = (document.nodes ?? []) as unknown[];
  const meshes = (document.meshes ?? []) as unknown[];
  const materials = (document.materials ?? []) as unknown[];
  const textures = (document.textures ?? []) as unknown[];
  const images = (document.images ?? []) as unknown[];
  const samplers = (document.samplers ?? []) as unknown[];
  const accessorsRaw = (document.accessors ?? []) as unknown[];
  const viewsRaw = (document.bufferViews ?? []) as unknown[];
  const buffers = (document.buffers ?? []) as unknown[];
  if (scenes.length < 1 || scenes.length > MAX_SCENES || nodes.length > MAX_NODES || meshes.length < 1 || meshes.length > MAX_MESHES ||
    materials.length > MAX_MATERIALS || textures.length > MAX_TEXTURES || images.length > MAX_IMAGES || samplers.length > MAX_SAMPLERS ||
    accessorsRaw.length < 1 || accessorsRaw.length > MAX_ACCESSORS || viewsRaw.length < 1 || viewsRaw.length > MAX_BUFFER_VIEWS || buffers.length !== 1 ||
    !isIndex(document.scene, scenes.length)) return null;

  const buffer = buffers[0];
  if (!isObject(buffer) || !onlyKeys(buffer, ["byteLength"]) || !integer(buffer.byteLength, 1, binary.length) || binary.length - buffer.byteLength > 3) return null;
  for (let i = buffer.byteLength as number; i < binary.length; i++) if (binary[i] !== 0) return null;

  const views: BufferView[] = [];
  for (const raw of viewsRaw) {
    if (!isObject(raw) || !onlyKeys(raw, ["buffer", "byteOffset", "byteLength", "byteStride", "target"]) || raw.buffer !== 0 ||
      !integer(raw.byteOffset ?? 0, 0, binary.length) || !integer(raw.byteLength, 1, binary.length) ||
      ((raw.byteOffset as number | undefined) ?? 0) + (raw.byteLength as number) > (buffer.byteLength as number) ||
      (raw.byteStride !== undefined && (!integer(raw.byteStride, 4, 252) || (raw.byteStride as number) % 4 !== 0)) ||
      (raw.target !== undefined && raw.target !== 34962 && raw.target !== 34963)) return null;
    views.push({ byteOffset: (raw.byteOffset as number | undefined) ?? 0, byteLength: raw.byteLength as number,
      ...(raw.byteStride === undefined ? {} : { byteStride: raw.byteStride as number }),
      ...(raw.target === undefined ? {} : { target: raw.target as number }) });
  }

  const accessors: Accessor[] = [];
  let accessorComponentsTotal = 0;
  for (const raw of accessorsRaw) {
    if (!isObject(raw) || !onlyKeys(raw, ["bufferView", "byteOffset", "componentType", "normalized", "count", "type", "min", "max"]) ||
      !isIndex(raw.bufferView, views.length) || !integer(raw.byteOffset ?? 0) || !integer(raw.count, 1, MAX_PRODUCT_GLB_BYTES) ||
      !COMPONENT_BYTES.has(raw.componentType as number) || !TYPE_COMPONENTS.has(raw.type as string) ||
      (raw.normalized !== undefined && typeof raw.normalized !== "boolean")) return null;
    const accessor: Accessor = {
      bufferView: raw.bufferView as number,
      byteOffset: (raw.byteOffset as number | undefined) ?? 0,
      componentType: raw.componentType as number,
      count: raw.count as number,
      type: raw.type as string,
      normalized: raw.normalized === true,
    };
    const view = views[accessor.bufferView];
    const componentBytes = COMPONENT_BYTES.get(accessor.componentType)!;
    const componentCount = TYPE_COMPONENTS.get(accessor.type)!;
    const elementBytes = componentBytes * componentCount;
    const stride = view.byteStride ?? elementBytes;
    accessorComponentsTotal += accessor.count * componentCount;
    if (accessorComponentsTotal > MAX_ACCESSOR_COMPONENTS || (view.byteOffset + accessor.byteOffset) % componentBytes !== 0 || stride < elementBytes || stride % componentBytes !== 0 ||
      accessor.byteOffset + (accessor.count - 1) * stride + elementBytes > view.byteLength ||
      (accessor.normalized && accessor.componentType === 5126) ||
      (raw.min !== undefined && !numberArray(raw.min, componentCount, -MAX_FLOAT_MAGNITUDE, MAX_FLOAT_MAGNITUDE)) ||
      (raw.max !== undefined && !numberArray(raw.max, componentCount, -MAX_FLOAT_MAGNITUDE, MAX_FLOAT_MAGNITUDE))) return null;
    if (Array.isArray(raw.min) && Array.isArray(raw.max) && raw.min.some((value, i) => (value as number) > (raw.max as number[])[i])) return null;

    const actualMin = new Array(componentCount).fill(Infinity) as number[];
    const actualMax = new Array(componentCount).fill(-Infinity) as number[];
    const base = view.byteOffset + accessor.byteOffset;
    for (let item = 0; item < accessor.count; item++) {
      for (let component = 0; component < componentCount; component++) {
        const value = readComponent(binary, base + item * stride + component * componentBytes, accessor.componentType);
        if (value === null || Math.abs(value) > MAX_FLOAT_MAGNITUDE) return null;
        actualMin[component] = Math.min(actualMin[component], value);
        actualMax[component] = Math.max(actualMax[component], value);
      }
    }
    const boundsMatch = (declared: unknown, actual: number[]) => !Array.isArray(declared) || declared.every((value, index) => {
      const tolerance = accessor.componentType === 5126 ? 1e-6 * Math.max(1, Math.abs(actual[index])) : 0;
      return Math.abs((value as number) - actual[index]) <= tolerance;
    });
    if (!boundsMatch(raw.min, actualMin) || !boundsMatch(raw.max, actualMax)) return null;
    accessors.push(accessor);
  }

  const validateTextureInfo = (value: unknown): boolean => {
    if (!isObject(value) || !onlyKeys(value, ["index", "texCoord"]) || !isIndex(value.index, textures.length) ||
      (value.texCoord !== undefined && value.texCoord !== 0 && value.texCoord !== 1)) return false;
    return true;
  };

  for (const raw of samplers) {
    if (!isObject(raw) || !onlyKeys(raw, ["magFilter", "minFilter", "wrapS", "wrapT"]) ||
      (raw.magFilter !== undefined && raw.magFilter !== 9728 && raw.magFilter !== 9729) ||
      (raw.minFilter !== undefined && ![9728, 9729, 9984, 9985, 9986, 9987].includes(raw.minFilter as number)) ||
      (raw.wrapS !== undefined && ![33071, 33648, 10497].includes(raw.wrapS as number)) ||
      (raw.wrapT !== undefined && ![33071, 33648, 10497].includes(raw.wrapT as number))) return null;
  }

  const imageBytes: Buffer[] = [];
  for (const raw of images) {
    if (!isObject(raw) || !onlyKeys(raw, ["bufferView", "mimeType", "name"]) || !isIndex(raw.bufferView, views.length) ||
      typeof raw.mimeType !== "string") return null;
    const view = views[raw.bufferView as number];
    if (view.target !== undefined || view.byteStride !== undefined) return null;
    imageBytes.push(binary.subarray(view.byteOffset, view.byteOffset + view.byteLength));
  }
  for (let index = 0; index < textures.length; index++) {
    const raw = textures[index];
    if (!isObject(raw) || !onlyKeys(raw, ["sampler", "source", "name", "extensions"]) ||
      (raw.sampler !== undefined && !isIndex(raw.sampler, samplers.length)) ||
      (raw.source !== undefined && !isIndex(raw.source, images.length))) return null;
    const webp = isObject(raw.extensions) && isObject(raw.extensions.EXT_texture_webp) ? raw.extensions.EXT_texture_webp.source : undefined;
    if (raw.source === undefined && webp === undefined || (webp !== undefined && !isIndex(webp, images.length))) return null;
    if (raw.source !== undefined && (!isObject(images[raw.source as number]) || (images[raw.source as number] as JsonObject).mimeType === "image/webp") ||
      (webp !== undefined && (!isObject(images[webp as number]) || (images[webp as number] as JsonObject).mimeType !== "image/webp"))) return null;
  }

  let totalImagePixels = 0;
  for (let index = 0; index < images.length; index++) {
    const image = images[index] as JsonObject;
    const webpImage = textures.some((texture) => isObject(texture) && isObject(texture.extensions) &&
      isObject(texture.extensions.EXT_texture_webp) && texture.extensions.EXT_texture_webp.source === index);
    if (image.mimeType === "image/webp" && !webpImage || image.mimeType !== "image/webp" && !["image/png", "image/jpeg"].includes(image.mimeType as string)) return null;
    const pixels = await validateImage(imageBytes[index], image.mimeType);
    if (pixels === null) return null;
    totalImagePixels += pixels;
    if (totalImagePixels > MAX_IMAGE_PIXELS) return null;
  }

  for (const raw of materials) {
    if (!isObject(raw) || !onlyKeys(raw, ["name", "pbrMetallicRoughness", "normalTexture", "occlusionTexture", "emissiveTexture", "emissiveFactor", "alphaMode", "alphaCutoff", "doubleSided"]) ||
      (raw.doubleSided !== undefined && typeof raw.doubleSided !== "boolean") ||
      (raw.alphaMode !== undefined && !["OPAQUE", "MASK", "BLEND"].includes(raw.alphaMode as string)) ||
      (raw.alphaCutoff !== undefined && (typeof raw.alphaCutoff !== "number" || !Number.isFinite(raw.alphaCutoff) || raw.alphaCutoff < 0)) ||
      (raw.emissiveFactor !== undefined && !validateNumberArray(raw.emissiveFactor, 3, 0, 1))) return null;
    if (raw.pbrMetallicRoughness !== undefined) {
      const pbr = raw.pbrMetallicRoughness;
      if (!isObject(pbr) || !onlyKeys(pbr, ["baseColorFactor", "metallicFactor", "roughnessFactor", "baseColorTexture", "metallicRoughnessTexture"]) ||
        (pbr.baseColorFactor !== undefined && !validateNumberArray(pbr.baseColorFactor, 4, 0, 1)) ||
        (pbr.metallicFactor !== undefined && (typeof pbr.metallicFactor !== "number" || !Number.isFinite(pbr.metallicFactor) || pbr.metallicFactor < 0 || pbr.metallicFactor > 1)) ||
        (pbr.roughnessFactor !== undefined && (typeof pbr.roughnessFactor !== "number" || !Number.isFinite(pbr.roughnessFactor) || pbr.roughnessFactor < 0 || pbr.roughnessFactor > 1)) ||
        (pbr.baseColorTexture !== undefined && !validateTextureInfo(pbr.baseColorTexture)) ||
        (pbr.metallicRoughnessTexture !== undefined && !validateTextureInfo(pbr.metallicRoughnessTexture))) return null;
    }
    for (const key of ["normalTexture", "occlusionTexture", "emissiveTexture"] as const) {
      if (raw[key] !== undefined) {
        const info = raw[key];
        const allowedKeys = key === "normalTexture" ? ["index", "texCoord", "scale"] : key === "occlusionTexture" ? ["index", "texCoord", "strength"] : ["index", "texCoord"];
        if (!isObject(info) || !onlyKeys(info, allowedKeys) || !validateTextureInfo(info) ||
          (key === "normalTexture" && info.scale !== undefined && (typeof info.scale !== "number" || !Number.isFinite(info.scale))) ||
          (key === "occlusionTexture" && info.strength !== undefined && (typeof info.strength !== "number" || !Number.isFinite(info.strength) || info.strength < 0 || info.strength > 1))) return null;
      }
    }
  }

  const meshTriangles: number[] = [];
  for (const raw of meshes) {
    if (!isObject(raw) || !onlyKeys(raw, ["name", "primitives"]) || !Array.isArray(raw.primitives) || raw.primitives.length < 1 || raw.primitives.length > 256) return null;
    let meshCount = 0;
    for (const primitive of raw.primitives) {
      if (!isObject(primitive) || !onlyKeys(primitive, ["attributes", "indices", "material", "mode"]) || !isObject(primitive.attributes) ||
        (primitive.material !== undefined && !isIndex(primitive.material, materials.length)) ||
        (primitive.mode !== undefined && primitive.mode !== 4)) return null;
      const attributeEntries = Object.entries(primitive.attributes);
      if (attributeEntries.length < 1 || attributeEntries.length > 8 || attributeEntries.some(([name]) =>
        !["POSITION", "NORMAL", "TANGENT", "TEXCOORD_0", "TEXCOORD_1", "COLOR_0"].includes(name))) return null;
      const positionIndex = primitive.attributes.POSITION;
      if (!isIndex(positionIndex, accessors.length)) return null;
      const position = accessors[positionIndex as number];
      if (views[position.bufferView].target !== undefined && views[position.bufferView].target !== 34962) return null;
      if (position.type !== "VEC3" || !(position.componentType === 5126 ||
        (document.extensionsUsed as unknown[] | undefined)?.includes("KHR_mesh_quantization") && [5120, 5121, 5122, 5123].includes(position.componentType))) return null;
      for (const [name, accessorIndex] of attributeEntries) {
        if (!isIndex(accessorIndex, accessors.length)) return null;
        const accessor = accessors[accessorIndex as number];
        if (views[accessor.bufferView].target !== undefined && views[accessor.bufferView].target !== 34962) return null;
        const type = name === "TANGENT" ? "VEC4" : name.startsWith("TEXCOORD") ? "VEC2" : name === "COLOR_0" ? ["VEC3", "VEC4"] : "VEC3";
        if (accessor.count !== position.count || (Array.isArray(type) ? !type.includes(accessor.type) : accessor.type !== type)) return null;
        if (accessor.componentType !== 5126 && !(document.extensionsUsed as unknown[] | undefined)?.includes("KHR_mesh_quantization") && name !== "COLOR_0") return null;
        if (name === "COLOR_0" && accessor.componentType !== 5126 && !([5121, 5123].includes(accessor.componentType) && accessor.normalized)) return null;
      }
      let primitiveTriangles = 0;
      if (primitive.indices !== undefined) {
        if (!isIndex(primitive.indices, accessors.length)) return null;
        const indices = accessors[primitive.indices as number];
        if (indices.type !== "SCALAR" || indices.normalized || ![5121, 5123, 5125].includes(indices.componentType) || indices.count % 3 !== 0 ||
          views[indices.bufferView].byteStride !== undefined || (views[indices.bufferView].target !== undefined && views[indices.bufferView].target !== 34963)) return null;
        const view = views[indices.bufferView];
        const stride = view.byteStride ?? COMPONENT_BYTES.get(indices.componentType)!;
        const base = view.byteOffset + indices.byteOffset;
        for (let index = 0; index < indices.count; index++) {
          const value = readComponent(binary, base + index * stride, indices.componentType);
          if (value === null || value >= position.count) return null;
        }
        primitiveTriangles = indices.count / 3;
      } else {
        if (position.count % 3 !== 0) return null;
        primitiveTriangles = position.count / 3;
      }
      meshCount += primitiveTriangles;
      if (meshCount > MAX_PRODUCT_GLB_TRIANGLES) return null;
    }
    meshTriangles.push(meshCount);
  }

  const parents = new Array(nodes.length).fill(0);
  for (const raw of nodes) {
    if (!isObject(raw) || !onlyKeys(raw, ["name", "children", "mesh", "translation", "rotation", "scale", "matrix"]) ||
      (raw.mesh !== undefined && !isIndex(raw.mesh, meshes.length)) ||
      (raw.children !== undefined && (!Array.isArray(raw.children) || raw.children.some((child) => !isIndex(child, nodes.length)))) ||
      (raw.matrix !== undefined && (raw.translation !== undefined || raw.rotation !== undefined || raw.scale !== undefined || !numberArray(raw.matrix, 16, -1_000_000, 1_000_000))) ||
      (raw.translation !== undefined && !numberArray(raw.translation, 3, -1_000_000, 1_000_000)) ||
      (raw.rotation !== undefined && (!numberArray(raw.rotation, 4, -1, 1) || Math.hypot(...raw.rotation as number[]) < 1e-9)) ||
      (raw.scale !== undefined && !numberArray(raw.scale, 3, -1_000_000, 1_000_000)) ) return null;
    if (Array.isArray(raw.children)) {
      if (new Set(raw.children).size !== raw.children.length) return null;
      for (const child of raw.children as number[]) if (++parents[child] > 1) return null;
    }
  }

  const roots = new Set<number>();
  for (const raw of scenes) {
    if (!isObject(raw) || !onlyKeys(raw, ["name", "nodes"]) || !Array.isArray(raw.nodes) || raw.nodes.some((node) => !isIndex(node, nodes.length)) || new Set(raw.nodes).size !== raw.nodes.length) return null;
    for (const node of raw.nodes as number[]) {
      if (parents[node] !== 0) return null;
      roots.add(node);
    }
  }
  const visited = new Set<number>();
  const active = new Set<number>();
  const visit = (index: number, depth: number): boolean => {
    if (depth > 64 || active.has(index)) return false;
    if (visited.has(index)) return true;
    active.add(index);
    const node = nodes[index] as JsonObject;
    for (const child of (node.children ?? []) as number[]) if (!visit(child, depth + 1)) return false;
    active.delete(index);
    visited.add(index);
    return true;
  };
  for (const root of roots) if (!visit(root, 0)) return null;
  if (visited.size !== nodes.length) return null;
  let triangles = 0;
  for (const raw of nodes) if (isObject(raw) && raw.mesh !== undefined) {
    triangles += meshTriangles[raw.mesh as number];
    if (triangles > MAX_PRODUCT_GLB_TRIANGLES) return null;
  }
  if (triangles < 1) return null;
  return triangles;
}

export async function validateProductGlb(input: Buffer): Promise<{ triangles: number; sha256: string } | null> {
  try {
    const parsed = validateContainer(input);
    if (!parsed) return null;
    const triangles = await validateDocument(parsed.document, parsed.binary);
    if (triangles === null) return null;
    return { triangles, sha256: createHash("sha256").update(input).digest("hex") };
  } catch {
    return null;
  }
}
