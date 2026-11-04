import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile, rm, chmod, link, symlink } from 'node:fs/promises';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { readLocalPlaygroundConfig as readProfile, readPrivateLocalLeaseConfig, localPlaygroundConfigCurrent } from '../src/control-room/playground-local-config.ts';
import { createLocalPlaygroundClient } from '../src/control-room/playground-local.ts';
const now = Date.parse('2026-11-04T10:00:00Z');
await mkdir(path.resolve('Panda-agent/artifacts'), { recursive: true });
const config = {version:1,expiresAt:'2026-11-04T11:00:00Z',ownerSubjectSha256:'a'.repeat(64),serviceToken:'b'.repeat(64),caCertificate:'-----BEGIN CERTIFICATE-----\nQUJDRA==\n-----END CERTIFICATE-----\n'};
const turn = {question:'According to the x8266 listing, what is its flash memory?',productSku:'ESPX8266',requestId:'11111111-1111-4111-8111-111111111111',contextDigest:'c'.repeat(64),userToken:'d'.repeat(32)};
const env = file => ({NODE_ENV:'development',PANDA_AGENT_PLAYGROUND_GATEWAY_ENABLED:'true',PANDA_AGENT_PLAYGROUND_GATEWAY_PROTOCOL:'v3-context-digest',PANDA_AGENT_PLAYGROUND_PROFILE:'mini-two-case-v1',PANDA_AGENT_PLAYGROUND_TRANSPORT:'local-ssm-v3',PANDA_AGENT_PLAYGROUND_LOCAL_CONFIG:file});
// These fixtures exercise file/schema guards; real Windows ACL coverage is separate.
const readLocalPlaygroundConfig = (flags, clock) => readProfile(flags, clock, async()=>true);
const complete = () => ({version:3,requestId:turn.requestId,status:'complete',contextDigest:turn.contextDigest,rawModel:'{"answer":"ok","evidence":[]}'});
function mock(reply, inspect=()=>{}) {
 let calls=0;
 const request=(options, callback)=>{ calls++; const req=new EventEmitter();req.destroy=()=>req;req.end=body=>{inspect(options,body);if(reply===null)return;queueMicrotask(()=>{const response=new EventEmitter();response.statusCode=200;response.headers={'content-type':'application/json'};response.complete=true;response.resume=()=>{};response.destroy=()=>{};callback(response);response.emit('data',Buffer.from(typeof reply==='string'?reply:JSON.stringify(reply)));response.emit('end');});};return req;};
 return {request,get calls(){return calls;}};
}
const rejects = (promise, code='outcome_unknown') => assert.rejects(promise, e=>e.code===code);

test('configuration is private, exact, canonical, local-only and time bounded',async()=>{
 const dir=await mkdtemp(path.resolve('Panda-agent/artifacts/local-config-fixture-')), file=path.join(dir,'config.json');
 try {
  await writeFile(file,JSON.stringify(config),{mode:0o600});
  assert.deepEqual(await readLocalPlaygroundConfig(env(file),()=>now),config);
  const nativeOnly={NODE_ENV:'development',PANDA_AGENT_HOSTED_TRANSPORT:'local-ssm-v1'};
  assert.deepEqual(await readPrivateLocalLeaseConfig(nativeOnly,file,()=>now,async()=>true),config);
  assert.equal(await readProfile(nativeOnly,()=>now,async()=>true),null);
  assert.equal(await readPrivateLocalLeaseConfig({...nativeOnly,NODE_ENV:'production'},file,()=>now,async()=>true),null);
  assert.equal(await readPrivateLocalLeaseConfig({...nativeOnly,VERCEL_ENV:'preview'},file,()=>now,async()=>true),null);
  assert.deepEqual(await readPrivateLocalLeaseConfig(nativeOnly,file,()=>now,async()=>false),process.platform==='win32'?null:config);
  assert.equal(localPlaygroundConfigCurrent(config,now),true);
  for(const override of [{NODE_ENV:'production'},{VERCEL:'1'},{VERCEL_ENV:'preview'},{PANDA_AGENT_PLAYGROUND_PROFILE:'other'},{PANDA_AGENT_PLAYGROUND_TRANSPORT:'other'},{PANDA_AGENT_PLAYGROUND_LOCAL_CONFIG:'relative.json'}]) assert.equal(await readLocalPlaygroundConfig({...env(file),...override},()=>now),null);
  for(const value of [{...config,extra:'x'},{...config,expiresAt:'2026-11-04T11:00:00.000Z'},{...config,expiresAt:'2026-11-04T12:00:01Z'},{...config,expiresAt:'2026-11-04T09:59:59Z'},{...config,caCertificate:'-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----'}]) {await writeFile(file,JSON.stringify(value));assert.equal(await readLocalPlaygroundConfig(env(file),()=>now),null);}
  await writeFile(file,JSON.stringify(config));
  if(process.platform!=='win32'){await chmod(file,0o644);assert.equal(await readLocalPlaygroundConfig(env(file),()=>now),null);await chmod(file,0o600);}
  const hard=path.join(dir,'hard');await link(file,hard);assert.equal(await readLocalPlaygroundConfig(env(file),()=>now),null);await rm(hard);
  const shortcut=path.join(dir,'shortcut');try {await symlink(file,shortcut);assert.equal(await readLocalPlaygroundConfig(env(shortcut),()=>now),null);} catch(e) {if(!['EPERM','EACCES'].includes(e.code))throw e;}
  assert.equal(await readLocalPlaygroundConfig(env(path.resolve('package.json')),()=>now),null);
 } finally {await rm(dir,{recursive:true,force:true});}
});

test('fixed pinned TLS and genuine headers carry exact approved v3 once',async()=>{
 const fake=mock(complete(),(o,b)=>{assert.equal(o.hostname,'127.0.0.1');assert.equal(o.port,49443);assert.equal(o.path,'/v1/turns');assert.equal(o.servername,'panda-gateway.internal');assert.equal(o.rejectUnauthorized,true);assert.equal(o.ca,config.caCertificate);assert.equal(o.headers.Authorization,`Bearer ${config.serviceToken}`);assert.equal(o.headers['X-Panda-User-Token'],turn.userToken);assert.equal(o.headers['X-Panda-Local-Validation'],'1');assert.deepEqual(JSON.parse(b),{version:3,mode:'playground',requestId:turn.requestId,question:turn.question,productSku:turn.productSku,contextDigest:turn.contextDigest});});
 assert.equal(await createLocalPlaygroundClient(config,{request:fake.request,now:()=>now,reauthorize:async()=>true})(turn),complete().rawModel);assert.equal(fake.calls,1);
});
test('only exact correlated responses are definitive',async()=>{
 for(const value of [{...complete(),contextDigest:'e'.repeat(64)},{...complete(),requestId:'22222222-2222-4222-8222-222222222222'},{...complete(),extra:true},{...complete(),rawModel:'x'.repeat(10001)},'x'.repeat(32769)]) await rejects(createLocalPlaygroundClient(config,{request:mock(value).request,now:()=>now,reauthorize:async()=>true})(turn));
 for(const status of ['quota','not_admitted']) await rejects(createLocalPlaygroundClient(config,{request:mock({version:3,requestId:turn.requestId,status}).request,now:()=>now,reauthorize:async()=>true})(turn),status);
});
test('cancelled, expired and unapproved requests never release or retry',async()=>{
 const fake=mock(null), controller=new AbortController(); const pending=createLocalPlaygroundClient(config,{request:fake.request,now:()=>now,reauthorize:async()=>true})({...turn,signal:controller.signal});controller.abort();await rejects(pending);assert.equal(fake.calls,1);
 const noSend=mock(complete()); await rejects(createLocalPlaygroundClient(config,{request:noSend.request,now:()=>now,reauthorize:async()=>true})({...turn,question:'Other'}));assert.equal(noSend.calls,0);
 let clock=now;const late=mock(complete(),()=>{clock=Date.parse(config.expiresAt);});await rejects(createLocalPlaygroundClient(config,{request:late.request,now:()=>clock,reauthorize:async()=>true})(turn));assert.equal(late.calls,1);
});


test('lease expiring during request construction prevents body write', async()=>{
 let clock=now,writes=0,destroys=0;
 const request=()=>{clock=Date.parse(config.expiresAt);const req=new EventEmitter();req.destroy=()=>{destroys++;return req;};req.end=()=>{writes++;};return req;};
 await rejects(createLocalPlaygroundClient(config,{request,now:()=>clock,reauthorize:async()=>true})(turn));
 assert.equal(writes,0);assert.ok(destroys>=1);
});


test('fresh authorization denial while pending prevents body write',async()=>{
 let release, started, writes=0, destroyed=0;
 const waiting=new Promise(resolve=>{release=resolve;}), ready=new Promise(resolve=>{started=resolve;});
 const request=()=>{const req=new EventEmitter();req.destroy=()=>{destroyed++;return req;};req.end=()=>{writes++;};return req;};
 const pending=createLocalPlaygroundClient(config,{request,now:()=>now,reauthorize:async()=>{started();return waiting;}})(turn);
 await ready; assert.equal(writes,0); release(false); await rejects(pending,'not_admitted'); assert.equal(writes,0);assert.ok(destroyed);
 const throwing=createLocalPlaygroundClient(config,{request,now:()=>now,reauthorize:async()=>{throw Error('private');}});
 await rejects(throwing(turn),'not_admitted');assert.equal(writes,0);
});
test('lease expiry while authorization is pending prevents body write',async()=>{
 let clock=now, release, started,writes=0;
 const waiting=new Promise(resolve=>{release=resolve;}), ready=new Promise(resolve=>{started=resolve;});
 const request=()=>{const req=new EventEmitter();req.destroy=()=>req;req.end=()=>{writes++;};return req;};
 const pending=createLocalPlaygroundClient(config,{request,now:()=>clock,reauthorize:async()=>{started();return waiting;}})(turn);
 await ready;clock=Date.parse(config.expiresAt);release(true);await rejects(pending);assert.equal(writes,0);
});
test('missing authorization callback rejects before connection',async()=>{
 let calls=0;const request=()=>{calls++;throw Error('unexpected');};
 await rejects(createLocalPlaygroundClient(config,{request,now:()=>now})(turn),'not_admitted');assert.equal(calls,0);
});
