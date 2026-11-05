import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {createDiagnosticImageHandlers} from '../src/server/diagnostic-images.ts';
import {ChatStoreError} from '../src/server/chat-store.ts';
const thread='11111111-1111-4111-8111-111111111111',assetId='22222222-2222-4222-8222-222222222222';
function setup(){let uploads=0,current=true,metadata;const store={reserveAsset:async(_t,_id,image,inputSha256)=>(metadata={...image,inputSha256,assetId,threadId:thread,expiresAt:Math.floor(Date.now()/1000)+900,status:'reserved',created:true}),recordAsset:async(_t,_id,status)=>metadata={...metadata,status},asset:async()=>metadata};
 const worker={upload:async()=>{uploads++;return {version:1,state:'ready'}},status:async()=>({version:1,state:'missing'}),read:async()=>{current=false;return {version:1,state:'ready',bytes:new Uint8Array([1,2])}},delete:async()=>({version:1,state:'deleted'})};
 const deps={enabled:()=>true,authenticate:async()=>({subject:'actor',sessionId:'session'}),current:async()=>current,store:()=>store,client:()=>worker};return {deps,store,worker,uploads:()=>uploads,setMetadata:v=>metadata=v};}
test('screenshot upload requires explicit consent and sends only normalized private bytes',async()=>{const s=setup(),handlers=createDiagnosticImageHandlers(s.deps);const bytes=await sharp({create:{width:8,height:8,channels:3,background:'red'}}).jpeg().toBuffer();
 const form=new FormData();form.set('file',new Blob([bytes],{type:'image/jpeg'}),'untrusted-name.jpg');form.set('assetId',assetId);form.set('consent','private-diagnostic-v1');
 const response=await handlers.uploadPOST(new Request('http://localhost/upload',{method:'POST',headers:{origin:'http://localhost'},body:form}),thread);assert.equal(response.status,201);assert.equal(s.uploads(),1);const value=await response.json();assert.equal(value.image.state,'ready');assert.equal(value.image.sha256,undefined);assert.equal(value.image.inputSha256,undefined);assert.equal(value.image.filename,undefined);
 const bad=new FormData();bad.set('file',new Blob([bytes],{type:'image/jpeg'}),'bad.jpg');bad.set('assetId',assetId);bad.set('consent','');assert.equal((await handlers.uploadPOST(new Request('http://localhost/upload',{method:'POST',headers:{origin:'http://localhost'},body:bad}),thread)).status,400);assert.equal(s.uploads(),1);
});
test('a revoked session after private read releases no image and foreign scope is generic',async()=>{const s=setup();s.setMetadata({assetId,threadId:thread,sha256:'a'.repeat(64),inputSha256:'b'.repeat(64),width:1,height:1,bytes:2,status:'ready',expiresAt:Math.floor(Date.now()/1000)+900});const h=createDiagnosticImageHandlers(s.deps);const response=await h.readGET(new Request('http://localhost/image'),thread,assetId);assert.equal(response.status,401);assert.match(response.headers.get('cache-control'),/no-store/);assert.doesNotMatch(await response.text(),/PNG|private|sha256/);
 s.deps.authenticate=async()=>null;assert.equal((await createDiagnosticImageHandlers(s.deps).readGET(new Request('http://localhost/image'),thread,assetId)).status,401);
});
test('cache loss terminalizes the owner metadata instead of retaining a ready screenshot',async()=>{
 const s=setup();s.setMetadata({assetId,threadId:thread,sha256:'a'.repeat(64),inputSha256:'b'.repeat(64),width:1,height:1,bytes:2,status:'ready',expiresAt:Math.floor(Date.now()/1000)+900});s.worker.read=async()=>({version:1,state:'missing'});
 const response=await createDiagnosticImageHandlers(s.deps).readGET(new Request('http://localhost/image'),thread,assetId);assert.equal(response.status,410);assert.equal((await s.store.asset(thread,assetId)).status,'expired');
});
test('whole image deadline returns no bytes and late private completion stays aborted',async()=>{
 const s=setup();s.setMetadata({assetId,threadId:thread,sha256:'a'.repeat(64),inputSha256:'b'.repeat(64),width:1,height:1,bytes:2,status:'ready',expiresAt:Math.floor(Date.now()/1000)+900});let release,signal;
 s.worker.read=async args=>{signal=args.signal;return new Promise(resolve=>release=()=>resolve({version:1,state:'ready',bytes:new Uint8Array([1,2])}))};
 const response=await createDiagnosticImageHandlers({...s.deps,deadlineMs:10}).readGET(new Request('http://localhost/image'),thread,assetId);assert.equal(response.status,503);assert.equal(signal.aborted,true);release();await new Promise(resolve=>setImmediate(resolve));assert.deepEqual(await response.json(),{error:'unavailable'});
});
test('upload replay checks volatile cache even when metadata was ready and never reuploads',async()=>{
 const s=setup(),reserve=s.store.reserveAsset;let statuses=0;s.store.reserveAsset=async(...args)=>({...await reserve(...args),created:false,status:'ready'});s.worker.status=async()=>{statuses++;return {version:1,state:'missing'}};
 const bytes=await sharp({create:{width:4,height:4,channels:3,background:'blue'}}).png().toBuffer();const form=new FormData();form.set('file',new Blob([bytes],{type:'image/png'}),'test.png');form.set('assetId',assetId);form.set('consent','private-diagnostic-v1');
 const response=await createDiagnosticImageHandlers(s.deps).uploadPOST(new Request('http://localhost/upload',{method:'POST',headers:{origin:'http://localhost'},body:form}),thread);assert.equal(response.status,410);assert.equal(statuses,1);assert.equal(s.uploads(),0);assert.equal((await s.store.asset(thread,assetId)).status,'expired');
});
test('session check returning after deadline cannot begin a deletion write',async()=>{
 const s=setup();let checks=0,release,writes=0;
 s.setMetadata({assetId,threadId:thread,sha256:'a'.repeat(64),inputSha256:'b'.repeat(64),width:1,height:1,bytes:2,status:'ready',expiresAt:Math.floor(Date.now()/1000)+900});
 s.deps.current=async()=>{if(++checks===3)return new Promise(resolve=>release=()=>resolve(true));return true;};
 s.store.recordAsset=async()=>{writes++;};
 const response=await createDiagnosticImageHandlers({...s.deps,deadlineMs:10}).deleteDELETE(new Request('http://localhost/image',{method:'DELETE',headers:{origin:'http://localhost'}}),thread,assetId);
 assert.equal(response.status,503);assert.equal(typeof release,'function');release();await new Promise(resolve=>setImmediate(resolve));assert.equal(writes,0);
});

test('DELETE accepts an empty Next request stream, preserves ownership checks and rejects actual bytes',async()=>{
 const s=setup();let deletes=0,writes=0;s.setMetadata({assetId,threadId:thread,sha256:'a'.repeat(64),inputSha256:'b'.repeat(64),width:1,height:1,bytes:2,status:'ready',expiresAt:Math.floor(Date.now()/1000)+900});
 s.worker.delete=async()=>{deletes++;return {version:1,state:'deleted'}};const record=s.store.recordAsset;s.store.recordAsset=async(...args)=>{writes++;return record(...args)};
 const request=(bytes)=>new Request('http://localhost/image',{method:'DELETE',headers:{origin:'http://localhost'},duplex:'half',body:new ReadableStream({start(c){if(bytes)c.enqueue(new Uint8Array([1]));c.close()}})});
 const h=createDiagnosticImageHandlers(s.deps);assert.equal((await h.deleteDELETE(request(false),thread,assetId)).status,200);assert.equal(deletes,1);assert.equal(writes,1);
 assert.equal((await h.deleteDELETE(request(true),thread,assetId)).status,400);assert.equal(deletes,1);assert.equal(writes,1);
 s.store.asset=async()=>{throw new ChatStoreError('not_found')};assert.equal((await h.deleteDELETE(request(false),thread,assetId)).status,404);assert.equal(deletes,1);assert.equal(writes,1);
});

test('an unfinished empty DELETE stream is bounded without a deletion write',async()=>{
 const s=setup();let canceled=false,writes=0;s.store.recordAsset=async()=>{writes++};
 const request=new Request('http://localhost/image',{method:'DELETE',headers:{origin:'http://localhost'},duplex:'half',body:new ReadableStream({cancel(){canceled=true}})});
 const response=await createDiagnosticImageHandlers({...s.deps,deadlineMs:10}).deleteDELETE(request,thread,assetId);
 assert.equal(response.status,503);await new Promise(resolve=>setImmediate(resolve));assert.equal(writes,0);assert.equal(canceled,true);
});
