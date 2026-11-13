// Calls the compile service (Panda-agent/services/compile, AWS Lambda Function URL) for the compile_sketch tool.
// The request is signed with HMAC-SHA256 over `${timestamp}.${body}`; the response is checked field by field.
import { createHmac } from 'node:crypto';

/** PandaByte boards the service builds for (same keys as services/compile/validate.mjs BOARDS) and their chip. */
export const COMPILE_BOARDS: Readonly<Record<string, string>> = {
  ESPXS3: 'ESP32-S3', ESPXC3: 'ESP32-C3', ESPXC3M: 'ESP32-C3', ESPXC5: 'ESP32-C5', ESPXC6: 'ESP32-C6', ESPX32: 'ESP32', XLORA: 'ESP32', ESPX8266: 'ESP8266',
};
/** Libraries preinstalled in the build image (the only ones a sketch may use beyond the core). */
export const COMPILE_LIBRARIES = ['Adafruit BME280 Library', 'Adafruit SSD1306', 'Adafruit GFX Library', 'Adafruit NeoPixel', 'Adafruit Unified Sensor',
  'Adafruit BusIO', 'DHT sensor library', 'PubSubClient', 'ArduinoJson'] as const;
export const COMPILE_TIMEOUT_MS = 115000, MAX_FIRMWARE_BYTES = 4 * 1024 * 1024;

export type CompileOutcome =
  | { ok: true; board: string; fqbn: string; address: number; size: number; sha256: string; binBase64: string; warnings: string; durationMs: number }
  | { ok: false; errors: string };

const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/** The service's JSON reply, or null when it is not a well-formed success or compile failure. */
export function parseCompileResponse(v: unknown): CompileOutcome | null {
  if (!record(v)) return null;
  if (v.ok === false) return typeof v.errors === 'string' ? { ok: false, errors: v.errors.slice(0, 4000) } : null;
  const { board, fqbn, address, size, sha256, binBase64, warnings, durationMs } = v;
  if (v.ok !== true || typeof board !== 'string' || !(board in COMPILE_BOARDS) || typeof fqbn !== 'string' || !/^[a-z0-9_]+:[a-z0-9_]+:[a-z0-9_]+$/.test(fqbn)
    || address !== 0 || !Number.isSafeInteger(size) || (size as number) < 1 || (size as number) > MAX_FIRMWARE_BYTES || typeof sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(sha256)
    || typeof binBase64 !== 'string' || binBase64.length !== Math.ceil((size as number) / 3) * 4 || !Number.isSafeInteger(durationMs)) return null;
  return { ok: true, board, fqbn, address: 0, size: size as number, sha256, binBase64, warnings: typeof warnings === 'string' ? warnings.slice(0, 2000) : '', durationMs: durationMs as number };
}

export async function compileOnService(o: { url: string; secret: string; board: string; sketch: string; signal: AbortSignal; fetcher?: typeof fetch; now?: () => number }): Promise<CompileOutcome> {
  const body = JSON.stringify({ board: o.board, sketch: o.sketch });
  const timestamp = String(Math.floor((o.now?.() ?? Date.now()) / 1000));
  const signature = createHmac('sha256', o.secret).update(`${timestamp}.${body}`).digest('hex');
  const response = await (o.fetcher ?? fetch)(o.url, { method: 'POST', redirect: 'error', cache: 'no-store', signal: AbortSignal.any([o.signal, AbortSignal.timeout(COMPILE_TIMEOUT_MS)]),
    headers: { 'content-type': 'application/json', 'x-panda-timestamp': timestamp, 'x-panda-signature': signature }, body });
  if (!response.ok) { void response.body?.cancel().catch(() => {}); throw new Error(`compile service ${response.status}`); }
  const parsed = parseCompileResponse(await response.json());
  if (!parsed) throw new Error('compile service reply was malformed');
  return parsed;
}
