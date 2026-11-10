import {registerHooks} from 'node:module';
import {test} from 'node:test';
import assert from 'node:assert/strict';
registerHooks({resolve(specifier,context,next){
 if(specifier==='./evaluation-cases.ts')return {url:'data:text/javascript,'+encodeURIComponent("export const evaluationCaseSet={key:'engineering-listings-v1',count:20};export async function loadEvaluationCases(){return {}}"),shortCircuit:true};
 if(specifier==='./evaluation-runner.ts')return {url:'data:text/javascript,'+encodeURIComponent("export async function runEvaluationCase(input){globalThis.evaluationCalls++;return {caseIndex:input.caseIndex,status:'passed'}}"),shortCircuit:true};
 return next(specifier,context);
}});
const {createEvaluationHandler}=await import('../src/control-room/evaluation-handler.ts');
const fingerprint='a'.repeat(64),runId='11111111-1111-4111-8111-111111111111';
const body={requestId:runId,mode:'retrieval',caseIndex:0,corpusFingerprint:fingerprint};
function fixture({kind='admin',claimed=true,current=true,stored=null}={}){
 globalThis.evaluationCalls=0;
 const calls=[];
 const handle=createEvaluationHandler(async()=>kind!=='admin'?{kind}:{kind,subject:'admin',dependencies:{authorize:async()=>current},rpc:async(name,p)=>{
 calls.push([name,p]);
 if(name==='panda_agent_evaluation_corpus')return fingerprint;
 if(p.p_action==='read')return {corpusFingerprint:fingerprint,run:stored};
 if(p.p_action==='claim'){if(p.p_corpus!==fingerprint)throw Object.assign(Error('changed'),{code:'conflict'});return {claimed,run:stored};}
 return {run:{...body,results:[p.p_result],claimedIndex:null}};
 }});
 return {handle,calls};
}
const req=(value=body,origin='http://localhost:3001')=>new Request('http://localhost:3001/api/admin/panda-agent/evaluations',{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify(value)});
test('evaluation rejects unauthorized/non-Admin callers before any persistence or model',async()=>{
 for(const [kind,status] of [['unauthorized',401],['forbidden',403],['unavailable',503]]){
 const f=fixture({kind});assert.equal((await f.handle(req())).status,status);assert.equal(f.calls.length,0);
 }
});
test('evaluation enforces origin, bounded index and allowlisted fields',async()=>{
 for(const request of [req(body,'https://bad.example'),req({...body,caseIndex:20}),req({...body,prompt:'override'}),req({...body,mode:'external'})]){
 const f=fixture();assert.ok([400,403].includes((await f.handle(request)).status));assert.equal(globalThis.evaluationCalls,0);assert.equal(f.calls.length,0);
 }
});
test('exclusive case claim is persisted before exactly one execution and completion',async()=>{
 const f=fixture();const result=await f.handle(req());assert.equal(result.status,200);assert.equal(globalThis.evaluationCalls,1);
 assert.deepEqual(f.calls.filter(([n])=>n==='panda_agent_evaluation_run').map(([,p])=>p.p_action),['claim','finish','read']);
 assert.equal(result.headers.get('cache-control'),'private, no-store');
});
test('a repeated pending/completed case never dispatches another model',async()=>{
 const f=fixture({claimed:false});assert.equal((await f.handle(req())).status,200);assert.equal(globalThis.evaluationCalls,0);
 assert.equal(f.calls.filter(([,p])=>p.p_action==='finish').length,0);
});
test('changed corpus is rejected atomically by the claim without execution',async()=>{
 const f=fixture();assert.equal((await f.handle(req({...body,corpusFingerprint:'b'.repeat(64)}))).status,409);
 assert.equal(globalThis.evaluationCalls,0);
});
test('history withholds model text and quotations after corpus changes',async()=>{
 const f=fixture({stored:{...body,corpusFingerprint:'b'.repeat(64),results:[{modelAnswer:'old fact',modelEvidence:[{quote:'old source'}]}]}});
 const result=await f.handle(new Request('http://localhost:3001/api/admin/panda-agent/evaluations'));
 assert.equal(result.status,200);const data=await result.json();
 assert.equal(data.run.results[0].modelAnswer,null);assert.deepEqual(data.run.results[0].modelEvidence,[]);assert.equal(data.run.results[0].sourceChanged,true);
});
test('revoked Admin cannot release evaluation history',async()=>{
 const f=fixture({current:false});assert.equal((await f.handle(new Request('http://localhost:3001/api/admin/panda-agent/evaluations'))).status,403);
});
