import test from 'node:test';
import assert from 'node:assert/strict';
import { approvedPlaygroundQuestions, matchApprovedPlaygroundCase } from '../src/control-room/playground-intent.ts';
import { playgroundCapabilities, createPlaygroundCapabilitiesHandler } from '../src/control-room/playground-capabilities.ts';
const flags={VERCEL:'1',PANDA_AGENT_PLAYGROUND_GATEWAY_ENABLED:'true',PANDA_AGENT_PLAYGROUND_GATEWAY_PROTOCOL:'v3-context-digest',PANDA_AGENT_PLAYGROUND_PROFILE:'mini-two-case-v1'};
test('returns fresh copies of the two approved questions',()=>{
 const values=approvedPlaygroundQuestions();assert.equal(values.length,2);assert.equal(matchApprovedPlaygroundCase({question:values[0],productSku:'ESPX8266'}),'mini-01');values.push('forged');assert.equal(approvedPlaygroundQuestions().length,2);
});
test('hosted requires all exact flags, Vercel and valid config; localhost remains unconfigured',()=>{
 const enabled=playgroundCapabilities(flags,true);assert.equal(enabled.model,'openai/gpt-4o-mini');assert.equal(enabled.connection,'configured_unverified');assert.equal(enabled.transport,'hosted');assert.equal(enabled.profile,'mini-two-case-v1');
 for(const input of [{...flags,VERCEL:undefined},{...flags,VERCEL:'true'},{...flags,PANDA_AGENT_PLAYGROUND_GATEWAY_ENABLED:'false'},{...flags,PANDA_AGENT_PLAYGROUND_GATEWAY_PROTOCOL:'other'},{...flags,PANDA_AGENT_PLAYGROUND_PROFILE:'other'}]){const result=playgroundCapabilities(input,true);assert.equal(result.connection,'not_configured');assert.equal(result.transport,'unconfigured');assert.equal(result.profile,null);}
 assert.equal(playgroundCapabilities(flags,false).connection,'not_configured');
});
test('fresh Admin gate, no-store responses and no configuration secrets',async()=>{
 let allowed=true,checks=0,reads=0;const handler=createPlaygroundCapabilitiesHandler(async()=>{checks++;return allowed?{allowed:true}:{allowed:false,status:403};},()=>{reads++;return playgroundCapabilities({...flags,PANDA_AGENT_PLAYGROUND_GATEWAY_TOKEN:'private-value',PANDA_AGENT_HOSTED_GATEWAY_URL:'private-url'},true);});
 const ok=await handler();assert.equal(ok.status,200);assert.equal(ok.headers.get('cache-control'),'private, no-store');const text=await ok.text();assert.equal(text.includes('private-value'),false);assert.equal(text.includes('private-url'),false);assert.deepEqual(Object.keys(JSON.parse(text)).sort(),['approvedQuestions','connection','model','profile','transport']);
 allowed=false;const denied=await handler();assert.equal(denied.status,403);assert.equal(denied.headers.get('cache-control'),'private, no-store');assert.equal(checks,2);assert.equal(reads,1);
});
test('auth and capability exceptions fail closed without exposing details',async()=>{
 const badAuth=createPlaygroundCapabilitiesHandler(async()=>{throw Error('secret');},()=>{throw Error('unexpected');});const a=await badAuth();assert.equal(a.status,503);assert.doesNotMatch(await a.text(),/secret/);
 const badConfig=createPlaygroundCapabilitiesHandler(async()=>({allowed:true}),()=>{throw Error('secret');});const b=await badConfig();assert.equal(b.status,503);assert.doesNotMatch(await b.text(),/secret/);
});
