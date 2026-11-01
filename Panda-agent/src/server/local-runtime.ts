import "server-only";
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {createOpenCodeEvidenceSelector, createOpenCodeConversation, createOpenCodeManufacturerSelector, createOpenCodeWebSelector} from './opencode-selector';
import type {ActivityReporter, ChatPresentation} from './chat-contracts';

type Runtime = {baseUrl: string; password: string};
/** Local-only operator tunnel. An uploaded source build must never activate this path. */
export async function localRuntime(): Promise<Runtime | null> {
  if(process.env.NODE_ENV === 'production' || process.env.PANDA_AGENT_LOCAL_WORKFLOW_ENABLED !== 'true') return null;
  try {
    const filename=path.resolve(process.cwd(),'Panda-agent/infra/local-workflow/artifacts/runtime.json');
    const raw=await readFile(filename,'utf8');
    if(Buffer.byteLength(raw)>4096) return null;
    const value=JSON.parse(raw);
    if(value?.baseUrl!=='http://127.0.0.1:4597'||typeof value.password!=='string'||!/^[0-9a-f]{64}$/.test(value.password)||value.authority!=='i-05bcf2573a0b77f7a')return null;
    return {baseUrl:value.baseUrl,password:value.password};
  } catch {return null;}
}

export async function localRuntimeSelector(onActivity?: ActivityReporter) {
  const config=await localRuntime();
  return config ? createOpenCodeEvidenceSelector({...config,onActivity}) : null;
}

export async function localRuntimeConversation(onActivity?: ActivityReporter, presentation?: ChatPresentation) {
  const config=await localRuntime();
  return config ? createOpenCodeConversation({...config,onActivity,...(presentation ? {onText:presentation.onText,onTextReset:presentation.onTextReset} : {})}) : null;
}

export async function localRuntimeManufacturerSelector(onActivity?: ActivityReporter) {
  const config=await localRuntime();
  return config ? createOpenCodeManufacturerSelector({...config,onActivity}) : null;
}

export async function localRuntimeWebSelector(onActivity?: ActivityReporter) {
  const config=await localRuntime();
  return config ? createOpenCodeWebSelector({...config,onActivity}) : null;
}

export async function localRuntimeStatus(): Promise<{available:boolean;mode:'aws_opencode_local';retrievalMethod:'lexical'}> {
  let available=false;
  const config=await localRuntime();
  if(config) {
    try {
      const response=await fetch(config.baseUrl+'/api/info',{headers:{Authorization:`Basic ${Buffer.from('opencode:'+config.password).toString('base64')}`},redirect:'error',cache:'no-store',signal:AbortSignal.timeout(3000)});
      if(response.ok&&response.body&&response.headers.get('content-type')?.includes('application/json')) {
        const reader=response.body.getReader();const parts:Uint8Array[]=[];let size=0;
        try {
          while(true){const part=await reader.read();if(part.done)break;size+=part.value.length;if(size>16384){await reader.cancel();throw Error();}parts.push(part.value);}
        }finally{reader.releaseLock();}
        available=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(parts)))?.version==='2.2.2';
      } else await response.body?.cancel();
    }catch{ /* Unavailable is a real state; no inference or retry is attempted. */ }
  }
  return {available,mode:'aws_opencode_local',retrievalMethod:'lexical'};
}
