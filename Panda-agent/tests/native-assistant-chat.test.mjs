import test from 'node:test';
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
const stub=source=>'data:text/javascript,'+encodeURIComponent(source);
registerHooks({resolve(specifier,context,next){
 if(context.parentURL?.includes('/server/') && specifier==='./basic-rag-runtime.ts')return{url:stub('export function createLunaPrototypePolicy(){throw Error("fixture only")}'),shortCircuit:true};
 if(context.parentURL?.includes('/server/') && specifier==='./lightweight-connection')return{url:stub('export async function currentLightweightSession(){throw Error("fixture only")}'),shortCircuit:true};
 if(context.parentURL?.endsWith('/native-assistant-chat.ts') && specifier==='./luna-native-openrouter.ts')return{url:stub('export function createLunaNativeCompletion(){return async()=>{throw Error("no provider")}}'),shortCircuit:true};
 return next(specifier,context);
}});
const {createNativeAssistantChat}=await import('../src/server/native-assistant-chat.ts');
const turn={thread:'10000000-0000-4000-8000-000000000001',request:'20000000-0000-4000-8000-000000000001',question:'Explain I2C.'};
const artifact={version:1,type:'answer',answer:'I2C is a serial bus.'},usage={inputTokens:1,outputTokens:1,costNanoUsd:1};
const admission={receipt:{sessionID:'ses_fixture'},messageID:'msg_fixture',promptHash:'a'.repeat(64),generation:'b'.repeat(64)};
function fixture({receiptResult=true, receiptThrows=false, cancelBeforeFinish=false, budget=true, contextRetired=false, retireThrows=false, revokeAfterAdmission=false}={}) {
 let row=null, savedAdmission=null, receipts=0, finishes=0, runs=0, budgets=0, retirements=0, active=true;
 const store={state:async()=>row && ({question:row.question,status:row.status,claimed:row.claimed,cancelled:row.cancelled}),
  begin:async(_t,_r,question)=>{row={question,status:'pending',claimed:false,cancelled:false};return {admitted:true};},
  attach:async(_t,_r,a)=>{savedAdmission=a;if(revokeAfterAdmission)active=false;return true;},nativeClaim:async()=>true,admissionCurrent:async(_t,_r,a)=>a===savedAdmission,
  claim:async()=>{if(row.claimed)return false;row.claimed=true;return true;},
  recordReceipt:async()=>{receipts++;if(receiptThrows)throw Error('write uncertain');return receiptResult;},
  finish:async(_t,_r,answer,cancel=false)=>{finishes++;if(row.status!=='pending')throw Error('conflict');row.status='complete';row.cancelled=cancel;row.answer=answer;return {};},
  retire:async(t,r,a)=>{assert.equal(t,turn.thread);assert.equal(r,turn.request);assert.equal(a,savedAdmission);assert.equal(row.status,'complete');assert.equal(row.cancelled,false);retirements++;if(retireThrows)throw Error('retirement uncertain');return true;}};
 const policy={enabled:async()=>true,dispatchCurrent:()=>true,binding:()=> 'fixture-policy',key:()=> 'fake',claimBudget:async()=>{budgets++;return budget;}};
 const run=async opts=>{runs++;try {
  if(!await opts.current() || !await opts.saveAdmission(admission) || !await opts.current(admission) || !await opts.claimCreate(admission) || !await opts.claimPrompt(admission))return {status:'unknown'};
  const call={owner:'owner',rootRun:turn.request,session:'ses_fixture',message:'msg_fixture',step:'1',kind:'main',bodyHash:'c'.repeat(64)};
  if(!await opts.reserve(call))return {status:'unknown'};
  await opts.receipt(call,usage);
  if(cancelBeforeFinish) {row.status='complete';row.cancelled=true;}
  if(!await opts.onSucceeded({artifact,usage}))return {status:'unknown'};
  return {status:'succeeded',artifact,usage,contextRetired};
 }catch{return {status:'unknown'};}};
 const service=createNativeAssistantChat({actor:{subject:'owner',sessionId:'session'},key:'d'.repeat(64),store,policy,current:async()=>active,available:async()=>true,run});
 return {service,row:()=>row,counts:()=>({receipts,finishes,runs,budgets,retirements}),revoke:()=>{active=false;}};
}
test('factory persists exact successful answer and replay never starts native execution',async()=>{
 const f=fixture();assert.deepEqual(await f.service.start(turn,new AbortController().signal),{status:'saved'});assert.deepEqual(f.row().answer,{outcome:'conversation',text:artifact.answer,citations:[]});
 assert.deepEqual(await f.service.start(turn,new AbortController().signal),{status:'saved'});assert.deepEqual(f.counts(),{receipts:1,finishes:1,runs:1,budgets:1,retirements:0});
});
test('exact immutable receipt replay is accepted; receipt write uncertainty never saves an answer',async()=>{
 const existing=fixture({receiptResult:false});assert.deepEqual(await existing.service.start(turn,new AbortController().signal),{status:'saved'});
 const lost=fixture({receiptThrows:true});assert.deepEqual(await lost.service.start(turn,new AbortController().signal),{status:'unknown'});assert.equal(lost.row().status,'pending');assert.equal(lost.counts().finishes,0);
 assert.deepEqual(await lost.service.start(turn,new AbortController().signal),{status:'unknown'});assert.equal(lost.counts().runs,1);
});
test('cancelled turn or failed budget reservation does not save a late answer',async()=>{
 const canceled=fixture({cancelBeforeFinish:true});assert.deepEqual(await canceled.service.start(turn,new AbortController().signal),{status:'unknown'});assert.equal(canceled.counts().finishes,0);
 const blocked=fixture({budget:false});assert.deepEqual(await blocked.service.start(turn,new AbortController().signal),{status:'unknown'});assert.equal(blocked.counts().receipts,0);assert.equal(blocked.counts().finishes,0);
});
test('only proven retired context is marked after durable save, and retirement uncertainty does not replay',async()=>{
 const retired=fixture({contextRetired:true});assert.deepEqual(await retired.service.start(turn,new AbortController().signal),{status:'saved'});assert.equal(retired.counts().retirements,1);
 const retained=fixture({contextRetired:false});assert.deepEqual(await retained.service.start(turn,new AbortController().signal),{status:'saved'});assert.equal(retained.counts().retirements,0);
 const uncertain=fixture({contextRetired:true,retireThrows:true});assert.deepEqual(await uncertain.service.start(turn,new AbortController().signal),{status:'saved'});assert.deepEqual(await uncertain.service.start(turn,new AbortController().signal),{status:'saved'});assert.equal(uncertain.counts().retirements,1);assert.equal(uncertain.counts().runs,1);assert.deepEqual(uncertain.row().answer,{outcome:'conversation',text:artifact.answer,citations:[]});
});
test('revoked actor after admission cannot reserve, record or save',async()=>{
 const f=fixture({revokeAfterAdmission:true});assert.deepEqual(await f.service.start(turn,new AbortController().signal),{status:'unknown'});assert.equal(f.counts().budgets,0);assert.equal(f.counts().receipts,0);assert.equal(f.counts().finishes,0);assert.equal(f.counts().retirements,0);
});
