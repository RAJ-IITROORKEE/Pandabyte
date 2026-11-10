import 'server-only';
import { auth, clerkClient } from '@clerk/nextjs/server';
import { createClient } from '@insforge/sdk';
import { boundedAgentFetch } from './lightweight-fetch';
import { createSnapshotTransport } from './snapshot-transport';

// Explicit Agent configuration prevents a storefront migration from silently moving evidence.
export async function openLightweightConnection(options?: { parallelSession?: boolean; sessionVerification?: 'live' | 'request'; snapshotTransport?: boolean }) {
  const session = await auth();
  if (!session.isAuthenticated || session.sessionStatus !== 'active' || !session.userId || !session.sessionId) return null;
  const baseUrl = process.env.PANDA_AGENT_INSFORGE_BASE_URL;
  const template = process.env.PANDA_AGENT_CLERK_JWT_TEMPLATE;
  if (!baseUrl || !template || !/^[A-Za-z0-9_-]{1,64}$/.test(template)) throw Error('Agent connection unavailable');
  const url = new URL(baseUrl);
  if (url.protocol !== 'https:' || !/^[a-z0-9]+\.[a-z0-9-]+\.insforge\.app$/.test(url.hostname) || url.pathname !== '/' || url.port || url.username || url.password || url.search || url.hash) throw Error('Agent connection unavailable');
  const sessionCurrent = options?.sessionVerification === 'request' ? Promise.resolve(true) : currentLightweightSession(session.userId, session.sessionId);
  if (!options?.parallelSession && !await sessionCurrent) return null;
  let accessToken: string | null;
  try { accessToken = await session.getToken({ template }); }
  catch (error) { if (!await sessionCurrent) return null; throw error; }
  if (!accessToken) { if (!await sessionCurrent) return null; throw Error('Agent connection unavailable'); }
  const transport = boundedAgentFetch();
  const client = createClient({ baseUrl, accessToken, timeout:8000, retryCount:0, debug:false,
    fetch: options?.snapshotTransport ? createSnapshotTransport(baseUrl, transport) : transport });
  return { subject: session.userId, sessionId: session.sessionId, client, sessionCurrent };
}

export async function authenticateLightweight(options?: { admin?: boolean }) {
  const connection = await openLightweightConnection({ parallelSession: options?.admin === true });
  if (!connection || !await connection.sessionCurrent) return null;
  const { subject, sessionId, client } = connection;
  const { data, error } = await client.database.rpc(options?.admin ? 'panda_agent_control_room_admission' : 'requesting_user_id');
  if (options?.admin) {
    const admission = data && typeof data === 'object' && !Array.isArray(data) ? data as Record<string, unknown> : null;
    if (error || !admission || admission.subject !== subject || typeof admission.admin !== 'boolean') throw Error('Agent identity unavailable');
    return { subject, sessionId, client, admin: admission.admin };
  }
  if (error || data !== subject) throw Error('Agent identity unavailable');
  return { subject, sessionId, client };
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
