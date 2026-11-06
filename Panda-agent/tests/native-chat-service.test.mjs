import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { createNativeChatService } from '../src/server/native-chat-service.ts';
import { createNativeRuntimeAdmission } from '../src/server/native-runtime.ts';
import { createNativeReceipt, createNativeMessageID } from '../src/opencode/session-contracts.ts';
const key='a'.repeat(64),thread='11111111-1111-4111-8111-111111111111',request='22222222-2222-4222-8222-222222222222';
const input={thread,request,question:'Fixture question'}, date='2026-11-06T00:00:00Z';
function fixture(options={}) {
 const calls=[],subject='fixture-owner',binding=createHmac('sha256',Buffer.from(key,'hex')).update('panda-native-owner-v1\n'+JSON.stringify({subject,thread})).digest('hex');
 const receipt=createNativeReceipt('customer',binding);
 const state={receipt,messageID:createNativeMessageID(),promptHash:'b'.repeat(64),runtimeBinding:'c'.repeat(64),scopes:[],phase:options.pending?'accepted':'terminal',version:5,createClaimed:true,promptClaimed:true,cancelRequested:false,terminalReason:options.pending?null:'answered',nativeOutcome:options.pending?null:'succeeded',responseHash:options.pending?null:'d'.repeat(64),removalClaimed:options.retired??false,runtimeRetired:options.retired??false};
 const answer={outcome:'conversation',text:options.withdrawn?'This saved answer is unavailable because its source or verification is no longer current.':'Fenced answer',citations:[]};
 const read={thread:{id:thread,title:'Fixture',updatedAt:date,status:options.pending?'pending':'idle'},messages:options.pending?[]:[{id:request,role:'assistant',text:answer.text,citations:[],createdAt:date}],turns:[{requestId:request,question:input.question,status:options.pending?'pending':'complete',response:options.pending?null:answer,createdAt:date}]};
 const actor={subject,sessionId:'fixture-session',client:{database:{schema(name){assert.equal(name,'public');return {async rpc(name,args){calls.push({name,args});if(options.foreign)return {data:null,error:{code:'P0001',details:'not_found'}};if(name==='panda_agent_native_contexts')return {data:options.contexts??{pending:false,requests:[],more:false},error:null};if(name==='panda_agent_native_state')return {data:structuredClone(state),error:null};if(name==='panda_agent_native_read')return {data:structuredClone(read),error:null};assert.fail('unexpected write: '+name);}};}}}};
 let descriptorReads=0,network=0;
 const runtime=createNativeRuntimeAdmission({key,readDescriptor:async()=>{descriptorReads++;return null;},fetch:async()=>{network++;assert.fail('No runtime or provider request expected');}});
 const service=createNativeChatService(actor,{key,current:async()=>!options.revoked,runtime});
 return {service,calls,actor,runtimeCounts:()=>({descriptorReads,network})};
}
test('assembled new dispatch remains hard off before evidence, runtime IO or database writes',async()=>{
 const f=fixture();await assert.rejects(f.service.start(input),{code:'unavailable'});assert.deepEqual(f.calls,[]);assert.deepEqual(f.runtimeCounts(),{descriptorReads:0,network:0});
});
test('terminal status, cancellation replay and retired cleanup use owned journal without a running process',async()=>{
 const f=fixture({retired:true});assert.deepEqual(await f.service.status(input),{status:'saved'});assert.deepEqual(await f.service.cancel({thread,request}),{status:'saved'});assert.deepEqual(await f.service.cleanup({thread,request}),{status:'retired'});assert.deepEqual(f.runtimeCounts(),{descriptorReads:0,network:0});
 assert.equal(f.calls.every(x=>['panda_agent_native_state','panda_agent_native_read'].includes(x.name)),true);
});
test('history uses native SQL source projection rather than raw saved native answer',async()=>{
 const f=fixture({withdrawn:true});const saved=await f.service.read(thread);assert.match(saved.messages[0].text,/no longer current/);assert.equal(f.calls[0].name,'panda_agent_native_read');assert.deepEqual(f.runtimeCounts(),{descriptorReads:0,network:0});
});
test('pending work without supervisor descriptor remains unavailable and never mutates',async()=>{
 for(const action of ['status','cancel','cleanup']){
  const f=fixture({pending:true});await assert.rejects(f.service[action](action==='status'?input:{thread,request}),{code:'unavailable'});assert.equal(f.calls.every(x=>['panda_agent_native_state','panda_agent_native_read'].includes(x.name)),true);assert.equal(f.runtimeCounts().network,0);
 }
});
test('foreign or revoked current owner cannot observe, cancel or clean up native work',async()=>{
 for(const options of [{foreign:true},{revoked:true}]){
  const f=fixture(options);await assert.rejects(f.service.status(input),{code:options.foreign?'not_found':'unauthenticated'});assert.deepEqual(f.runtimeCounts(),{descriptorReads:0,network:0});
 }
});
test('mutating a supplied actor cannot replace captured signer/current-session identity',async()=>{
 const f=fixture();f.actor.subject='foreign';f.actor.sessionId='changed';assert.deepEqual(await f.service.status(input),{status:'saved'});assert.equal(f.calls.filter(x=>x.name==='panda_agent_native_state').every(x=>JSON.parse(x.args.p_payload).subject==='fixture-owner'),true);
});


test('Delete cleanup batches at most four current owned terminal receipts and retains pending/more/unknown conflicts',async()=>{
 for(const [contexts,expected,cleanups] of [
  [{pending:true,requests:[],more:false},false,0],
  [{pending:false,requests:[],more:false},true,0],
  [{pending:false,requests:[request],more:false},true,1],
  [{pending:false,requests:[request],more:true},false,1],
 ]){
  const f=fixture({contexts});let count=0;f.service.cleanup=async()=>{count++;return {status:'retired'};};
  assert.equal(await f.service.cleanupThread(thread),expected);assert.equal(count,cleanups);
 }
 const unknown=fixture({contexts:{pending:false,requests:[request],more:false}});unknown.service.cleanup=async()=>({status:'unknown'});assert.equal(await unknown.service.cleanupThread(thread),false);
 const foreign=fixture({foreign:true});await assert.rejects(foreign.service.cleanupThread(thread),{code:'not_found'});
});
