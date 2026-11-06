import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,createHmac} from 'node:crypto';
import {createMcpClient,prepareMcp,mcpDocumentId} from '../src/agentic/mcp-client.ts';
const secret='fixture-secret', turnId='11111111-1111-4111-8111-111111111111';
const sha=s=>createHash('sha256').update(s).digest('hex');
const document={documentId:mcpDocumentId,url:'https://docs.espressif.com/projects/esp-idf/en/v5.5.1/esp32/api-reference/peripherals/gpio.html',title:'ESP-IDF v5.5.1 ESP32 GPIO',framework:'esp-idf',chip:'esp32',version:'5.5.1',fetchedAt:'2026-11-06T00:00:00Z',bodySha256:'a'.repeat(64),header:'#include "driver/gpio.h"'};
test('MCP client binds fixed document, independent audience and signed zero-cost receipt',async()=>{
 const calls=[];
 const client=createMcpClient({baseUrl:'http://127.0.0.1:8182',secret,fetch:async(url,init)=>{
  const claims=JSON.parse(Buffer.from(init.headers.authorization.slice(7).split('.')[0],'base64url'));
  calls.push({url:String(url),claims,body:JSON.parse(init.body)});
  const raw=JSON.stringify({version:1,state:'complete',document,usage:{modelCalls:0,inputTokens:0,outputTokens:0,costNanoUsd:0}});
  const mac=createHmac('sha256',secret).update(`response.v1\n${claims.nonce}\n${sha(init.body)}\n${sha(raw)}`).digest('base64url');
  return new Response(raw,{headers:{'x-panda-receipt':mac}});
 }});
 const prepared=prepareMcp(turnId,mcpDocumentId);
 assert.equal((await client.run({subject:'actor',sessionId:'session',prepared})).state,'complete');
 assert.equal(calls[0].claims.aud,'panda-lightweight-mcp-v1');
 assert.equal(calls[0].body.documentId,mcpDocumentId);
 assert.throws(()=>prepareMcp(turnId,'http://169.254.169.254'));
 assert.throws(()=>createMcpClient({baseUrl:'http://evil.example',secret}));
});
test('lost MCP execution is never retried and status uses original digest only',async()=>{
 const routes=[];const client=createMcpClient({baseUrl:'http://127.0.0.1:8182',secret,fetch:async(url)=>{routes.push(new URL(url).pathname);throw Error('lost');}});
 const prepared=prepareMcp(turnId,mcpDocumentId);
 await assert.rejects(client.run({subject:'actor',sessionId:'session',prepared}),/unknown/);
 await assert.rejects(client.status({subject:'actor',sessionId:'session',turnId,requestBodySha256:prepared.digest}),/unknown/);
 assert.deepEqual(routes,['/v1/mcp/run','/v1/mcp/status']);
});
