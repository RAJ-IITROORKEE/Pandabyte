import { test } from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';

const modules = {
 'server-only':'',
 '@clerk/nextjs/server':'export const auth=async()=>({isAuthenticated:true,sessionStatus:"active",userId:"fixture"})',
 './clerk':'export const controlRoomAdminAccess=async()=>({allowed:true})',
 '../server/lightweight-connection':'export const authenticateLightweight=async()=>({subject:"fixture",admin:true,sessionId:"session"});export const currentLightweightSession=async()=>true',
 '../server/hosted-rag-policy':'export const createHostedRagPolicy=()=>({enabled:async()=>globalThis.playgroundCapabilityReady})',
 '../server/basic-rag-profile':'export const readBasicRagProfile=async()=>null',
 '../server/luna-test-profile':'export const readLunaTestProfile=async()=>({})',
 '../server/basic-rag-runtime':'export const createLunaPrototypePolicy=()=>{throw Error("unexpected")}',
};
registerHooks({resolve(specifier,context,next){
 if(Object.hasOwn(modules,specifier))return {url:'data:text/javascript,'+encodeURIComponent(modules[specifier]),shortCircuit:true};
 if(specifier==='./playground-capabilities')return next(specifier+'.ts',context);
 return next(specifier,context);
}});
const {playgroundCapabilitiesGET}=await import('../src/control-room/playground-capabilities-clerk.ts');

test('actual public Playground capabilities binding reports selected hosted model and retains local Luna',async()=>{
 const names=['VERCEL','PANDA_AGENT_HOSTED_MODEL','PANDA_AGENT_HOSTED_GROUNDED_ENABLED','PANDA_AGENT_LUNA_PROFILE_FILE','PANDA_AGENT_LUNA_PROTOTYPE_PROFILE_FILE'];
 const previous=names.map(k=>process.env[k]);
 Object.assign(process.env,{VERCEL:'1',PANDA_AGENT_HOSTED_MODEL:'openai/gpt-oss-20b',PANDA_AGENT_HOSTED_GROUNDED_ENABLED:'true'});
 delete process.env.PANDA_AGENT_LUNA_PROTOTYPE_PROFILE_FILE;
 try{
  globalThis.playgroundCapabilityReady=true;
  const read=async()=>{const response=await playgroundCapabilitiesGET(new Request('https://fixture.example/api/admin/panda-agent/playground'));assert.equal(response.headers.get('cache-control'),'private, no-store');return response.json();};
  let value=await read();assert.equal(value.model,'openai/gpt-oss-20b');assert.equal(value.profile,'hosted-rag-v1');
  globalThis.playgroundCapabilityReady=false;value=await read();assert.equal(value.model,'openai/gpt-oss-20b');assert.equal(value.connection,'not_configured');
  globalThis.playgroundCapabilityReady=true;process.env.PANDA_AGENT_HOSTED_MODEL='foreign';value=await read();assert.equal(value.connection,'not_configured');
  delete process.env.VERCEL;delete process.env.PANDA_AGENT_HOSTED_GROUNDED_ENABLED;process.env.PANDA_AGENT_LUNA_PROFILE_FILE='fixture';value=await read();assert.equal(value.model,'openai/gpt-6-luna');assert.equal(value.profile,'luna-rag-test-v1');assert.equal(value.transport,'local');
 }finally{names.forEach((k,i)=>previous[i]===undefined?delete process.env[k]:process.env[k]=previous[i]);delete globalThis.playgroundCapabilityReady;}
});
