import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash, randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createResearchTurnRunner } from '../src/server/research-turn-runner.ts';
import { reserveDockerHostSlot } from '../src/server/native-docker-host-quota.ts';
import { researchImageId } from '../src/opencode/research-runtime.ts';

// Fake docker/transport/host seams drive the real runner, store, gateway and broker wiring. No evidence path: that needs a real native
// session transcript (covered by the injected host run). These cover mapping, cleanup, cancel, deadline and slot retention.
const sha = s => createHash('sha256').update(s).digest('hex');
const key = 'sk-or-v1-' + 'a'.repeat(64);
const subjectHash = 'a'.repeat(64), chatId = '11111111-2222-4333-8444-555555555555';
const input = { subjectHash, chatId, runId: 'b'.repeat(64), profile: 'tavily-hosted-haiku', prompt: 'Which interfaces does the RP2040 PIO support?' };

function rig(over = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'panda-runner-')), root = path.join(dir, 'root'), slotDir = path.join(dir, 'slots');
  fs.mkdirSync(root, { mode: 0o700 }); fs.mkdirSync(slotDir, { mode: 0o700 });
  const clock = { t: Date.UTC(2026, 10, 11, 12) }, calls = { docker: [], requests: [], interrupts: 0, prompts: 0 }, state = { id: null, labels: {}, removed: false, rmFails: false, createFails: false, mcp: true, mem: 2000000 };
  const attestation = over.attestation ?? { version: 1, reviewedAt: new Date(clock.t - 3600000).toISOString(), expiresAt: new Date(clock.t + 36000000).toISOString(), keySha256: sha(key), workspaceSha256: 'c'.repeat(64),
    privacy: { paidTraining: false, publicPrompts: false, dataDiscount: false, logging: false, traces: 'langsmith_metadata_only' } };
  const docker = async args => {
    calls.docker.push(args[0]);
    if (args[0] === 'image') return JSON.stringify([{ Id: researchImageId, Architecture: 'arm64', Config: { Labels: {} } }]);
    if (args[0] === 'create') {
      if (state.createFails) throw Error('docker create failed');
      for (let i = 0; i < args.length; i++) if (args[i] === '--label') { const [k, ...v] = args[i + 1].split('='); state.labels[k] = v.join('='); }
      state.id = 'd'.repeat(64); return state.id;
    }
    if (args[0] === 'inspect') return JSON.stringify([{ Image: researchImageId, Config: { Labels: state.labels }, State: { Pid: 0, Status: 'created' } }]);
    if (args[0] === 'start') return '';
    if (args[0] === 'rm') { if (state.rmFails) throw Error('rm failed'); state.removed = true; return ''; }
    if (args[0] === 'ps') return state.id && !state.removed ? state.id : '';
    throw Error('unexpected docker ' + args[0]);
  };
  const transportFactory = config => {
    const reply = body => ({ status: 200, body: JSON.stringify(body) });
    return { sessionID: config.sessionID, generation: config.generation, createBody: {}, async provider() {}, async broker() {}, async close() {},
      async request(method, route, body) {
        calls.requests.push(method + ' ' + route);
        if (route === '/api/info') return reply({ version: '2.2.5', pid: 7 });
        if (route === '/api/config') return reply({});
        if (route === '/api/mcp') return reply({ data: state.mcp ? [{ name: 'panda_research', status: { status: 'connected' } }] : [] });
        if (route === '/api/session') return reply({});
        if (route === '/api/session/active') return reply({ data: {} });
        if (route.endsWith('/interrupt?resume=false')) { calls.interrupts++; return reply({}); }
        if (route.endsWith('/prompt')) { calls.prompts++; return reply({ data: { id: 'accepted' } }); }
        if (route.includes('/message?')) return reply({ data: [] });
        if (route === '/api/session/' + config.sessionID) return reply({ data: { id: config.sessionID, metadata: { pandaResearch: config.ownership }, time: { created: 1, updated: 1 } } });
        throw Error('unexpected request ' + route);
      } };
  };
  const hooks = over.hooks ?? {};
  const runner = createResearchTurnRunner({ root, slotDir, codeSource: fileURLToPath(new URL('../runtime/opencode/', import.meta.url)), keys: async () => ({ openrouterKey: key, tavilyKey: 'tvly-test' }), attestation: async () => attestation,
    docker, transportFactory, verifyContainer: () => true, verifyConfig: () => true, now: () => clock.t, sleep: async ms => { clock.t += ms; hooks.onSleep?.(); },
    host: { memAvailableKiB: async () => state.mem, diskAvailableKiB: async () => 10000000, memoryProof: async () => ({ peakBytes: 1, oomKill: 0 }) } });
  return { runner, clock, calls, state, slotFile: path.join(slotDir, 'slot-0'), slotDir, cleanup: () => fs.rmSync(dir, { recursive: true, force: true }) };
}
const zero = { calls: 0, inputTokens: 0, outputTokens: 0, costNanoUsd: 0 };

test('pre-claim failures map to failed:<reason> with zero usage and never reach the container or prompt', async () => {
  const busy = rig(); try {
    await reserveDockerHostSlot(busy.slotDir, 'panda-n45-' + 'e'.repeat(32));
    assert.deepEqual(await busy.runner.run(input), { state: 'failed', reason: 'busy', usage: zero }); assert.equal(busy.calls.docker.length, 0);
    assert.ok(fs.existsSync(busy.slotFile), 'another lease keeps its slot');
  } finally { busy.cleanup(); }
  const expired = rig({ attestation: { version: 1, reviewedAt: '2026-11-10T00:00:00.000Z', expiresAt: '2026-11-10T20:00:00.000Z', keySha256: sha(key), workspaceSha256: 'c'.repeat(64), privacy: { paidTraining: false, publicPrompts: false, dataDiscount: false, logging: false, traces: 'langsmith_metadata_only' } } }); try {
    assert.deepEqual(await expired.runner.run(input), { state: 'failed', reason: 'attestation_expired', usage: zero }); assert.equal(expired.calls.docker.length, 0); assert.equal(fs.existsSync(expired.slotFile), false, 'slot released');
  } finally { expired.cleanup(); }
  const floor = rig(); try { floor.state.mem = 786432; assert.notEqual((await floor.runner.run(input)).reason, 'busy', 'exactly the 768 MiB floor is enough'); } finally { floor.cleanup(); }
  const below = rig(); try { below.state.mem = 786431; assert.equal((await below.runner.run(input)).reason, 'busy'); } finally { below.cleanup(); }
  const lowMem = rig(); try { lowMem.state.mem = 1000; assert.equal((await lowMem.runner.run(input)).reason, 'busy'); assert.equal(fs.existsSync(lowMem.slotFile), false); } finally { lowMem.cleanup(); }
  const notReady = rig(); try {
    notReady.state.mcp = false;
    assert.deepEqual(await notReady.runner.run(input), { state: 'failed', reason: 'tool_not_ready', usage: zero });
    assert.equal(notReady.calls.prompts, 0); assert.equal(notReady.state.removed, true); assert.equal(fs.existsSync(notReady.slotFile), false, 'removal proven, slot freed');
  } finally { notReady.cleanup(); }
});

test('a cancel before the prompt is claimed is failed:invalid; after the claim it is unknown, interrupts native and removes the container', async () => {
  const early = new AbortController(), pre = rig({ hooks: { onSleep: () => early.abort() } }); try {
    pre.state.mcp = false; // abort while polling for MCP readiness
    const result = await pre.runner.run(input, { signal: early.signal }); assert.deepEqual(result, { state: 'failed', reason: 'invalid', usage: zero });
    assert.equal(pre.calls.prompts, 0); assert.equal(pre.state.removed, true); assert.equal(fs.existsSync(pre.slotFile), false);
  } finally { pre.cleanup(); }
  const controller = new AbortController(); let sleeps = 0;
  const post = rig({ hooks: { onSleep: () => { if (++sleeps === 3) controller.abort(); } } }); try {
    const result = await post.runner.run(input, { signal: controller.signal });
    assert.deepEqual(result, { state: 'unknown', usage: zero }); assert.equal(post.calls.prompts, 1); assert.equal(post.calls.interrupts, 1, 'native interrupt sent');
    assert.equal(post.state.removed, true); assert.equal(fs.existsSync(post.slotFile), false);
  } finally { post.cleanup(); }
});

test('the 300 s turn deadline after the prompt claim returns unknown and removes the container', async () => {
  const r = rig(); try {
    const result = await r.runner.run(input);
    assert.deepEqual(result, { state: 'unknown', usage: zero }); assert.equal(r.calls.prompts, 1); assert.equal(r.state.removed, true); assert.equal(fs.existsSync(r.slotFile), false);
    assert.ok(r.clock.t - Date.UTC(2026, 10, 11, 12) >= 300000);
  } finally { r.cleanup(); }
});

test('a failed removal retains the slot, and restart reclaim removes by identity then frees it', async () => {
  const r = rig(); try {
    r.state.mcp = false; r.state.rmFails = true;
    assert.equal((await r.runner.run(input)).reason, 'tool_not_ready'); assert.ok(fs.existsSync(r.slotFile), 'slot retained while the container may exist');
    const [lease] = await r.runner.heldLeases(); assert.match(lease, /^panda-n45-[a-f0-9]{32}$/);
    assert.equal(r.state.labels['panda.native.lease'], lease);
    await assert.rejects(() => r.runner.reclaimLease(lease)); assert.ok(fs.existsSync(r.slotFile), 'never unlinked before removal is proven');
    r.state.rmFails = false; const foreign = r.state.labels['panda.native.lease']; r.state.labels['panda.native.lease'] = 'panda-n45-' + 'f'.repeat(32);
    assert.equal(await r.runner.reclaimLease(lease), false, 'a container with another lease label is never removed'); assert.equal(r.state.removed, false);
    r.state.labels['panda.native.lease'] = foreign;
    assert.equal(await r.runner.reclaimLease(lease), true); assert.equal(r.state.removed, true); assert.equal(fs.existsSync(r.slotFile), false); assert.deepEqual(await r.runner.heldLeases(), []);
  } finally { r.cleanup(); }
  const create = rig(); try {
    create.state.createFails = true;
    assert.equal((await create.runner.run(input)).state, 'failed'); assert.ok(fs.existsSync(create.slotFile), 'uncertain create keeps the slot');
  } finally { create.cleanup(); }
});
