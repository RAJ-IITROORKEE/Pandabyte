import test from 'node:test';
import assert from 'node:assert/strict';
import {futureCapabilities,createDisabledCapability} from '../src/diagnostics/future-capabilities.ts';
test('future capabilities expose bounded versioned disabled contracts',()=>{
 assert.deepEqual(futureCapabilities.map(c=>c.id),['mqtt_read','execute_code','generate_image']);
 for(const capability of futureCapabilities){assert.equal(capability.version,1);assert.equal(capability.enabled,false);assert.equal(capability.costCap,0);assert.ok(capability.permission);assert.ok(capability.timeoutMs>0);assert.ok(capability.maxResultBytes>0);assert.ok(capability.inputSchema);assert.ok(capability.outputSchema);}
 const mqtt=futureCapabilities[0];assert.equal(mqtt.inputSchema.additionalProperties,false);assert.deepEqual(mqtt.inputSchema.required,['broker','topic']);
});
test('disabled adapter reports unsupported and never dispatches even on abort',async()=>{
 let called=0;const controller=new AbortController();controller.abort();
 for(const c of futureCapabilities){const adapter=createDisabledCapability(c,async()=>{called++;return {}});assert.deepEqual(await adapter.invoke({},controller.signal),{state:'unsupported'});const pendingController=new AbortController();const pending=adapter.invoke({},pendingController.signal);pendingController.abort();assert.deepEqual(await pending,{state:'unsupported'});}
 assert.equal(called,0);
});
