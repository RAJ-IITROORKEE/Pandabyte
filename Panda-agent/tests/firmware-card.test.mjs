import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { decodeFirmware, firmwareFileName } from '../src/ui/agent/firmware.ts';
const bytes = Uint8Array.from({ length: 10 }, (_, i) => i * 7);
const fw = { id: 'f1', board: 'ESPXS3', fqbn: 'esp32:esp32:esp32s3', address: 0, size: 10, sha256: createHash('sha256').update(bytes).digest('hex'), binBase64: Buffer.from(bytes).toString('base64'), durationMs: 5 };
test('decodes a firmware image and names the file', async () => {
  assert.deepEqual([...await decodeFirmware(fw)], [...bytes]);
  assert.equal(firmwareFileName(fw), `pandabyte-espxs3-${fw.sha256.slice(0, 8)}.merged.bin`);
});
test('rejects a wrong size, checksum or encoding', async () => {
  await assert.rejects(decodeFirmware({ ...fw, size: 11 }), /size/);
  await assert.rejects(decodeFirmware({ ...fw, sha256: 'b'.repeat(64) }), /checksum/);
  await assert.rejects(decodeFirmware({ ...fw, binBase64: '***' }), /damaged/);
});
