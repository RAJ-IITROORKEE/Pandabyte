import {registerHooks} from 'node:module';import {test} from 'node:test';import assert from 'node:assert/strict';
const fake={
 'server-only':'export {}',
 '@clerk/nextjs/server':'export const auth=async()=>globalThis.snapshotAdmissionFixture.session',
 '../server/lightweight-connection':'export const openLightweightConnection=async()=>globalThis.snapshotAdmissionFixture.actor',
 '../retrieval/snapshot-client':'export const createSnapshotClient=value=>({subject:value.subject,database:{rpc:async()=>({data:null,error:null})}})',
 '../retrieval/insforge-adapters':'export const createInsforgeAdapters=()=>({})',
 '../retrieval/product-context-set':'export const createWorkflowProductContextPreparer=()=>async()=>({kind:"insufficient"})'
};
registerHooks({resolve(specifier,context,next){return Object.hasOwn(fake,specifier)?{url:'data:text/javascript,'+encodeURIComponent(fake[specifier]),shortCircuit:true}:next(specifier,context)}});
const {snapshotRetrievalAdmission}=await import('../src/control-room/snapshot-retrieval-clerk.ts');
function fixture({active=true,subject='owner',error=null}={}){
 let calls=0;
 const f={session:{isAuthenticated:true,sessionStatus:'active',userId:'owner',sessionId:'session'},
 actor:{subject:'owner',sessionId:'session',sessionCurrent:Promise.resolve(active),client:{database:{rpc:async name=>{calls++;assert.equal(name,'panda_agent_runtime_admin_snapshot');return {data:{subject},error}}}}}};
 globalThis.snapshotAdmissionFixture=f;return {...f,calls:()=>calls};
}
test('document-only admission performs one snapshot RPC and local session checks do not query again',async()=>{
 const f=fixture();const timing={databaseSnapshotMs:null};const a=await snapshotRetrievalAdmission(timing);
 assert.equal(a.kind,'admin');assert.equal(f.calls(),1);assert.equal(await a.dependencies.authorize(),true);assert.equal(await a.dependencies.authorize(),true);assert.equal(f.calls(),1);assert.ok(Number.isSafeInteger(timing.databaseSnapshotMs));
 f.session.sessionId='other';assert.equal(await a.dependencies.authorize(),false);
});
test('inactive or mismatched users never receive the captured documents',async()=>{
 fixture({active:false});assert.equal((await snapshotRetrievalAdmission({databaseSnapshotMs:null})).kind,'unauthorized');
 fixture({subject:'other'});assert.equal((await snapshotRetrievalAdmission({databaseSnapshotMs:null})).kind,'unavailable');
});
test('database Admin denials remain forbidden and no model generator is exposed',async()=>{
 fixture({error:{details:'forbidden'}});assert.equal((await snapshotRetrievalAdmission({databaseSnapshotMs:null})).kind,'forbidden');
 fixture();const a=await snapshotRetrievalAdmission({databaseSnapshotMs:null});assert.equal(a.dependencies.generate,undefined);
});
