import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { resolvePlaygroundConfiguration, localPlaygroundOwner, sameLocalPlaygroundConfiguration } from '../src/control-room/playground-configuration.ts';
import { playgroundCapabilities } from '../src/control-room/playground-capabilities.ts';

const flags = {NODE_ENV:'development',PANDA_AGENT_PLAYGROUND_GATEWAY_ENABLED:'true',PANDA_AGENT_PLAYGROUND_GATEWAY_PROTOCOL:'v3-context-digest',PANDA_AGENT_PLAYGROUND_PROFILE:'mini-two-case-v1',PANDA_AGENT_PLAYGROUND_TRANSPORT:'local-ssm-v3'};
const config = () => ({version:1,expiresAt:new Date(Math.floor(Date.now()/1000)*1000+3600000).toISOString().replace('.000Z','Z'),ownerSubjectSha256:createHash('sha256').update('owner').digest('hex'),serviceToken:'a'.repeat(64),caCertificate:'fixture-public-certificate'});

test('local resolution requires explicit development flags and never falls back to hosted',async()=>{
 let reads=0; const value=config(); const read=async()=>{reads++;return value;};
 const enabled=await resolvePlaygroundConfiguration(flags,read);assert.equal(enabled.transport,'local');assert.equal(reads,1);
 for(const override of [{NODE_ENV:'production'},{VERCEL:'1'},{PANDA_AGENT_PLAYGROUND_TRANSPORT:'other'},{PANDA_AGENT_PLAYGROUND_GATEWAY_ENABLED:'false'},{PANDA_AGENT_PLAYGROUND_GATEWAY_PROTOCOL:'other'},{PANDA_AGENT_PLAYGROUND_PROFILE:'other'}]) assert.equal(await resolvePlaygroundConfiguration({...flags,...override},read),null);
 assert.equal(reads,1);assert.equal(await resolvePlaygroundConfiguration(flags,async()=>null),null);
 assert.equal(await resolvePlaygroundConfiguration(flags,async()=>({...value,expiresAt:'2020-01-01T00:00:00Z'})),null);
});

test('the configured lease belongs to the active opaque owner and changes revoke it',()=>{
 const value=config();assert.equal(localPlaygroundOwner(value,'owner'),true);assert.equal(localPlaygroundOwner(value,'foreign'),false);
 assert.equal(sameLocalPlaygroundConfiguration(value,{...value}),true);
 for(const change of [{serviceToken:'b'.repeat(64)},{caCertificate:'different'},{ownerSubjectSha256:'c'.repeat(64)},{expiresAt:'2020-01-01T00:00:00Z'}]) assert.equal(sameLocalPlaygroundConfiguration(value,{...value,...change}),false);
 const capability=playgroundCapabilities(flags,false,localPlaygroundOwner(value,'owner'));
 assert.equal(capability.transport,'local');assert.equal(capability.connection,'configured_unverified');assert.equal(capability.profile,'mini-two-case-v1');
 assert.equal(playgroundCapabilities(flags,false,false).transport,'unconfigured');
 assert.doesNotMatch(JSON.stringify(capability),/fixture-public|ownerSubject|serviceToken/);
});

test('product profile is explicit and still requires the current owner lease',async()=>{
 const value=config(), next={...flags,PANDA_AGENT_PLAYGROUND_PROFILE:'product-playground-v1'};
 const resolved=await resolvePlaygroundConfiguration(next,async()=>value);
 assert.equal(resolved.profile,'product-playground-v1');assert.equal(localPlaygroundOwner(resolved.config,'owner'),true);assert.equal(localPlaygroundOwner(resolved.config,'other'),false);
 assert.equal((await resolvePlaygroundConfiguration(next,async()=>null)),null);
 assert.equal(playgroundCapabilities(next,false,true).profile,'product-playground-v1');
});
