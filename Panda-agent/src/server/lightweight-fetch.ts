// SDK timers end at headers. Keep this deadline through bounded body consumption.
export function boundedAgentFetch(transport:typeof fetch=fetch,timeoutMs=8000):typeof fetch {
  return async(input,init)=>{
    const controller=new AbortController();
    const abort=()=>controller.abort();
    const inherited=init?.signal??(input instanceof Request?input.signal:undefined);
    inherited?.addEventListener('abort',abort,{once:true});
    if(inherited?.aborted)controller.abort();
    const timer=setTimeout(abort,timeoutMs);
    let reader:ReadableStreamDefaultReader<Uint8Array>|undefined;
    try {
      const response=await transport(input,{...init,signal:controller.signal,redirect:'error',cache:'no-store'});
      if(!response.body)return response;
      reader=response.body.getReader(); const chunks:Uint8Array[]=[]; let size=0;
      while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>4*1024*1024)throw Error('Agent response too large');chunks.push(value);}
      const headers=new Headers(response.headers);headers.delete('content-encoding');headers.delete('content-length');
      return new Response(Buffer.concat(chunks),{status:response.status,statusText:response.statusText,headers});
    } finally {
      clearTimeout(timer);inherited?.removeEventListener('abort',abort);
      if(reader){await reader.cancel().catch(()=>{});reader.releaseLock();}
    }
  };
}
