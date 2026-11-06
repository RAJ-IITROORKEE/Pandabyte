// Local mock wire evidence only. No real provider, credential file or application runtime is used.
import { createServer } from 'node:http';
import { createServer as createPortReservation } from 'node:net';
import { createWriteStream } from 'node:fs';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, relative, isAbsolute, basename } from 'node:path';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { randomBytes } from 'node:crypto';
import { createNativeSessionClient } from '../Panda-agent/src/opencode/session-client.ts';
import { createNativeReceipt, createNativeMessageID } from '../Panda-agent/src/opencode/session-contracts.ts';

if (process.argv.length !== 2) throw Error('invalid_probe_argument');
const executable = resolve('tmp/opencode-2.2.2-review/opencode.exe');
const output = resolve('docs/agent-experience-upgrade/opencode-provider-wire-probe.json');
const fixtureRoot = await mkdtemp(join(tmpdir(), 'panda-provider-wire-'));
const logRoot = resolve('tmp/opencode-provider-wire-probe', basename(fixtureRoot));
const deadline = Date.now() + 45000;
const providerID = 'panda-wire-fixture';
const modelID = 'xingchen-agi/xing4.0-29b-a4b:free';
const policy = { only: ['phala'], allow_fallbacks: false, require_parameters: true, zdr: true, data_collection: 'deny', max_price: { prompt: 0, completion: 0, request: 0, image: 0 } };
const summary = {
  version: '2.2.2', scope: 'isolated native to loopback MOCK provider only',
  applicationAdmission: 'disposable file receipt callback; not Clerk, database ownership or production isolation',
  realProviderCallsRequested: false, realCredentialFilesRead: false, runtimeOrProviderReady: false,
  nativeRetrySetting: 'settings.maxRetries=0 is a candidate only; observation decides',
  observationWindowMs: 10000, cases: [], additionalCases: { http5xx: 'not_run', dropAfterAccept: 'not_run' },
};
const fail = reason => { throw Error(reason); };
const check = (value, reason) => { if (!value) fail(reason); };
const sleep = ms => new Promise(done => setTimeout(done, ms));
const inside = (parent, target) => { const rel = relative(resolve(parent), resolve(target)); return rel !== '' && !rel.startsWith('..') && !isAbsolute(rel); };
async function reservePort() {
  const server = createPortReservation(); server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const port = server.address().port; await new Promise((ok, reject) => server.close(error => error ? reject(error) : ok()));
  return port;
}
async function readJSON(response) {
  check(response.body, 'native_missing_body');
  const reader = response.body.getReader(), chunks = []; let bytes = 0;
  try {
    for (;;) {
      const part = await reader.read(); if (part.done) break;
      bytes += part.value.length; check(bytes <= 1_000_000, 'native_body_limit'); chunks.push(part.value);
    }
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks)));
  } finally { void reader.cancel().catch(() => {}); reader.releaseLock(); }
}
function inspectWire(headers, body) {
  return {
    cacheDisabled: headers['x-openrouter-cache'] === 'false', modelMatches: body?.model === modelID,
    endpointOnly: JSON.stringify(body?.provider?.only) === JSON.stringify(policy.only),
    noFallback: body?.provider?.allow_fallbacks === false, requireParameters: body?.provider?.require_parameters === true,
    zdr: body?.provider?.zdr === true, dataCollectionDenied: body?.provider?.data_collection === 'deny',
    fourZeroCeilings: body?.provider?.max_price && ['prompt', 'completion', 'request', 'image'].every(key => body.provider.max_price[key] === 0)
      && Object.keys(body.provider.max_price).length === 4,
    pluginsEmpty: Array.isArray(body?.plugins) && body.plugins.length === 0,
  };
}
async function run429Case() {
  const scenario = '429';
  const record = { scenario, phase: 'fixture', attempts: 0, rejectedPaths: 0, wireChecks: [], terminal: false, activeAtEnd: null };
  summary.cases.push(record);
  const work = join(fixtureRoot, scenario);
  for (const directory of ['home', 'programdata', 'tmp', 'config', 'data', 'cache', 'state', 'workspace']) await mkdir(join(work, directory), { recursive: true });
  let child, childExit, sink, stdout, stderr;
  try {
    sink = createServer(async (request, response) => {
      try {
        check(request.socket.remoteAddress === '127.0.0.1' && request.method === 'POST' && request.url === '/v1/chat/completions', 'mock_path');
        const chunks = []; let bytes = 0;
        for await (const chunk of request) { bytes += chunk.length; check(bytes <= 1_000_000, 'mock_body_limit'); chunks.push(chunk); }
        const body = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks)));
        record.attempts++;
        const fields = inspectWire(request.headers, body);
        record.wireChecks.push(fields);
        if (!Object.values(fields).every(value => value === true)) { response.writeHead(422, { 'content-type': 'application/json' }); response.end('{"error":{"message":"fixture policy violation","type":"invalid_request_error"}}'); return; }
        response.writeHead(429, { 'content-type': 'application/json', 'retry-after': '1' });
        response.end('{"error":{"message":"Synthetic local fixture failure","type":"rate_limit_exceeded"}}');
      } catch {
        record.rejectedPaths++;
        if (!response.headersSent) response.writeHead(400, { 'content-type': 'application/json' });
        response.end('{"error":{"message":"fixture invalid request"}}');
      }
    });
    sink.requestTimeout = 5000; sink.headersTimeout = 5000;
    sink.listen(0, '127.0.0.1'); await once(sink, 'listening');
    const mockURL = `http://127.0.0.1:${sink.address().port}/v1`;
    const config = {
      model: { providerID, model: modelID },
      providers: { [providerID]: {
        name: 'Local mock wire fixture', package: '@opencode/ai/providers/openai-compatible', env: ['PANDA_WIRE_FIXTURE_TOKEN'],
        settings: { baseURL: mockURL, encoding: 'none', maxRetries: 0 }, compatibility: { supportsPromptCacheKey: false },
        headers: { 'X-OpenRouter-Cache': 'false' }, body: { provider: policy, plugins: [] },
        models: { [modelID]: { modelID, capabilities: { tools: false, input: ['text'], output: ['text'] }, limit: { context: 262144, output: 128 } } },
      } },
      permissions: [{ action: '*', resource: '*', effect: 'deny' }],
      policies: [
        { action: 'provider.use', resource: '*', effect: 'deny' }, { action: 'provider.use', resource: providerID, effect: 'allow' },
        { action: 'tool.use', resource: '*', effect: 'deny' }, { action: 'integration.use', resource: '*', effect: 'deny' },
      ],
      mcp: { servers: {} }, plugins: [], skills: [], warming: false, snapshots: false, share: 'disabled', update: 'disable',
      experimental: { background_compaction: false, schedules: false, subagent_depth: 0 },
    };
    const configPath = join(work, 'config', 'opencode.json');
    await writeFile(configPath, JSON.stringify(config), { flag: 'wx' });
    const port = await reservePort(), password = randomBytes(32).toString('hex');
    const env = Object.fromEntries(['SystemRoot', 'WINDIR', 'COMSPEC', 'PATHEXT'].filter(key => process.env[key]).map(key => [key, process.env[key]]));
    Object.assign(env, {
      PATH: join(process.env.SystemRoot, 'System32'), USERPROFILE: join(work, 'home'), ProgramData: join(work, 'programdata'),
      TEMP: join(work, 'tmp'), TMP: join(work, 'tmp'), XDG_CONFIG_HOME: join(work, 'config'), XDG_DATA_HOME: join(work, 'data'), XDG_CACHE_HOME: join(work, 'cache'), XDG_STATE_HOME: join(work, 'state'),
      OPENCODE_CONFIG: configPath, OPENCODE_CONFIG_DIR: join(work, 'config'), OPENCODE_CONFIG_PROJECT_DISABLE: 'true',
      OPENCODE_DISABLE_CLAUDE_CODE: 'true', OPENCODE_DISABLE_CLAUDE_CODE_SKILLS: 'true', OPENCODE_DISABLE_MODELS_FETCH: 'true',
      OPENCODE_FILEWATCHER_DISABLE: 'true', OPENCODE_DISABLE_FFF: 'true', OPENCODE_PASSWORD: password,
      PANDA_WIRE_FIXTURE_TOKEN: 'synthetic-local-fixture-token',
      HTTP_PROXY: 'http://127.0.0.1:9', HTTPS_PROXY: 'http://127.0.0.1:9', NO_PROXY: '127.0.0.1,localhost',
    });
    stdout = createWriteStream(join(logRoot, scenario + '.stdout.log'), { flags: 'wx' });
    stderr = createWriteStream(join(logRoot, scenario + '.stderr.log'), { flags: 'wx' });
    child = spawn(executable, ['serve', '--hostname', '127.0.0.1', '--port', String(port)], { cwd: join(work, 'workspace'), env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    childExit = new Promise(done => { child.once('exit', () => done(true)); child.once('error', () => done(true)); });
    child.stdout.pipe(stdout); child.stderr.pipe(stderr);
    let logBytes = 0;
    for (const stream of [child.stdout, child.stderr]) stream.on('data', chunk => { logBytes += chunk.length; if (logBytes > 2_000_000) { record.logLimit = true; child.kill(); } });
    const baseUrl = `http://127.0.0.1:${port}`;
    const headers = { authorization: `Basic ${Buffer.from('opencode:' + password).toString('base64')}`, 'x-opencode-directory': encodeURIComponent(join(work, 'workspace')) };
    const get = async path => {
      const remaining = Math.min(3000, deadline - Date.now()); check(remaining > 0, 'probe_deadline');
      const response = await fetch(baseUrl + path, { headers, redirect: 'error', signal: AbortSignal.timeout(remaining) });
      check(response.status === 200, 'native_status'); return readJSON(response);
    };
    record.phase = 'startup';
    let info;
    const startupDeadline = Math.min(deadline, Date.now() + 15000);
    while (Date.now() < startupDeadline) {
      try { info = await get('/api/info'); if (info.version === '2.2.2') break; } catch { /* Bounded startup only. */ }
      check(child.exitCode === null && child.signalCode === null, 'native_startup_exit'); await sleep(200);
    }
    check(info?.version === '2.2.2' && info.pid === child.pid, 'native_identity'); record.pidVerified = true;
    record.phase = 'activation_catalog';
    const models = await get('/api/model');
    check(Array.isArray(models.data) && models.data.length === 1 && models.data[0].providerID === providerID && models.data[0].id === modelID, 'fixture_model_catalog');
    const [skills, mcp] = await Promise.all([get('/api/skill'), get('/api/mcp')]);
    check(Array.isArray(skills.data) && skills.data.length === 0 && Array.isArray(mcp.data) && mcp.data.length === 0, 'fixture_capability_catalog');
    record.onlyFixtureModel = true;
    const loaded = await get('/api/config');
    check(Array.isArray(loaded) && loaded.some(entry => {
      const provider = entry?.info?.providers?.[providerID];
      return provider?.settings?.baseURL === mockURL && JSON.stringify(provider.body?.provider) === JSON.stringify(policy)
        && provider.headers?.['X-OpenRouter-Cache'] === 'false' && Array.isArray(provider.body?.plugins) && provider.body.plugins.length === 0;
    }), 'fixture_loaded_config');
    const receipt = createNativeReceipt('playground', 'a'.repeat(64));
    const marker = join(work, 'session-receipt.json'); await writeFile(marker, JSON.stringify(receipt), { flag: 'wx' });
    const admission = async candidate => JSON.stringify(candidate) === await readFile(marker, 'utf8');
    const native = createNativeSessionClient({ baseUrl, password, directory: join(work, 'workspace'), expectedPid: child.pid, timeoutMs: 5000 });
    record.phase = 'session_create'; await native.create(receipt, admission);
    record.phase = 'prompt_ack';
    const ack = await native.prompt(receipt, { messageID: createNativeMessageID(), text: 'Synthetic local wire probe. Reply with fixture.' }, admission);
    check(ack.status === 'accepted', 'fixture_prompt_ack'); record.promptAccepted = true;
    record.phase = 'observe';
    const observationStart = Date.now(), observationEnd = Math.min(deadline, observationStart + summary.observationWindowMs);
    while (Date.now() < observationEnd) {
      const state = await native.get(receipt, admission), active = await native.active(receipt, admission);
      record.activeAtEnd = active.active;
      record.terminal = state.outcome !== undefined && state.time.busy !== undefined && state.time.idle !== undefined && state.time.idle >= state.time.busy && !active.active;
      if (record.terminal || record.wireChecks.some(fields => !Object.values(fields).every(value => value === true))) break;
      await sleep(250);
    }
    record.observedMs = Date.now() - observationStart;
    check(record.attempts > 0 && record.rejectedPaths === 0, 'fixture_no_completion_wire');
    check(record.wireChecks.every(fields => Object.values(fields).every(value => value === true)), 'wire_policy_not_preserved');
    record.policyForwarded = true;
    record.retryGate = record.attempts > 1 ? 'failed_native_retries_observed' : record.terminal ? 'pass_single_attempt_terminal' : 'unverified_window_ended';
    record.phase = 'observed';
  } finally {
    if (child && child.exitCode === null && child.signalCode === null) child.kill();
    record.childStopped = child ? await Promise.race([childExit, sleep(5000).then(() => false)]) : true;
    if (sink) { sink.closeAllConnections(); await new Promise(done => sink.close(() => done())); }
    record.sinkClosed = true;
    for (const stream of [stdout, stderr]) if (stream && !stream.closed) { stream.end(); await Promise.race([once(stream, 'close'), sleep(1000)]); }
  }
}
try {
  check(process.platform === 'win32' && inside(resolve('tmp'), logRoot), 'fixture_platform_or_log_path');
  await mkdir(logRoot, { recursive: true });
  await run429Case();
  summary.policyForwarding = 'pass';
  summary.retryGate = summary.cases.every(record => record.retryGate === 'pass_single_attempt_terminal') ? 'pass' : summary.cases.some(record => record.attempts > 1) ? 'failed' : 'unverified';
  summary.result = summary.retryGate === 'pass' ? 'completed' : 'policy_blocked';
} catch (error) {
  summary.result = 'stopped'; summary.reason = /^[a-z_]+$/.test(error.message ?? '') ? error.message : 'probe_error';
} finally {
  summary.childrenStopped = summary.cases.every(record => record.childStopped === true);
  summary.mockSinksClosed = summary.cases.every(record => record.sinkClosed === true);
  if (summary.childrenStopped && inside(tmpdir(), fixtureRoot) && basename(fixtureRoot).startsWith('panda-provider-wire-')) {
    await rm(fixtureRoot, { recursive: true, force: true }); summary.fixtureRemoved = true;
  } else summary.fixtureRemoved = false;
  summary.logs = 'task-owned stdout/stderr retained under ignored tmp/opencode-provider-wire-probe';
  await writeFile(output, JSON.stringify(summary, null, 2) + '\n');
}
console.log(JSON.stringify(summary, null, 2));
if (summary.result !== 'completed' || !summary.childrenStopped || !summary.mockSinksClosed || !summary.fixtureRemoved) process.exitCode = 1;
