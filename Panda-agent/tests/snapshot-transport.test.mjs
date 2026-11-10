import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import {once} from 'node:events';
import {gzipSync,deflateSync,brotliCompressSync} from 'node:zlib';
import {createSnapshotTransport} from '../src/server/snapshot-transport.ts';

const origin='https://fixture.us.insforge.app';
const path='/api/database/rpc/panda_agent_runtime_admin_snapshot';
const endpoint=origin+path;
test('only the exact snapshot POST uses the native transport',async()=>{
 const calls=[];
 const transport=createSnapshotTransport(origin,async(input,init)=>{calls.push([input,init]);return new Response('fallback');});
 for(const [url,method] of [[endpoint,'GET'],[endpoint+'?x=1','POST'],[endpoint+'?','POST'],[endpoint+'#fragment','POST'],
  [origin+'/api/database/rpc/another','POST'],[endpoint.replace('fixture.us','other.us'),'POST'],[endpoint.replace('https://','https://name@'),'POST']]){
  const init={method};
  assert.equal(await (await transport(url,init)).text(),'fallback');
  assert.deepEqual(calls.at(-1),[url,init]);
 }
 assert.throws(()=>createSnapshotTransport('http://fixture.us.insforge.app'));
 assert.throws(()=>createSnapshotTransport(origin+'/prefix'));
});

test('pooled snapshot requests isolate actor headers, bound decoded bodies, and honor aborts',async t=>{
 const observed=[];
 let variant='gzip',notifyStall;
 const server=http.createServer(async(req,res)=>{
  const chunks=[];for await(const chunk of req)chunks.push(chunk);
  observed.push({socket:req.socket,auth:req.headers.authorization,body:Buffer.concat(chunks).toString(),url:req.url});
  if(variant==='stall'){res.write('partial');notifyStall();return;}
  if(variant==='redirect'){res.writeHead(307,{location:origin+'/another'}).end();return;}
  if(variant==='denied'){res.writeHead(403,{'content-type':'application/json'}).end('{"code":"forbidden"}');return;}
  const encode={gzip:gzipSync,br:brotliCompressSync,deflate:deflateSync,oversize:gzipSync}[variant];
  if(variant==='bad'){res.writeHead(200,{'content-encoding':'gzip'}).end('not a gzip stream');return;}
  const compressed=encode(variant==='oversize'?Buffer.alloc(4*1024*1024+1):Buffer.from('{"ok":true}'));
  res.writeHead(200,{'content-encoding':variant==='oversize'?'gzip':variant,'content-length':compressed.length}).end(compressed);
 });
 server.listen(0,'127.0.0.1');await once(server,'listening');
 t.after(()=>{server.closeAllConnections();server.close();});
 const agents=[],connectionOptions=[];
 // Substitute only the TLS dial. Real ClientRequest, Agent pooling, sockets and streaming stay active.
 t.mock.method(https.Agent.prototype,'createConnection',function(options){
  connectionOptions.push(options);
  agents.push(this);return net.connect(server.address().port,'127.0.0.1');
 });
 const unexpected=()=>assert.fail('snapshot ran a fallback');
 const first=createSnapshotTransport(origin,unexpected),second=createSnapshotTransport(origin,unexpected);
 const post=(f,token,signal)=>f(endpoint,{method:'POST',body:'{}',headers:{authorization:'Bearer '+token},signal});
 for(const [i,encoding] of ['gzip','br','deflate'].entries()){
  variant=encoding;const response=await post(i===0?first:second,'actor'+i);
  assert.deepEqual(await response.json(),{ok:true});
  assert.equal(response.headers.get('content-encoding'),null);assert.equal(response.headers.get('content-length'),null);
 }
 assert.deepEqual(observed.map(o=>o.auth),['Bearer actor0','Bearer actor1','Bearer actor2']);
 assert.ok(observed.every(o=>o.socket===observed[0].socket && o.body==='{}' && o.url===path));
 assert.equal(agents.length,1);assert.equal(agents[0].maxSockets,8);assert.equal(agents[0].maxFreeSockets,2);
 assert.equal(connectionOptions[0].autoSelectFamily,true);
 assert.equal(connectionOptions[0].autoSelectFamilyAttemptTimeout,750);
 assert.equal(connectionOptions[0].family,undefined);
 variant='denied';const denied=await post(first,'denied');assert.equal(denied.status,403);assert.deepEqual(await denied.json(),{code:'forbidden'});
 variant='redirect';await assert.rejects(post(first,'redirect'));assert.equal(observed.length,5);
 variant='oversize';await assert.rejects(post(first,'large'),/too large/);
 variant='bad';await assert.rejects(post(first,'bad'));
 variant='stall';const started=new Promise(r=>{notifyStall=r;}),controller=new AbortController();
 const pending=post(first,'abort',controller.signal);await started;controller.abort();await assert.rejects(pending);
 const before=observed.length;await assert.rejects(post(first,'already-aborted',AbortSignal.abort()));assert.equal(observed.length,before);
});
