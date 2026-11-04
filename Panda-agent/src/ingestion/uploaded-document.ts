import { createHash } from 'node:crypto';
import { chunkMarkdown } from './listings.ts';
// Existing isolated parser verifies bytes and bounds PDF extraction.
import { parseDocumentBytes } from '../documents/parse-document.mjs';

const digest = (bytes: Uint8Array | string) => createHash('sha256').update(bytes).digest('hex');
/** Parse authorized private bytes; no network, storage, or publication. */
export async function parseUploadedDocument(input: { mediaType:string; bytes:Uint8Array; expectedSha256:string }) {
  if (!input || !(input.bytes instanceof Uint8Array) || input.bytes.length < 1 || input.bytes.length > 3_145_728 || !/^[a-f0-9]{64}$/.test(input.expectedSha256) || digest(input.bytes) !== input.expectedSha256 || !['text/plain','text/markdown','application/pdf'].includes(input.mediaType)) throw Error('Invalid document');
  if (input.mediaType !== 'application/pdf' && /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(new TextDecoder('utf-8',{fatal:true}).decode(input.bytes))) throw Error('Invalid document');
  const parsed = await parseDocumentBytes({data:input.bytes,mimeType:input.mediaType,expectedSourceSha256:input.expectedSha256});
  if (parsed.status !== 'complete' || parsed.truncated || !Array.isArray(parsed.segments) || !parsed.segments.length) throw Error('Document requires review');
  const chunks = parsed.segments.flatMap((segment:{text:string;sectionPath:string[]}, index:number) => chunkMarkdown(`upload:${input.expectedSha256}:${index}`,segment.text).map(chunk=>({...chunk,section_path:[...segment.sectionPath,...chunk.section_path]})));
  if (!chunks.length || chunks.length>256 || chunks.some((chunk:{status:string;text:string;section_path:string[]})=>chunk.status !== 'pending_review' || chunk.text.length>12000 || chunk.section_path.length>12)) throw Error('Document requires review');
  return {originalSha256:input.expectedSha256, normalizedSha256:digest(JSON.stringify(parsed.segments)), parserVersion:'private-upload-v1', chunks};
}
