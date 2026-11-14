import { authenticateLightweight } from '@/Panda-agent/src/server/lightweight-connection';
import { parseDailyUsage } from '@/Panda-agent/src/agent-loop/daily-limits';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET() {
  const headers = { 'Cache-Control':'private, no-store', Vary:'Cookie', 'X-Content-Type-Options':'nosniff' };
  const actor = await authenticateLightweight();
  if (!actor) return Response.json({ error:'unauthenticated' }, { status:401, headers });
  try {
    const { data, error } = await actor.client.database.rpc('panda_agent_daily_usage', {});
    const usage = error ? null : parseDailyUsage(data);
    if (!usage) return Response.json({ error:'unavailable' }, { status:503, headers });
    return Response.json(usage, { headers });
  } catch { return Response.json({ error:'unavailable' }, { status:503, headers }); }
}
