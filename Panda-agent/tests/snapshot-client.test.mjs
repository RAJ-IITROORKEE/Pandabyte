import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {dirname, join} from 'node:path';
import {createSnapshotClient} from '../src/retrieval/snapshot-client.ts';
import {createInsforgeAdapters} from '../src/retrieval/insforge-adapters.ts';
import {createWorkflowProductContextPreparer} from '../src/retrieval/product-context-set.ts';
import {ENGINEERING_CONFIG, ENGINEERING_MANIFEST} from '../src/retrieval/engineering-proof.ts';
import {loadEvaluationCases, evaluationCaseSet} from '../src/control-room/evaluation-cases.ts';
import {runEvaluationCase} from '../src/control-room/evaluation-runner.ts';

const id='00000000-0000-4000-8000-000000000001';
const candidate={configHash:ENGINEERING_CONFIG,manifestHash:ENGINEERING_MANIFEST,membershipHash:ENGINEERING_MANIFEST,memberCount:284,state:'candidate',sealed:true};
function fixture(){
 const product={id,sku:'EXAMPLE',title:'Example board',sourceUrl:'https://pandabyte.in/product-page/example'};
 const chunk={documentVersionId:id,logicalChunkId:'a'.repeat(64),chunkVersionId:'b'.repeat(64),text:'Example body.',textHash:'c'.repeat(64),generation:1,physicalRevision:null,capturedAt:'2026-10-31T00:00:00Z',sectionPath:['Specs']};
 return {subject:'user_test',catalog:{items:[{...product,approvedChunksCount:1}]},scopes:{[id]:{candidate:{...candidate},product,chunks:[chunk]}}};
}
test('snapshot clients isolate requests, freeze nested data and expose only runtime reads',async()=>{
 const value=fixture(),client=createSnapshotClient(value);
 value.scopes[id].chunks[0].sectionPath[0]='changed';
 const other=createSnapshotClient(value);
 const scope=async c=>(await c.database.rpc('panda_agent_runtime_scope',{p_product:id})).data;
 assert.equal(client.subject,'user_test');
 assert.deepEqual((await scope(client)).chunks[0].sectionPath,['Specs']);
 assert.deepEqual((await scope(other)).chunks[0].sectionPath,['changed']);
 assert.throws(()=>{client.database.rpc=()=>{};},TypeError);
 for(const row of [(await scope(client)),(await scope(client)).chunks[0],(await scope(client)).chunks[0].sectionPath,(await client.database.rpc('panda_agent_runtime_products')).data.items])assert.ok(Object.isFrozen(row));
 for(const [name,params] of [['staff_role_memberships'],['panda_agent_runtime_products',{extra:1}],['panda_agent_runtime_scope',{}],['panda_agent_runtime_scope',{p_product:'__proto__'}],['panda_agent_runtime_scope',{p_product:id,extra:true}],['panda_agent_runtime_scope',{p_product:id.replace(/1$/,'2')}]]){
  const result=await client.database.rpc(name,params);assert.equal(result.data,null);assert.ok(result.error);
 }
});

test('malformed, oversized, duplicate and prototype-tainted snapshots fail closed',()=>{
 for(const change of [
  v=>{delete v.subject;},v=>{v.subject='';},v=>{v.catalog.items.push(v.catalog.items[0]);},
  v=>{v.catalog.items.push({...v.catalog.items[0],id:id.replace(/1$/,'2'),sku:'example'});},
  v=>{v.catalog.items=Array(43).fill(v.catalog.items[0]);},v=>{v.scopes[id].chunks=Array(285).fill(v.scopes[id].chunks[0]);},
  v=>{v.scopes[id].chunks.push({...v.scopes[id].chunks[0]});v.catalog.items[0].approvedChunksCount=2;},
  v=>{v.scopes[id].product.id=id.replace(/1$/,'2');},v=>{v.scopes[id].product.title='Wrong';},
  v=>{v.scopes[id].candidate.sealed='true';},
  v=>{v.scopes[id].chunks[0].text='界'.repeat(1500000);},v=>{v.scopes[id].chunks[0].sectionPath={};},
  v=>{Object.defineProperty(v.scopes,'__proto__',{enumerable:true,value:v.scopes[id]});},
  v=>{v.scopes[id].chunks[0].constructor='bad';},v=>{Object.setPrototypeOf(v.catalog.items[0],{inherited:true});},
 ]){
  const value=fixture();change(value);assert.throws(()=>createSnapshotClient(value),/Invalid retrieval snapshot/);
 }
});

const sourcePath=process.env.PANDA_TEST_RAG_SNAPSHOT;
test('all 20 reviewed retrieval cases pass with a new snapshot per request',
 {skip:!(sourcePath&&process.env.PANDA_AGENT_EVALUATION_PACK_FILE)&&'private reviewed inputs unavailable'},async()=>{
 const pack=await loadEvaluationCases();
 const {chunks}=JSON.parse(await readFile(sourcePath,'utf8'));
 const {rows}=JSON.parse(await readFile(join(dirname(sourcePath),'canonical-mapping.json'),'utf8'));
 const snapshot={subject:'user_test',catalog:{items:[]},scopes:{}};
 for(const row of rows){
  const selected=chunks.filter(x=>x.product_id===row.record_id);
  const product={id:row.record_id,sku:row.skus[0],title:selected[0].locator.section_path[0],sourceUrl:row.source_url};
  snapshot.catalog.items.push({...product,approvedChunksCount:selected.length});
  snapshot.scopes[product.id]={candidate,product,chunks:selected.map(x=>({
   documentVersionId:x.version_id,logicalChunkId:x.logical_chunk_id,chunkVersionId:x.chunk_version_id,text:x.text,
   textHash:x.content_sha256,generation:x.generation,physicalRevision:null,capturedAt:'2026-10-31T00:00:00Z',sectionPath:x.locator.section_path,
  }))};
 }
 for(let caseIndex=0;caseIndex<pack.cases.length;caseIndex++){
  const client=createSnapshotClient(snapshot),authorize=async()=>true,corpusFingerprint='f'.repeat(64);
  const result=await runEvaluationCase({runId:id,caseIndex,mode:'retrieval',caseSetKey:evaluationCaseSet.key,corpusFingerprint,signal:new AbortController().signal},pack,{
   authorize,readCorpusFingerprint:async()=>corpusFingerprint,
   prepare:createWorkflowProductContextPreparer({actor:{subject:client.subject},client,authorizeCurrent:authorize,
    createAdapters:()=>createInsforgeAdapters(client,()=>assert.fail('retrieval invoked a model'))}),
  });
  assert.equal(result.status,'passed',pack.cases[caseIndex].id);
  assert.equal(result.modelStatus,'not_requested');
 }
 assert.equal(pack.cases.length,20);
 const product=snapshot.catalog.items[0];
 snapshot.scopes[product.id].chunks[0].text+=' altered';
 const altered=createSnapshotClient(snapshot);
 const adapters=createInsforgeAdapters(altered,()=>assert.fail('no model needed'));
 assert.equal(await adapters.currentScope({subject:altered.subject},product),null,'changed source text must fail the original proof');
});
