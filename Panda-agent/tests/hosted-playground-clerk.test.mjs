import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { test } from 'node:test';

const stubs = {
  '@clerk/nextjs/server': 'export const auth=async()=>globalThis.hostedFixture.session',
  './clerk': 'export const controlRoomAdminAccess=async()=>globalThis.hostedFixture.access',
  '../server/lightweight-connection': 'export const authenticateLightweight=async flag=>globalThis.hostedFixture.admit(flag);export const currentLightweightSession=async(s,id)=>globalThis.hostedFixture.live(s,id)',
  '../server/hosted-rag-policy': 'export const createHostedRagPolicy=o=>({enabled:async()=>globalThis.hostedFixture.ready && await o.current()})',
  '../server/hosted-rag-playground': 'export const createHostedRagPlayground=p=>async(i,check)=>globalThis.hostedFixture.generate(i,check,p)',
  '../retrieval/product-context-set': 'export const createWorkflowProductContextPreparer=input=>async()=>globalThis.hostedFixture.context(input.authorizeCurrent)',
  '../retrieval/insforge-adapters': 'export const createInsforgeAdapters=()=>({})',
  './snapshot-retrieval-clerk': 'export const snapshotRetrievalAdmission=async timing=>globalThis.hostedFixture.snapshot(timing)',
};
registerHooks({resolve(specifier, context, next) {
  if (Object.hasOwn(stubs, specifier)) return {url:'data:text/javascript,'+encodeURIComponent(stubs[specifier]),shortCircuit:true};
  if (specifier === './playground-capabilities' || specifier === './playground-workflow-handler') return next(specifier+'.ts',context);
  return next(specifier,context);
}});
const {hostedPlaygroundGET, hostedPlaygroundPOST} = await import('../src/control-room/hosted-playground-clerk.ts');
const origin='https://pandabyte-iot.vercel.app', url=origin+'/api/admin/panda-agent/playground';
const requestId='448ca4bc-074e-40b3-8abd-c515fe77e489';
const ask=(body,headers={})=>new Request(url,{method:'POST',headers:{origin,'content-type':'application/json',...headers},body:JSON.stringify(body)});
function fixture() {
  const subject='fixture',sessionId='fixture-session';
  const f=globalThis.hostedFixture={
    access:{allowed:true},session:{isAuthenticated:true,sessionStatus:'active',userId:subject,sessionId},
    admin:true,active:true,role:'ADMIN',ready:true,modelAdmissions:0,snapshots:0,calls:0,
    admit(flag) {assert.deepEqual(flag,{admin:true});this.modelAdmissions++;return {admin:this.admin,subject,sessionId,client:{database:{from:name=>{
      assert.equal(name,'staff_role_memberships');return {select:()=>({eq:(col,s)=>{
        assert.deepEqual([col,s],['user_id',subject]);return {limit:async()=>({data:[{role:this.role}],error:null})};}})};
    }}}};},
    live(s,id) {assert.deepEqual([s,id],[subject,sessionId]);return this.active;},
    context(current) {return {kind:'ready',products:[{sku:'FIX',title:'Fixture'}],passages:[{rank:1,productSku:'FIX',
      productTitle:'Fixture',title:'Fixture',sourceUrl:'https://pandabyte.in/product-page/fixture',capturedAt:'2026-10-31T00:00:00Z',
      sectionPath:['Spec'],text:'Fixture listing.'}],revalidate:current,authorizedBy:current};},
    snapshot(timing) {this.snapshots++;timing.databaseSnapshotMs=3;return {kind:'admin',subject,dependencies:{
      authorize:async()=>true,prepare:async()=>this.context(async()=>true)}};},
    async generate(_input,check,policy) {assert.ok(await policy.enabled());assert.ok(await check());this.calls++;
      return {evaluation:{answer:'Fixture listing.',evidence:[{rank:1,quote:'Fixture listing.',reason:'Source'}]},
        usage:{inputTokens:11,outputTokens:3,costNanoUsd:2000}};},
  };
  return f;
}
test('document-only and model POSTs use distinct admissions with real handler validation and elapsed metrics',async()=>{
  const f=fixture();
  const doc=await hostedPlaygroundPOST(ask({question:'Which product is listed?'}));
  assert.equal(doc.status,200);assert.equal((await doc.json()).metrics.databaseSnapshotMs,3);
  assert.deepEqual([f.snapshots,f.modelAdmissions,f.calls],[1,0,0]);
  const result=await hostedPlaygroundPOST(ask({question:'Which product is listed?',evaluate:true,requestId}));
  assert.equal(result.status,200);const data=await result.json();assert.equal(data.model.status,'evaluated');
  assert.ok(data.metrics.elapsedMs>=0);assert.equal(data.metrics.databaseSnapshotMs,undefined);
  assert.deepEqual([f.snapshots,f.modelAdmissions,f.calls],[1,1,1]);
});
test('framing and strict request validation reject malformed calls before any model execution',async()=>{
  const f=fixture();
  for(const [req,status] of [[new Request(url),405],[ask({}, {origin:'https://other.example'}),403],
    [ask({}, {'content-type':'text/plain'}),415],[ask({question:'x'.repeat(8500)}),413]]) {
    assert.equal((await hostedPlaygroundPOST(req)).status,status);
  }
  assert.deepEqual([f.snapshots,f.modelAdmissions,f.calls],[0,0,0]);
  for(const body of [{question:'Test?',evaluate:true},{question:'Test?',evaluate:'true'},{question:'Test?',extra:true}]) {
    assert.equal((await hostedPlaygroundPOST(ask(body))).status,400);
  }
  assert.equal(f.calls,0);
});
test('denied Admin, revoked Clerk session, subject change, or lost live role stop model requests',async()=>{
  for(const scenario of ['admission','liveSession','changedSubject','changedRole']){
    const f=fixture();
    if(scenario==='admission')f.admin=false;
    if(scenario==='liveSession')f.active=false;
    if(scenario==='changedSubject')f.session.userId='another';
    if(scenario==='changedRole')f.role='CUSTOMER';
    const r=await hostedPlaygroundPOST(ask({question:'Test?',evaluate:true,requestId}));
    assert.equal(r.status,scenario==='admission'?403:503);assert.equal(f.calls,0);assert.equal(f.snapshots,0);
  }
});
test('capability GET gates Admin access and reports only hosted policy state',async()=>{
  const f=fixture();
  const r=await hostedPlaygroundGET(new Request(url));assert.equal(r.status,200);
  assert.deepEqual(await r.json(),{model:'openai/gpt-6-luna',connection:'configured_unverified',transport:'hosted',profile:'hosted-rag-v1',approvedQuestions:[]});
  f.ready=false;
  assert.deepEqual(await (await hostedPlaygroundGET(new Request(url))).json(),
    {model:'openai/gpt-6-luna',connection:'not_configured',transport:'unconfigured',profile:null,approvedQuestions:[]});
  f.access={allowed:false,status:403};assert.equal((await hostedPlaygroundGET(new Request(url))).status,403);assert.equal(f.modelAdmissions,2);
});
