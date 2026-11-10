// Private loopback channels. Frame counters correlate replies, never authorize work.
import {createServer} from 'node:http';
import {timingSafeEqual} from 'node:crypto';
import {createHash} from 'node:crypto';
import fs from 'node:fs';
const token=process.env.PANDA_RESEARCH_CHANNEL_TOKEN,generation=process.env.PANDA_RESEARCH_GENERATION;
if(!/^[a-f0-9]{64}$/.test(token??'')||!/^[a-f0-9]{64}$/.test(generation??''))throw Error('research_channel_unavailable');
const secret=Buffer.from('Bearer '+token),active=new Map();let next=0,buffer=Buffer.alloc(0),closed=false;
const valid64=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const stop=()=>{if(closed)return;closed=true;for(const item of active.values()){clearTimeout(item.timer);item.res.destroy();}active.clear();for(const server of servers){server.closeAllConnections();server.close();}process.exitCode=1;process.stdin.destroy();};
function serverFor(channel,port,path,max){
 const server=createServer(async(req,res)=>{
  try{
   const supplied=Buffer.from(req.headers.authorization??'');
   if(supplied.length!==secret.length||!timingSafeEqual(supplied,secret)||req.method!=='POST'||req.url!==path||req.headers.origin!==undefined||!/^application\/json(?:\s*;|$)/i.test(req.headers['content-type']??'')){res.writeHead(403).end();return;}
   if(closed||active.size>=8){res.writeHead(503).end();return;}
   const chunks=[];let size=0;for await(const part of req){size+=part.length;if(size>max)throw Error();chunks.push(part);}
   const body=Buffer.concat(chunks);new TextDecoder('utf-8',{fatal:true}).decode(body);
   let headers={'content-type':'application/json'};
   if(channel==='provider'){
    const session=req.headers['x-panda-native-session'],kind=req.headers['x-panda-native-kind'],gen=req.headers['x-panda-native-generation'];
    if(typeof session!=='string'||!/^ses_[a-f0-9]{12}[A-Za-z0-9]{14}$/.test(session)||!['primary','compaction','title','generate'].includes(kind)||gen!==generation){res.writeHead(403).end();return;}
    headers={...headers,'x-panda-native-session':session,'x-panda-native-kind':kind,'x-panda-native-generation':gen};
   }else{
    const value=JSON.parse(body.toString('utf8'));if(!value||!valid64(value.generation)||value.generation!==generation){res.writeHead(403).end();return;}
   }
   const id=++next,timer=setTimeout(()=>{active.delete(id);if(!res.destroyed)res.writeHead(504).end();},120000);
   active.set(id,{res,timer,channel});
   const line=JSON.stringify({version:1,type:'request',id,channel,method:'POST',path,headers,body:body.toString('base64')})+'\n';
   if(!process.stdout.write(line))await new Promise((done,no)=>{process.stdout.once('drain',done);process.stdout.once('error',no);});
  }catch{if(!res.headersSent)res.writeHead(400);res.end();}
 });server.requestTimeout=120000;server.headersTimeout=5000;
 return {server,port};
}
const definitions=[serverFor('provider',4175,'/v1/chat/completions',131072),serverFor('broker',4174,'/echo',16384)],servers=definitions.map(v=>v.server);
process.stdin.on('data',part=>{
 try{
  buffer=Buffer.concat([buffer,part]);if(buffer.length>2850000)throw Error();let at;
  while((at=buffer.indexOf(10))!==-1){
   const raw=buffer.subarray(0,at);buffer=buffer.subarray(at+1);const value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(raw));
   if(!value||Object.keys(value).sort().join(',')!=='body,contentType,id,status,type,version'||value.version!==1||value.type!=='response'||!active.has(value.id)||!Number.isInteger(value.status)||value.status<200||value.status>599||!['application/json','text/event-stream'].includes(value.contentType)||typeof value.body!=='string'||!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value.body))throw Error();
   const item=active.get(value.id),body=Buffer.from(value.body,'base64');if(body.toString('base64')!==value.body||body.length>(item.channel==='provider'?2097152:32768))throw Error();
   clearTimeout(item.timer);active.delete(value.id);if(!item.res.destroyed)item.res.writeHead(value.status,{'content-type':value.contentType,'cache-control':'no-store'}).end(body);
  }
 }catch{stop();}
});
process.stdin.on('end',stop);process.stdin.on('error',stop);process.stdout.on('error',stop);
try{
 await Promise.all(definitions.map(({server,port})=>new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve);})));
 // Standalone channel tests have no native state directory and cannot start native.
 if(fs.existsSync('/runtime/state')){
  const st=fs.lstatSync('/runtime/state');if(!st.isDirectory()||st.isSymbolicLink()||st.uid!==10001||(st.mode&0o777)!==0o700)throw Error();
  const file='/runtime/state/channel-'+generation+'.tmp',fd=fs.openSync(file,'wx',0o600);
  try{fs.writeFileSync(fd,JSON.stringify({generation,tokenHash:createHash('sha256').update(token).digest('hex'),pid:process.pid}));fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
  fs.renameSync(file,'/runtime/state/channel-ready.json');
 }
 process.stdout.write('{"version":1,"type":"ready"}\n');
}catch{stop();}
