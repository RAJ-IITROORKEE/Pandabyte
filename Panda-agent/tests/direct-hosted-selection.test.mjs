import {registerHooks} from 'node:module';
import test from 'node:test';
import assert from 'node:assert/strict';

registerHooks({resolve(specifier,context,next){
 const sources={
  './hosted-direct-policy.ts':'export const createHostedDirectPolicy=()=>globalThis.hostedSelectionFixture.policy',
  './basic-rag-runtime.ts':'export const createLunaPrototypePolicy=()=>{throw Error("unexpected local policy")}',
  './luna-prototype-profile.ts':'export const readLunaPrototypeProfile=async()=>null',
  './direct-assistant-chat.ts':'export const createDirectAssistantChat=options=>{globalThis.hostedSelectionFixture.options=options;return {state:async()=>true,status:async()=>({status:"saved"}),cancel:async()=>({status:"saved"}),start:()=>options.policy.enabled()}}',
  './direct-assistant-store.ts':'export const createDirectAssistantStore=()=>({})',
  './plain-llm-chat.ts':'export const createPlainLlmStore=()=>({});export const createPlainLlmChatService=()=>({state:async()=>false})',
  './lightweight-connection':'export const currentLightweightSession=async()=>true',
  './main-rag-chat.ts':'export const mainRagChatForActor=({direct})=>direct',
 };
 return Object.hasOwn(sources,specifier)?{url:'data:text/javascript,'+encodeURIComponent(sources[specifier]),shortCircuit:true}:next(specifier,context);
}});
const {directAssistantForActor}=await import('../src/server/direct-assistant-runtime.ts');

test('fast direct dispatch requires admitted unmetered policy, while historical status needs no new admission',async()=>{
 const keys=['VERCEL','PANDA_AGENT_HOSTED_MODEL','PANDA_AGENT_MAIN_RAG_ENABLED'],prior=keys.map(k=>process.env[k]);
 try{
  process.env.VERCEL='1';process.env.PANDA_AGENT_HOSTED_MODEL='openai/gpt-oss-20b';delete process.env.PANDA_AGENT_MAIN_RAG_ENABLED;
  for(const unmetered of [false,true])for(const model of [undefined,'openai/gpt-oss-20b']){
   let admissions=0;globalThis.hostedSelectionFixture={policy:{enabled:async()=>{admissions++;return true;},current:async()=>true,dispatchCurrent:()=>true,key:()=> 'synthetic',binding:()=> 'fixture',isUnmetered:()=>unmetered,budgetRefs:()=>null}};
   const service=directAssistantForActor({subject:'fixture',sessionId:'fixture',client:{}},new Request('http://localhost/api/panda-agent/chats/fixture/messages',{headers:model?{'X-Panda-Model':model}:{}}));
   assert.deepEqual(await service.status({thread:'old',request:'old'},new AbortController().signal),{status:'saved'});assert.equal(admissions,0);
   assert.equal(await service.start({},new AbortController().signal),unmetered);assert.equal(admissions,1);
  }
 }finally{keys.forEach((k,i)=>{if(prior[i]===undefined)delete process.env[k];else process.env[k]=prior[i];});delete globalThis.hostedSelectionFixture;}
});
