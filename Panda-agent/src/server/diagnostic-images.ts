import {createHash} from 'node:crypto';
import {normalizeDiagnosticImage} from '../diagnostics/image-normalize.ts';
import type {createImageClient} from '../diagnostics/image-client.ts';
import type {createDiagnosticStore,DiagnosticAsset} from './diagnostic-store.ts';
import type {ChatActor} from './chat-contracts.ts';
import {uuid} from './chat-contracts.ts';
import {ChatStoreError} from './chat-store.ts';
type Store=Pick<ReturnType<typeof createDiagnosticStore>,'reserveAsset'|'recordAsset'|'asset'>;
type Dependencies={enabled:()=>boolean;authenticate:()=>Promise<ChatActor|null>;current:(actor:ChatActor)=>Promise<boolean>;store:(actor:ChatActor)=>Store;client:()=>ReturnType<typeof createImageClient>;deadlineMs?:number};
const headers={'cache-control':'private, no-store','x-content-type-options':'nosniff'};
const json=(value:unknown,status=200)=>new Response(JSON.stringify(value),{status,headers:{...headers,'content-type':'application/json; charset=utf-8'}});
const publicAsset=(a:DiagnosticAsset)=>({id:a.assetId,state:a.status,expiresAt:new Date(a.expiresAt*1000).toISOString(),bytes:a.bytes,width:a.width,height:a.height});
let uploading=false;
async function limitedBody(request:Request,limit=2097152+16384,overflowStatus=413){
 if(!request.body)throw 400;
 const reader=request.body.getReader(),parts:Uint8Array[]=[];let size=0,timer:ReturnType<typeof setTimeout>|undefined;
 let rejectAbort:(error:unknown)=>void=()=>{};
 const interrupted=new Promise<never>((_,reject)=>{rejectAbort=reject;timer=setTimeout(()=>reject(408),5000);});
 const abort=()=>rejectAbort(400);request.signal.addEventListener('abort',abort,{once:true});if(request.signal.aborted)abort();
 const work=(async()=>{while(true){const part=await reader.read();if(part.done)break;if(part.value.byteLength>limit-size)throw overflowStatus;size+=part.value.byteLength;parts.push(part.value);}return Buffer.concat(parts);})();
 try{return await Promise.race([work,interrupted]);}finally{clearTimeout(timer);request.signal.removeEventListener('abort',abort);void reader.cancel().catch(()=>{});try{reader.releaseLock();}catch{/* Pending network cancellation owns the reader until it settles. */}}
}
export function createDiagnosticImageHandlers(deps:Dependencies){
 const deadlineMs=deps.deadlineMs??30000;if(!Number.isInteger(deadlineMs)||deadlineMs<1||deadlineMs>30000)throw Error('Invalid image deadline');
 async function handle(request:Request,thread:string,action:'upload'|'read'|'delete',assetId?:string):Promise<Response>{
  let ownsUpload=false;
  try{
   const expected=action==='upload'?'POST':action==='read'?'GET':'DELETE';
   if(request.method!==expected)return new Response(null,{status:405,headers:{...headers,allow:expected}});
   const actor=await deps.authenticate();if(!actor?.sessionId)throw new ChatStoreError('unauthenticated');
   const url=new URL(request.url),isStatus=action==='read'&&url.search==='?status=1';
   if(!uuid(thread)||(assetId!==undefined&&!uuid(assetId))||(url.search&&!isStatus))throw 400;
   thread=thread.toLowerCase();assetId=assetId?.toLowerCase();
   if((action!=='read'&&request.headers.get('origin')!==url.origin)||(request.headers.has('origin')&&request.headers.get('origin')!==url.origin))throw 403;
   if(action==='delete'&&request.body)await limitedBody(request,0,400);
   const current=async()=>!request.signal.aborted&&await deps.current(actor)&&!request.signal.aborted;
   if(!await current())throw new ChatStoreError('unauthenticated');
   const store=deps.store(actor);
   const record=async(id:string,state:'ready'|'unknown'|'deleted'|'expired')=>{if(!await current())throw new ChatStoreError('unauthenticated');return store.recordAsset(thread,id,state);};
   const args=(a:DiagnosticAsset)=>({subject:actor.subject,sessionId:actor.sessionId!,threadId:thread,assetId:a.assetId,sha256:a.sha256,bytes:a.bytes,width:a.width,height:a.height,expiresAt:a.expiresAt,signal:request.signal});
   const refresh=async(id:string)=>{if(!await current())throw new ChatStoreError('unauthenticated');const a=await store.asset(thread,id);if(!await current())throw new ChatStoreError('unauthenticated');return a;};
   if(action==='upload'){
    if(!deps.enabled())throw new ChatStoreError('unavailable');
    if(uploading)return json({error:'busy'},503);uploading=true;ownsUpload=true;
    if(!/^multipart\/form-data\s*;\s*boundary=/i.test(request.headers.get('content-type')??'')||(request.headers.get('content-encoding')??'identity')!=='identity')throw 415;
    const raw=await limitedBody(request);if(!await current())throw new ChatStoreError('unauthenticated');
    let form:FormData;try{form=await new Request(request.url,{method:'POST',headers:{'content-type':request.headers.get('content-type')!},body:raw}).formData();}catch{throw 400;}
    const entries=[...form.entries()];if(entries.length!==3||new Set(entries.map(([k])=>k)).size!==3||entries.some(([k])=>!['file','assetId','consent'].includes(k))||form.get('consent')!=='private-diagnostic-v1'||!uuid(form.get('assetId')))throw 400;
    assetId=(form.get('assetId') as string).toLowerCase();const file=form.get('file');if(!(file instanceof Blob)||!file.size||file.size>2097152||!['image/png','image/jpeg'].includes(file.type))throw 400;
    const original=new Uint8Array(await file.arrayBuffer());let normalized:Awaited<ReturnType<typeof normalizeDiagnosticImage>>;
    try{normalized=await normalizeDiagnosticImage(original,file.type);}catch(e){throw e instanceof Error&&e.message==='busy'?503:e instanceof Error&&e.message==='timeout'?408:400;}
    if(!await current())throw new ChatStoreError('unauthenticated');
    const reservation=await store.reserveAsset(thread,assetId,{sha256:normalized.sha256,bytes:normalized.bytes.byteLength,width:normalized.width,height:normalized.height},createHash('sha256').update(original).digest('hex'));
    if(reservation.status==='expired'||reservation.status==='deleted')return json({error:'screenshot_expired',image:publicAsset(reservation)},410);
    if(reservation.created){
     if(!await current())throw new ChatStoreError('unauthenticated');
     let result:Awaited<ReturnType<ReturnType<typeof createImageClient>['upload']>>;
     try{result=await deps.client().upload({...args(reservation),body:normalized.bytes});}catch{try{await record(assetId,'unknown');}catch{}return json({error:'upload_unknown'},503);}
     if(!await current())throw new ChatStoreError('unauthenticated');
     if(result.state==='ready')await record(assetId,'ready');
     else if(result.state==='rejected'&&['busy','quota','invalid'].includes(result.code)){await record(assetId,'expired');return json({error:result.code},result.code==='quota'?429:result.code==='invalid'?400:503);}
     else{try{await record(assetId,'unknown');}catch{}return json({error:'upload_unknown'},503);}
    }else{
     const result=await deps.client().status(args(reservation));
     if(!await current())throw new ChatStoreError('unauthenticated');
     if(result.state==='ready')await record(assetId,'ready');
     else if(['missing','expired','deleted'].includes(result.state)){await record(assetId,result.state==='deleted'?'deleted':'expired');return json({error:'screenshot_expired'},410);}
     else{await record(assetId,'unknown');return json({error:'upload_unknown',image:publicAsset({...reservation,status:'unknown'})},202);}
    }
    const saved=await refresh(assetId);if(saved.status!=='ready'||saved.expiresAt<=Date.now()/1000)return json({error:'screenshot_expired'},410);
    return json({image:publicAsset(saved),visionAvailable:false},reservation.created?201:200);
   }
   const asset=await refresh(assetId!);
   if(action==='delete'){
    await record(assetId!,'deleted');if(!await current())throw new ChatStoreError('unauthenticated');
    try{const result=await deps.client().delete(args(asset));return result.state==='deleted'?json({state:'deleted'}):json({state:'cleanup_pending'},202);}catch{return json({state:'cleanup_pending'},202);}
   }
   if(asset.status==='deleted'||asset.status==='expired'||asset.expiresAt<=Date.now()/1000)return json({error:'screenshot_expired'},410);
   if(isStatus){
    const result=await deps.client().status(args(asset));
    if(result.state==='ready')await record(assetId!,'ready');
    else if(['missing','expired','deleted'].includes(result.state)){await record(assetId!,result.state==='deleted'?'deleted':'expired');return json({error:'screenshot_expired'},410);}
    const saved=await refresh(assetId!);return json({image:publicAsset(saved),visionAvailable:false},saved.status==='ready'?200:202);
   }
   if(asset.status!=='ready')return json({error:'upload_unknown'},409);
   const result=await deps.client().read(args(asset));
   if(!await current())throw new ChatStoreError('unauthenticated');
   if(['missing','expired','deleted'].includes(result.state)){await record(assetId!,result.state==='deleted'?'deleted':'expired');return json({error:'screenshot_expired'},410);}
   if(result.state!=='ready'||!('bytes' in result)||!(result.bytes instanceof Uint8Array))return json({error:'screenshot_unavailable'},410);
   const saved=await refresh(assetId!);if(saved.status!=='ready'||saved.expiresAt<=Date.now()/1000||saved.sha256!==asset.sha256)return json({error:'screenshot_expired'},410);
   return new Response(new Blob([result.bytes.slice().buffer as ArrayBuffer],{type:'image/png'}),{headers:{...headers,'content-type':'image/png','content-disposition':'inline; filename="diagnostic.png"'}});
  }catch(e){const status=e instanceof ChatStoreError?({not_found:404,conflict:409,invalid:400,unauthenticated:401,quota:429,unavailable:503})[e.code]:typeof e==='number'?e:503;return json({error:status===401?'unauthenticated':status===404?'not_found':status===409?'conflict':status===429?'quota':status===503?'unavailable':'invalid'},status);}
  finally{if(ownsUpload)uploading=false;}
 }
 async function run(request:Request,thread:string,action:'upload'|'read'|'delete',assetId?:string){
  const controller=new AbortController(),abort=()=>controller.abort();request.signal.addEventListener('abort',abort,{once:true});if(request.signal.aborted)abort();let timer:ReturnType<typeof setTimeout>|undefined;
  const bounded=new Request(request,{signal:controller.signal});
  try{return await Promise.race([handle(bounded,thread,action,assetId),new Promise<Response>(resolve=>{timer=setTimeout(()=>{controller.abort();resolve(json({error:'unavailable'},503));},deadlineMs);})]);}
  finally{clearTimeout(timer);request.signal.removeEventListener('abort',abort);}
 }
 return {uploadPOST:(request:Request,thread:string)=>run(request,thread,'upload'),readGET:(request:Request,thread:string,assetId:string)=>run(request,thread,'read',assetId),deleteDELETE:(request:Request,thread:string,assetId:string)=>run(request,thread,'delete',assetId)};
}
