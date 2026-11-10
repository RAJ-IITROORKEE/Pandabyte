import {registerHooks} from 'node:module';
import {test} from 'node:test';
import assert from 'node:assert/strict';
const modules={
 '@/Panda-agent/src/server/lightweight-connection':'export const authenticateLightweight=async()=>globalThis.mainCapability.actor',
 '@/Panda-agent/src/server/direct-assistant-runtime':'export const directPolicyForActor=()=>({enabled:async()=>globalThis.mainCapability.admitted,allowance:()=>globalThis.mainCapability.allowance,isUnmetered:()=>globalThis.mainCapability.unmetered})',
 '@/Panda-agent/src/server/direct-assistant-store':'export const createDirectAssistantStore=()=>({ready:async()=>globalThis.mainCapability.installed})',
};
registerHooks({resolve(specifier,context,next){
 if(Object.hasOwn(modules,specifier))return {url:'data:text/javascript,'+encodeURIComponent(modules[specifier]),shortCircuit:true};
 if(specifier==='@/Panda-agent/src/ui/capabilities')return {url:new URL('../src/ui/capabilities.ts',import.meta.url).href,shortCircuit:true};
 return next(specifier,context);
}});
const {GET}=await import('../../app/api/panda-agent/capabilities/route.ts');
const {parseCapabilities}=await import('../src/ui/capabilities.ts');

test('uncapped owner chat is Ready with RAG and no numeric budget, while legacy capped admission stays bounded',async()=>{
 const names=['PANDA_AGENT_DIRECT_ASSISTANT_ENABLED','PANDA_AGENT_LIGHTWEIGHT_ENABLED','PANDA_AGENT_MAIN_RAG_ENABLED'];
 const previous=names.map(k=>process.env[k]);names.forEach(k=>process.env[k]='true');
 try{
  const f=globalThis.mainCapability={actor:{subject:'fixture'},admitted:true,installed:true,unmetered:true,allowance:null};
  const request=()=>new Request('https://pandabyte-iot.vercel.app/api/panda-agent/capabilities');
  let r=await GET(request()),v=await r.json();assert.equal(r.status,200);assert.equal(v.status,'ready');assert.equal(v.rag,true);assert.equal(v.budget,null);assert.ok(parseCapabilities(v));assert.equal(v.models.filter(m=>m.enabled).length,1);
  f.admitted=false;v=await(await GET(request())).json();assert.equal(v.status,'unavailable');
  f.admitted=true;f.unmetered=false;f.allowance={remainingNanoUsd:0};v=await(await GET(request())).json();assert.equal(v.status,'unavailable');
  f.allowance={remainingNanoUsd:1597640};v=await(await GET(request())).json();assert.equal(v.status,'ready');assert.equal(v.budget.remainingNanoUsd,1597640);
  f.actor=null;r=await GET(request());assert.equal(r.status,401);
 }finally{names.forEach((k,i)=>previous[i]===undefined?delete process.env[k]:process.env[k]=previous[i]);delete globalThis.mainCapability;}
});
