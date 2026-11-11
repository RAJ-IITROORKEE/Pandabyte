import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const shim = fileURLToPath(new URL('../runtime/opencode/research-mcp-shim.mjs', import.meta.url));
const hex = 'a'.repeat(64), id26 = 'A'.repeat(26);
const call = (id, toolID, query) => ({ jsonrpc: '2.0', id, method: 'tools/call', params: { name: 'echo', arguments: { query, __pandaNative: { sessionID: 'ses_' + id26, assistantMessageID: 'msg_' + id26, toolID, generation: hex,
  inputHash: createHash('sha256').update(JSON.stringify({ query })).digest('hex') } }, _meta: { 'ai.opencode/sessionID': 'ses_' + id26 } } });

test('parallel native tool calls are queued to the broker one at a time and none is failed locally', async () => {
  let inFlight = 0, maxInFlight = 0; const seen = [];
  const broker = createServer((request, response) => {
    let body = ''; request.on('data', chunk => { body += chunk; });
    request.on('end', () => {
      inFlight++; maxInFlight = Math.max(maxInFlight, inFlight); const query = JSON.parse(body).input.query; seen.push(query);
      setTimeout(() => { inFlight--; response.writeHead(200, { 'content-type': 'application/json' }); response.end(JSON.stringify({ content: [{ type: 'text', text: JSON.stringify({ query, marker: 'synthetic-public-evidence' }) }] })); }, 60);
    });
  });
  await new Promise(resolve => broker.listen(4174, '127.0.0.1', resolve));
  const child = spawn(process.execPath, [shim], { env: { ...process.env, PANDA_RESEARCH_PROFILE: 'synthetic-echo', PANDA_RESEARCH_GENERATION: hex, PANDA_RESEARCH_CHANNEL_TOKEN: hex }, stdio: ['pipe', 'pipe', 'inherit'] });
  try {
    const replies = new Map(); let buffer = '';
    child.stdout.on('data', chunk => { buffer += chunk; let at; while ((at = buffer.indexOf('\n')) >= 0) { const frame = JSON.parse(buffer.slice(0, at)); buffer = buffer.slice(at + 1); replies.set(frame.id, frame); } });
    const write = frame => child.stdin.write(JSON.stringify(frame) + '\n');
    write({ jsonrpc: '2.0', id: 0, method: 'initialize', params: { protocolVersion: '2025-03-26' } });
    write(call(1, 'tool-a', 'Public I2C fixture'));
    write(call(2, 'tool-b', 'Public SPI fixture'));
    const deadline = Date.now() + 5000;
    while (!(replies.has(1) && replies.has(2)) && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 20));
    for (const id of [1, 2]) { assert.ok(replies.get(id)?.result, 'reply ' + id); assert.notEqual(replies.get(id).result.isError, true); }
    assert.deepEqual(seen, ['Public I2C fixture', 'Public SPI fixture']);
    assert.equal(maxInFlight, 1);
  } finally { child.kill(); await new Promise(resolve => broker.close(resolve)); }
});
