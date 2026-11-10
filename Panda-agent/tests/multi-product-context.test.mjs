import test from 'node:test';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
import { runtimeSnapshot as snapshot } from './fixtures/runtime-snapshot.mjs';
import {resolveMultiProductIdentity} from '../src/retrieval/multi-product-identity.ts';import {createWorkflowProductContextPreparer,prepareProductContextSet} from '../src/retrieval/product-context-set.ts';
import {PRODUCT_MEMBERSHIP} from '../src/retrieval/engineering-proof.ts';
test('descriptive identity requires corroborated title words and disambiguates an explicitly named accessory',()=>{
 const catalog=[
  {id:'one',sku:'RING',title:'Circular ABC12 WeMoS LED'},
  {id:'two',sku:'STRIP',title:'Straight ABC12 LED'},
  {id:'a',sku:'BOARD-A',title:'PandaByte xAlpha Board'},
  {id:'b',sku:'xBeta',title:'PandaByte xBeta Board'},
  {id:'s',sku:'ACCESSORY',title:'xAlpha xBeta Shield'},
 ];
 const skus=q=>resolveMultiProductIdentity(catalog,q).products?.map(row=>row.sku);
 assert.deepEqual(skus('Which LEDs does the circular ABC12 use?'),['RING']);
 assert.deepEqual(skus('What does ACCESSORY xAlpha/xBeta support?'),['ACCESSORY']);
 assert.deepEqual(skus('Compare ACCESSORY xAlpha/xBeta with xBeta'),['xBeta','ACCESSORY']);
 for(const q of ['ABC12','circular','Which straight circular ABC12?', 'Compare circular ABC12 with missing',
  'What about imaginary ZZ99 circular ABC12?','What about straight or circular ABC12?']){
  assert.equal(resolveMultiProductIdentity(catalog,q).kind,'clarification',q);
 }
 const ambiguous=[...catalog,{id:'other',sku:'RING-V2',title:'Circular ABC12 WeMoS LED V2'}];
 assert.equal(resolveMultiProductIdentity(ambiguous,'What does the circular ABC12 use?').kind,'clarification');
});
const rows=[{id:'c3',sku:'ESPXC3',title:'PandaByte xC3 ESP32-C3 Board'},{id:'c3m',sku:'ESPXC3M',title:'PandaByte xC3m ESP32-C3 Board'},{id:'s3',sku:'ESPXS3',title:'PandaByte xS3 ESP32-S3 Board'},{id:'c6',sku:'ESPXC6',title:'PandaByte xC6 ESP32-C6 Board'},{id:'dht',sku:'PBDHT11',title:'DHT11 Sensor'}];
test('full catalog aliases resolve distinct xC3 and xS3, shared models clarify, boundaries isolate xC3m',()=>{
 assert.deepEqual(resolveMultiProductIdentity(rows,'Does PandaByte xC3 or xS3 have 8MB PSRAM?').products.map(x=>x.sku),['ESPXC3','ESPXS3']);
 assert.equal(resolveMultiProductIdentity(rows,'Which ESP32 has 8MB?').kind,'clarification');assert.equal(resolveMultiProductIdentity(rows,'Does xC3 or ESP32 have PSRAM?').kind,'clarification');
 assert.deepEqual(resolveMultiProductIdentity(rows,'What about xC3m?').products.map(x=>x.sku),['ESPXC3M']);assert.equal(resolveMultiProductIdentity(rows,'xC3 xC3m xS3 xC6').kind,'clarification');assert.equal(resolveMultiProductIdentity(rows,'ESP32-C3').kind,'clarification');
});
const skip=!snapshot&&'private catalog fixture unavailable';
const hash=s=>createHash('sha256').update(s).digest('hex');
function fixture(mode="default"){
 const urls=['pandabyte-xc3-esp32c3-microcontroller-board-arduino-compatible','pandabyte-xs3-esp32-s3-microcontroller-board-arduino-compatible'];
 const catalog=urls.map((slug,i)=>{const x=snapshot.chunks.find(c=>c.source_url.endsWith('/'+slug));return {id:x.product_id,sku:i?'ESPXS3':'ESPXC3',title:i?'PandaByte xS3 ESP32-S3 Board':'PandaByte xC3 ESP32-C3 Board',sourceUrl:x.source_url,approvedChunksCount:1};});let valid=true,allowed=true,revoked=null;
 const client={database:{rpc:async()=>({data:{items:catalog},error:null})}},source=(product,i)=>{const text=mode==="identical"?`PSRAM shared ${i}`:mode==="large"?`PSRAM ${product.sku} `+"x".repeat(10980):`PSRAM memory ${i} for ${product.sku}.`;return {handle:`panda:00000000-0000-4000-8000-${String(i+1).padStart(12,'0')}:${hash(product.id+':'+i)}:${hash('version:'+product.id+':'+i)}`,productId:mode==='wrong-product'?'other':product.id,text,textHash:hash(text),header:'fixture',physicalRevision:null,blocked:false,title:product.title,sourceUrl:product.sourceUrl,capturedAt:'2026-10-30T00:00:00Z',sectionPath:['Specs']};};
 const createAdapters=()=>({resolveIdentity:async()=>{throw Error('unused')},currentScope:async(_actor,p)=>{const product=catalog.find(x=>x.id===p.id);return {fingerprint:valid&&revoked!==p.id?'current':'changed',candidate:true,sealed:true,engineeringVerified:true,manifestVerified:true,configVerified:true,generationCurrent:true,chunks:Array.from({length:5},(_,i)=>source(product,i))};},lexical:async(_q,handles)=>handles,dense:async()=>[],select:async()=>{throw Error('unused')}});
 return {input:{actor:{subject:'admin'},question:'Does xC3 or xS3 have 8MB PSRAM?',client,createAdapters,authorizeCurrent:async()=>allowed},catalog,revoke:id=>revoked=id,deny:()=>allowed=false,change:()=>valid=false};
}
test('per-product source pipeline and fair merge with revalidation',{skip},async()=>{const f=fixture(),value=await prepareProductContextSet(f.input);assert.equal(value.kind,'ready');assert.equal(value.passages.length,8);assert.deepEqual(value.passages.map(x=>x.productSku),['ESPXC3','ESPXS3','ESPXC3','ESPXS3','ESPXC3','ESPXS3','ESPXC3','ESPXS3']);assert.ok(value.passages.every(p=>p.text.includes(p.productSku)));assert.equal(await value.revalidate(),true);f.revoke(f.catalog[1].id);assert.equal(await value.revalidate(),false);});
test('a retrieval-only workflow reads each selected scope and the full catalog twice through release', { skip }, async () => {
 const {runRagWorkflow}=await import('../src/control-room/rag-workflow.ts');
 const f=fixture(), calls={catalog:0,scopes:0,actor:0};
 const rpc=f.input.client.database.rpc;
 f.input.client.database.rpc=(...args)=>{calls.catalog++;return rpc(...args);};
 const factory=f.input.createAdapters;
 f.input.createAdapters=()=>{
  const adapters=factory(), read=adapters.currentScope;
  return {...adapters,currentScope:(...args)=>{calls.scopes++;return read(...args);}};
 };
 f.input.authorizeCurrent=async()=>{calls.actor++;return true;};
 const result=await runRagWorkflow({question:f.input.question,evaluate:false,signal:new AbortController().signal},{
  authorize:f.input.authorizeCurrent,
  prepare:createWorkflowProductContextPreparer(f.input),
 });
 assert.equal(result.outcome,'retrieved');
 assert.deepEqual(calls,{catalog:2,scopes:4,actor:3});
 assert.equal(result.metrics.contextRevalidationCount,1);
});
test('only the original preparation callback with the same actor guard handles workflow entry',async()=>{
 const {runRagWorkflow}=await import('../src/control-room/rag-workflow.ts');
 for(const scenario of ['matched','wrapped','different','denied','revoked-at-release']){
  const events=[];
  const authorize=async()=>{events.push('authorize');return scenario!=='denied' && !(scenario==='revoked-at-release'&&events.includes('catalog'));};
  const prepare=createWorkflowProductContextPreparer({
   actor:{subject:'admin'},authorizeCurrent:authorize,createAdapters:()=>{throw Error('unexpected scope read');},
   client:{database:{rpc:async()=>{events.push('catalog');return {data:{items:[]},error:null};}}},
  });
  const run=runRagWorkflow({question:'Which board?',evaluate:false,signal:new AbortController().signal},{
   authorize:scenario==='different'?async()=>{events.push('other guard');return false;}:authorize,
   prepare:scenario==='wrapped'?Object.assign((...args)=>prepare(...args),{authorizedBy:authorize}):prepare,
  });
  if(scenario==='denied'||scenario==='different'||scenario==='revoked-at-release'){
   await assert.rejects(run,/Workflow unavailable/);
  }else{
   assert.equal((await run).outcome,'clarification');
  }
  const expected=scenario==='different'?['other guard']:scenario==='denied'?['authorize']:['authorize','catalog','authorize'];
  if(scenario==='wrapped')expected.unshift('authorize');
  assert.deepEqual(events,expected,scenario);
 }
});
test('cancellation and administrator revocation withhold the entire snapshot',{skip},async()=>{const f=fixture(),c=new AbortController();c.abort();assert.equal((await prepareProductContextSet({...f.input,signal:c.signal})).kind,'unavailable');f.deny();assert.equal((await prepareProductContextSet(f.input)).kind,'unavailable');});

test('cross-product chunks are withheld and identical source bodies stay separate',{skip},async()=>{
 const bad=fixture('wrong-product');assert.notEqual((await prepareProductContextSet(bad.input)).kind,'ready');
 const f=fixture('identical'),result=await prepareProductContextSet(f.input);assert.equal(result.kind,'ready');assert.equal(result.passages[0].text,result.passages[1].text);assert.notEqual(result.passages[0].productSku,result.passages[1].productSku);
});
test('never starves a product when the first passages cannot fit together',{skip},async()=>{const f=fixture('large');assert.equal((await prepareProductContextSet(f.input)).kind,'insufficient');});
test('captured source projection supplies separately tagged xC3 and xS3 contexts',{skip},async()=>{
 const {createInsforgeAdapters}=await import('../src/retrieval/insforge-adapters.ts');const {ENGINEERING_CONFIG,ENGINEERING_MANIFEST}=await import('../src/retrieval/engineering-proof.ts');const f=fixture();
 const client={database:{rpc:async(name,params)=>{if(name==='panda_agent_runtime_products')return {data:{items:f.catalog},error:null};const p=f.catalog.find(x=>x.id===params.p_product);if(!p)return {data:null,error:'missing'};const chunks=snapshot.chunks.filter(x=>x.product_id===p.id).map(x=>({documentVersionId:x.version_id,logicalChunkId:x.logical_chunk_id,chunkVersionId:x.chunk_version_id,text:x.text,textHash:x.content_sha256,generation:x.generation,physicalRevision:null,capturedAt:'2026-10-31T00:00:00Z',sectionPath:x.locator.section_path}));return {data:{candidate:{configHash:ENGINEERING_CONFIG,manifestHash:ENGINEERING_MANIFEST,membershipHash:ENGINEERING_MANIFEST,memberCount:284,state:'candidate',sealed:true},product:p,chunks},error:null};}}};
 const result=await prepareProductContextSet({...f.input,client,createAdapters:()=>createInsforgeAdapters(client,async()=>{throw Error('unused');})});assert.equal(result.kind,'ready');assert.deepEqual([...new Set(result.passages.map(x=>x.productSku))],['ESPXC3','ESPXS3']);assert.ok(result.passages.length<=8);assert.equal(await result.revalidate(),true);
});
test('comparison unknown targets clarify while named shared families remain usable',()=>{
 for(const q of ['Compare xC3 with xUnknown99','Compare xC3 with UNKNOWN123','DHT11 or ESP32','Compare xC3 ESP32 with ESP32'])assert.equal(resolveMultiProductIdentity(rows,q).kind,'clarification',q);
 assert.deepEqual(resolveMultiProductIdentity(rows,'Compare xC3 ESP32 with xS3 ESP32').products.map(x=>x.sku),['ESPXC3','ESPXS3']);
 assert.deepEqual(resolveMultiProductIdentity(rows,'What is xC3?').products.map(x=>x.sku),['ESPXC3']);
});
test('captured catalog rejects an unknown comparison side',{skip},async()=>{const f=fixture();const result=await prepareProductContextSet({...f.input,question:'Compare xC3 with xUnknown99'});assert.equal(result.kind,'clarification');});
test('only single-product context carries the exact legacy text and provenance binding',{skip},async()=>{
 const f=fixture(),one=await prepareProductContextSet({...f.input,question:'What PSRAM does xC3 have?'});assert.equal(one.kind,'ready');assert.ok(one.legacyBinding);assert.equal(one.legacyBinding.textDigest,hash(JSON.stringify(one.passages.map(({rank,text})=>({rank,text})))));
 const base=f.input.createAdapters(),scope=await base.currentScope(f.input.actor,{id:f.catalog[0].id,sku:f.catalog[0].sku});const {playgroundContextProof}=await import('../src/control-room/playground-context-proof.ts');const fragments=one.passages.map(p=>{const chunk=scope.chunks.find(c=>c.text===p.text);return {handle:chunk.handle,text:p.text};});assert.equal(one.legacyBinding.provenanceDigest,playgroundContextProof({id:f.catalog[0].id,sku:f.catalog[0].sku},scope.fingerprint,fragments,scope.chunks));
 const both=await prepareProductContextSet(f.input);assert.equal(both.kind,'ready');assert.ok(!('legacyBinding' in both));
});
test('explicit unresolved comparisons clarify; ordinary property wording remains single-product',()=>{
 for(const q of ['Compare xC3 with Arduino Uno','Compare xC3 and a mystery board','xC3 versus a generic board','between xC3 and another board'])assert.equal(resolveMultiProductIdentity(rows,q).kind,'clarification',q);
 assert.deepEqual(resolveMultiProductIdentity(rows,'xC3 with WiFi').products.map(x=>x.sku),['ESPXC3']);
});
test('product reads run concurrently and revalidation uses two Admin checks plus every scope',{skip},async()=>{
 const f=fixture(),original=f.input.createAdapters;let entered=0,release;const gate=new Promise(resolve=>{release=resolve;});let authCalls=0,scopeCalls=0;
 f.input.authorizeCurrent=async()=>{authCalls++;return true;};f.input.createAdapters=()=>{const a=original(),read=a.currentScope;let first=true;a.currentScope=async(...args)=>{scopeCalls++;if(first){first=false;if(++entered===2)release();await gate;}return read(...args);};return a;};
 const result=await Promise.race([prepareProductContextSet(f.input),new Promise((_,reject)=>setTimeout(()=>reject(Error('product reads were serialized')),1000))]);assert.equal(result.kind,'ready');assert.equal(entered,2);const beforeAuth=authCalls,beforeScopes=scopeCalls;assert.equal(await result.revalidate(),true);assert.equal(authCalls-beforeAuth,2);assert.equal(scopeCalls-beforeScopes,2);
});
test('membership loss or withdrawal during concurrent scope checks withholds release',{skip},async()=>{
 for(const mode of ['membership','source']){const f=fixture(),original=f.input.createAdapters;let pause=false,entered=0,started,release;const begun=new Promise(r=>{started=r;}),gate=new Promise(r=>{release=r;});
  f.input.createAdapters=()=>{const a=original(),read=a.currentScope;a.currentScope=async(...args)=>{if(pause){if(++entered===2)started();await gate;}return read(...args);};return a;};
  const result=await prepareProductContextSet(f.input);assert.equal(result.kind,'ready');pause=true;const pending=result.revalidate();await begun;if(mode==='membership')f.deny();else f.revoke(f.catalog[1].id);release();assert.equal(await pending,false);
 }
});

test('unknown product choice before a shared predicate clarifies without blocking property alternatives',()=>{
 for(const q of ['Does xC3 or Arduino Uno have 8 MB PSRAM?','Does xC3 or a mystery board support WiFi?','Does xC3 or an unknown module use USB?'])assert.equal(resolveMultiProductIdentity(rows,q).kind,'clarification',q);
 assert.deepEqual(resolveMultiProductIdentity(rows,'Does xC3 or xS3 have 8 MB PSRAM?').products.map(p=>p.sku),['ESPXC3','ESPXS3']);
 assert.deepEqual(resolveMultiProductIdentity(rows,'Does xC3 have WiFi or Bluetooth?').products.map(p=>p.sku),['ESPXC3']);
});

test('synthetic context avoids selector and redundant reads while withholding stale sources',async()=>{
 const product={id:'00000000-0000-4000-8000-000000000001',sku:'SYNTHXC3',title:'PandaByte xC3 Board',sourceUrl:'https://pandabyte.in/product-page/synthetic-xc3',approvedChunksCount:1};
 const membershipKey=hash(product.id);assert.equal(PRODUCT_MEMBERSHIP[membershipKey],undefined);
 PRODUCT_MEMBERSHIP[membershipKey]={count:1,digest:'0'.repeat(64)};
 try {
  let scopeReads=0,catalogReads=0,revoked=false,revokeOnRead=0,allowed=true,selectionCalls=0,duplicate=false;
  const body='Synthetic xC3 uses an ESP32-C3.';
  const chunk={handle:`panda:00000000-0000-4000-8000-000000000002:${hash('logical')}:${hash('version')}`,productId:product.id,text:body,textHash:hash(body),header:'fixture',physicalRevision:null,blocked:false,title:product.title,sourceUrl:product.sourceUrl,capturedAt:'2026-10-30T00:00:00Z',sectionPath:['Specs']};
  const input={actor:{subject:'admin'},question:'What does xC3 use?',
   client:{database:{rpc:async()=>{catalogReads++;return {data:{items:[product]},error:null};}}},
   createAdapters:()=>({resolveIdentity:async()=>{throw Error('unused')},currentScope:async()=>{scopeReads++;return {fingerprint:revoked||scopeReads===revokeOnRead?'withdrawn':'current',candidate:true,sealed:true,engineeringVerified:true,manifestVerified:true,configVerified:true,generationCurrent:true,chunks:duplicate?[structuredClone(chunk),{...chunk,sourceUrl:'https://evil.test/private'}]:[structuredClone(chunk)]};},lexical:async(_q,handles)=>handles,dense:async()=>[],select:async()=>{selectionCalls++;throw Error('unused');}}),
   authorizeCurrent:async()=>allowed};
  const ready=await prepareProductContextSet(input);
  assert.equal(ready.kind,'ready');assert.equal(ready.authorizedBy,input.authorizeCurrent);assert.equal(selectionCalls,0);assert.equal(scopeReads,2);assert.equal(catalogReads,2);
  assert.equal(await ready.revalidate(),true);assert.equal(scopeReads,3);
  const beforeDeferred={scopeReads,catalogReads};
  const pendingRelease=await prepareProductContextSet(input,'at_workflow_release');
  assert.equal(pendingRelease.kind,'ready');
  assert.equal(scopeReads-beforeDeferred.scopeReads,1,'only the initial scope is needed to rank passages');
  assert.equal(catalogReads-beforeDeferred.catalogReads,1,'only the initial catalog is needed to plan products');
  revoked=true;
  assert.equal(await pendingRelease.revalidate(),false,'the final release must see a withdrawal after ranking');
  revoked=false;
  assert.equal(scopeReads-beforeDeferred.scopeReads,2);
  assert.equal(catalogReads-beforeDeferred.catalogReads,2);
  duplicate=true;assert.equal((await prepareProductContextSet(input)).kind,'unavailable');duplicate=false;
  revoked=true;assert.equal(await ready.revalidate(),false);
  revoked=false;revokeOnRead=scopeReads+2;assert.equal((await prepareProductContextSet(input)).kind,'unavailable');
  revokeOnRead=0;allowed=false;assert.equal((await prepareProductContextSet(input)).kind,'unavailable');assert.equal(selectionCalls,0);
 } finally { delete PRODUCT_MEMBERSHIP[membershipKey]; }
});

test('catalog and source revalidation overlap and withhold revoked or aborted results', {timeout:5000}, async()=>{
 const product={id:'00000000-0000-4000-8000-000000000003',sku:'SYNTHXC3',title:'PandaByte xC3 Board',sourceUrl:'https://pandabyte.in/product-page/synthetic-xc3',approvedChunksCount:1};
 const membershipKey=hash(product.id);assert.equal(PRODUCT_MEMBERSHIP[membershipKey],undefined);
 PRODUCT_MEMBERSHIP[membershipKey]={count:1,digest:'0'.repeat(64)};
 try {
  for(const scenario of ['current','membership','source','catalog','abort','scope-error','catalog-error']){
   let pause=false,allowed=true,revoked=false,catalogChanged=false,catalogStarted=false,scopeStarted=false,authCalls=0,release,startCatalog;
   const gate=new Promise(resolve=>{release=resolve;}),catalogEntered=new Promise(resolve=>{startCatalog=resolve;}),controller=new AbortController();
   const body='Synthetic xC3 uses an ESP32-C3.';
   const chunk={handle:`panda:00000000-0000-4000-8000-000000000004:${hash('logical')}:${hash('version')}`,productId:product.id,text:body,textHash:hash(body),header:'fixture',physicalRevision:null,blocked:false,title:product.title,sourceUrl:product.sourceUrl,capturedAt:'2026-10-30T00:00:00Z',sectionPath:['Specs']};
   const input={actor:{subject:'admin'},question:'What does xC3 use?',signal:controller.signal,
    client:{database:{rpc:async()=>{if(pause){catalogStarted=true;startCatalog();await gate;if(scenario==='catalog-error')throw Error('unavailable');}return {data:{items:[catalogChanged?{...product,title:'PandaByte xC3 Changed Board'}:product]},error:null};}}},
    createAdapters:()=>({resolveIdentity:async()=>{throw Error('unused')},currentScope:async()=>{if(pause){scopeStarted=true;await gate;if(scenario==='scope-error')throw Error('unavailable');}return {fingerprint:revoked?'withdrawn':'current',candidate:true,sealed:true,engineeringVerified:true,manifestVerified:true,configVerified:true,generationCurrent:true,chunks:[structuredClone(chunk)]};},lexical:async(_q,handles)=>handles,dense:async()=>[],select:async()=>{throw Error('unused');}}),
    authorizeCurrent:async()=>{authCalls++;return allowed;}};
   const ready=await prepareProductContextSet(input);assert.equal(ready.kind,'ready');
   pause=true;const beforeAuth=authCalls,pending=ready.revalidate();
   try {
    await catalogEntered;assert.equal(catalogStarted,true);assert.equal(scopeStarted,true,'scope check must start before catalog completes');
    if(scenario==='membership')allowed=false;
    if(scenario==='source')revoked=true;
    if(scenario==='catalog')catalogChanged=true;
    if(scenario==='abort')controller.abort();
   } finally {release();}
   assert.equal(await pending,scenario==='current',scenario);
   assert.equal(authCalls-beforeAuth,scenario==='abort'?1:2,'authorization checks bracket parallel reads');
   if(scenario==='current'){
    allowed=false;catalogStarted=false;scopeStarted=false;
    assert.equal(await ready.revalidate(),false);
    assert.equal(catalogStarted,false);assert.equal(scopeStarted,false);
   }
  }
 } finally {delete PRODUCT_MEMBERSHIP[membershipKey];}
});
test('captured catalog clarifies unknown product choice',{skip},async()=>{const f=fixture();const result=await prepareProductContextSet({...f.input,question:'Does xC3 or Arduino Uno have 8 MB PSRAM?'});assert.equal(result.kind,'clarification');});
