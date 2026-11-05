import {createHash} from 'node:crypto';
import {lookup} from 'node:dns/promises';
import {request} from 'node:https';
import {BlockList,isIP,type LookupFunction} from 'node:net';
import {Parser} from 'htmlparser2';
import {vendorCatalog} from './vendor-catalog.ts';
type Address={address:string;family:number};
type ResponseData={status:number;headers:Record<string,string|undefined>;body:Uint8Array};
export type VendorTransport={resolve:(host:string,signal:AbortSignal)=>Promise<Address[]>;request:(url:string,address:Address,signal:AbortSignal)=>Promise<ResponseData>};
const fail=()=>new Error('Vendor document unavailable');
const blocked=new BlockList();
for(const [a,n] of [['0.0.0.0',8],['10.0.0.0',8],['100.64.0.0',10],['127.0.0.0',8],['169.254.0.0',16],['172.16.0.0',12],['192.0.0.0',24],['192.0.2.0',24],['192.31.196.0',24],['192.52.193.0',24],['192.88.99.0',24],['192.168.0.0',16],['192.175.48.0',24],['198.18.0.0',15],['198.51.100.0',24],['203.0.113.0',24],['224.0.0.0',4],['240.0.0.0',4]] as const)blocked.addSubnet(a,n,'ipv4');
for(const [a,n] of [['2001::',23],['2001:db8::',32],['2002::',16],['3fff::',20]] as const)blocked.addSubnet(a,n,'ipv6');
const global6=new BlockList();global6.addSubnet('2000::',3,'ipv6');
function publicAddress(a:Address):boolean{return !!a&&typeof a.address==='string'&&((a.family===4&&isIP(a.address)===4&&!blocked.check(a.address,'ipv4'))||(a.family===6&&isIP(a.address)===6&&global6.check(a.address,'ipv6')&&!blocked.check(a.address,'ipv6')));}
export function pinnedVendorLookup(address:Address):LookupFunction{return (_host,options,callback)=>{if(options.all)callback(null,[address]);else callback(null,address.address,address.family);};}
const defaultTransport:VendorTransport={
 resolve:host=>lookup(host,{all:true,verbatim:true}),
 request:(url,address,signal)=>new Promise((resolve,reject)=>{
  const req=request(url,{method:'GET',agent:false,servername:'docs.espressif.com',headers:{accept:'text/html','accept-encoding':'identity'},signal,lookup:pinnedVendorLookup(address)},res=>{
   let size=0;const chunks:Buffer[]=[];
   res.on('data',(chunk:Buffer)=>{size+=chunk.length;if(size>1048576){req.destroy(fail());return;}chunks.push(chunk)});
   res.on('error',reject);res.on('end',()=>resolve({status:res.statusCode??0,headers:{location:res.headers.location,'content-type':res.headers['content-type'],'content-encoding':res.headers['content-encoding']},body:Buffer.concat(chunks)}));
  });req.on('error',reject);req.end();
 })
};
function extract(html:string):string[]{
 let heading='',captureHeading='',block='',blockTag='',normal=false,header=false,headerSeen=false,skip=0,depth=0,main=0;const fragments:string[]=[];
 const parser=new Parser({onopentag(name,attrs){depth++;if(skip){return;}if(['script','style','nav','footer','header','template','svg','noscript'].includes(name)||attrs.hidden!==undefined||attrs['aria-hidden']==='true'){skip=depth;return;}if(!main&&(name==='main'||attrs.role==='main'))main=depth;if(!main)return;if(name==='h2'||name==='h3'){captureHeading=name;heading='';}else if(header&&!blockTag&&(name==='p'||name==='pre')){blockTag=name;block='';}},ontext(text){if(skip||!main)return;if(captureHeading)heading+=text;if(blockTag)block+=text;},onclosetag(name){if(skip){if(skip===depth)skip=0;depth--;return;}if(main&&captureHeading===name){const h=heading.replace(/\s+/g,' ').replace(/[¶\uf0c1]/g,'').trim();if(name==='h2'){normal=h==='API Reference - Normal GPIO';header=false;}else {header=normal&&!headerSeen&&h==='Header File';if(header)headerSeen=true;}captureHeading='';}if(main&&name===blockTag){const value=block.replace(/\s+/g,' ').trim();if(value)fragments.push(value);blockTag='';}if(main===depth)main=0;depth--; }},{decodeEntities:true});
 parser.end(html);if(!fragments.length||fragments.length>8||fragments.some(x=>x.length>3000)||fragments.reduce((n,x)=>n+x.length,0)>20000||new Set(fragments).size!==fragments.length)throw fail();return fragments;
}
export async function fetchVendorDocument(catalogId:string,options:{signal?:AbortSignal;transport?:VendorTransport}={}){
 if(catalogId!==vendorCatalog.id||options.signal?.aborted)throw fail();
 const controller=new AbortController();const abort=()=>controller.abort();options.signal?.addEventListener('abort',abort,{once:true});const timer=setTimeout(abort,10000);const transport=options.transport??defaultTransport;
 const bounded=<T>(p:Promise<T>):Promise<T>=>new Promise((resolve,reject)=>{if(controller.signal.aborted){reject(fail());return;}const cancel=()=>reject(fail());controller.signal.addEventListener('abort',cancel,{once:true});p.then(v=>{controller.signal.removeEventListener('abort',cancel);resolve(v)},e=>{controller.signal.removeEventListener('abort',cancel);reject(e)});});
 try {let url:string=vendorCatalog.sourceUrl;for(let redirects=0;redirects<=2;redirects++){
  if(url!==vendorCatalog.sourceUrl)throw fail();const addresses=await bounded(transport.resolve('docs.espressif.com',controller.signal));if(!Array.isArray(addresses)||addresses.length===0||addresses.length>32||!addresses.every(publicAddress))throw fail();
  const response=await bounded(transport.request(url,addresses[0],controller.signal));if(!response||!(response.body instanceof Uint8Array)||response.body.byteLength>1048576)throw fail();
  if([301,302,303,307,308].includes(response.status)){if(redirects===2||!response.headers.location)throw fail();url=new URL(response.headers.location,url).href;continue;}
  if(response.status!==200||!/^text\/html(?:;|$)/i.test(response.headers['content-type']??'')||!['','identity'].includes((response.headers['content-encoding']??'').toLowerCase()))throw fail();
  const html=new TextDecoder('utf-8',{fatal:true}).decode(response.body);const fragments=extract(html);return {catalogId:vendorCatalog.id,title:vendorCatalog.title,sourceUrl:vendorCatalog.sourceUrl,fetchedAt:new Date().toISOString(),contentHash:createHash('sha256').update(response.body).digest('hex'),fragments};
 }throw fail();}finally{clearTimeout(timer);options.signal?.removeEventListener('abort',abort);controller.abort();}
}
