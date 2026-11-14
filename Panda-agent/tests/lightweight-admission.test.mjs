import {registerHooks} from 'node:module';import {test} from 'node:test';import assert from 'node:assert/strict';
registerHooks({resolve(specifier,context,next){
 const code={
 'server-only':'export {}',
 '@clerk/nextjs/server':'export const auth=async()=>globalThis.admissionFixture.session;export const clerkClient=async()=>({sessions:{getSession:async(id)=>globalThis.admissionFixture.live(id)}})',
 '@insforge/sdk':'export const createClient=()=>({database:{rpc:async(name)=>{globalThis.admissionFixture.calls.push(name);return {data:globalThis.admissionFixture.data,error:null}}}})',
 './lightweight-fetch':'export const boundedAgentFetch=()=>async()=>{throw Error("unexpected network")}',
 './snapshot-transport':'export const createSnapshotTransport=(_base,fallback)=>fallback'
 }[specifier];
 return code?{url:'data:text/javascript,'+encodeURIComponent(code),shortCircuit:true}:next(specifier,context);
}});
const {authenticateLightweight,currentLightweightSession}=await import('../src/server/lightweight-connection.ts');
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
test('default token preparation overlaps live session and a revoked session never reaches the database',async()=>{
 for(const active of [true,false]){
  const f=fixture('owner');let release,tokenStarted=false;const gate=new Promise(resolve=>{release=resolve;});
  f.live=async()=>{await gate;return {status:active?'active':'revoked',userId:'owner'};};
  f.session.getToken=async()=>{tokenStarted=true;return 'fixture-token';};
  const pending=authenticateLightweight();await new Promise(resolve=>setImmediate(resolve));
  try{assert.equal(tokenStarted,true);}finally{release();}
  const actor=await pending;assert.equal(Boolean(actor),active);assert.deepEqual(f.calls,active?['requesting_user_id']:[]);
 }
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

test('overlapping live checks share one backend read and settled results never mask revocation',async()=>{
 const f=fixture();let release,reads=0;
 f.live=()=>{reads++;return new Promise(resolve=>{release=resolve;});};
 const first=currentLightweightSession('owner','session'),second=currentLightweightSession('owner','session');
 await new Promise(resolve=>setImmediate(resolve));assert.equal(reads,1);
 release({status:'active',userId:'owner'});assert.deepEqual(await Promise.all([first,second]),[true,true]);
 f.live=async()=>{reads++;return {status:'revoked',userId:'owner'};};
 assert.equal(await currentLightweightSession('owner','session'),false);assert.equal(reads,2);
 f.live=async()=>{reads++;return {status:'active',userId:'owner'};};
 assert.equal(await currentLightweightSession('owner','session'),true);assert.equal(reads,3);
});

test('different actors and sessions cannot share a live authorization result',async()=>{
 const f=fixture(),releases=[];let reads=0;
 f.live=id=>{reads++;return new Promise(resolve=>{releases.push(()=>resolve({status:'active',userId:id==='other-session'?'other':'owner'}));});};
 const pending=[currentLightweightSession('owner','session'),currentLightweightSession('other','session'),currentLightweightSession('other','other-session')];
 await new Promise(resolve=>setImmediate(resolve));assert.equal(reads,3);releases.forEach(release=>release());
 assert.deepEqual(await Promise.all(pending),[true,false,true]);
});

test('failed and timed out checks are evicted and a late old response cannot evict a new check',async t=>{
 const f=fixture();let reads=0;
 f.live=async()=>{reads++;throw Error('private provider error');};
 assert.equal(await currentLightweightSession('owner','session'),false);
 assert.equal(await currentLightweightSession('owner','session'),false);assert.equal(reads,2);
 t.mock.timers.enable({apis:['setTimeout']});
 const releases=[];f.live=()=>{reads++;return new Promise(resolve=>{releases.push(resolve);});};
 const expired=currentLightweightSession('owner','session');await Promise.resolve();t.mock.timers.tick(3000);
 assert.equal(await expired,false);assert.equal(reads,3);
 const fresh=currentLightweightSession('owner','session');await Promise.resolve();assert.equal(reads,4);
 releases[0]({status:'active',userId:'owner'});await Promise.resolve();
 const shared=currentLightweightSession('owner','session');assert.equal(shared,fresh);assert.equal(reads,4);
 releases[1]({status:'revoked',userId:'owner'});assert.deepEqual(await Promise.all([fresh,shared]),[false,false]);
});

test('one request reuses a passed session check for 5 s and never a failed one',async t=>{
 const {requestSessionCheck}=await import('../src/server/lightweight-connection.ts');
 const f=fixture();let reads=0;f.live=async()=>{reads++;return {status:'active',userId:'owner'};};
 t.mock.timers.enable({apis:['Date'],now:1000});
 const check=requestSessionCheck('owner','session');
 assert.equal(await check(),true);assert.equal(await check(),true);assert.equal(reads,1,'reused within 5 s');
 assert.equal(await requestSessionCheck('owner','session')(),true);assert.equal(reads,2,'another request checks afresh');
 t.mock.timers.tick(5000);f.live=async()=>{reads++;return {status:'revoked',userId:'owner'};};
 assert.equal(await check(),false);assert.equal(await check(),false);assert.equal(reads,4,'a failed check is never reused');
 assert.equal(await requestSessionCheck('owner',undefined)(),false);
});

test('in-flight keys and map capacity are bounded without changing unshared checks',async()=>{
 const f=fixture(),releases=[];let reads=0;
 f.live=()=>{reads++;return new Promise(resolve=>{releases.push(()=>resolve({status:'active',userId:'owner'}));});};
 const pending=Array.from({length:256},(_,index)=>currentLightweightSession('owner',`session-${index}`));
 const shared=currentLightweightSession('owner','session-0');assert.equal(shared,pending[0]);
 pending.push(currentLightweightSession('owner','overflow'),currentLightweightSession('owner','overflow'));
 pending.push(currentLightweightSession('owner','x'.repeat(257)),currentLightweightSession('owner','x'.repeat(257)));
 await new Promise(resolve=>setImmediate(resolve));assert.equal(reads,260);
 releases.forEach(release=>release());assert.ok((await Promise.all(pending)).every(Boolean));
 f.live=async()=>{reads++;return {status:'revoked',userId:'owner'};};
 assert.equal(await currentLightweightSession('owner','session-0'),false);assert.equal(reads,261);
});
