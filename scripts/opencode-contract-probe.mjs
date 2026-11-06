// Provider-free, isolated 2.2.2 read-only capability probe. Never logs responses or secrets.
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, basename, relative, isAbsolute } from 'node:path';
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { createServer } from 'node:net';
import { once } from 'node:events';
import { createNativeInspectionClient } from '../Panda-agent/src/opencode/inspection-client.ts';
import { createNativeSessionClient } from '../Panda-agent/src/opencode/session-client.ts';
import { createNativeReceipt } from '../Panda-agent/src/opencode/session-contracts.ts';

const executable = resolve('tmp/opencode-2.2.2-review/opencode.exe');
if (process.argv.slice(2).some(arg => arg !== '--sessions') || process.argv.length > 3) throw Error('invalid_probe_argument');
const sessionProbe = process.argv[2] === '--sessions';
const output = resolve(`docs/agent-experience-upgrade/${sessionProbe ? 'opencode-session-probe' : 'opencode-probe'}.json`);
const root = await mkdtemp(join(tmpdir(), 'panda-opencode-probe-'));
const summary = {version: '2.2.2', scope: sessionProbe ? 'isolated provider-free disposable native session probe' : 'isolated provider-free read-only local probe', checks: {}, noPromptsOrExternalCallsRequested: true, runtimeOrProviderReady: false};
let child, exited;
try {
  for (const dir of ['home', 'programdata', 'tmp', 'config', 'data', 'cache', 'state', 'workspace']) await mkdir(join(root, dir));
  // Reviewed original: Panda-agent/runtime/opencode/opencode.json in the preserved checkout.
  const config = {permissions:[{action:'*',resource:'*',effect:'deny'}],policies:['tool.use','provider.use','integration.use'].map(action=>({action,resource:'*',effect:'deny'})),mcp:{servers:{}},plugins:[],skills:[],update:'disable',share:'disabled'};
  const configPath = join(root, 'config', 'opencode.json');
  await writeFile(configPath, JSON.stringify(config), {flag:'wx'});
  const server = createServer(); server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const port = server.address().port; await new Promise((ok, fail) => server.close(error => error ? fail(error) : ok()));
  const password = randomBytes(32).toString('hex');
  const env = Object.fromEntries(['SystemRoot','WINDIR','COMSPEC','PATHEXT'].filter(k => process.env[k]).map(k => [k, process.env[k]]));
  Object.assign(env, {PATH: join(process.env.SystemRoot, 'System32'), USERPROFILE:join(root,'home'), ProgramData:join(root,'programdata'), TEMP:join(root,'tmp'), TMP:join(root,'tmp'), XDG_DATA_HOME:join(root,'data'), XDG_CONFIG_HOME:join(root,'config'), XDG_CACHE_HOME:join(root,'cache'), XDG_STATE_HOME:join(root,'state'), OPENCODE_CONFIG_DIR:join(root,'config'), OPENCODE_CONFIG:configPath, OPENCODE_CONFIG_PROJECT_DISABLE:'true', OPENCODE_DISABLE_CLAUDE_CODE:'true', OPENCODE_DISABLE_CLAUDE_CODE_SKILLS:'true', OPENCODE_DISABLE_MODELS_FETCH:'true', OPENCODE_FILEWATCHER_DISABLE:'true', OPENCODE_DISABLE_FFF:'true', OPENCODE_PASSWORD:password, HTTP_PROXY:'http://127.0.0.1:9', HTTPS_PROXY:'http://127.0.0.1:9', NO_PROXY:'127.0.0.1,localhost'});
  child = spawn(executable, ['serve','--hostname','127.0.0.1','--port',String(port)], {cwd:join(root,'workspace'), env, stdio:'ignore', windowsHide:true});
  exited = new Promise(done => {child.once('exit', (code, signal) => done({code, signal})); child.once('error', () => done({error:true}));});
  const base = `http://127.0.0.1:${port}`, auth = `Basic ${Buffer.from(`opencode:${password}`).toString('base64')}`;
  async function get(path, authenticated = true) {
    const response = await fetch(base + path, {headers: authenticated ? {authorization:auth} : {}, redirect:'error', signal:AbortSignal.timeout(3000)});
    if (!response.body) throw Error('missing_body');
    const reader = response.body.getReader(), chunks = []; let size = 0;
    try { while (true) { const part = await reader.read(); if (part.done) break; size += part.value.length; if (size > 1_000_000) { await reader.cancel(); throw Error('response_too_large'); } chunks.push(part.value); } }
    finally { reader.releaseLock(); }
    return {status:response.status, data:response.ok ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : null};
  }
  let info;
  for (let i=0; i<80; i++) {
    try {info = await get('/api/info'); if (info.status === 200) break;} catch { /* startup */ }
    if (child.exitCode !== null || child.signalCode !== null) throw Error('server_exited_before_ready');
    await new Promise(done=>setTimeout(done,250));
  }
  if (!info || info.status !== 200 || info.data.version !== '2.2.2' || info.data.pid !== child.pid) throw Error('runtime_identity_unverified');
  summary.checks.authenticatedInfo = {status:info.status, versionMatches:true, pidMatchesSpawnedChild:true};
  const anon = await get('/api/info',false); summary.checks.anonymousInfo = {status:anon.status};
  if (anon.status !== 401) throw Error('anonymous_not_denied');
  // The native model-list endpoint waits for plugin/policy activation. The
  // application adapter must use that barrier before reporting skill discovery.
  const inspected = await createNativeInspectionClient({baseUrl:base, password, timeoutMs:5000}).inspect();
  summary.checks.applicationInspectionAdapter = {result:'unverified', projection:inspected};
  const loaded = await get('/api/config');
  if (loaded.status !== 200 || !Array.isArray(loaded.data)) throw Error('config_shape_unexpected');
  const infos = loaded.data.map(x => x && typeof x === 'object' ? x.info : null).filter(Boolean);
  const reviewed = infos.some(x => JSON.stringify(x.permissions) === JSON.stringify(config.permissions) && JSON.stringify(x.policies) === JSON.stringify(config.policies) && Array.isArray(x.plugins) && x.plugins.length === 0 && Array.isArray(x.skills) && x.skills.length === 0 && x.update === 'disable' && x.share === 'disabled');
  const pathClass = value => { if (typeof value !== 'string' || !isAbsolute(value)) return 'missing'; const rel = relative(root, value); return rel === '' || (!rel.startsWith('..' + (process.platform === 'win32' ? '\\' : '/')) && rel !== '..' && !isAbsolute(rel)) ? 'inside' : 'outside'; };
  const skillPath = value => {
    if (typeof value !== 'string' || !value) return {kind:'missing'};
    if (isAbsolute(value)) return {kind:'absolute', location:pathClass(value)};
    const scheme = /^([a-z][a-z0-9+.-]{1,20}):/i.exec(value);
    return scheme ? {kind:'uri', scheme:scheme[1].toLowerCase()} : {kind:'relative'};
  };
  const safeKeys = new Set(['permissions','policies','mcp','plugins','skills','update','share','providers','model','agents','instructions','references','commands','experimental','shell']);
  summary.checks.config = {status:loaded.status, array:true, documentCount:loaded.data.length, reviewedFieldsMatch:reviewed, entries:loaded.data.map(entry => ({type: ['document','directory'].includes(entry?.type) ? entry.type : 'unknown', path: pathClass(entry?.path), keys: entry?.info && typeof entry.info === 'object' ? Object.keys(entry.info).filter(key => safeKeys.has(key)).sort() : []}))};
  if (!reviewed) throw Error('loaded_config_unverified');
  for (const [label,path] of [['skills','/api/skill'],['mcp','/api/mcp'],['models','/api/model']]) {
    const result = await get(path);
    const data = result.data && typeof result.data === 'object' ? result.data.data : undefined;
    summary.checks[label] = {status:result.status, dataArray:Array.isArray(data), ...(Array.isArray(data) ? {count:data.length} : {})};
    if (result.status !== 200 || !Array.isArray(data)) throw Error('endpoint_shape_unexpected');
    if (label === 'skills') summary.checks.skills.entries = data.map(skill => ({path:skillPath(skill?.path), ...(typeof skill?.name === 'string' && /^[a-z0-9][a-z0-9 -]{0,63}$/i.test(skill.name) ? {name:skill.name} : {}), matchesPinnedBuiltin: (skill?.name === 'OpenCode' && skill?.path === '/builtin/opencode.md') || (skill?.name === 'Report' && skill?.path === '/builtin/report.md')}));
  }
  if (inspected.version !== '2.2.2' || inspected.status !== 'discovery_only' || inspected.execution !== 'not_execution_ready' || inspected.counts.skills !== summary.checks.skills.count || inspected.counts.mcpServers !== summary.checks.mcp.count || inspected.counts.models !== summary.checks.models.count) throw Error('adapter_projection_mismatch');
  summary.checks.applicationInspectionAdapter = {result:'pass', projection:inspected};
  if (sessionProbe) {
    if (inspected.counts.models !== 0 || inspected.counts.skills !== 0 || inspected.counts.mcpServers !== 0) throw Error('fixture_not_denied');
    const receipt = createNativeReceipt('playground', 'a'.repeat(64));
    const receiptPath = join(root, 'session-receipt.json');
    await writeFile(receiptPath, JSON.stringify(receipt), {flag:'wx'});
    const access = async candidate => JSON.stringify(candidate) === await readFile(receiptPath, 'utf8');
    summary.checks.nativeSessionAdapter = {result:'unverified',phase:'create'};
    const native = createNativeSessionClient({baseUrl:base, password, directory:join(root,'workspace'), timeoutMs:5000});
    const created = await native.create(receipt, access);
    summary.checks.nativeSessionAdapter.phase = 'get';
    const state = await native.get(receipt, access);
    summary.checks.nativeSessionAdapter.phase = 'active';
    const active = await native.active(receipt, access);
    summary.checks.nativeSessionAdapter.phase = 'messages';
    const wireHistory = await get(`/api/session/${receipt.sessionID}/message?limit=100&order=asc`);
    summary.checks.nativeSessionAdapter.messageShape = {status:wireHistory.status, keys:Object.keys(wireHistory.data), count:Array.isArray(wireHistory.data.data)?wireHistory.data.data.length:null, cursor:wireHistory.data.cursor === null ? 'null' : typeof wireHistory.data.cursor, cursorFields:wireHistory.data.cursor && Object.fromEntries(Object.entries(wireHistory.data.cursor).map(([key,value])=>[key,value===null?'null':typeof value]))};
    const history = await native.messages(receipt, access);
    summary.checks.nativeSessionAdapter.phase = 'interrupt';
    if (active.active || history.length || created.outcome !== undefined || state.outcome !== undefined) throw Error('unexpected_disposable_session_state');
    const interrupt = await native.interrupt(receipt, access);
    if (interrupt.status === 'cancelled') throw Error('unstarted_session_falsely_cancelled');
    summary.checks.nativeSessionAdapter = {result:'pass', durableFixtureReceipt:true, createAndOwnedRead:true, active:false, historyCount:history.length, unstartedInterrupt:interrupt.status, admission:'disposable file callback; not real application ownership or database isolation'};
  }
  summary.result = 'completed';
} catch (error) { summary.result = 'stopped'; summary.reason = /^[a-z_]+$/.test(error.message) ? error.message : 'probe_error'; }
finally {
  if (child) {
    if (child.exitCode === null && child.signalCode === null) child.kill();
    const result = await Promise.race([exited, new Promise(done=>setTimeout(()=>done(null),5000))]);
    summary.childStopped = Boolean(result);
  } else summary.childStopped = true;
  const expectedRoot = resolve(tmpdir());
  if (summary.childStopped && resolve(root).startsWith(expectedRoot + (process.platform === 'win32' ? '\\' : '/')) && basename(root).startsWith('panda-opencode-probe-')) {
    await rm(root, {recursive:true, force:true}); summary.fixtureRemoved = true;
  } else summary.fixtureRemoved = false;
  await writeFile(output, JSON.stringify(summary, null, 2) + '\n');
}
console.log(JSON.stringify(summary, null, 2));
if (summary.result !== 'completed' || !summary.childStopped || !summary.fixtureRemoved) process.exitCode = 1;
