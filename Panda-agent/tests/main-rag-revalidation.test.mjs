import {registerHooks} from 'node:module';
import test from 'node:test';
import assert from 'node:assert/strict';

// Exercise the live boundary coordinator without private corpus fixtures or provider calls.
registerHooks({resolve(specifier,context,next){
 const code=specifier==='server-only'?'export {}':specifier==='../retrieval/product-context-set.ts'
  ?'export const prepareProductContextSet=(...args)=>globalThis.mainRevalidationFixture.prepare(...args)':null;
 return code?{url:'data:text/javascript,'+encodeURIComponent(code),shortCircuit:true}:next(specifier,context);
}});
const {prepareMainRagContext}=await import('../src/server/main-rag-chat.ts');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function fixture(){
 const calls=[],controller=new AbortController(),snapshotClient={},liveClient={};
 const f={calls,controller,active:true,admin:true,history:true,digest:'selected',freshHook:()=>{},
  authorizeCurrent:async()=>{calls.push('session');return f.active;},
  adminCurrent:async()=>{calls.push('admin');return f.admin;},
  historyCurrent:async()=>{calls.push('history');return f.history;},
  prepare:async(input,verification)=>{
   assert.equal(verification,'at_workflow_release');
   if(input.client===snapshotClient)return {kind:'ready',digest:'selected'};
   assert.equal(input.client,liveClient);assert.equal(input.authorizeCurrent,f.authorizeCurrent);
   calls.push('fresh-source');await f.freshHook();return {kind:'ready',digest:f.digest};
  },
 };
 globalThis.mainRevalidationFixture=f;
 f.context=()=>prepareMainRagContext({subject:'owner',question:'Which MCU?',signal:controller.signal,snapshotClient,liveClient,
  authorizeCurrent:f.authorizeCurrent,adminCurrent:f.adminCurrent,historyCurrent:f.historyCurrent});
 return f;
}

test('both live auth pairs overlap while history and fresh sources remain between the same boundaries',async()=>{
 const f=fixture(),releases=[];
 for(const [property,event] of [['authorizeCurrent','session'],['adminCurrent','admin']]){
  f[property]=()=>{f.calls.push(event);return new Promise(resolve=>releases.push(()=>resolve(true)));};
 }
 const context=await f.context();assert.equal(context.authorizedBy,f.authorizeCurrent);
 const pending=context.revalidate();await tick();
 assert.deepEqual(f.calls,['session','admin'],'both pre-source guards must start before either completes');
 releases.splice(0).forEach(release=>release());await tick();
 assert.deepEqual(f.calls,['session','admin','history','fresh-source','session','admin']);
 releases.splice(0).forEach(release=>release());assert.equal(await pending,true);
 assert.deepEqual(f.calls,['session','admin','history','fresh-source','session','admin','history']);
});

test('every revalidation rereads live sources and both access guards without retaining completed results',async()=>{
 const f=fixture(),context=await f.context();
 assert.equal(await context.revalidate(),true);assert.equal(await context.revalidate(),true);
 assert.equal(f.calls.filter(c=>c==='session').length,4);assert.equal(f.calls.filter(c=>c==='admin').length,4);
 assert.equal(f.calls.filter(c=>c==='fresh-source').length,2);assert.equal(f.calls.filter(c=>c==='history').length,4);
 for(const property of ['active','admin','history']){
  f.calls.length=0;f[property]=false;assert.equal(await context.revalidate(),false,property);
  assert.equal(f.calls.includes('fresh-source'),false,`${property} revoked before source reads`);f[property]=true;
 }
});

test('changes during fresh source reads still block release through source, session, Admin, history and abort fences',async()=>{
 for(const change of ['digest','active','admin','history','abort']){
  const f=fixture(),context=await f.context();
  f.freshHook=()=>{if(change==='abort')f.controller.abort();else f[change]=change==='digest'?'changed':false;};
  assert.equal(await context.revalidate(),false,change);
  assert.equal(f.calls.filter(c=>c==='fresh-source').length,1,change);
  if(change==='digest'||change==='abort')assert.deepEqual(f.calls,['session','admin','history','fresh-source']);
  else assert.deepEqual(f.calls,['session','admin','history','fresh-source','session','admin',...(change==='history'?['history']:[])]);
 }
 const f=fixture();f.authorizeCurrent=async()=>{throw Error('unavailable');};
 const context=await f.context();await assert.rejects(context.revalidate(),/unavailable/);
 assert.equal(f.calls.includes('fresh-source'),false);
});
