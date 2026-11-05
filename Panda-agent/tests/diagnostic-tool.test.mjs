import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {createToolBroker} from '../src/diagnostics/tool-broker.ts';
test('disabled tools never call grant or transport; revocation prevents release',async()=>{
 let grants=0,calls=0;const invoke=async()=>{calls++;return {references:[]}};
 const disabled=createToolBroker({enabled:false,currentGrant:async()=>{grants++;return true},invoke});
 await assert.rejects(disabled.search({topic:'gpio',chip:'esp32',frameworkVersion:'5.5.1'})); assert.equal(grants,0);assert.equal(calls,0);
 const broker=createToolBroker({enabled:true,currentGrant:async()=>++grants===1,invoke});
 await assert.rejects(broker.search({topic:'gpio',chip:'esp32',frameworkVersion:'5.5.1'}));assert.equal(calls,1);
});
test('injected HTTP fixture receives only fixed public topic and aborts an in-flight call',async()=>{
 let received;const server=createServer((req,res)=>{let body='';req.on('data',c=>body+=c);req.on('end',()=>{received=JSON.parse(body);if(req.url==='/ok'){res.writeHead(200,{'content-type':'application/json'});res.end('{"references":[]}')}})});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const port=server.address().port;
 try{
  const broker=createToolBroker({enabled:true,currentGrant:async()=>true,invoke:async(input,signal)=>{const r=await fetch(`http://127.0.0.1:${port}/ok`,{method:'POST',body:JSON.stringify(input),signal});return r.json()}});
  assert.deepEqual(await broker.search({topic:'gpio',chip:'esp32',frameworkVersion:'5.5.1'}),{references:[]});assert.deepEqual(received,{topic:'gpio',chip:'esp32',frameworkVersion:'5.5.1'});
  const c=new AbortController();const slow=createToolBroker({enabled:true,currentGrant:async()=>true,invoke:async(input,signal)=>{const r=await fetch(`http://127.0.0.1:${port}/slow`,{method:'POST',body:JSON.stringify(input),signal});return r.json()}});
  const pending=slow.search({topic:'gpio',chip:'esp32',frameworkVersion:'5.5.1'},c.signal);setTimeout(()=>c.abort(),20);await assert.rejects(pending);
 }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});
