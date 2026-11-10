import test from 'node:test';
import assert from 'node:assert/strict';
import { runNativeAssistant } from '../src/opencode/native-assistant-runner.ts';

function fixture(overrides = {}) {
 let saved, creates=0, prompts=0, posts=0, receipts=0;
 const options = { question:'Explain I2C briefly.', owner:'owner', rootRun:'run', binding:'b'.repeat(64), signal:new AbortController().signal,
  saveAdmission:async value=>{ if(saved) return false; saved=structuredClone(value); return true; },
  claimCreate:async value=>{ creates++; return JSON.stringify(value)===JSON.stringify(saved); },
  claimPrompt:async value=>{ prompts++; return JSON.stringify(value)===JSON.stringify(saved); },
  current:async value=>!value || JSON.stringify(value)===JSON.stringify(saved),
  reserve:async call=>call.owner==='owner' && call.rootRun==='run' && call.session===saved.receipt.sessionID && call.message===saved.messageID,
  complete:async (messages,before)=>{ assert.equal(await before(),true); posts++; assert.ok(messages.some(m=>m.role==='system')); return {content:'{"version":1,"type":"answer","answer":"I2C is a serial bus."}',usage:{inputTokens:12,outputTokens:10,costNanoUsd:20}}; },
  receipt:async()=>{receipts++;}, ...overrides };
 return {options,counts:()=>({creates,prompts,posts,receipts})};
}
test('invalid or already cancelled input never starts the runtime',async()=>{
 const controller=new AbortController();controller.abort();const f=fixture({signal:controller.signal});
 assert.deepEqual(await runNativeAssistant(f.options),{status:'unknown'});assert.deepEqual(f.counts(),{creates:0,prompts:0,posts:0,receipts:0});
});
test('actual isolated 2.2.6 ties one native answer to one admitted provider call', {skip:process.platform!=='win32' || process.env.PANDA_NATIVE_226_TEST!=='true',timeout:100000},async()=>{
 const f=fixture(), result=await runNativeAssistant(f.options);
 assert.deepEqual(f.counts(),{creates:1,prompts:1,posts:1,receipts:1});
 assert.deepEqual(result,{status:'succeeded',artifact:{version:1,type:'answer',answer:'I2C is a serial bus.'},usage:{inputTokens:12,outputTokens:10,costNanoUsd:20},contextRetired:false});
 assert.deepEqual(f.counts(),{creates:1,prompts:1,posts:1,receipts:1});
});
test('actual native runner denies foreign generation and duplicate durable admission before prompt', {skip:process.platform!=='win32' || process.env.PANDA_NATIVE_226_TEST!=='true',timeout:100000},async()=>{
 const foreign=fixture({current:async admission=>!admission});assert.deepEqual(await runNativeAssistant(foreign.options),{status:'unknown'});assert.deepEqual(foreign.counts(),{creates:0,prompts:0,posts:0,receipts:0});
 const replay=fixture({saveAdmission:async()=>false});assert.deepEqual(await runNativeAssistant(replay.options),{status:'unknown'});assert.deepEqual(replay.counts(),{creates:0,prompts:0,posts:0,receipts:0});
});
test('cancellation during native provider completion releases no result or receipt', {skip:process.platform!=='win32' || process.env.PANDA_NATIVE_226_TEST!=='true',timeout:100000},async()=>{
 const controller=new AbortController();let calls=0;
 const f=fixture({signal:controller.signal,complete:async (_messages,before)=>{assert.equal(await before(),true);calls++;controller.abort();return {content:'{"version":1,"type":"answer","answer":"secret"}',usage:{inputTokens:1,outputTokens:1,costNanoUsd:1}};}});
 assert.deepEqual(await runNativeAssistant(f.options),{status:'unknown'});assert.equal(calls,1);assert.equal(f.counts().receipts,0);
});
test('only a durably confirmed success removes its isolated instance', {skip:process.platform!=='win32' || process.env.PANDA_NATIVE_226_TEST!=='true',timeout:100000},async()=>{
 const {readdir,access}=await import('node:fs/promises'); const {join}=await import('node:path');
 const parents=['C:\\ProgramData\\PandaByte\\AgentRuntime','C:\\PandaByteAgentRuntime'];
 const instances=async()=>{const all=[];for(const parent of parents){try {for(const entry of await readdir(parent,{withFileTypes:true})) if(entry.isDirectory() && entry.name.startsWith('pandabyte-native-execution-')) all.push(join(parent,entry.name));}catch(e){if(e.code!=='ENOENT')throw e;}} return all;};
 for(const confirmed of [true,false]) {
  const before=new Set(await instances());let created=[];let seen;
  const f=fixture({onSucceeded:async result=>{seen=structuredClone(result);created=(await instances()).filter(path=>!before.has(path));assert.equal(created.length,1);return confirmed;}});
  const result=await runNativeAssistant(f.options);assert.equal(result.status,'succeeded');assert.equal(result.contextRetired,confirmed);assert.deepEqual(seen,{artifact:result.artifact,usage:result.usage});
  assert.equal(created.length,1);const exists=await access(created[0]).then(()=>true,()=>false);assert.equal(exists,!confirmed);
 }
});
