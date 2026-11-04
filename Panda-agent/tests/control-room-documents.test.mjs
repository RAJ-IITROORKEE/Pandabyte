import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,createHmac} from 'node:crypto';
import {createDocumentsHandlers} from '../src/control-room/documents.ts';
const ref='11111111-1111-4111-8111-111111111111', bytes=Buffer.from('# Fixture\n\nSafe source text.'),sha=createHash('sha256').update(bytes).digest('hex'),secret='c'.repeat(64);
const request=(body,headers={})=>new Request('http://localhost:3000/api/admin/panda-agent/documents',{method:'POST',headers:{origin:'http://localhost:3000','content-type':'application/json',...headers},body});
function fixture(){let calls=[],allowed=true,sourceHash=sha,changeRead=false,badChunk=false,withdrawn=false,reads=0,withdrawError=null;const client={database:{schema:()=>({rpc:async(name,args)=>{calls.push({name,args});if(name==='panda_agent_external_source')return {data:{reference:ref,version:2,mediaType:'text/markdown',expectedSize:bytes.length,expectedSha256:sourceHash},error:null};if(name==='panda_agent_external_commit')return {data:{reference:ref,status:'prepared',version:1},error:null};if(name==='panda_agent_external_withdraw')return {data:withdrawError?null:{reference:ref,status:'withdrawn',version:2},error:withdrawError};if(name==='panda_agent_external_status')return {data:{reference:ref,sourceVersion:2,status:'processing',canRetry:false},error:null};if(name==='panda_agent_external_document_read')return {data:{reference:ref,version:1,status:withdrawn?'withdrawn':'prepared',title:'Fixture',fingerprint:(changeRead&&++reads>1?'e':'d').repeat(64),chunks:[{ordinal:1,text:'Evidence',textSha256:badChunk?'a'.repeat(64):createHash('sha256').update('Evidence').digest('hex'),sectionPath:['Document']}]},error:null};if(name==='panda_agent_external_documents_list')return {data:{items:[{kind:'product_listing',title:'Fixture',sku:'TEST',status:'available',chunkCount:3,privateKey:'must not escape'}],nextCursor:null,stats:{productDocuments:1,productChunks:3,uploadedDocuments:0,uploadedChunks:0}},error:null};throw Error('unexpected');}})},storage:{from:()=>({download:async()=>({data:new Blob([bytes]),error:null})})}};return {handlers:createDocumentsHandlers(async()=>allowed?{kind:'admin',subject:'owner',client}:{kind:'forbidden'},()=>true),calls,setHash(v){sourceHash=v;},deny(){allowed=false;},changeRead(){changeRead=true;},badChunk(){badChunk=true;},withdrawn(){withdrawn=true;},withdrawConflict(){withdrawError={code:'P0001',details:'version_conflict'};}};}
const post=()=>request(JSON.stringify({reference:ref,expectedVersion:2}));
test('prepared content is signed only after exact-byte readback',async()=>{
 const previous=process.env.PANDA_AGENT_INGESTION_SIGNING_SECRET;process.env.PANDA_AGENT_INGESTION_SIGNING_SECRET=secret;
 try{const f=fixture(),r=await f.handlers.POST(post());assert.equal(r.status,200);assert.deepEqual(await r.json(),{reference:ref,status:'prepared',version:1,chunkCount:1});const commit=f.calls.find(x=>x.name==='panda_agent_external_commit');const payload=JSON.parse(commit.args.p_payload);assert.equal(payload.actor,'owner');assert.equal(payload.reference,ref);assert.equal(payload.originalSha256,sha);assert.equal(commit.args.p_mac,createHmac('sha256',Buffer.from(secret,'hex')).update('pandabyte/external-ingestion/v1\0'+commit.args.p_payload).digest('hex'));assert.equal(payload.chunks.length,1);}finally{if(previous===undefined)delete process.env.PANDA_AGENT_INGESTION_SIGNING_SECRET;else process.env.PANDA_AGENT_INGESTION_SIGNING_SECRET=previous;}
});
test('invalid bytes, absent secret, unauthorized and oversized requests never commit',async()=>{
 const previous=process.env.PANDA_AGENT_INGESTION_SIGNING_SECRET;process.env.PANDA_AGENT_INGESTION_SIGNING_SECRET=secret;
 try{const f=fixture();f.setHash('a'.repeat(64));assert.equal((await f.handlers.POST(post())).status,503);assert.ok(!f.calls.some(x=>x.name==='panda_agent_external_commit'));const g=fixture();delete process.env.PANDA_AGENT_INGESTION_SIGNING_SECRET;assert.equal((await g.handlers.POST(post())).status,503);assert.equal(g.calls.length,0);g.deny();assert.equal((await g.handlers.POST(post())).status,403);const h=fixture();process.env.PANDA_AGENT_INGESTION_SIGNING_SECRET=secret;assert.equal((await h.handlers.POST(request('x'.repeat(5000)))).status,413);assert.equal(h.calls.length,0);}finally{if(previous===undefined)delete process.env.PANDA_AGENT_INGESTION_SIGNING_SECRET;else process.env.PANDA_AGENT_INGESTION_SIGNING_SECRET=previous;}
});
test('listing projects only bounded public fields, and rejects invalid query',async()=>{
 const f=fixture();const r=await f.handlers.GET(new Request('http://localhost:3000/api/admin/panda-agent/documents?q=test&limit=20'));assert.equal(r.status,200);const data=await r.json();assert.deepEqual(data.items,[{kind:'product_listing',title:'Fixture',sku:'TEST',status:'available',chunkCount:3}]);assert.ok(!JSON.stringify(data).includes('privateKey'));assert.equal((await f.handlers.GET(new Request('http://localhost:3000/api/admin/panda-agent/documents?limit=51'))).status,400);
});


test('status and detail revalidate Admin and never invent retry or expose hashes',async()=>{
 const f=fixture(),status=await f.handlers.STATUS(new Request(`http://localhost/api/admin/panda-agent/documents/${ref}/status?sourceVersion=2`),ref);
 assert.deepEqual(await status.json(),{reference:ref,sourceVersion:2,status:'processing',canRetry:false});
 const detail=await f.handlers.DETAIL(new Request(`http://localhost/api/admin/panda-agent/documents/${ref}?version=1`),ref);
 assert.deepEqual(await detail.json(),{reference:ref,title:'Fixture',version:1,status:'prepared',chunks:[{ordinal:1,text:'Evidence',sectionPath:['Document']}]});
 f.deny();assert.equal((await f.handlers.STATUS(new Request(`http://localhost/api/admin/panda-agent/documents/${ref}/status?sourceVersion=2`),ref)).status,403);
});
test('streaming bodies stop at the 4 KiB boundary without relying on Content-Length',async()=>{
 const f=fixture();let pulls=0;
 const stream=new ReadableStream({pull(controller){pulls++;controller.enqueue(new Uint8Array(2048));if(pulls===8)controller.close();}});
 const req=new Request('http://localhost:3000/api/admin/panda-agent/documents',{method:'POST',headers:{origin:'http://localhost:3000','content-type':'application/json'},body:stream,duplex:'half'});
 assert.equal((await f.handlers.POST(req)).status,413);assert.equal(f.calls.length,0);assert.ok(pulls<8);
});


test('withdrawal or source change before detail release withholds text',async()=>{
 const f=fixture();f.changeRead();const result=await f.handlers.DETAIL(new Request(`http://localhost/api/admin/panda-agent/documents/${ref}?version=1`),ref);
 assert.equal(result.status,503);assert.ok(!JSON.stringify(await result.json()).includes('Evidence'));
});

test('withdrawal requires same origin, active Admin and expected document version',async()=>{
 const f=fixture(),valid=()=>request(JSON.stringify({expectedVersion:1}));
 assert.equal((await f.handlers.WITHDRAW(request(JSON.stringify({expectedVersion:1}),{origin:'https://wrong.example'}),ref)).status,403);
 assert.equal((await f.handlers.WITHDRAW(request(JSON.stringify({expectedVersion:0})),ref)).status,400);
 assert.equal(f.calls.length,0);
 const result=await f.handlers.WITHDRAW(valid(),ref);assert.equal(result.status,200);assert.deepEqual(await result.json(),{reference:ref,status:'withdrawn',version:2});
 assert.deepEqual(f.calls.at(-1),{name:'panda_agent_external_withdraw',args:{p_reference:ref,p_version:1}});
 f.deny();assert.equal((await f.handlers.WITHDRAW(valid(),ref)).status,403);assert.equal(f.calls.length,1);
});

test('stale withdrawal is a conflict and does not fabricate success',async()=>{
 const f=fixture();f.withdrawConflict();const result=await f.handlers.WITHDRAW(request(JSON.stringify({expectedVersion:1})),ref);
 assert.equal(result.status,409);assert.deepEqual(await result.json(),{error:{code:'conflict'}});
});


test('lexical search returns version-bound source locators and abstains without a match',async()=>{
 const f=fixture(),search=question=>request(JSON.stringify({question,version:1}));
 const response=await f.handlers.SEARCH(search('Evidence'),ref);assert.equal(response.status,200);
 assert.deepEqual(await response.json(),{outcome:'retrieved',retrieval:'lexical',relevance:'unverified',passages:[{rank:1,text:'Evidence',source:{kind:'uploaded_document',reference:ref,version:1,title:'Fixture',ordinal:1,sectionPath:['Document']}}]});
 const absent=await f.handlers.SEARCH(search('unrelated'),ref);assert.deepEqual(await absent.json(),{outcome:'insufficient',retrieval:'lexical',relevance:'unverified',passages:[]});
});
test('lexical search withholds matches when the source changes or access is denied',async()=>{
 const f=fixture();f.changeRead();const response=await f.handlers.SEARCH(request(JSON.stringify({question:'Evidence',version:1})),ref);assert.equal(response.status,503);assert.ok(!JSON.stringify(await response.json()).includes('Evidence'));
 const g=fixture();g.deny();assert.equal((await g.handlers.SEARCH(request(JSON.stringify({question:'Evidence',version:1})),ref)).status,403);assert.equal(g.calls.length,0);
});

test('lexical search rejects withdrawn sources and invalid chunk hashes',async()=>{
 for(const mode of ['withdrawn','badChunk']) {const f=fixture();f[mode]();const response=await f.handlers.SEARCH(request(JSON.stringify({question:'Evidence',version:1})),ref);assert.equal(response.status,503);assert.ok(!JSON.stringify(await response.json()).includes('Evidence'));}
});
