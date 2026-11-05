import 'server-only';
import { auth, clerkClient } from '@clerk/nextjs/server';
import { createClient } from '@insforge/sdk';
import { boundedAgentFetch } from './lightweight-fetch';

// Explicit Agent configuration prevents a storefront migration from silently moving evidence.
export async function authenticateLightweight() {
  const session = await auth();
  if (!session.isAuthenticated || session.sessionStatus !== 'active' || !session.userId || !session.sessionId) return null;
  const baseUrl = process.env.PANDA_AGENT_INSFORGE_BASE_URL;
  const template = process.env.PANDA_AGENT_CLERK_JWT_TEMPLATE;
  if (!baseUrl || !template || !/^[A-Za-z0-9_-]{1,64}$/.test(template)) throw Error('Agent connection unavailable');
  const url = new URL(baseUrl);
  if (url.protocol !== 'https:' || !/^[a-z0-9]+\.[a-z0-9-]+\.insforge\.app$/.test(url.hostname) || url.pathname !== '/' || url.port || url.username || url.password || url.search || url.hash) throw Error('Agent connection unavailable');
  const accessToken = await session.getToken({ template });
  if (!accessToken) throw Error('Agent connection unavailable');
  const client = createClient({ baseUrl, accessToken, timeout:8000, retryCount:0, debug:false, fetch:boundedAgentFetch() });
  const { data, error } = await client.database.rpc('requesting_user_id');
  if (error || data !== session.userId) throw Error('Agent identity unavailable');
  return { subject: session.userId, sessionId: session.sessionId, client };
}

export async function currentLightweightSession(subject: string, sessionId: string) {
  let timer:ReturnType<typeof setTimeout>|undefined;
  try {
    const current = await Promise.race([(async()=> (await clerkClient()).sessions.getSession(sessionId))(),new Promise<null>(resolve=>{timer=setTimeout(()=>resolve(null),3000);})]);
    if(!current)return false;
    return current.status === 'active' && current.userId === subject;
  } catch { return false; }
  finally {clearTimeout(timer);}
}
