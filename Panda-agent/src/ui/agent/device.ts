// Device panel helpers (phase 6, Admin only): the serial log, the message sent to the agent, and the checks before flashing.
// Pure functions so the browser-only panel stays thin and these rules are tested.

export const MAX_LOG_LINES = 500, MAX_LINE_CHARS = 300, MAX_FIRMWARE_BYTES = 16 * 1024 * 1024, SECTOR = 0x1000;
export const BAUD_RATES = [9600, 57600, 115200, 230400, 460800, 921600] as const;

/** Appends decoded serial text: complete lines go to `lines` (control characters removed, each cut to MAX_LINE_CHARS, the
 *  newest MAX_LOG_LINES kept); an unfinished line stays in `partial`. "\r\n", "\n" and a lone "\r" all end a line. */
export function appendSerial(lines: readonly string[], partial: string, chunk: string): { lines: string[]; partial: string } {
  const parts = (partial + chunk).split(/\r\n|\n|\r(?!$)/);
  const rest = parts.pop() ?? '';
  const clean = (s: string) => s.replace(/\r$/, '').replace(/[\p{Cc}\p{Cf}]/gu, c => c === '\t' ? '  ' : '').slice(0, MAX_LINE_CHARS);
  const next = [...lines, ...parts.map(clean)].slice(-MAX_LOG_LINES);
  // A device that never sends a newline still shows its output in bounded pieces.
  return rest.length > MAX_LINE_CHARS ? { lines: [...next, clean(rest)].slice(-MAX_LOG_LINES), partial: '' } : { lines: next, partial: rest };
}

/** The chat message for "Ask the agent": the question, then as many of the newest log lines as fit in one message. */
export function agentLogMessage(lines: readonly string[], chip: string | null, baud: number, question: string, limit = 2000): string {
  const ask = question.trim().replace(/\s+/g, ' ').slice(0, 300) || 'What does this serial output mean, and what should I check?';
  const head = `${ask}\n\nSerial output from my ${chip ?? 'board'} at ${baud} baud (newest last):\n\`\`\`text\n`, tail = '\n```';
  const kept: string[] = [];
  let size = head.length + tail.length;
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i].replace(/```/g, "'''");
    if (size + line.length + 1 > limit) break;
    kept.unshift(line); size += line.length + 1;
  }
  return `${head}${kept.join('\n')}${tail}`;
}

/** A flash address typed by the user: hex (0x10000) or decimal, on a 4 KB sector boundary, below 16 MB; null otherwise. */
export function parseFlashAddress(text: string): number | null {
  const t = text.trim();
  const n = /^0x[0-9a-f]{1,7}$/i.test(t) ? parseInt(t.slice(2), 16) : /^\d{1,8}$/.test(t) ? Number(t) : NaN;
  return Number.isSafeInteger(n) && n >= 0 && n < MAX_FIRMWARE_BYTES && n % SECTOR === 0 ? n : null;
}

/** The chip id an ESP-IDF / Arduino image header names (magic 0xE9; chip id at byte 12, little endian), looking at offset 0
 *  (bootloader or app image) and 0x1000 (a merged ESP32 image padded with 0xFF). Null when there is no such header. */
export function imageChipId(data: Uint8Array): number | null {
  for (const at of [0, SECTOR]) {
    if (data.length >= at + 24 && data[at] === 0xe9 && data.subarray(0, at).every(b => b === 0xff)) return data[at + 12] | (data[at + 13] << 8);
  }
  return null;
}

export type ConnectedChip = { name: string; imageChipId: number | null; flashBytes: number | null };
/** Why a firmware file must not be flashed to this chip at this address, or null when it may (the user still confirms). */
export function firmwareProblem(data: Uint8Array, address: number, chip: ConnectedChip): string | null {
  if (!data.length) return 'The file is empty.';
  if (data.length > MAX_FIRMWARE_BYTES) return 'The file is larger than 16 MB.';
  if (chip.flashBytes !== null && address + data.length > chip.flashBytes) return `The file does not fit: it ends past the board's ${chip.flashBytes / 1048576} MB flash.`;
  const id = imageChipId(data);
  // ESP8266 images have no chip id; other chips must match exactly (an image for another chip will not boot).
  if (id !== null && chip.imageChipId !== null && id !== chip.imageChipId) return `This firmware was built for another chip (image chip id ${id}), not the connected ${chip.name}.`;
  return null;
}
