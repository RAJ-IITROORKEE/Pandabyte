import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { createInterface } from 'node:readline';
import plugin from '../runtime/opencode/research-binding/index.ts';

const generation = 'a'.repeat(64), token = 'b'.repeat(64), sessionID = 'ses_' + '1'.repeat(26), messageID = 'msg_' + '2'.repeat(26);
const hash = input => createHash('sha256').update(JSON.stringify(input)).digest('hex');
function environment(profile = 'synthetic-echo') { process.env.PANDA_RESEARCH_GENERATION = generation; process.env.PANDA_RESEARCH_CHANNEL_TOKEN = token; process.env.PANDA_RESEARCH_PROFILE = profile; }
async function load(tool, profile = 'synthetic-echo') {
  environment(profile); const hooks = {}, transforms = [];
  await plugin.setup({ session: { hook: async (name, callback) => { await Promise.resolve(); hooks[name] = callback; } }, tool: { transform: async callback => { await Promise.resolve(); transforms.push(callback); } } });
  if (tool) for (const transform of transforms) transform({ list: () => [tool], update: (id, callback) => { assert.equal(id, tool.id); callback(tool); } });
  return hooks;
}

test('binding awaits registration, replaces spoofed HTTP headers and suppresses retry/title maintenance', async () => {
  const hooks = await load();
  const event = { sessionID, kind: 'primary', request: new Request('http://127.0.0.1:4175/v1/chat/completions', { method: 'POST', headers: { 'x-panda-native-session': 'spoof', 'x-panda-native-kind': 'title', 'x-panda-native-generation': 'old' }, body: '{}' }) };
  hooks['http.request'](event);
  assert.equal(event.request.headers.get('x-panda-native-session'), sessionID);
  assert.equal(event.request.headers.get('x-panda-native-kind'), 'primary');
  assert.equal(event.request.headers.get('x-panda-native-generation'), generation);
  assert.equal(await event.request.text(), '{}');
  const retry = { decision: { retry: true, delay: 100 } }; hooks.retry(retry); assert.deepEqual(retry.decision, { retry: false });
  const title = {}; hooks.title(title); assert.equal(title.result, 'Panda research fixture');
});

test('search profile wraps only its actual native search executor and rejects unknown modes', async () => {
  const seen = [], result = {}, execute = (input, context) => { seen.push({ input, context }); return result; };
  const selected = { id: 'panda_research_search', name: 'search', execute };
  await load(selected, 'tavily-search');
  const input = { query: 'RP2040 PIO documentation' }, context = { sessionID, messageID, id: 'call-search' };
  assert.equal(selected.execute(input, context), result);
  assert.deepEqual(seen[0].input, { ...input, __pandaNative: { sessionID, assistantMessageID: messageID, toolID: 'call-search', generation, inputHash: hash(input) } });
  const echo = { id: 'panda_research_echo', name: 'echo', execute };
  await load(echo, 'tavily-search'); assert.equal(echo.execute, execute);
  environment('foreign'); await assert.rejects(plugin.setup({ session: { hook: async () => {} }, tool: { transform: async () => {} } }));
  environment();
});

test('echo executor retains schema/options and original Effect while binding actual native tool IDs', async () => {
  const effect = {}, seen = [], schema = { type: 'object', properties: { query: { type: 'string' } }, additionalProperties: false }, options = { codemode: false, namespace: 'panda_research' };
  const tool = { id: 'panda_research_echo', name: 'echo', description: 'fixture', input: schema, options, execute: (input, context) => { seen.push({ input, context }); return effect; } };
  await load(tool);
  const input = { query: 'public I2C evidence' }, context = { sessionID, messageID, id: 'call_fixture', agent: 'panda-research', progress: () => {} };
  assert.equal(tool.execute(input, context), effect);
  assert.equal(tool.input, schema); assert.equal(tool.options, options); assert.equal(tool.description, 'fixture');
  assert.deepEqual(input, { query: 'public I2C evidence' });
  assert.deepEqual(seen[0].input, { query: 'public I2C evidence', __pandaNative: { sessionID, assistantMessageID: messageID, toolID: 'call_fixture', generation, inputHash: hash(input) } });
  assert.equal(seen[0].context, context);
  assert.equal(tool.execute(input, { ...context, id: 'call.fixture:1' }), effect);
  for (const bad of [{ query: '' }, { query: 'x'.repeat(401) }, { query: 'private\u0000' }, { query: '\ud800' }, { query: 'x', __pandaNative: {} }, { query: 'x', extra: true }]) assert.throws(() => tool.execute(bad, context));
  assert.throws(() => tool.execute(input, { ...context, sessionID: 'foreign' }));
  assert.equal(seen.length, 2);
});

test('foreign tool executors are unchanged and invalid runtime generation cannot register', async () => {
  const execute = () => ({}), tool = { id: 'foreign_echo', name: 'foreign_echo', execute };
  await load(tool); assert.equal(tool.execute, execute);
  process.env.PANDA_RESEARCH_GENERATION = 'bad';
  await assert.rejects(plugin.setup({ session: { hook: async () => {} }, tool: { transform: async () => {} } }));
});

test('stdio shim bounds unterminated UTF-8 frames before accepting work', async () => {
  const child = spawn(process.execPath, ['Panda-agent/runtime/opencode/research-mcp-shim.mjs'], { env: { ...process.env, PANDA_RESEARCH_GENERATION: generation, PANDA_RESEARCH_CHANNEL_TOKEN: token, PANDA_RESEARCH_PROFILE: 'synthetic-echo' }, stdio: ['pipe', 'pipe', 'pipe'] });
  child.stdin.on('error', () => {});
  const exited = once(child, 'exit');
  child.stdin.write('x'.repeat(16385));
  const [code] = await exited; assert.equal(code, 1);
});

test('stdio shim exposes only public echo schema and rejects unbound/changed/foreign input before broker dispatch', async () => {
  const seen = [], server = createServer(async (request, response) => {
    let body = ''; for await (const chunk of request) body += chunk;
    seen.push({ path: request.url, authorization: request.headers.authorization, input: JSON.parse(body) });
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ content: [{ type: 'text', text: JSON.stringify({ query: JSON.parse(body).input.query, marker: 'synthetic-public-evidence' }) }] }));
  });
  server.listen(4174, '127.0.0.1'); await once(server, 'listening');
  const child = spawn(process.execPath, ['Panda-agent/runtime/opencode/research-mcp-shim.mjs'], { env: { ...process.env, PANDA_RESEARCH_GENERATION: generation, PANDA_RESEARCH_CHANNEL_TOKEN: token, PANDA_RESEARCH_PROFILE: 'synthetic-echo' }, stdio: ['pipe', 'pipe', 'pipe'] });
  const waiting = new Map(); const lines = createInterface({ input: child.stdout });
  lines.on('line', line => { const frame = JSON.parse(line); waiting.get(frame.id)?.(frame); waiting.delete(frame.id); });
  let next = 1;
  const rpc = (method, params) => new Promise((resolve, reject) => { const id = next++; const timeout = setTimeout(() => reject(Error('shim timeout')), 5000); waiting.set(id, value => { clearTimeout(timeout); resolve(value); }); child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n'); });
  try {
    await rpc('initialize', { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'test', version: '1' } });
    const listed = await rpc('tools/list', {});
    assert.deepEqual(listed.result.tools.map(x => x.name), ['echo']);
    assert.deepEqual(listed.result.tools[0].inputSchema, { type: 'object', properties: { query: { type: 'string', minLength: 1, maxLength: 400 } }, required: ['query'], additionalProperties: false });
    const input = { query: 'public I2C evidence' }, envelope = { sessionID, assistantMessageID: messageID, toolID: 'call_fixture', generation, inputHash: hash(input) };
    const params = { name: 'echo', arguments: { ...input, __pandaNative: envelope }, _meta: { 'ai.opencode/sessionID': sessionID } };
    for (const invalid of [
      { ...params, name: 'search' }, { ...params, arguments: input }, { ...params, arguments: { ...params.arguments, extra: true } },
      { ...params, _meta: { 'ai.opencode/sessionID': 'ses_' + '3'.repeat(26) } },
      { ...params, arguments: { ...params.arguments, query: 'changed' } },
      { ...params, arguments: { ...params.arguments, __pandaNative: { ...envelope, extra: true } } },
      { ...params, arguments: { ...params.arguments, __pandaNative: { ...envelope, generation: 'c'.repeat(64) } } },
    ]) assert.equal((await rpc('tools/call', invalid)).result.isError, true);
    assert.equal(seen.length, 0);
    const result = await rpc('tools/call', params);
    assert.deepEqual(result.result, { content: [{ type: 'text', text: '{"query":"public I2C evidence","marker":"synthetic-public-evidence"}' }] });
    assert.deepEqual(seen, [{ path: '/echo', authorization: `Bearer ${token}`, input: { ...envelope, input } }]);
  } finally { child.stdin.end(); await once(child, 'exit'); lines.close(); await new Promise(done => server.close(done)); }
});

test('search shim uses only search path and releases exact bounded excerpt objects without provider metadata', { timeout: 20000 }, async () => {
  const digest = value => createHash('sha256').update(value).digest('hex');
  const source = (content = 'Public PIO documentation', url = 'https://www.raspberrypi.com/documentation/') => ({ handle: `web:${digest(url)}:${digest(content)}:${digest(content)}`, url, title: 'RP2040 PIO', content, capturedAt: '2026-11-11T00:00:00.000Z' });
  const mcp = sources => ({ content: [{ type: 'text', text: JSON.stringify({ kind: 'tavily_excerpt', sources }) }] });
  let returned = mcp([source()]), delay = 0; const seen = [];
  const server = createServer(async (request, response) => {
    let body = ''; for await (const part of request) body += part;
    seen.push({ path: request.url, body: JSON.parse(body) });
    const wait = delay; delay = 0; if (wait) await new Promise(done => setTimeout(done, wait));
    response.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(returned));
  });
  server.listen(4174, '127.0.0.1'); await once(server, 'listening');
  const child = spawn(process.execPath, ['Panda-agent/runtime/opencode/research-mcp-shim.mjs'], { env: { ...process.env, PANDA_RESEARCH_GENERATION: generation, PANDA_RESEARCH_CHANNEL_TOKEN: token, PANDA_RESEARCH_PROFILE: 'tavily-search' }, stdio: ['pipe', 'pipe', 'pipe'] });
  const lines = createInterface({ input: child.stdout }), waiting = new Map(); let next = 1;
  lines.on('line', line => { const value = JSON.parse(line); waiting.get(value.id)?.(value); waiting.delete(value.id); });
  const rpc = (method, params) => new Promise((resolve, reject) => { const id = next++, timer = setTimeout(() => reject(Error('search shim timeout')), 15000); waiting.set(id, value => { clearTimeout(timer); resolve(value); }); child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n'); });
  const input = { query: 'RP2040 PIO documentation' }, bound = { sessionID, assistantMessageID: messageID, toolID: 'call-search', generation, inputHash: hash(input) };
  const params = { name: 'search', arguments: { ...input, __pandaNative: bound }, _meta: { 'ai.opencode/sessionID': sessionID } };
  try {
    await rpc('initialize', { protocolVersion: '2025-03-26' });
    const catalog = await rpc('tools/list', {}); assert.deepEqual(catalog.result.tools.map(tool => tool.name), ['search']);
    assert.equal((await rpc('tools/call', { ...params, name: 'echo' })).result.isError, true); assert.equal(seen.length, 0);
    assert.deepEqual((await rpc('tools/call', params)).result, returned);
    assert.deepEqual(seen[0], { path: '/search', body: { ...bound, input } });
    // A valid hosted search may exceed echo's ten-second deadline.
    returned = mcp([]); delay = 10500; assert.deepEqual((await rpc('tools/call', params)).result, returned);
    for (const bad of [
      { content: [{ type: 'text', text: JSON.stringify({ query: input.query, marker: 'synthetic-public-evidence' }) }] },
      { ...mcp([source()]), requestId: 'private-provider-id' },
      mcp([{ ...source(), handle: 'web:forged' }]), mcp([source(), source()]),
      mcp([source('content', 'https://host.localdomain/')]), mcp([{ ...source(), capturedAt: 'invalid' }]),
      mcp([{ ...source(), content: '\ud800' }]),
      mcp([source('"'.repeat(5500)), source('"'.repeat(5500), 'https://www.raspberrypi.com/other/')]),
      mcp([source('é'.repeat(6000)), source('é'.repeat(6000), 'https://www.raspberrypi.com/other/')]),
      { content: [{ type: 'text', text: JSON.stringify({ kind: 'tavily_excerpt', sources: [source()], credits: 1 }) }] },
      { content: [{ type: 'text', text: '{"kind":"tavily_excerpt","sources":[{"private":"unvalidated"}],"sources":[]}' }] },
    ]) { returned = bad; assert.equal((await rpc('tools/call', params)).result.isError, true); }
  } finally { child.stdin.end(); await once(child, 'exit'); lines.close(); server.closeAllConnections(); await new Promise(done => server.close(done)); }
});
