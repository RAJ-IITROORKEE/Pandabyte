import {registerHooks} from 'node:module';import {test} from 'node:test';import assert from 'node:assert/strict';
registerHooks({resolve(specifier,context,next){
 const code={
 'server-only':'export {}',
 '@clerk/nextjs/server':'export const auth=async()=>globalThis.admissionFixture.session;export const clerkClient=async()=>({sessions:{getSession:async()=>globalThis.admissionFixture.live()}})',
 '@insforge/sdk':'export const createClient=()=>({database:{rpc:async(name)=>{globalThis.admissionFixture.calls.push(name);return {data:globalThis.admissionFixture.data,error:null}}}})',
 './lightweight-fetch':'export const boundedAgentFetch=()=>async()=>{throw Error("unexpected network")}',
 './snapshot-transport':'export const createSnapshotTransport=(_base,fallback)=>fallback'
 }[specifier];
 return code?{url:'data:text/javascript,'+encodeURIComponent(code),shortCircuit:true}:next(specifier,context);
}});
const {authenticateLightweight}=await import('../src/server/lightweight-connection.ts');
const original={url:process.env.PANDA_AGENT_INSFORGE_BASE_URL,template:process.env.PANDA_AGENT_CLERK_JWT_TEMPLATE};
process.env.PANDA_AGENT_INSFORGE_BASE_URL='https://fixture.us-east.insforge.app';process.env.PANDA_AGENT_CLERK_JWT_TEMPLATE='fixture';
function fixture(data={subject:'owner',admin:true}){
 globalThis.admissionFixture={data,calls:[],session:{isAuthenticated:true,sessionStatus:'active',userId:'owner',sessionId:'session',getToken:async()=> 'fixture-token'},live:async()=>({status:'active',userId:'owner'})};return globalThis.admissionFixture;
}
test('Admin admission binds the Clerk subject and role in one RPC',async()=>{
 const f=fixture();const actor=await authenticateLightweight({admin:true});assert.equal(actor.admin,true);assert.deepEqual(f.calls,['panda_agent_control_room_admission']);
});
test('mismatched subjects and nonboolean role claims cannot authorize',async()=>{
 for(const data of [{subject:'other',admin:true},{subject:'owner',admin:'true'},null]){fixture(data);await assert.rejects(authenticateLightweight({admin:true}),/identity unavailable/);}
 const f=fixture({subject:'owner',admin:false});assert.equal((await authenticateLightweight({admin:true})).admin,false);assert.equal(f.calls.length,1);
});
test('token preparation overlaps live-session read and inactive sessions never reach the database',async()=>{
 const f=fixture();let started;const ready=new Promise(r=>{started=r});
 f.session.getToken=async()=>{started();return 'fixture-token'};f.live=async()=>{await ready;return {status:'active',userId:'owner'}};
 assert.equal((await authenticateLightweight({admin:true})).admin,true);
 f.calls=[];f.live=async()=>({status:'revoked',userId:'owner'});assert.equal(await authenticateLightweight({admin:true}),null);assert.deepEqual(f.calls,[]);
});
test('default callers retain the original identity RPC and actor shape',async()=>{
 const f=fixture('owner');const actor=await authenticateLightweight();assert.deepEqual(Object.keys(actor).sort(),['client','sessionId','subject']);assert.deepEqual(f.calls,['requesting_user_id']);
});
test.after(()=>{if(original.url===undefined)delete process.env.PANDA_AGENT_INSFORGE_BASE_URL;else process.env.PANDA_AGENT_INSFORGE_BASE_URL=original.url;if(original.template===undefined)delete process.env.PANDA_AGENT_CLERK_JWT_TEMPLATE;else process.env.PANDA_AGENT_CLERK_JWT_TEMPLATE=original.template;});
test('document-only connection uses verified active request claims and defers Admin proof to the snapshot',async()=>{
 const {openLightweightConnection}=await import('../src/server/lightweight-connection.ts');
 const f=fixture();let backendCalls=0;f.live=async()=>{backendCalls++;return {status:'active',userId:'owner'}};
 const actor=await openLightweightConnection({parallelSession:true,sessionVerification:'request'});
 assert.equal(actor.subject,'owner');assert.equal(await actor.sessionCurrent,true);assert.equal(backendCalls,0);assert.deepEqual(f.calls,[]);
 f.session.isAuthenticated=false;assert.equal(await openLightweightConnection({sessionVerification:'request'}),null);
 f.session.isAuthenticated=true;f.session.sessionStatus='pending';assert.equal(await openLightweightConnection({sessionVerification:'request'}),null);
});
