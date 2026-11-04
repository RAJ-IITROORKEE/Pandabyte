import test from 'node:test';
import assert from 'node:assert/strict';
import {hostedPlaygroundProfile} from '../src/control-room/playground-hosted-profile.ts';
import {playgroundCapabilities} from '../src/control-room/playground-capabilities.ts';
const mini={VERCEL:'1',PANDA_AGENT_PLAYGROUND_GATEWAY_ENABLED:'true',PANDA_AGENT_PLAYGROUND_GATEWAY_PROTOCOL:'v3-context-digest',PANDA_AGENT_PLAYGROUND_PROFILE:'mini-two-case-v1'};
const product={...mini,PANDA_AGENT_PLAYGROUND_PROFILE:'product-playground-v1'};
const capabilities=flags=>playgroundCapabilities(flags,hostedPlaygroundProfile(flags)!==null);
test('new product remains unconfigured until every hosted opt-in and independent host readiness gate are exact',()=>{
 assert.equal(hostedPlaygroundProfile(product),null);assert.equal(capabilities(product).profile,null);
 const ready={...product,PANDA_AGENT_PRODUCT_PLAYGROUND_HOST_READY:'true'};
 assert.equal(hostedPlaygroundProfile(ready),'product-playground-v1');assert.deepEqual(capabilities(ready).approvedQuestions,[]);
 for(const change of [{VERCEL:undefined},{PANDA_AGENT_PLAYGROUND_GATEWAY_ENABLED:'false'},{PANDA_AGENT_PLAYGROUND_GATEWAY_PROTOCOL:'other'},{PANDA_AGENT_PLAYGROUND_TRANSPORT:'local-ssm-v3'},{PANDA_AGENT_PRODUCT_PLAYGROUND_HOST_READY:'TRUE'},{PANDA_AGENT_PLAYGROUND_PROFILE:'other'}])assert.equal(hostedPlaygroundProfile({...ready,...change}),null);
});
test('legacy mini profile remains byte-independent of readiness gate',()=>{
 assert.equal(hostedPlaygroundProfile(mini),'mini-two-case-v1');assert.equal(capabilities(mini).approvedQuestions.length,2);
 assert.equal(hostedPlaygroundProfile({...mini,PANDA_AGENT_PRODUCT_PLAYGROUND_HOST_READY:'false'}),'mini-two-case-v1');
});
