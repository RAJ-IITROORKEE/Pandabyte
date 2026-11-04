import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createPlaygroundHandler } from '../src/control-room/playground-handler.ts';
const text = 'The listing describes an ESP8266 processor.';
const handle = `panda:00000000-0000-0000-0000-000000000001:${'a'.repeat(64)}:${'b'.repeat(64)}`;
const chunk = { handle, productId:'p1', text, textHash:createHash('sha256').update(text).digest('hex'), header:'header', physicalRevision:null, blocked:false, title:'Board', sourceUrl:'https://pandabyte.in/product-page/board', capturedAt:'2026-10-30T00:00:00Z', sectionPath:['Details'] };
const scope = { fingerprint:'proof', candidate:true, sealed:true, engineeringVerified:true, manifestVerified:true, configVerified:true, generationCurrent:true, chunks:[chunk] };
const adapters = (overrides={}) => ({ resolveIdentity:async()=>({kind:'resolved',product:{id:'p1',sku:'SKU'}}), currentScope:async()=>scope, lexical:async()=>[handle], dense:async()=>{throw Error('not used')}, select:async()=>{throw Error('model must not run')}, ...overrides });
const request = (body={question:'Which processor?',productSku:'SKU'}, headers={}) => new Request('http://localhost/api', {method:'POST',headers:{origin:'http://localhost','content-type':'application/json',...headers},body:JSON.stringify(body)});
const admin = a => createPlaygroundHandler(async()=>({kind:'admin',actor:{subject:'clerk-user'},adapters:a}));
test('returns bounded ranked passages without invoking the selector or exposing internal handles',async()=>{
 const res=await admin(adapters())(request()); const data=await res.json();
 assert.equal(res.status,200); assert.equal(res.headers.get('cache-control'),'private, no-store');
 assert.equal(data.outcome,'retrieved'); assert.equal(data.relevance,'unverified'); assert.equal(data.model.status,'not_requested');
 assert.ok(Number.isSafeInteger(data.metrics.elapsedMs) && data.metrics.elapsedMs >= 0);
 assert.equal(data.metrics.contextPassages,1); assert.equal(data.metrics.contextCharacters,[...text].length);
 assert.equal(data.metrics.inputTokens,null); assert.equal(data.metrics.outputTokens,null); assert.equal(data.metrics.costUsd,null);
 assert.deepEqual(data.passages,[{rank:1,title:'Board',sourceUrl:chunk.sourceUrl,capturedAt:chunk.capturedAt,sectionPath:['Details'],text,lexicalOverlap:{matched:1,total:2}}]); assert.ok(!JSON.stringify(data).includes(handle));
});
test('rejects unauthenticated, forbidden, cross-origin and invalid input',async()=>{
 for(const [kind,status] of [['unauthorized',401],['forbidden',403],['unavailable',503]]) assert.equal((await createPlaygroundHandler(async()=>({kind}))(request())).status,status);
 assert.equal((await admin(adapters())(request(undefined,{origin:'http://evil.test'}))).status,403);
 assert.equal((await admin(adapters())(request({question:'x',extra:true}))).status,400);
 assert.equal((await admin(adapters())(request({question:'x'.repeat(9000)}))).status,413);
});
test('fails closed on changed scope and outside-scope rankings',async()=>{
 let calls=0; const changed=adapters({currentScope:async()=>({...scope,fingerprint:++calls===1?'one':'two'})});
 assert.equal((await admin(changed)(request())).status,503);
 assert.equal((await admin(adapters({lexical:async()=>['untrusted']}))(request())).status,503);
});
test('no matching evidence is reported without claiming relevance',async()=>{
 const res=await admin(adapters({lexical:async()=>[]}))(request()); const body=await res.json();
 assert.equal(body.outcome,'insufficient'); assert.deepEqual(body.passages,[]); assert.equal(body.relevance,'unverified');
});

test('injected evaluator requires literal bounded evidence and rechecked scope',async()=>{
 const make = fn => createPlaygroundHandler(async()=>({kind:'admin',actor:{subject:'test'},adapters:adapters()}),fn);
 let res=await make(async()=>({answer:'The listing names ESP8266.',evidence:[{rank:1,quote:'ESP8266 processor',reason:'Names the processor.'}]}))(request({question:'Which processor?',productSku:'SKU',evaluate:true,requestId:'00000000-0000-4000-8000-000000000001'}));
 let data=await res.json(); assert.equal(res.status,200); assert.equal(data.model.status,'evaluated'); assert.equal(data.model.evidence[0].rank,1);
 res=await make(async()=>({answer:'Unsupported',evidence:[{rank:1,quote:'not in source',reason:'No'}]}))(request({question:'Which processor?',productSku:'SKU',evaluate:true,requestId:'00000000-0000-4000-8000-000000000001'})); assert.equal(res.status,503);
 res=await make(async()=>({answer:'',evidence:[]}))(request({question:'Which processor?',productSku:'SKU',evaluate:true,requestId:'00000000-0000-4000-8000-000000000001'})); data=await res.json(); assert.equal(data.model.answer,''); assert.deepEqual(data.model.evidence,[]);
 let count=0; const stale=adapters({currentScope:async()=>({...scope,fingerprint:++count<3?'one':'changed'})});
 res=await createPlaygroundHandler(async()=>({kind:'admin',actor:{subject:'test'},adapters:stale}),async()=>({answer:'x',evidence:[{rank:1,quote:'ESP8266',reason:'x'}]}))(request({question:'Which processor?',productSku:'SKU',evaluate:true,requestId:'00000000-0000-4000-8000-000000000001'})); assert.equal(res.status,503);
});

test('rechecks administrator identity before releasing results',async()=>{
 for (const final of [{kind:'forbidden'},{kind:'admin',actor:{subject:'different'},adapters:adapters()}]) {
  let calls=0; const handler=createPlaygroundHandler(async()=>++calls===1?{kind:'admin',actor:{subject:'original'},adapters:adapters()}:final);
  assert.equal((await handler(request())).status,503); assert.equal(calls,2);
 }
});

test('model execution requires explicit opt-in and preserves unknown and quota outcomes', async()=>{
 let calls=0;
 const make=fn=>createPlaygroundHandler(async()=>({kind:'admin',actor:{subject:'test'},adapters:adapters()}),fn);
 const count=async()=>{calls++;return {answer:'',evidence:[]};};
 let res=await make(count)(request());
 assert.equal((await res.json()).model.status,'not_requested'); assert.equal(calls,0);
 assert.equal((await make(count)(request({question:'x',evaluate:'true'}))).status,400);
 for (const code of ['quota','not_admitted','outcome_unknown']) {
  res=await make(async()=>{throw Object.assign(Error('private diagnostic'),{code});})(request({question:'x',evaluate:true,requestId:'00000000-0000-4000-8000-000000000001'}));
  assert.equal(res.status,503); assert.deepEqual(await res.json(),{error:{code}});
 }
 res=await admin(adapters())(request({question:'x',evaluate:true,requestId:'00000000-0000-4000-8000-000000000001'}));
 assert.equal((await res.json()).model.status,'guard_unavailable');
});

test('revoked Admin cannot call model and durable intent reaches the evaluator unchanged', async()=>{
 const requestId='00000000-0000-4000-8000-000000000001';
 let calls=0, admissions=0;
 const handler=createPlaygroundHandler(async()=>++admissions===1?{kind:'admin',actor:{subject:'test'},adapters:adapters()}:{kind:'forbidden'},async()=>{calls++;return {answer:'',evidence:[]};});
 assert.equal((await handler(request({question:'x',evaluate:true,requestId}))).status,503); assert.equal(calls,0);
 const accepted=createPlaygroundHandler(async()=>({kind:'admin',actor:{subject:'test'},adapters:adapters()}),async(_q,_p,_s,intent)=>{assert.equal(intent.requestId,requestId);return {answer:'',evidence:[]};});
 assert.equal((await accepted(request({question:'x',evaluate:true,requestId}))).status,200);
 assert.equal((await accepted(request({question:'x',evaluate:true}))).status,400);
});

test('mixed source-label metadata cannot reappear as model answer evidence', async()=>{
 const label=`Source: ${chunk.sourceUrl}`;
 const metadata={...chunk,handle:handle.replace('a'.repeat(64),'c'.repeat(64)),text:label,textHash:createHash('sha256').update(label).digest('hex')};
 const a=adapters({currentScope:async()=>({...scope,chunks:[chunk,metadata]}),lexical:async()=>[handle,metadata.handle]});
 const handler=createPlaygroundHandler(async()=>({kind:'admin',actor:{subject:'test'},adapters:a}),async()=>({answer:'ESP8266',evidence:[{rank:1,quote:'ESP8266',reason:'Processor'},{rank:2,quote:label,reason:'Source label'}]}));
 assert.equal((await handler(request({question:'processor',evaluate:true,requestId:'00000000-0000-4000-8000-000000000001'}))).status,503);
});
