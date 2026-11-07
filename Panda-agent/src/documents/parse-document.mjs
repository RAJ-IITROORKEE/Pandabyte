import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import path from 'node:path';
import {Parser} from 'htmlparser2';

const MAX_BYTES=3*1024*1024, MAX_CHARACTERS=20000;
const hash=value=>createHash('sha256').update(value).digest('hex');
const config={version:1,maxBytes:MAX_BYTES,maxPages:100,maxCharacters:MAX_CHARACTERS,pdfJavaScript:false,network:false,ocr:false};
const configSha256=hash(JSON.stringify(config));
const textMime=new Set(['text/plain','text/markdown','application/json']);

function htmlText(text){
 let ignored=0,output='',truncated=false;
 const hidden=new Set(['script','style','noscript','template']);
 const parser=new Parser({onopentag(name){if(hidden.has(name))ignored++;},onclosetag(name){if(hidden.has(name))ignored--;else if(!ignored&&output.length<MAX_CHARACTERS)output+='\n';},ontext(value){if(ignored)return;const room=MAX_CHARACTERS-output.length;output+=value.slice(0,Math.max(0,room));if(value.length>room)truncated=true;}},{decodeEntities:true});
 parser.write(text);parser.end();return {text:output,truncated};
}

export function decodePdfWorkerOutput(parts){return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(parts)));}

async function pdfText(data){
 return new Promise((resolve,reject)=>{
  const env={};for(const key of ['PATH','SystemRoot','WINDIR','TEMP','TMP'])if(process.env[key])env[key]=process.env[key];
  const child=spawn(process.execPath,['--max-old-space-size=192',path.join(process.cwd(),'Panda-agent','src','documents','pdf-text-worker.mjs')],{env,stdio:['pipe','pipe','pipe'],windowsHide:true});
  const output=[];let size=0,settled=false;
  const finish=(error,value)=>{if(settled)return;settled=true;clearTimeout(timer);if(error){child.kill();reject(error);}else resolve(value);};
  const timer=setTimeout(()=>finish(Error('parse_deadline')),15000);
  child.on('error',()=>finish(Error('parse_failed')));
  child.stdin.on('error',()=>{});
  child.stdout.on('data',chunk=>{size+=chunk.length;if(size>262144)finish(Error('parse_limit'));else output.push(Buffer.from(chunk));});
  child.stderr.on('data',()=>{});
  child.on('close',code=>{try{if(code!==0)throw Error('parse_failed');const value=decodePdfWorkerOutput(output);if(!value||!Array.isArray(value.segments)||value.segments.length>100||!Number.isSafeInteger(value.pagesSeen)||value.pagesSeen<0||typeof value.truncated!=='boolean'||value.segments.some(s=>!s||!Number.isSafeInteger(s.page)||s.page<1||typeof s.text!=='string')||value.segments.reduce((n,s)=>n+s.text.length,0)>MAX_CHARACTERS)throw Error('parse_failed');finish(null,value);}catch{finish(Error('parse_failed'));}});
  child.stdin.end(data);
 });
}

// Internal byte parser only. The transport must establish ownership and the
// expected source hash before calling; this module accepts no URL or file path.
export async function parseDocumentBytes({data,mimeType,expectedSourceSha256}){
 if(!(data instanceof Uint8Array)||!data.byteLength||data.byteLength>MAX_BYTES||typeof mimeType!=='string'||!/^[a-f0-9]{64}$/.test(expectedSourceSha256??''))throw Error('Invalid document input');
 data=Uint8Array.from(data);
 if(hash(data)!==expectedSourceSha256)throw Error('Invalid document input');
 const sourceSha256=hash(data),base={sourceSha256,parser:{name:mimeType==='application/pdf'?'pdfjs-dist':'pandabyte-text',version:mimeType==='application/pdf'?'6.4.299':'1',configSha256},trust:'untrusted_content',modality:'extracted_text'};
 const empty=(status,warning)=>({...base,status,segments:[],totals:{pagesSeen:0,characters:0},truncated:false,warnings:[warning]});
 if(!textMime.has(mimeType)&&mimeType!=='text/html'&&mimeType!=='application/pdf')return empty('unsupported','unsupported_type');
 try{
  let rawSegments,pagesSeen=0,truncated=false;
  if(mimeType==='application/pdf'){
   if(Buffer.from(data.subarray(0,5)).toString('ascii')!=='%PDF-')return empty('failed','invalid_document');
   const parsed=await pdfText(data);rawSegments=parsed.segments;pagesSeen=parsed.pagesSeen;truncated=parsed.truncated;
  }else{
   const text=new TextDecoder('utf-8',{fatal:true}).decode(data);
   if(mimeType==='application/json')JSON.parse(text);
   const parsed=mimeType==='text/html'?htmlText(text):{text:text.slice(0,MAX_CHARACTERS),truncated:text.length>MAX_CHARACTERS};
   rawSegments=[{text:parsed.text}];truncated=parsed.truncated;
  }
  const segments=rawSegments.map(s=>({...('page'in s?{page:s.page}:{}),sectionPath:'page'in s?['Page',String(s.page)]:['Document'],text:s.text.trim(),textSha256:hash(s.text.trim())})).filter(s=>s.text);
  if(!segments.length)return {...empty('unsupported','no_text'),totals:{pagesSeen,characters:0},truncated};
  return {...base,status:truncated?'partial':'complete',segments,totals:{pagesSeen,characters:segments.reduce((n,s)=>n+s.text.length,0)},truncated,warnings:truncated?['extraction_truncated']:[]};
 }catch(error){return empty('failed',error?.message==='parse_deadline'?'parse_deadline':'invalid_document');}
}
