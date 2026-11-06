import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readChatStream} from '../src/ui/chat-stream.ts';
import {messagePayload} from '../src/ui/guide-input.ts';
const stream=(events)=>new ReadableStream({start(c){c.enqueue(new TextEncoder().encode(events.map(e=>`data: ${JSON.stringify(e)}\n\n`).join('')));c.close();}});
test('strict tool events are observed and malformed events make the outcome unknown',async()=>{
 const seen=[];
 await readChatStream(stream([{type:'tool',tool:{toolId:'convert_units',state:'complete',origin:'recorded'}},{type:'complete',data:{}}]),()=>{},undefined,card=>seen.push(card));
 assert.deepEqual(seen,[{toolId:'convert_units',state:'complete',origin:'recorded'}]);
 await assert.rejects(readChatStream(stream([{type:'tool',tool:{toolId:'convert_units',state:'complete',origin:'execution',secret:'x'}},{type:'complete',data:{}}]),()=>{}));
});
test('structured task uses the dedicated request field',()=>{
 const agentic={skillId:'panda-documented-firmware-help',task:'unit-conversion',question:'Convert this',products:[],frameworkVersion:null,conversion:{value:1,from:'V',to:'mV'}};
 assert.deepEqual(messagePayload('request', {agentic}),{requestId:'request',agentic});
});
