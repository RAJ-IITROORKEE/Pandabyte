import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { parseUploadedDocument } from '../src/ingestion/uploaded-document.ts';
const parse=(text,type='text/markdown')=>{const bytes=Buffer.from(text);return parseUploadedDocument({mediaType:type,bytes,expectedSha256:createHash('sha256').update(bytes).digest('hex')});};
test('verified markdown is normalized and deterministically chunked without changing source bytes',async()=>{
 const raw=Buffer.from('# Title\r\n\r\nFirst paragraph.\r\n\r\nSecond paragraph.'); const before=Buffer.from(raw);const input={mediaType:'text/markdown',bytes:raw,expectedSha256:createHash('sha256').update(raw).digest('hex')};
 const first=await parseUploadedDocument(input), second=await parseUploadedDocument(input);assert.deepEqual(first,second);assert.equal(first.chunks.length,2);assert.deepEqual(raw,before);assert.ok(first.chunks[0].section_path.includes('Title'));
});
test('invalid bytes, hashes, types and unsafe markdown fail closed',async()=>{
 const bytes=Buffer.from('hello');await assert.rejects(parseUploadedDocument({mediaType:'text/plain',bytes,expectedSha256:'0'.repeat(64)}));await assert.rejects(parse('hello','text/html'));await assert.rejects(parse('abc\0def','text/plain'));await assert.rejects(parse('```\nunclosed'));await assert.rejects(parse('a'.repeat(12001)));await assert.rejects(parse('not a pdf','application/pdf'));await assert.rejects(parse('%PDF- bogus','application/pdf'));
});
test('PDF text is parsed in the bounded worker',async()=>{
 const PDFDocument=(await import('pdfkit')).default;
 const document=new PDFDocument({autoFirstPage:true,compress:false});const parts=[];
 const finished=new Promise((resolve,reject)=>{document.on('data',p=>parts.push(p));document.on('end',resolve);document.on('error',reject);});
 document.text('Fixture specification: voltage 3.3 volts.');document.end();await finished;
 const bytes=Buffer.concat(parts), result=await parseUploadedDocument({mediaType:'application/pdf',bytes,expectedSha256:createHash('sha256').update(bytes).digest('hex')});
 assert.ok(result.chunks.some(c=>c.text.includes('Fixture specification')));assert.deepEqual(result.chunks[0].section_path.slice(0,2),['Page','1']);
});
