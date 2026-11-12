import { authenticateLightweight } from '@/Panda-agent/src/server/lightweight-connection';
import { throttle, transcribe, validateAudio } from '@/Panda-agent/src/server/transcribe';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'private, no-store', Vary: 'Cookie' };
const fail = (error: string, status: number) => Response.json({ error }, { status, headers });

export async function POST(request: Request) {
  if (request.headers.get('origin') !== new URL(request.url).origin) return fail('forbidden', 403);
  if (process.env.PANDA_AGENT_LIGHTWEIGHT_ENABLED !== 'true') return fail('unavailable', 503);
  let actor;
  try { actor = await authenticateLightweight(); } catch { return fail('transcription_unavailable', 502); }
  if (!actor) return fail('unauthenticated', 401);
  if (!throttle(actor.subject)) return fail('rate_limited', 429);
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return fail('transcription_unavailable', 502);
  const length = Number(request.headers.get('content-length'));
  if (Number.isFinite(length) && length > 1_700_000) return fail('too_large', 413);
  let file: FormDataEntryValue | null;
  try { file = (await request.formData()).get('audio'); } catch { return fail('invalid_audio', 400); }
  const audio = file instanceof File ? file : null;
  const checked = validateAudio(audio);
  if ('status' in checked) return fail('invalid_audio', checked.status);
  const result = await transcribe(await audio!.arrayBuffer(), checked.format, apiKey);
  return result ? Response.json({ text: result.text }, { headers }) : fail('transcription_unavailable', 502);
}
