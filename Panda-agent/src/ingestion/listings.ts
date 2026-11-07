import { createHash } from 'node:crypto';
import { readFile, realpath, stat } from 'node:fs/promises';
import path from 'node:path';

// Local parser safety bounds, not production quotas.
export const LIMITS = { manifestBytes: 1_000_000, documentBytes: 1_000_000, blockBytes: 16_384, documents: 44 } as const;
export const PARSER_VERSION = 'listing-markdown-v1';
const hash = (value: string | Uint8Array) => createHash('sha256').update(value).digest('hex');
export const PARSER_CONFIG_SHA256 = hash(JSON.stringify({ parser: PARSER_VERSION, limits: LIMITS }));
const id = (...parts: unknown[]) => hash(JSON.stringify(parts));
const digestPattern = /^[a-f0-9]{64}$/;

type Source = {
  document_id: string; slug: string; scope: 'product_listing'; path: string; source_url: string;
  raw_sha256: string; normalized_sha256: string; parser_sha256: string; physical_revision: null;
  specification_locators: { field: string; line: number }[]; warnings: string[];
};

function validateSource(value: unknown, parserHash: string): asserts value is Source {
  if (!value || typeof value !== 'object') throw new Error('Invalid listing entry');
  const s = value as Source;
  if (typeof s.slug !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(s.slug) ||
      s.path !== `products/${s.slug}/product.md` || s.scope !== 'product_listing' ||
      s.physical_revision !== null || s.parser_sha256 !== parserHash ||
      !digestPattern.test(s.raw_sha256) || !digestPattern.test(s.normalized_sha256) ||
      typeof s.document_id !== 'string' || typeof s.source_url !== 'string' ||
      s.document_id !== `https://www.pandabyte.in/product-page/${s.slug}` || s.source_url !== s.document_id ||
      !Array.isArray(s.warnings) || s.warnings.some(w => typeof w !== 'string') ||
      !Array.isArray(s.specification_locators) || s.specification_locators.some(l => !l || typeof l.field !== 'string' || !Number.isSafeInteger(l.line) || l.line < 1)) {
    throw new Error('Invalid listing entry');
  }
}

async function boundedRead(file: string, limit: number): Promise<Buffer> {
  const info = await stat(file);
  if (!info.isFile() || info.size > limit) throw new Error('Missing or oversized input');
  const data = await readFile(file);
  if (data.length > limit) throw new Error('Oversized input');
  return data;
}

/** Preserve complete Markdown blocks, including fences and contiguous table rows. */
export function chunkMarkdown(documentId: string, input: string) {
  const text = input.replace(/\r\n?/g, '\n');
  const lines = text.split('\n');
  const headings: string[] = [];
  const ordinals = new Map<string, number>();
  const chunks: { logical_chunk_id: string; chunk_version_id: string; content_sha256: string; section_path: string[]; locator: { start_line: number; end_line: number }; kind: string; text: string; status: 'pending_review' | 'review_required'; review_reason: string | null }[] = [];
  let i = 0;
  while (i < lines.length) {
    if (!lines[i].trim()) { i++; continue; }
    const heading = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(lines[i]);
    if (heading) {
      headings.length = Math.min(headings.length, heading[1].length - 1);
      while (headings.length < heading[1].length - 1) headings.push('');
      headings.push(heading[2]); i++; continue;
    }
    const start = i;
    const fence = /^\s{0,3}(`{3,}|~{3,})/.exec(lines[i]);
    let kind = 'paragraph';
    let incomplete = false;
    if (fence) {
      kind = 'code'; i++;
      const marker = fence[1][0];
      const close = new RegExp(`^\\s{0,3}${marker}{${fence[1].length},}\\s*$`);
      while (i < lines.length && !close.test(lines[i])) i++;
      if (i < lines.length) i++; else incomplete = true;
    } else {
      kind = /^\s*\|/.test(lines[i]) ? 'table' : 'paragraph';
      while (i < lines.length && lines[i].trim() && !/^(#{1,6})\s+/.test(lines[i]) &&
        (i === start || !/^\s{0,3}(`{3,}|~{3,})/.test(lines[i])) &&
        (kind !== 'table' || /^\s*\|/.test(lines[i]))) i++;
    }
    const body = lines.slice(start, i).join('\n');
    const section = [...headings];
    const key = JSON.stringify(section);
    const ordinal = (ordinals.get(key) ?? 0) + 1; ordinals.set(key, ordinal);
    const logical = id(documentId, section, ordinal);
    const contentHash = hash(body);
    const reason = incomplete ? 'Unclosed fenced code block' : Buffer.byteLength(body) > LIMITS.blockBytes ? 'Block exceeds local review bound' : null;
    chunks.push({ logical_chunk_id: logical, chunk_version_id: id(logical, PARSER_VERSION, kind, contentHash), content_sha256: contentHash,
      section_path: section, locator: { start_line: start + 1, end_line: i }, kind, text: body,
      status: reason ? 'review_required' : 'pending_review', review_reason: reason });
  }
  return chunks;
}

/** Load only the frozen explicit listing allowlist; never scan directories. */
export async function buildListingManifest(root: string) {
  const corpusRoot = await realpath(root);
  const manifestPath = await realpath(path.join(corpusRoot, 'manifest.json'));
  if (path.dirname(manifestPath) !== corpusRoot) throw new Error('Manifest escapes corpus');
  const bytes = await boundedRead(manifestPath, LIMITS.manifestBytes);
  const manifest = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  if (manifest?.schema_version !== 1 || manifest.scope !== 'product_listing' || !digestPattern.test(manifest.parser_sha256) ||
      !Array.isArray(manifest.documents) || manifest.documents.length !== LIMITS.documents) throw new Error('Invalid listing manifest');
  const ids = new Set<string>(); const paths = new Set<string>();
  const documents = [];
  for (const entry of manifest.documents as unknown[]) {
    validateSource(entry, manifest.parser_sha256);
    if (ids.has(entry.document_id) || paths.has(entry.path)) throw new Error('Duplicate listing entry');
    ids.add(entry.document_id); paths.add(entry.path);
    const file = await realpath(path.join(corpusRoot, entry.path));
    const expected = path.join(corpusRoot, ...entry.path.split('/'));
    if (file !== expected) throw new Error('Listing path resolves outside its allowed location');
    const data = await boundedRead(file, LIMITS.documentBytes);
    if (hash(data) !== entry.normalized_sha256) throw new Error('Listing hash mismatch');
    const text = new TextDecoder('utf-8', { fatal: true }).decode(data);
    const chunks = chunkMarkdown(entry.document_id, text);
    if (!chunks.length) throw new Error('Empty listing');
    documents.push({ ...entry, document_version_id: id(entry.document_id, entry.raw_sha256, entry.normalized_sha256, entry.parser_sha256, PARSER_CONFIG_SHA256), chunks });
  }
  return { schema_version: 1, status: 'pending_review' as const, parser_version: PARSER_VERSION, source_manifest_sha256: hash(bytes), documents };
}
