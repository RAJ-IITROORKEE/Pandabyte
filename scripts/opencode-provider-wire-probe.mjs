// Local mock wire evidence only. No real provider, credential file or application runtime is used.
import { createServer } from 'node:http';
import { createServer as createPortReservation } from 'node:net';
import { createWriteStream } from 'node:fs';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, relative, isAbsolute, basename } from 'node:path';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createHash, randomBytes } from 'node:crypto';
import { createNativeSessionClient } from '../Panda-agent/src/opencode/session-client.ts';
import { createNativeReceipt, createNativeMessageID } from '../Panda-agent/src/opencode/session-contracts.ts';
import noRetry from '../Panda-agent/runtime/opencode/plugins/no-retry.ts';
import { correlateNativeTurn } from '../Panda-agent/src/opencode/turn-result.ts';
import { createNativeLifecycle } from '../Panda-agent/src/server/native-lifecycle.ts';

if (process.argv.length !== 2) throw Error('invalid_probe_argument');
const executable = resolve('tmp/opencode-2.2.2-review/opencode.exe');
const output = resolve('docs/agent-experience-upgrade/opencode-provider-wire-probe.json');
const fixtureRoot = await mkdtemp(join(tmpdir(), 'panda-provider-wire-'));
const logRoot = resolve('tmp/opencode-provider-wire-probe', basename(fixtureRoot));
const pluginPath = resolve('Panda-agent/runtime/opencode/plugins/no-retry.ts');
const previousEvidence = JSON.parse(await readFile(output, 'utf8'));
const baseline = previousEvidence.baseline ?? previousEvidence;
const deadline = Date.now() + 150000;
const providerID = 'panda-wire-fixture';
const modelID = 'xingchen-agi/xing4.0-29b-a4b:free';
const policy = { only: ['phala'], allow_fallbacks: false, require_parameters: true, zdr: true, data_collection: 'deny', max_price: { prompt: 0, completion: 0, request: 0, image: 0 } };
const summary = {
  version: '2.2.2', scope: 'isolated native to loopback MOCK provider only',
  applicationAdmission: 'disposable file receipt callback; not Clerk, database ownership or production isolation',
  realProviderCallsRequested: false, realCredentialFilesRead: false, runtimeOrProviderReady: false,
  baseline,
  nativeRetryControl: 'dedicated instance local panda-no-retry session retry veto; no provider maxRetries claim',
  limitations: ['HTTP session retry path only; auxiliary generation and websocket transport recovery are outside this probe', 'Mock policy forwarding does not verify real provider pricing or account/key ZDR guardrails'],
  observationWindowMs: 20000, cases: [],
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
function cancellationFixture(native, receipt, messageID, promptHash) {
  const turn = { thread: '10000000-0000-4000-8000-000000000001', request: '10000000-0000-4000-8000-000000000002' };
  const runtimeBinding = 'b'.repeat(64);
  let state = {
    receipt, messageID, promptHash, runtimeBinding, scopes: [], phase: 'prompting', version: 1,
    createClaimed: true, promptClaimed: true, cancelRequested: false,
    nativeOutcome: null, terminalReason: null, removalClaimed: false, runtimeRetired: false,
  };
  let releasedAnswer;
  const sameTurn = (thread, request) => thread === turn.thread && request === turn.request;
  const update = (thread, request, version, changes) => {
    check(sameTurn(thread, request) && version === state.version, 'fixture_journal_fence');
    state = { ...state, ...changes, version: version + 1 };
    return structuredClone(state);
  };
  const lifecycle = createNativeLifecycle({
    current: async input => sameTurn(input.thread, input.request)
      && (!input.receipt || JSON.stringify(input.receipt) === JSON.stringify(receipt)),
    ownerBinding: async () => receipt.binding,
    authorizeRuntime: async operation => operation === 'observe' ? runtimeBinding : null,
    native,
    store: {
      state: async (thread, request) => sameTurn(thread, request) ? structuredClone(state) : null,
      transition: async (thread, request, version, phase) => update(thread, request, version, { phase, cancelRequested: true }),
      complete: async (thread, request, version, answer, nativeOutcome, terminalReason) => {
        update(thread, request, version, { phase: 'terminal', nativeOutcome, terminalReason });
        releasedAnswer = answer;
      },
      claimRemoval: async (thread, request, version) => update(thread, request, version, { removalClaimed: true }),
      retire: async (thread, request, version) => update(thread, request, version, { runtimeRetired: true }),
    },
  });
  return { turn, lifecycle, outcome: () => ({
    nativeOutcome: state.nativeOutcome,
    terminalReason: state.terminalReason,
    runtimeRetired: state.runtimeRetired,
    fixedCancellationAnswer: releasedAnswer?.outcome === 'insufficient'
      && releasedAnswer.text === 'This request was cancelled. Start a new question when ready.'
      && releasedAnswer.citations.length === 0,
  }) };
}
async function runCase(scenario) {
  const record = { scenario, phase: 'fixture', attempts: 0, rejectedPaths: 0, wireChecks: [], terminal: false, activeAtEnd: null };
  summary.cases.push(record);
  const work = join(fixtureRoot, scenario);
  for (const directory of ['home', 'programdata', 'tmp', 'config', 'data', 'cache', 'state', 'workspace']) await mkdir(join(work, directory), { recursive: true });
  const pluginDirectory = join(work, 'retry-plugin');
  await mkdir(pluginDirectory);
  await writeFile(join(pluginDirectory, 'no-retry.ts'), await readFile(pluginPath), { flag: 'wx' });
  await writeFile(join(pluginDirectory, 'package.json'), JSON.stringify({ name: 'panda-no-retry-local', type: 'module', exports: { '.': './no-retry.ts' } }), { flag: 'wx' });
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
        if (scenario === 'drop') { request.socket.destroy(); return; }
        if (scenario === 'success' || scenario === 'cancel') {
          response.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' });
          const chunk = (delta, finish_reason = null) => ({ id: 'chatcmpl-fixture', object: 'chat.completion.chunk', created: 1, model: modelID, choices: [{ index: 0, delta, finish_reason }] });
          response.write('data: ' + JSON.stringify(chunk({ role: 'assistant', content: 'Synthetic fixture reply.' })) + '\n\n');
          if (scenario === 'cancel') {
            record.partialChunkSent = true;
            response.once('close', () => { record.providerConnectionClosed = true; });
            return;
          }
          response.write('data: ' + JSON.stringify(chunk({}, 'stop')) + '\n\n');
          response.end('data: [DONE]\n\n'); return;
        }
        response.writeHead(Number(scenario), { 'content-type': 'application/json', 'retry-after': '1' });
        response.end(JSON.stringify({ error: { message: 'Synthetic local fixture failure', type: scenario === '429' ? 'rate_limit_exceeded' : 'server_error' } }));
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
        settings: { baseURL: mockURL, encoding: 'none' }, compatibility: { supportsPromptCacheKey: false },
        headers: { 'X-OpenRouter-Cache': 'false' }, body: { provider: policy, plugins: [] },
        models: { [modelID]: { modelID, capabilities: { tools: false, input: ['text'], output: ['text'] }, limit: { context: 262144, output: 128 } } },
      } },
      permissions: [{ action: '*', resource: '*', effect: 'deny' }],
      policies: [
        { action: 'provider.use', resource: '*', effect: 'deny' }, { action: 'provider.use', resource: providerID, effect: 'allow' },
        { action: 'tool.use', resource: '*', effect: 'deny' }, { action: 'integration.use', resource: '*', effect: 'deny' },
        { action: 'integration.use', resource: `plugin:${pluginDirectory}`, effect: 'allow' },
      ],
      mcp: { servers: {} }, plugins: [pluginDirectory], skills: [], warming: false, snapshots: false, share: 'disabled', update: 'disable',
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
    let plugins;
    const pluginDeadline = Math.min(deadline, Date.now() + 5000);
    do {
      plugins = await get('/api/plugin');
      if (plugins.data?.some(item => item.id === 'panda-no-retry' && item.state?.status === 'active')) break;
      await sleep(100);
    } while (Date.now() < pluginDeadline);
    record.pluginCatalog = { expectedActive: Array.isArray(plugins.data) && plugins.data.some(item => item.id === 'panda-no-retry' && item.state?.status === 'active'), external: Array.isArray(plugins.data) ? plugins.data.filter(item => item.source?.type === 'local').map(item => ({ expectedID: item.id === 'panda-no-retry', status: item.state?.status ?? null })) : [] };
    check(record.pluginCatalog.expectedActive && record.pluginCatalog.external.length === 1, 'fixture_plugin_catalog');
    record.retryPluginActive = true;
    record.onlyFixtureModel = true;
    const loaded = await get('/api/config');
    check(Array.isArray(loaded) && loaded.some(entry => {
      const provider = entry?.info?.providers?.[providerID];
      return provider?.settings?.baseURL === mockURL && JSON.stringify(provider.body?.provider) === JSON.stringify(policy)
        && provider.headers?.['X-OpenRouter-Cache'] === 'false' && Array.isArray(provider.body?.plugins) && provider.body.plugins.length === 0;
    }), 'fixture_loaded_config');
    const receipt = createNativeReceipt(scenario === 'cancel' ? 'customer' : 'playground', 'a'.repeat(64));
    const marker = join(work, 'session-receipt.json'); await writeFile(marker, JSON.stringify(receipt), { flag: 'wx' });
    const admission = async candidate => JSON.stringify(candidate) === await readFile(marker, 'utf8');
    const mutations = { prompts: 0, interrupts: 0, deletes: 0 };
    const transport = (url, init) => {
      const path = new URL(url).pathname;
      if (init?.method === 'POST' && path.endsWith('/prompt')) mutations.prompts++;
      if (init?.method === 'POST' && path.endsWith('/interrupt')) mutations.interrupts++;
      if (init?.method === 'DELETE') mutations.deletes++;
      return fetch(url, init);
    };
    const native = createNativeSessionClient({ baseUrl, password, directory: join(work, 'workspace'), expectedPid: child.pid, timeoutMs: 5000, fetch: transport });
    record.phase = 'session_create'; await native.create(receipt, admission);
    record.phase = 'prompt_ack';
    const messageID = createNativeMessageID(), text = 'Synthetic local wire probe. Reply with fixture.';
    const promptHash = createHash('sha256').update(text, 'utf8').digest('hex');
    const ack = await native.prompt(receipt, { messageID, text }, admission);
    check(ack.status === 'accepted', 'fixture_prompt_ack'); record.promptAccepted = true;
    record.phase = 'observe';
    const observationStart = Date.now(), observationEnd = Math.min(deadline, observationStart + summary.observationWindowMs);
    const cancellation = scenario === 'cancel' ? cancellationFixture(native, receipt, messageID, promptHash) : null;
    if (cancellation) {
      while (Date.now() < observationEnd) {
        if (record.partialChunkSent && (await native.active(receipt, admission)).active && !record.providerConnectionClosed) {
          record.activeBeforeCancel = true;
          break;
        }
        await sleep(100);
      }
      check(record.activeBeforeCancel, 'fixture_not_active_before_cancel');
      record.phase = 'cancel';
      const { lifecycle, turn } = cancellation;
      let cancelled = await lifecycle.cancel(turn);
      while (cancelled.status !== 'saved' && Date.now() < observationEnd) {
        await sleep(100);
        cancelled = await lifecycle.status(turn);
      }
      record.cancelStatus = cancelled.status;
    }
    while (Date.now() < observationEnd) {
      const state = await native.get(receipt, admission), active = await native.active(receipt, admission);
      record.activeAtEnd = active.active;
      record.terminal = state.outcome !== undefined && state.time.busy !== undefined && state.time.idle !== undefined && state.time.idle >= state.time.busy && !active.active;
      if (record.terminal || record.wireChecks.some(fields => !Object.values(fields).every(value => value === true))) break;
      await sleep(250);
    }
    record.observedMs = Date.now() - observationStart;
    const messages = await native.messages(receipt, admission);
    const state = await native.get(receipt, admission);
    const finalActive = await native.active(receipt, admission);
    const correlated = correlateNativeTurn({ messageID, promptHash }, state, finalActive.active, messages);
    record.correlation = { state: correlated.state, outcome: correlated.state === 'terminal' ? correlated.outcome : null, syntheticTextMatches: correlated.state === 'terminal' && correlated.outcome === 'succeeded' ? correlated.serializedAnswer === 'Synthetic fixture reply.' : null };
    const user = messages.find(message => message.type === 'user'), assistant = messages.find(message => message.type === 'assistant'), idle = messages.at(-1);
    record.correlationChecks = {
      userIDMatches: user?.id === messageID, promptHashMatches: user?.type === 'user' && createHash('sha256').update(user.text, 'utf8').digest('hex') === promptHash,
      messageTimesOrdered: messages.every((message, index) => index === 0 || message.created >= messages[index - 1].created),
      busyAtOrAfterUser: state.time.busy >= user?.created, idleAtOrAfterBusy: state.time.idle >= state.time.busy,
      idleMessageAtOrAfterBusy: idle?.created >= state.time.busy, assistantAtOrAfterUser: assistant?.created >= user?.created,
      assistantAtOrAfterBusy: assistant?.created >= state.time.busy,
      assistantCompletedAtOrBeforeIdleMessage: assistant?.completed <= idle?.created, assistantCompletedAtOrBeforeSessionIdle: assistant?.completed <= state.time.idle,
    };
    record.messages = {
      types: messages.map(message => message.type), hasUser: messages.some(message => message.type === 'user'),
      assistants: messages.filter(message => message.type === 'assistant').map(message => ({ completed: message.completed !== undefined, failed: message.failed, retrying: message.retrying })),
      idleOutcomes: messages.filter(message => message.type === 'idle').map(message => message.outcome),
      stateOutcome: state.outcome ?? null, busyPresent: state.time.busy !== undefined, idlePresent: state.time.idle !== undefined,
    };
    check(record.attempts > 0 && record.rejectedPaths === 0, 'fixture_no_completion_wire');
    check(record.wireChecks.every(fields => Object.values(fields).every(value => value === true)), 'wire_policy_not_preserved');
    record.policyForwarded = true;
    record.retryGate = record.attempts > 1 ? 'failed_native_retries_observed' : record.terminal ? 'pass_single_attempt_terminal' : 'unverified_window_ended';
    check(record.terminal && record.attempts === 1, 'retry_not_single_terminal');
    const expectedOutcome = cancellation ? 'interrupted' : scenario === 'success' ? 'succeeded' : 'failed';
    check(record.messages.stateOutcome === expectedOutcome, 'unexpected_terminal_outcome');
    check(record.messages.hasUser && record.messages.idleOutcomes.at(-1) === expectedOutcome
      && (cancellation || (record.messages.assistants.length === 1 && record.messages.assistants[0].completed && !record.messages.assistants[0].retrying)), 'terminal_message_evidence');
    check(record.correlation.state === 'terminal' && record.correlation.outcome === expectedOutcome && (scenario !== 'success' || record.correlation.syntheticTextMatches), 'terminal_turn_correlation');
    if (cancellation) {
      record.phase = 'cancel_cleanup';
      const { lifecycle, turn, outcome } = cancellation;
      check(record.cancelStatus === 'saved' && record.providerConnectionClosed, 'cancel_not_saved_or_provider_open');
      check((await lifecycle.cancel(turn)).status === 'saved', 'repeat_cancel_not_saved');
      check((await lifecycle.cleanup(turn)).status === 'retired', 'cancel_cleanup_not_retired');
      check((await lifecycle.cleanup(turn)).status === 'retired', 'repeat_cleanup_not_retired');
      check((await native.absence(receipt, admission)).absent, 'cancelled_session_still_exists');
      record.lifecycle = outcome();
      record.nativeMutations = mutations;
      check(record.lifecycle.fixedCancellationAnswer && record.lifecycle.runtimeRetired
        && record.lifecycle.terminalReason === 'cancelled' && record.lifecycle.nativeOutcome === 'interrupted', 'cancel_journal_result');
      check(mutations.prompts === 1 && mutations.interrupts === 1 && mutations.deletes === 1, 'duplicate_native_mutation');
    }
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
  const hooks = [];
  await noRetry.setup({ session: { hook: async (name, callback) => { hooks.push({ name, callback }); } } });
  check(hooks.length === 1 && hooks[0].name === 'retry', 'offline_hook_registration');
  for (const decision of [{ retry: true, delay: 1000 }, { retry: false }]) {
    const event = { decision }; hooks[0].callback(event);
    check(JSON.stringify(event.decision) === '{"retry":false}', 'offline_hook_veto');
  }
  summary.offlineHook = 'pass_single_retry_hook_unconditional_veto';
  for (const scenario of ['429', '503', 'drop', 'success', 'cancel']) await runCase(scenario);
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
