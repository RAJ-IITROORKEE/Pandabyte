export const MAX_AUDIO_BYTES = 1_500_000;
export const MAX_TEXT = 2000;
const FORMATS: Record<string, string> = { 'audio/webm': 'webm', 'audio/ogg': 'ogg', 'audio/mp4': 'm4a', 'audio/wav': 'wav', 'audio/mpeg': 'mp3' };

export function audioFormat(type: string): string | null {
  return FORMATS[type.split(';')[0].trim().toLowerCase()] ?? null;
}

/** Returns an HTTP status for an invalid upload, or the OpenRouter format. */
export function validateAudio(file: { size: number; type: string } | null): { status: 400 | 413 | 415 } | { format: string } {
  if (!file || file.size === 0) return { status: 400 };
  if (file.size > MAX_AUDIO_BYTES) return { status: 413 };
  const format = audioFormat(file.type);
  return format ? { format } : { status: 415 };
}

// shortcut: per-instance memory, move to the database if abuse appears
const hits = new Map<string, number[]>();
export function throttle(subject: string, now = Date.now(), limit = 20, windowMs = 600_000): boolean {
  const recent = (hits.get(subject) ?? []).filter(time => now - time < windowMs);
  if (recent.length >= limit) { hits.set(subject, recent); return false; }
  recent.push(now);
  hits.set(subject, recent);
  if (hits.size > 5000) for (const [key, list] of hits) if (!list.some(time => now - time < windowMs)) hits.delete(key);
  return true;
}

export async function transcribe(bytes: ArrayBuffer, format: string, apiKey: string, fetchImpl: typeof fetch = fetch): Promise<{ text: string } | null> {
  try {
    const response = await fetchImpl('https://openrouter.ai/api/v1/audio/transcriptions', {
      method: 'POST', redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(25_000),
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'openai/whisper-large-v3-turbo',
        input_audio: { data: Buffer.from(bytes).toString('base64'), format },
        provider: { only: ['deepinfra/us'], allow_fallbacks: false, zdr: true, data_collection: 'deny' },
      }),
    });
    if (!response.ok) return null;
    const body = await response.json() as { text?: unknown };
    return typeof body.text === 'string' ? { text: body.text.trim().slice(0, MAX_TEXT) } : null;
  } catch { return null; }
}
