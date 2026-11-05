export async function lightweightReady() {
  if(process.env.PANDA_AGENT_LIGHTWEIGHT_ENABLED!=='true')return false;
  try {
    const origin=new URL(process.env.PANDA_AGENT_LIGHTWEIGHT_URL??'');
    if(origin.username || origin.password || origin.search || origin.hash || origin.pathname!=='/' || (origin.protocol!=='https:' && !(origin.protocol==='http:' && ['localhost','127.0.0.1','[::1]'].includes(origin.hostname))))return false;
    const response=await fetch(new URL('/ready',origin),{signal:AbortSignal.timeout(3000),cache:'no-store',redirect:'error'});
    const available=response.ok;
    await response.body?.cancel();
    return available;
  }catch{return false;}
}
