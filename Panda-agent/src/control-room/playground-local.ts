import 'server-only';
import https from 'node:https';
import { parsePlaygroundIntent } from './playground-intent.ts';
import { PlaygroundGatewayError } from './playground-gateway.ts';
import { localPlaygroundConfigCurrent, type LocalPlaygroundConfig } from './playground-local-config.ts';

type Turn = { question:string; productSku:string; userToken:string; requestId:string; contextDigest:string; signal?:AbortSignal };
const unknown = () => new PlaygroundGatewayError('outcome_unknown');
const exact = (value: object, keys: string[]) => Object.keys(value).sort().join(',') === [...keys].sort().join(',');
export function createLocalPlaygroundClient(config: LocalPlaygroundConfig, options: {reauthorize:()=>Promise<boolean>; request?:typeof https.request; now?:()=>number}) {
  const request = options?.request ?? https.request, now = options?.now ?? Date.now;
  return async (turn: Turn): Promise<string> => {
    if (typeof options?.reauthorize !== 'function') throw new PlaygroundGatewayError('not_admitted');
    const intent = parsePlaygroundIntent({requestId:turn?.requestId, question:turn?.question, productSku:turn?.productSku});
    if (!intent || intent.requestId !== turn.requestId || !/^[a-z0-9._~-]{16,8192}$/i.test(turn.userToken ?? '') || !/^[a-f0-9]{64}$/.test(turn.contextDigest ?? '') || !/^[a-f0-9]{64}$/.test(config?.serviceToken ?? '') || typeof config?.caCertificate !== 'string' || !localPlaygroundConfigCurrent(config,now()) || turn.signal?.aborted) throw unknown();
    const body = JSON.stringify({version:3,mode:'playground',requestId:turn.requestId,question:turn.question,productSku:turn.productSku,contextDigest:turn.contextDigest});
    if (Buffer.byteLength(body) > 16384) throw unknown();
    return new Promise<string>((resolve,reject) => {
      let done = false, req: ReturnType<typeof https.request> | undefined;
      const finish = (error?: Error, value?: string) => { if (done) return; done = true; clearTimeout(timer); turn.signal?.removeEventListener('abort',abort); if (error) { req?.destroy(); reject(error); } else resolve(value!); };
      const abort = () => finish(unknown());
      const timer = setTimeout(abort, Math.min(135000, Math.max(1, Date.parse(config.expiresAt) - now())));
      turn.signal?.addEventListener('abort',abort,{once:true});
      try {
        if (turn.signal?.aborted || !localPlaygroundConfigCurrent(config,now())) { finish(unknown()); return; }
        req = request({protocol:'https:',hostname:'127.0.0.1',port:49443,path:'/v1/turns',method:'POST',servername:'panda-gateway.internal',ca:config.caCertificate,rejectUnauthorized:true,headers:{'Content-Type':'application/json',Accept:'application/json',Authorization:`Bearer ${config.serviceToken}`,'X-Panda-User-Token':turn.userToken,'X-Panda-Local-Validation':'1'}}, response => {
          if (response.statusCode !== 200 || !/^application\/json(?:\s*;|$)/i.test(String(response.headers['content-type'] ?? ''))) { response.resume(); finish(unknown()); return; }
          const parts: Buffer[] = []; let size = 0;
          response.on('data', (chunk: Buffer | string) => { const bytes=Buffer.from(chunk); size+=bytes.length; if(size>32768) { response.destroy(); finish(unknown()); } else parts.push(bytes); });
          response.on('error', () => finish(unknown()));
          response.on('aborted', () => finish(unknown()));
          response.on('close', () => { if (!response.complete) finish(unknown()); });
          response.on('end', () => {
            if (done || turn.signal?.aborted || !localPlaygroundConfigCurrent(config,now())) { finish(unknown()); return; }
            try {
              const value: unknown = JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(parts)));
              if (!value || typeof value !== 'object' || Array.isArray(value)) throw unknown();
              const result=value as Record<string,unknown>;
              if (exact(result,['version','requestId','status']) && result.version===3 && result.requestId===turn.requestId && (result.status==='quota' || result.status==='not_admitted')) { finish(new PlaygroundGatewayError(result.status)); return; }
              if (!exact(result,['version','requestId','status','contextDigest','rawModel']) || result.version!==3 || result.requestId!==turn.requestId || result.status!=='complete' || result.contextDigest!==turn.contextDigest || typeof result.rawModel!=='string' || !result.rawModel.isWellFormed() || result.rawModel.length>10000) throw unknown();
              finish(undefined,result.rawModel);
            } catch { finish(unknown()); }
          });
        });
        req.on('error',()=>finish(unknown()));
        const currentRequest = req;
        void (async () => {
          let allowed = false;
          try { allowed = await options.reauthorize() === true; } catch { /* No body was sent. */ }
          if (done) return;
          if (!allowed) { finish(new PlaygroundGatewayError('not_admitted')); return; }
          if (turn.signal?.aborted || !localPlaygroundConfigCurrent(config,now())) { finish(unknown()); return; }
          try { currentRequest.end(body); } catch { finish(unknown()); }
        })();
      } catch { finish(unknown()); }
    });
  };
}




