import test from 'node:test';
import assert from 'node:assert/strict';
let network=0;
globalThis.fetch=async()=>{network++;throw Error('Offline fixture forbids network');};
const {runRagWorkflow}=await import('../src/control-room/rag-workflow.ts');
const {createPlaygroundWorkflowHandler}=await import('../src/control-room/playground-workflow-handler.ts');
const question='Does xC3 or xS3 list 8 MB PSRAM?',requestId='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
function fixture(){
 let active=true,current=true,calls=0,prepared=0;
 const products=[{id:'private-one',sku:'ESPXC3',title:'PandaByte xC3'},{id:'private-two',sku:'ESPXS3',title:'PandaByte xS3'}];
 const passages=products.map((p,i)=>({rank:i+1,productSku:p.sku,productTitle:p.title,title:p.title,sourceUrl:`https://www.pandabyte.in/product-page/${p.sku.toLowerCase()}`,capturedAt:'2026-11-04T00:00:00Z',sectionPath:['Specifications'],text:i?'8 MB PSRAM':'4 MB SPI flash'}));
 const context={kind:'ready',products,passages,digest:'a'.repeat(64),sourceProofs:[{productSku:'ESPXC3',fingerprint:'private-fingerprint'}],revalidate:async()=>current};
 const deps={authorize:async()=>active,prepare:async()=>{prepared++;return context;},generationScope:'multiple_products',generate:async(input,beforeSend)=>{calls++;assert.equal(await beforeSend(),true);assert.equal(input.documents[1].pageContent,'8 MB PSRAM');assert.equal(input.documents[1].metadata.productSku,'ESPXS3');return {evaluation:{answer:'The xS3 listing states 8 MB PSRAM.',evidence:[{rank:2,quote:'8 MB PSRAM',reason:'The xS3 passage states its PSRAM.'}]},usage:{inputTokens:100,outputTokens:20,costNanoUsd:27000}};}};
 return {deps,context,callCount:()=>calls,prepareCount:()=>prepared,revoke:()=>active=false,withdraw:()=>current=false};
}
const input=()=>({question,evaluate:false,signal:new AbortController().signal});

test('only retrieval-only runs defer checking ranked passages until final release', async () => {
  for (const evaluate of [false, true]) {
    const f = fixture();
    const prepare = f.deps.prepare;
    f.deps.prepare = async (query, signal, verification) => {
      assert.equal(verification, evaluate ? 'before_use' : 'at_workflow_release');
      return prepare(query, signal);
    };
    const result = await runRagWorkflow({ ...input(), evaluate, requestId }, f.deps);
    assert.equal(result.outcome, 'retrieved');
    assert.equal(f.callCount(), evaluate ? 1 : 0);
  }
});

test('a retrieval-only HTTP response withholds every passage if final release fails', async () => {
  const f = fixture();
  f.context.authorizedBy = f.deps.authorize;
  f.context.revalidate = async () => false;
  const handler = createPlaygroundWorkflowHandler(async () => ({kind:'admin',subject:'owner',dependencies:f.deps}));
  const response = await handler(new Request('https://app.example/api', {
    method: 'POST', headers: { origin:'https://app.example', 'content-type':'application/json' },
    body: JSON.stringify({ question }),
  }));
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { error: { code: 'unavailable' } });
  assert.equal(f.callCount(), 0);
});

test('matching authorized context removes only the redundant outer Admin check',async()=>{
 for(const identity of ['same','different','missing']){
  const f=fixture();let checks=0,reads=0;const authorize=async()=>{checks++;return true;};f.deps.authorize=authorize;
  if(identity!=='missing')f.context.authorizedBy=identity==='same'?authorize:async()=>true;
  f.context.revalidate=async()=>{reads++;return await authorize()&&await authorize();};
  const result=await runRagWorkflow({...input(),evaluate:true,requestId},f.deps);
  assert.equal(result.model.status,'evaluated');assert.equal(reads,identity==='same'?2:3);assert.equal(checks,identity==='same'?6:10);
 }
});

test('matching context checks Admin again after source reads and before dispatch',async()=>{
 const f=fixture();let active=true;const authorize=async()=>active;f.deps.authorize=authorize;f.context.authorizedBy=authorize;
 f.context.revalidate=async()=>{if(!await authorize())return false;active=false;return authorize();};
 await assert.rejects(runRagWorkflow({...input(),evaluate:true,requestId},f.deps));assert.equal(f.callCount(),1);
});

test('matching context withholds the completed model result on revocation or abort during release',async()=>{
 for(const failure of ['withdrawn','aborted']){
  const f=fixture(),controller=new AbortController();let active=true,reads=0;
  const authorize=async()=>active;f.deps.authorize=authorize;f.context.authorizedBy=authorize;
  f.context.revalidate=async()=>{if(!await authorize())return false;if(++reads===2){if(failure==='withdrawn')active=false;else controller.abort();}return authorize();};
  await assert.rejects(runRagWorkflow({...input(),evaluate:true,requestId,signal:controller.signal},f.deps));assert.equal(f.callCount(),1);
 }
});

test('workflow exposes bounded numeric timings without affecting a valid answer',async()=>{
 for(const [timing,expected] of [[{admissionMs:24,providerRoundTripMs:13},[24,13]],[undefined,[null,null]],[{admissionMs:-1,providerRoundTripMs:9},[null,null]],[{admissionMs:120001,providerRoundTripMs:9},[null,null]]]){
  const f=fixture(),generate=f.deps.generate;f.deps.generate=async(...args)=>({...await generate(...args),timing});
  const r=await runRagWorkflow({...input(),evaluate:true,requestId},f.deps);
  assert.equal(r.model.status,'evaluated');assert.equal(r.metrics.contextRevalidationCount,3);assert.ok(Number.isSafeInteger(r.metrics.contextRevalidationMs));
  assert.deepEqual([r.metrics.admissionMs,r.metrics.providerRoundTripMs],expected);assert.equal(f.callCount(),1);
 }
 const retrievalOnly=await runRagWorkflow(input(),fixture().deps);
 assert.equal(retrievalOnly.metrics.contextRevalidationCount,1);assert.equal(retrievalOnly.metrics.admissionMs,null);assert.equal(retrievalOnly.metrics.providerRoundTripMs,null);
});

test('a failed timing observer is omitted without affecting the workflow result',async()=>{
 const f=fixture(),generate=f.deps.generate;f.deps.generate=async(...args)=>{const value=await generate(...args);Object.defineProperty(value,'timing',{get(){throw Error('private observer error');}});return value;};
 const r=await runRagWorkflow({...input(),evaluate:true,requestId},f.deps);assert.equal(r.model.status,'evaluated');assert.equal(r.metrics.admissionMs,null);assert.equal(r.metrics.providerRoundTripMs,null);assert.doesNotMatch(JSON.stringify(r),/private observer error/);
});
test('actual LangGraph SDK retrieves two tagged products without calling a model or exposing private proofs',async()=>{
 const f=fixture(),r=await runRagWorkflow(input(),f.deps);
 assert.equal(r.outcome,'retrieved');assert.deepEqual(r.products.map(p=>p.sku),['ESPXC3','ESPXS3']);assert.equal(r.model.status,'not_requested');assert.equal(f.callCount(),0);
 assert.deepEqual(r.workflow.map(s=>s.stage),['authorize','retrieve','augment','generate','validate','release']);assert.ok(r.workflow.every(s=>s.elapsedMs>=0));assert.equal(r.metrics.inputTokens,null);
 assert.doesNotMatch(JSON.stringify(r),/private-one|private-two|private-fingerprint|sourceProofs|legacyBinding/);
});
test('single-product generation policy cannot dispatch a multi-product context',async()=>{
 const f=fixture();f.deps.generationScope='single_product';const r=await runRagWorkflow({...input(),evaluate:true,requestId},f.deps);
 assert.deepEqual(r.model,{status:'not_run',reason:'multi_product_guard_unavailable'});assert.equal(r.passages.length,2);assert.equal(f.callCount(),0);
});
test('guarded injected completion runs once and quote validation preserves product attribution',async()=>{
 const f=fixture(),r=await runRagWorkflow({...input(),evaluate:true,requestId},f.deps);
 assert.equal(f.callCount(),1);assert.equal(r.model.status,'evaluated');assert.equal(r.passages[r.model.evidence[0].rank-1].productSku,'ESPXS3');assert.equal(r.metrics.costUsd,0.000027);
});
test('invalid model quotations stay unknown and are never retried',async()=>{
 const f=fixture();let sends=0;f.deps.generate=async()=>{sends++;return {evaluation:{answer:'Unsupported',evidence:[{rank:1,quote:'8 MB PSRAM',reason:'Wrong product'}]}};};
 await assert.rejects(runRagWorkflow({...input(),evaluate:true,requestId},f.deps),e=>e.code==='outcome_unknown');assert.equal(sends,1);
});

test('basic zero-cost policy exposes verified zero usage and rejects paid or missing receipts',async()=>{
 for(const cost of [0,1,undefined]){
  const f=fixture();f.deps.usagePolicy='zero_cost';
  const generate=f.deps.generate;
  f.deps.generate=async(...args)=>{const r=await generate(...args);r.usage=cost===undefined?undefined:{inputTokens:100,outputTokens:20,costNanoUsd:cost};return r;};
  if(cost===0){const r=await runRagWorkflow({...input(),evaluate:true,requestId},f.deps);assert.equal(r.metrics.costUsd,0);assert.equal(r.metrics.inputTokens,100);}
  else await assert.rejects(runRagWorkflow({...input(),evaluate:true,requestId},f.deps),e=>e.code==='outcome_unknown');
  assert.equal(f.callCount(),1);
 }
});
test('withdrawal or revoked Admin after generation withholds the result',async()=>{
 for(const revoke of ['withdraw','revoke']){const f=fixture(),complete=f.deps.generate;f.deps.generate=async(...args)=>{const r=await complete(...args);f[revoke]();return r;};await assert.rejects(runRagWorkflow({...input(),evaluate:true,requestId},f.deps));assert.equal(f.callCount(),1);}
});
test('unresolved product and abort never dispatch a model',async()=>{
 const f=fixture();f.deps.prepare=async()=>({kind:'clarification'});const r=await runRagWorkflow({...input(),evaluate:true,requestId},f.deps);assert.equal(r.outcome,'clarification');assert.equal(f.callCount(),0);
 const abort=new AbortController();abort.abort();await assert.rejects(runRagWorkflow({...input(),signal:abort.signal},fixture().deps));
});
test('ambient tracing and verbose flags fail closed before SDK work or network access',async()=>{
 const names=['LANGSMITH_TRACING','LANGSMITH_TRACING_V2','LANGCHAIN_TRACING_V2','LANGCHAIN_TRACING','LANGCHAIN_VERBOSE'];const before=Object.fromEntries(names.map(k=>[k,process.env[k]]));
 try{for(const k of names)delete process.env[k];for(const k of names){process.env[k]='true';const f=fixture();await assert.rejects(runRagWorkflow(input(),f.deps),/observability unavailable/);assert.equal(f.prepareCount(),0);assert.equal(f.callCount(),0);delete process.env[k];}assert.equal(network,0);
 }finally{for(const [k,v]of Object.entries(before))if(v===undefined)delete process.env[k];else process.env[k]=v;}
});
test('aborted streaming request cancels body reading before retrieval',async()=>{
 let cancelled=false;const abort=new AbortController(),f=fixture();const handler=createPlaygroundWorkflowHandler(async()=>({kind:'admin',subject:'owner',dependencies:f.deps}));
 const request=new Request('https://app.example/api',{method:'POST',headers:{origin:'https://app.example','content-type':'application/json'},body:new ReadableStream({cancel(){cancelled=true;}}),duplex:'half',signal:abort.signal});
 const pending=handler(request);setTimeout(()=>abort.abort(),10);assert.equal((await pending).status,503);assert.equal(cancelled,true);assert.equal(f.prepareCount(),0);
});
test('workflow HTTP boundary preserves Admin, origin, exact payload and UUID guards',async()=>{
 const f=fixture(),handler=createPlaygroundWorkflowHandler(async()=>({kind:'admin',subject:'owner',dependencies:f.deps}));
 const request=(body,origin='https://app.example')=>new Request('https://app.example/api/admin/panda-agent/playground',{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify(body)});
 assert.equal((await handler(request({question}))).status,200);
 for(const body of [{question,productSku:'untrusted'},{question,evaluate:true,requestId:'00000000-0000-0000-0000-000000000000'},{question,evaluate:true,requestId:requestId.toUpperCase()}])assert.equal((await handler(request(body))).status,400);
 assert.equal((await handler(request({question},'https://other.example'))).status,403);assert.equal(f.callCount(),0);
 const denied=createPlaygroundWorkflowHandler(async()=>({kind:'unauthorized'}));assert.equal((await denied(request({question}))).status,401);
});
test('quota, known denial and ambiguous model outcomes remain distinct with no automatic retry',async()=>{
 for(const code of ['quota','not_admitted','outcome_unknown','response_rejected']){const f=fixture();let sends=0;f.deps.generate=async()=>{sends++;throw Object.assign(Error('Guarded fixture outcome'),{code});};
  const handler=createPlaygroundWorkflowHandler(async()=>({kind:'admin',subject:'owner',dependencies:f.deps}));
  const request=new Request('https://app.example/api',{method:'POST',headers:{origin:'https://app.example','content-type':'application/json'},body:JSON.stringify({question,evaluate:true,requestId})});
  const response=await handler(request);assert.equal(response.status,503);assert.equal((await response.json()).error.code,code);assert.equal(sends,1);
 }
});
test('oversized streamed JSON never reaches context preparation or generation',async()=>{
 const f=fixture(),handler=createPlaygroundWorkflowHandler(async()=>({kind:'admin',subject:'owner',dependencies:f.deps}));
 const request=new Request('https://app.example/api',{method:'POST',headers:{origin:'https://app.example','content-type':'application/json'},body:JSON.stringify({question:'x'.repeat(9000)})});
 assert.equal((await handler(request)).status,413);assert.equal(f.prepareCount(),0);assert.equal(f.callCount(),0);
});
test('document-only execution reuses request admission while model execution retains fresh database guards',async()=>{
 for(const evaluate of [false,true]){
  const f=fixture();let databaseChecks=0,admittedChecks=0,admittedPrepares=0;
  f.deps.authorize=async()=>{databaseChecks++;return true};
  const prepare=f.deps.prepare;
  f.deps.retrieval={authorize:async()=>{admittedChecks++;return true},prepare:async(...args)=>{admittedPrepares++;return prepare(...args)}};
  const result=await runRagWorkflow({...input(),evaluate,requestId},f.deps);
  assert.equal(result.outcome,'retrieved');
  if(evaluate){assert.ok(databaseChecks>0);assert.equal(admittedChecks,0);assert.equal(admittedPrepares,0);}
  else{assert.equal(databaseChecks,0);assert.ok(admittedChecks>0);assert.equal(admittedPrepares,1);}
 }
});
test('request admission reuse still denies changed sessions and withdrawn source passages',async()=>{
 const denied=fixture();denied.deps.retrieval={authorize:async()=>false,prepare:denied.deps.prepare};
 await assert.rejects(runRagWorkflow(input(),denied.deps));assert.equal(denied.prepareCount(),0);
 const withdrawn=fixture();withdrawn.deps.retrieval={authorize:async()=>true,prepare:withdrawn.deps.prepare};withdrawn.withdraw();
 await assert.rejects(runRagWorkflow(input(),withdrawn.deps));assert.equal(withdrawn.callCount(),0);
});
