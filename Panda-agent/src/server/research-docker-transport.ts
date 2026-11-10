import { spawn } from 'node:child_process';
import { researchJSON, researchObject } from '../opencode/research-values.ts';

export type ResearchWireResponse = { status:number; contentType:string; body:string };
type Wire = {sessionID:string;generation:string;directory:string;ownership:{binding:string;owner:string;profileHash:string};method:string;path:string;body?:string};
type ChannelRequest = {method:string;path:string;headers:Record<string,string>;body:Buffer};
type ChannelHandler = (request:ChannelRequest)=>Promise<{status:number;contentType:string;body:Buffer|string}>;
const hex=(v:unknown):v is string=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const nativeID=(v:unknown,prefix:string)=>typeof v==='string'&&new RegExp('^'+prefix+'[a-f0-9]{12}[A-Za-z0-9]{14}$').test(v);
const unavailable=()=>Error('research_transport_unavailable');
const decode=(v:Buffer)=>new TextDecoder('utf-8',{fatal:true}).decode(v);
const b64=(v:unknown,max:number):Buffer=>{
 if(typeof v!=='string'||v.length>Math.ceil(max/3)*4||!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(v))throw unavailable();
 const result=Buffer.from(v,'base64');if(result.length>max||result.toString('base64')!==v)throw unavailable();return result;
};
function response(value:unknown):ResearchWireResponse{
 if(!researchObject(value)||Object.keys(value).sort().join(',')!=='body,contentType,status'||!Number.isInteger(value.status)||(value.status as number)<100||(value.status as number)>599
  ||typeof value.contentType!=='string'||!['application/json','text/event-stream'].includes(value.contentType)||typeof value.body!=='string'||!value.body.isWellFormed()||Buffer.byteLength(value.body)>1048576)throw unavailable();
 return {status:value.status as number,contentType:value.contentType,body:value.body};
}
export function createResearchDockerTransport(config:{containerId:string;sessionID:string;directory:string;generation:string;ownership:{binding:string;owner:string;profileHash:string};run?:(request:Wire)=>Promise<ResearchWireResponse>}){
 if(!config||!hex(config.containerId)||!nativeID(config.sessionID,'ses_')||config.directory!=='/runtime/workspace'||!hex(config.generation)||!researchObject(config.ownership)
  ||Object.keys(config.ownership).sort().join(',')!=='binding,owner,profileHash'||!Object.values(config.ownership).every(hex))throw unavailable();
 const {containerId,sessionID,directory,generation}=config,ownership=Object.freeze({...config.ownership}),base='/api/session/'+sessionID;
 let closed=false,channel:ReturnType<typeof spawn>|undefined,ready:Promise<void>|undefined,provider:ChannelHandler|undefined,broker:ChannelHandler|undefined;
 const pendingChildren=new Set<ReturnType<typeof spawn>>();
 const createBody={id:sessionID,title:'panda-research-'+ownership.binding,agent:'panda-research',model:{providerID:'panda-research-fixture',id:'panda-fixture'},location:{directory},metadata:{pandaResearch:ownership},permissions:[{action:'*',resource:'*',effect:'deny'},{action:'panda_research_echo',resource:'*',effect:'allow'}]};
 function valid(method:string,path:string,body:unknown){
  if(closed||typeof path!=='string'||!['GET','POST'].includes(method))return false;
  if(method==='GET')return body===undefined&&(['/api/info','/api/config','/api/model','/api/session/active',base,base+'/message?limit=100&order=asc'].includes(path)
   ||new RegExp('^'+base+'/message\\?limit=100&cursor=[A-Za-z0-9_-]{1,2048}(?:%3D){0,2}$').test(path));
  if(!researchJSON(body,98304)||!researchObject(body))return false;
  if(path===base+'/interrupt?resume=false')return Object.keys(body).length===0;
  if(path==='/api/session')return JSON.stringify(body)===JSON.stringify(createBody);
  return path===base+'/prompt'&&Object.keys(body).sort().join(',')==='id,text'&&nativeID(body.id,'msg_')&&typeof body.text==='string'&&body.text.trim().length>0&&body.text.isWellFormed()&&Buffer.byteLength(body.text)<=96000;
 }
 async function run(q:Wire):Promise<ResearchWireResponse>{
  if(config.run)return response(await config.run(structuredClone(q)));
  const child=spawn('docker',['exec','-i',containerId,'node','/research-code/research-http-proxy.mjs'],{stdio:['pipe','pipe','ignore'],windowsHide:true});pendingChildren.add(child);
  return new Promise((resolve,reject)=>{
   const chunks:Buffer[]=[];let size=0,done=false;
   const finish=(error?:Error)=>{if(done)return;done=true;clearTimeout(timer);pendingChildren.delete(child);child.kill();if(error)reject(error);else try{const value=JSON.parse(decode(Buffer.concat(chunks)));resolve(response({...value,body:decode(b64(value.body,1048576))}));}catch{reject(unavailable());}};
   const timer=setTimeout(()=>finish(unavailable()),10000);
   child.on('error',()=>finish(unavailable()));child.stdin!.on('error',()=>finish(unavailable()));
   child.stdout!.on('data',(part:Buffer)=>{size+=part.length;if(size>1450000){finish(unavailable());return;}chunks.push(part);});
   child.on('close',code=>finish(code===0?undefined:unavailable()));child.stdin!.end(JSON.stringify(q));
  });
 }
 function startChannels(){
  if(ready)return ready;
  ready=new Promise<void>((resolve,reject)=>{
   channel=spawn('docker',['exec','-i',containerId,'node','/research-code/research-provider-channel.mjs'],{stdio:['pipe','pipe','ignore'],windowsHide:true});
   let buffer=Buffer.alloc(0),started=false,last=0,active=0,dead=false;
   const fail=()=>{if(dead)return;dead=true;clearTimeout(timer);if(!started)reject(unavailable());channel?.stdin?.destroy();channel?.kill();};
   const timer=setTimeout(fail,10000);
   channel.on('error',fail);channel.on('close',fail);channel.stdin!.on('error',fail);
   const send=async(frame:unknown)=>{if(dead||closed)throw unavailable();const text=JSON.stringify(frame)+'\n';if(!channel!.stdin!.write(text))await new Promise<void>((done,no)=>{channel!.stdin!.once('drain',done);channel!.stdin!.once('error',no);});};
   channel.stdout!.on('data',(part:Buffer)=>{
    buffer=Buffer.concat([buffer,part]);if(buffer.length>200000){fail();return;}let at:number;
    while((at=buffer.indexOf(10))!==-1){const line=buffer.subarray(0,at);buffer=buffer.subarray(at+1);
     try{
      const value:unknown=JSON.parse(decode(line));if(!researchObject(value))throw unavailable();
      if(!started){if(JSON.stringify(value)!=='{"version":1,"type":"ready"}')throw unavailable();started=true;clearTimeout(timer);resolve();continue;}
      if(Object.keys(value).sort().join(',')!=='body,channel,headers,id,method,path,type,version'||value.version!==1||value.type!=='request'||value.id!==last+1||!['provider','broker'].includes(value.channel as string)
       ||value.method!=='POST'||value.path!==(value.channel==='provider'?'/v1/chat/completions':'/echo')||!researchObject(value.headers)||!Object.values(value.headers).every(v=>typeof v==='string'&&v.length<=256)||++active>8)throw unavailable();
      last=value.id as number;const id=last,handler=value.channel==='provider'?provider:broker,body=b64(value.body,value.channel==='provider'?131072:16384);
      const request={method:'POST',path:value.path as string,headers:structuredClone(value.headers) as Record<string,string>,body};
      void (async()=>{try{
       const result=handler?await handler(request):{status:503,contentType:'application/json',body:'{}'};
       const payload=Buffer.isBuffer(result.body)?result.body:Buffer.from(result.body);if(!Number.isInteger(result.status)||result.status<100||result.status>599||!['application/json','text/event-stream'].includes(result.contentType)||payload.length>(value.channel==='provider'?2097152:32768))throw unavailable();
       await send({version:1,type:'response',id,status:result.status,contentType:result.contentType,body:payload.toString('base64')});
      }catch{fail();}finally{active--;}})();
     }catch{fail();return;}
    }
   });
  });
  return ready;
 }
 return Object.freeze({
  sessionID,generation,createBody:structuredClone(createBody),
  async request(method:string,path:string,body?:unknown){if(!valid(method,path,body))throw unavailable();return run({sessionID,generation,directory,ownership,method,path,...(body===undefined?{}:{body:JSON.stringify(body)})});},
  async provider(handler:ChannelHandler){if(closed||provider||typeof handler!=='function')throw unavailable();provider=handler;await startChannels();},
  async broker(handler:ChannelHandler){if(closed||broker||typeof handler!=='function')throw unavailable();broker=handler;await startChannels();},
  async close(){closed=true;channel?.stdin?.end();channel?.kill();for(const child of pendingChildren)child.kill();pendingChildren.clear();},
 });
}
