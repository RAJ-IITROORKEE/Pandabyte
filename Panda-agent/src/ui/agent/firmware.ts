import type { Firmware } from "../../agent-loop/turn-events";

const hex = (buf: ArrayBuffer) => Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");

/** Decodes the streamed image and checks its length and SHA-256 against what the server reported; throws a short Error otherwise. */
export async function decodeFirmware(fw: Firmware): Promise<Uint8Array> {
  let bin: string;
  try { bin = atob(fw.binBase64); } catch { throw new Error("The firmware data is damaged."); }
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  if (bytes.length !== fw.size) throw new Error("The firmware size does not match.");
  if (hex(await crypto.subtle.digest("SHA-256", bytes)) !== fw.sha256) throw new Error("The firmware checksum does not match.");
  return bytes;
}

export const firmwareFileName = (fw: Firmware) => `pandabyte-${fw.board.toLowerCase()}-${fw.sha256.slice(0, 8)}.merged.bin`;
