import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import PDFDocument from 'pdfkit';
import {parseDocumentBytes,decodePdfWorkerOutput} from '../src/documents/parse-document.mjs';
const input=(text,mimeType='text/plain')=>{const data=Buffer.from(text);return {data,mimeType,expectedSourceSha256:createHash('sha256').update(data).digest('hex')};};

test('text parsing binds source and output hashes and explicitly truncates',async()=>{
 const r=await parseDocumentBytes(input('x'.repeat(21000)));assert.equal(r.status,'partial');assert.equal(r.totals.characters,20000);assert.equal(r.trust,'untrusted_content');assert.equal(r.truncated,true);assert.equal(r.segments[0].textSha256,createHash('sha256').update(r.segments[0].text).digest('hex'));
 await assert.rejects(parseDocumentBytes({...input('data'),expectedSourceSha256:'0'.repeat(64)}));
 await assert.rejects(parseDocumentBytes(input('x'.repeat(3*1024*1024+1))));
});
test('HTML strips executable/style content and does not fetch resources',async()=>{
 const r=await parseDocumentBytes(input('<h1>Board</h1><script>stealKey()</script><style>secret</style><img src="https://invalid.test/x"><p>ESP8266 &amp; 4 MB</p>','text/html'));assert.equal(r.status,'complete');assert.match(r.segments[0].text,/ESP8266 & 4 MB/);assert.doesNotMatch(r.segments[0].text,/stealKey|secret|invalid/);
});
test('unsupported types and malformed UTF-8/JSON/PDF do not fabricate text',async()=>{
 assert.equal((await parseDocumentBytes(input('image','image/png'))).status,'unsupported');
 assert.equal((await parseDocumentBytes(input('{oops','application/json'))).status,'failed');
 assert.equal((await parseDocumentBytes(input('oops','application/pdf'))).status,'failed');
 const b=Buffer.from([255]);assert.equal((await parseDocumentBytes({...input(''),data:b,expectedSourceSha256:createHash('sha256').update(b).digest('hex')})).status,'failed');
});
test('PDF extraction retains actual page provenance in bounded child process',async()=>{
 const data=await new Promise(resolve=>{const parts=[],doc=new PDFDocument();doc.on('data',c=>parts.push(c));doc.on('end',()=>resolve(Buffer.concat(parts)));doc.text('Synthetic board controller ESP8266');doc.addPage().text('Synthetic flash capacity 4 MB');doc.end();});
 const r=await parseDocumentBytes({data,mimeType:'application/pdf',expectedSourceSha256:createHash('sha256').update(data).digest('hex')});assert.equal(r.status,'complete');assert.equal(r.totals.pagesSeen,2);assert.deepEqual(r.segments.map(s=>s.page),[1,2]);assert.match(r.segments[0].text,/ESP8266/);assert.match(r.segments[1].text,/4 MB/);
});

test('worker JSON decoding preserves UTF-8 split across output chunks and rejects invalid bytes',()=>{
 const bytes=Buffer.from(JSON.stringify({segments:[{page:1,text:'温度 °C'}],pagesSeen:1,truncated:false}));
 const index=bytes.indexOf(Buffer.from('温'));assert.ok(index>=0);
 assert.equal(decodePdfWorkerOutput([bytes.subarray(0,index+1),bytes.subarray(index+1)]).segments[0].text,'温度 °C');
 assert.throws(()=>decodePdfWorkerOutput([Buffer.from([0xff])]));
});
