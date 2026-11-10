import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {dirname,join} from 'node:path';
import {isMainProductQuestion,isImplicitProductFollowup,resolveMainFollowupScope,createMainRagRouter,prepareMainRagContext} from '../src/server/main-rag-chat.ts';
import {runBasicRag} from '../src/retrieval/basic-rag.ts';
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

test('short pronoun hardware follow-ups are grounded and explicit product identity overrides history',()=>{
 for(const question of ['What is its USB connector?','Does it support Bluetooth?','Can it run from 5 V?',
  'How much does it cost?','Is it in stock?','What is its operating temperature?','Does it have certification?']){
  assert.equal(isImplicitProductFollowup(question,catalog),true,question);assert.equal(isMainProductQuestion(question,catalog),true,question);
 }
 for(const question of ['Does BOARDGREEN support Bluetooth?','What is its xGreen32 USB connector?','Can it run from 5 V, the xUnknown90?',
  'Explain Bluetooth in one sentence.','Explain it more simply.','Explain it in JavaScript.','Explain UART.','Hello!'])assert.equal(isImplicitProductFollowup(question,catalog),false,question);
});

test('explicit project name/deadline recall stays conversational despite its pronoun',async()=>{
 for(const question of [
  'What is my project name and its current deadline? Reply in one short sentence.',
  "What is my project's name and its updated deadline?",
  'Remind me of my project name and deadline.',
  'What is the current deadline of my project?',
  'When is my project due?',
 ]){
  assert.equal(isImplicitProductFollowup(question,catalog),false,question);
  assert.equal(isMainProductQuestion(question,catalog),false,question);
  const f=fixture();await f.router.start({...turn,question},signal());
  assert.deepEqual(f.calls.map(c=>c[0]),['route','direct'],question);
 }
});

test('project-memory wording cannot bypass product identities, mixed hardware or ambiguous follow-ups',()=>{
 for(const question of [
  'What is my project name and its BOARDGREEN voltage?',
  'What is my project name and its xUnknown99 MCU?',
  'What is my project name and its pinout?',
  'What is my project deadline and can it run from 5 V?',
  'What is its name and current deadline?',
  'What are its specifications?',
  'What is my project name and its weight?',
 ])assert.equal(isMainProductQuestion(question,catalog),true,question);
});

test('long factual references request grounded clarification without inheriting an implicit product',()=>{
 const question='Does it support '+Array(35).fill('this feature').join(' ')+'?';
 assert.equal(isMainProductQuestion(question,catalog),true);
 assert.equal(isImplicitProductFollowup(question,catalog),false);
});

function historyFixture(){
 const citation={id:'S1',title:catalog[0].title,sourceUrl:catalog[0].sourceUrl,capturedAt:'2026-10-31T00:00:00Z',sectionPath:['Specs'],quote:'Reviewed source'};
 return {thread:{id:turn.thread,title:'Disposable',updatedAt:'2026-11-10T00:00:00Z',status:'idle'},messages:[],turns:[{
  requestId:'40000000-0000-4000-8000-000000000001',question:'Which MCU does BOARDGREEN use?',status:'complete',createdAt:'2026-11-10T00:00:00Z',
  response:{outcome:'evidence',text:'Prior answer must never enter model evidence.',citations:[citation]},
 }]};
}
test('history carry-over requires latest verified evidence and one exact current product across all citations',()=>{
 const history=historyFixture(),scope=resolveMainFollowupScope(history,catalog,turn.thread);
 assert.equal(scope.sku,'BOARDGREEN');assert.match(scope.anchor,/^[a-f0-9]{64}$/);
 const ownPending={requestId:turn.request,question:'What is its USB connector?',status:'pending',response:null,createdAt:'2026-11-10T00:01:00Z'};
 history.turns.push(ownPending);assert.equal(resolveMainFollowupScope(history,catalog,turn.thread),null);
 assert.deepEqual(resolveMainFollowupScope(history,catalog,turn.thread,turn.request),scope);
 for(const change of [
  h=>{h.turns=[];},h=>{h.thread.id=turn.request;},h=>{h.turns[0].response.citations=[];},
  h=>{h.turns[0].response.outcome='insufficient';},h=>{h.turns[0].response.citations[0].title='Unverified title';},
  h=>{h.turns[0].response.citations[0].sourceUrl='https://example.com/foreign';},
  h=>{h.turns[0].question='Compare BOARDGREEN with CABLECHARGE';},h=>{h.turns[0].question='Which MCU does xUnknown90 use?';},
  h=>{h.turns[0].response.citations.push({...h.turns[0].response.citations[0],title:catalog[1].title,sourceUrl:catalog[1].sourceUrl});},
  h=>{h.turns.push({...ownPending,requestId:'50000000-0000-4000-8000-000000000001'});},
  h=>{h.turns.push({...ownPending,status:'complete',response:{outcome:'conversation',text:'Hello',citations:[]}});},
  h=>{h.turns.push({...ownPending,status:'complete',response:{outcome:'clarification',text:'Which unknown product?',citations:[]}});},
 ]){const h=historyFixture();change(h);assert.equal(resolveMainFollowupScope(h,catalog,turn.thread),null);}
 const edited=historyFixture();edited.turns[0].response.text='Changed';
 assert.notEqual(resolveMainFollowupScope(edited,catalog,turn.thread).anchor,scope.anchor);
 assert.equal(resolveMainFollowupScope(historyFixture(),[],turn.thread),null,'withdrawn current catalog product');
 assert.equal(resolveMainFollowupScope(historyFixture(),[catalog[0],{...catalog[0],sku:'DUPLICATE'}],turn.thread),null,'ambiguous catalog match');
 const followup=historyFixture();followup.turns[0].question='What is its USB connector?';assert.equal(resolveMainFollowupScope(followup,catalog,turn.thread).sku,'BOARDGREEN');
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
test('router provides only the current thread to follow-up selection and keeps the visible question intact',async()=>{
 let seen;
 const bridge={state:async()=>false,start:async value=>{assert.equal(value.question,'What is its USB connector?');return {status:'saved'};},status:async()=>({status:'unknown'}),cancel:async()=>({status:'saved'})};
 const router=createMainRagRouter({rag:bridge,direct:bridge,legacy:bridge,route:async(question,_signal,_report,thread)=>{seen={question,thread};return 'rag';}});
 await router.start({...turn,question:'What is its USB connector?'},signal());assert.deepEqual(seen,{question:'What is its USB connector?',thread:turn.thread});
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

test('implicit retrieval carries identity only, preserves provider question and fences changed history before send and release',
 {skip:!sourcePath&&'private reviewed source snapshot unavailable'},async()=>{
 const snapshot=await reviewedSnapshot(),snapshotClient=createSnapshotClient(snapshot),liveClient=createSnapshotClient(snapshot);
 const product=snapshot.catalog.items.find(row=>row.sku==='ESPX8266');assert.ok(product);
 const prior=historyFixture();prior.turns[0].question=`Which MCU does ${product.sku} use?`;prior.turns[0].response.citations[0].sourceUrl=product.sourceUrl;prior.turns[0].response.citations[0].title=product.title;
 const anchor=resolveMainFollowupScope(prior,snapshot.catalog.items,turn.thread);assert.ok(anchor);
 const question='What is its USB connector?',authorize=async()=>true;
 const historyCurrent=async()=>resolveMainFollowupScope(prior,snapshot.catalog.items,turn.thread)?.anchor===anchor.anchor;
 const prepare=()=>prepareMainRagContext({subject:snapshot.subject,question,retrievalQuestion:`${question}\nProduct SKU: ${anchor.sku}`,
  signal:signal(),snapshotClient,liveClient,authorizeCurrent:authorize,adminCurrent:authorize,historyCurrent});
 const context=await prepare();assert.equal(context.kind,'ready');assert.equal(context.products[0].sku,product.sku);
 assert.ok(context.passages.every(p=>!p.text.includes('Prior answer must never enter model evidence.')));
 const answer=async(input,beforeSend)=>{
  assert.equal(input.question,question,'model and journal retain the user question');assert.ok(await beforeSend());
  return {evaluation:{answer:'The captured listing identifies the connector.',evidence:[{rank:1,quote:input.passages[0].text.slice(0,40),reason:'Captured listing'}]},usage:{inputTokens:20,outputTokens:20,costNanoUsd:0}};
 };
 const success=await runBasicRag({question,signal:signal()},{authorize,prepare,complete:answer});assert.equal(success.status,'answered');
 prior.turns[0].response.citations=[];assert.equal(await context.revalidate(),false,'masked or revoked prior evidence blocks dispatch');
 const before=await runBasicRag({question,signal:signal()},{authorize,prepare,complete:async(_input,beforeSend)=>{
  assert.equal(await beforeSend(),false);throw Object.assign(Error('denied'),{code:'not_admitted'});
 }});assert.notEqual(before.status,'answered');
 prior.turns[0].response.citations=[{id:'S1',sourceUrl:product.sourceUrl,title:product.title,capturedAt:'2026-10-31T00:00:00Z',sectionPath:['Specs'],quote:'Reviewed source'}];
 const late=await runBasicRag({question,signal:signal()},{authorize,prepare,complete:async(input,beforeSend)=>{
  const value=await answer(input,beforeSend);prior.turns[0].response.text='Changed during model response';return value;
 }});assert.notEqual(late.status,'answered','changed history blocks release after model receipt');
});
