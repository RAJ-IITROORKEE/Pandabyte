import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {dirname,join} from 'node:path';
import {isMainProductQuestion,createMainRagRouter,prepareMainRagContext} from '../src/server/main-rag-chat.ts';
import {createSnapshotClient} from '../src/retrieval/snapshot-client.ts';
import {ENGINEERING_CONFIG,ENGINEERING_MANIFEST} from '../src/retrieval/engineering-proof.ts';
import {loadEvaluationCases,evaluationCaseSet} from '../src/control-room/evaluation-cases.ts';
import {runEvaluationCase} from '../src/control-room/evaluation-runner.ts';

const catalog=[{id:'10000000-0000-4000-8000-000000000001',sku:'BOARDGREEN',title:'xGreen32 development board',sourceUrl:'https://pandabyte.in/product-page/green',approvedChunksCount:1},
 {id:'10000000-0000-4000-8000-000000000002',sku:'CABLECHARGE',title:'Type-C Data and Charging USB Cable',sourceUrl:'https://pandabyte.in/product-page/cable',approvedChunksCount:1}];
const turn={thread:'20000000-0000-4000-8000-000000000001',request:'30000000-0000-4000-8000-000000000001',question:'What MCU does BOARDGREEN use?'};
const signal=()=>new AbortController().signal;

test('catalog identity, descriptive product questions, unknown models and mixed requests stay grounded',()=>{
 for(const question of ['What MCU does BOARDGREEN use?','What flash does xGreen32 have?','How long is the Type-C charging USB cable?',
  'Does PandaByte sell a board with Bluetooth?','Which MCU does xMystery999 use?','Does xUnknown support Wi-Fi?','What voltage does this board use?',
  'What memory does the ESP32 board have?','Does BOARDGREEN have UL certification?','Tell a joke and tell me the voltage of BOARDGREEN',
  'Compare BOARDGREEN with xUnknown90','What is its USB connector?','What MCU does that board use?'])assert.equal(isMainProductQuestion(question,catalog),true,question);
 for(const question of ['Hello!','Who are you?','Explain UART in one sentence.','How do I format a Markdown table?','What is 2 + 2?'])
  assert.equal(isMainProductQuestion(question,catalog),false,question);
});

function fixture({owner=null,result={status:'saved'},modelAllowed=true}={}){
 const calls=[],bridges={};
 for(const name of ['rag','direct','legacy'])bridges[name]={
  state:async()=>owner===name,
  start:async(value)=>{calls.push([name,'start',value.question]);if(result instanceof Error)throw result;return result;},
  status:async()=>{calls.push([name,'status']);return {status:'unknown'};},
  cancel:async()=>{calls.push([name,'cancel']);return {status:'saved'};},
 };
 const router=createMainRagRouter({...bridges,modelAllowed:()=>modelAllowed,route:async question=>{calls.push(['route']);return isMainProductQuestion(question,catalog)?'rag':'direct';}});
 return {router,calls};
}
test('product and unsupported requests use the RAG journal; general questions use direct',async()=>{
 for(const question of [turn.question,'Does BOARDGREEN have UL certification?','Compare BOARDGREEN with xUnknown90','Tell a joke and tell me the voltage of BOARDGREEN']){
  const f=fixture();assert.deepEqual(await f.router.start({...turn,question},signal()),{status:'saved'});
  assert.deepEqual(f.calls.map(c=>c[0]),['route','rag']);
 }
 const f=fixture();await f.router.start({...turn,question:'Explain UART in one sentence.'},signal());
 assert.deepEqual(f.calls.map(c=>c[0]),['route','direct']);
});
test('RAG unavailability, uncertainty and errors never fall through to direct generation',async()=>{
 for(const result of [{status:'unknown'},new Error('unavailable')]){
  const f=fixture({result});if(result instanceof Error)await assert.rejects(f.router.start(turn,signal()));else assert.deepEqual(await f.router.start(turn,signal()),result);
  assert.deepEqual(f.calls.map(c=>c[0]),['route','rag']);
 }
});
test('persisted RAG, direct and legacy requests keep their own replay/status/cancel path',async()=>{
 for(const owner of ['rag','direct','legacy']){
  const f=fixture({owner,modelAllowed:false});assert.equal(await f.router.state(turn.thread,turn.request),true);
  await f.router.start(turn,signal());await f.router.status(turn,signal());await f.router.cancel(turn,signal());
  assert.deepEqual(f.calls.map(c=>c.slice(0,2)),[[owner,'start'],[owner,'status'],[owner,'cancel']]);
 }
});
test('new request selection remains stable for subsequent status/cancel and rejects another model',async()=>{
 const f=fixture();assert.equal(await f.router.state(turn.thread,turn.request),false);
 await f.router.start(turn,signal());await f.router.status(turn,signal());await f.router.cancel(turn,signal());
 assert.deepEqual(f.calls.map(c=>c[0]),['route','rag','rag','rag']);
 const denied=fixture({modelAllowed:false});await assert.rejects(denied.router.start(turn,signal()),e=>e.code==='unavailable');assert.deepEqual(denied.calls,[]);
});
test('conflicting journal ownership fails closed before any execution',async()=>{
 const f=fixture();const bridge={state:async()=>true,start:()=>assert.fail(),status:()=>assert.fail(),cancel:()=>assert.fail()};
 const router=createMainRagRouter({direct:bridge,rag:bridge,legacy:bridge,route:async()=>assert.fail()});
 await assert.rejects(router.start(turn,signal()),e=>e.code==='conflict');assert.deepEqual(f.calls,[]);
});

const sourcePath=process.env.PANDA_TEST_RAG_SNAPSHOT;
async function reviewedSnapshot(){
 const {chunks}=JSON.parse(await readFile(sourcePath,'utf8'));
 const {rows}=JSON.parse(await readFile(join(dirname(sourcePath),'canonical-mapping.json'),'utf8'));
 const candidate={configHash:ENGINEERING_CONFIG,manifestHash:ENGINEERING_MANIFEST,membershipHash:ENGINEERING_MANIFEST,memberCount:284,state:'candidate',sealed:true};
 const snapshot={subject:'user_test',catalog:{items:[]},scopes:{}};
 for(const row of rows){
  const selected=chunks.filter(x=>x.product_id===row.record_id);
  const product={id:row.record_id,sku:row.skus[0],title:selected[0].locator.section_path[0],sourceUrl:row.source_url};
  snapshot.catalog.items.push({...product,approvedChunksCount:selected.length});
  snapshot.scopes[product.id]={candidate,product,chunks:selected.map(x=>({documentVersionId:x.version_id,logicalChunkId:x.logical_chunk_id,
   chunkVersionId:x.chunk_version_id,text:x.text,textHash:x.content_sha256,generation:x.generation,physicalRevision:null,capturedAt:'2026-10-31T00:00:00Z',sectionPath:x.locator.section_path}))};
 }
 return snapshot;
}
test('all 20 frozen cases select RAG and preserve reviewed source quality through the main-chat preparer',
 {skip:!(sourcePath&&process.env.PANDA_AGENT_EVALUATION_PACK_FILE)&&'private reviewed inputs unavailable'},async()=>{
 const snapshot=await reviewedSnapshot(),pack=await loadEvaluationCases(),authorize=async()=>true,corpusFingerprint='f'.repeat(64);
 for(let caseIndex=0;caseIndex<pack.cases.length;caseIndex++){
  const c=pack.cases[caseIndex],snapshotClient=createSnapshotClient(snapshot),liveClient=createSnapshotClient(snapshot);
  assert.equal(isMainProductQuestion(c.question,snapshot.catalog.items),true,c.id);
  const result=await runEvaluationCase({runId:turn.request,caseIndex,caseSetKey:evaluationCaseSet.key,corpusFingerprint,mode:'retrieval',signal:signal()},pack,{
   authorize,readCorpusFingerprint:async()=>corpusFingerprint,
   prepare:(question,abort)=>prepareMainRagContext({subject:snapshot.subject,question,signal:abort,snapshotClient,liveClient,authorizeCurrent:authorize,adminCurrent:authorize}),
  });
  assert.equal(result.status,'passed',c.id);assert.equal(result.modelStatus,'not_requested');
 }
 assert.equal(pack.cases.length,20);
});
test('snapshot-selected evidence is revalidated from live reads and fails after source/Admin/session revocation',
 {skip:!sourcePath&&'private reviewed source snapshot unavailable'},async()=>{
 const snapshot=await reviewedSnapshot();
 const immutable=createSnapshotClient(snapshot),question='Which MCU does the x8266 use?';
 let live=createSnapshotClient(snapshot),reads=0,admin=true,session=true;
 const liveClient={database:{rpc:async(...args)=>{reads++;return live.database.rpc(...args);}}},authorizeCurrent=async()=>session;
 const context=await prepareMainRagContext({subject:snapshot.subject,question,signal:signal(),snapshotClient:immutable,liveClient,authorizeCurrent,adminCurrent:async()=>admin});
 assert.equal(context.kind,'ready');assert.equal(reads,0,'ranking must use only immutable request snapshot');assert.equal(context.authorizedBy,authorizeCurrent);
 assert.equal(await context.revalidate(),true);assert.ok(reads>0,'release must consult live RPCs');
 admin=false;assert.equal(await context.revalidate(),false);admin=true;
 session=false;assert.equal(await context.revalidate(),false);session=true;
 const selected=context.products[0].id;snapshot.scopes[selected].chunks[0].text+=' changed';live=createSnapshotClient(snapshot);
 assert.equal(await context.revalidate(),false,'immutable snapshot must never vouch for changed live source');
 assert.equal((await immutable.database.rpc('panda_agent_runtime_scope',{p_product:selected})).data.chunks[0].text.endsWith(' changed'),false);
 delete snapshot.scopes[selected];snapshot.catalog.items=snapshot.catalog.items.filter(p=>p.id!==selected);live=createSnapshotClient(snapshot);
 assert.equal(await context.revalidate(),false,'withdrawn source cannot release selected evidence');
});
