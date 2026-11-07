// Development inspection only. This supervisor never creates a session or sends a prompt.
import { createReadStream } from 'node:fs';
import { lstat, mkdir, mkdtemp, open, realpath, rm, unlink, writeFile } from 'node:fs/promises';
import { createHash, randomBytes } from 'node:crypto';
import { execFile, execFileSync, spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:net';
import { once } from 'node:events';
import { promisify } from 'node:util';
import { createNativeInspectionClient } from '../src/opencode/inspection-client.ts';
import { readNativeRuntimeFile } from '../src/server/native-runtime-file.ts';

const version = '2.2.2';
const binaryHash = 'e49134e14f29f0ab586035c3e6e486a7aa9c3e721d556661eff9f4eee0e1dae4';
// Official npm archive integrity retained in docs/agent-experience-upgrade/capability-contract.md.
const archiveIntegrity = 'tFS9vYp0/+VOeYpcWvAy1e2iMEx6x5/XagVpwtjG33ocvumn5R2qaKGhqhI56Wu8Hfet+VYaw8nwbx9BqxJCqQ==';
let stage = 'arguments';
const requireValue = value => { if (!value) throw Error('local_inspection_unavailable'); };
const inside = (parent, path) => { const rel = relative(parent, path); return Boolean(rel) && rel !== '..' && !rel.startsWith('..' + sep) && !isAbsolute(rel); };
const sameFile = (a, b) => a.dev === b.dev && a.ino === b.ino && !a.isSymbolicLink() && a.isFile() && a.nlink === 1;

export function descriptorTarget(args, workspace) {
  requireValue(args.length === 2 && args[0] === '--descriptor' && typeof args[1] === 'string' && args[1].length <= 4096
    && args[1].isWellFormed() && !/[\u0000-\u001f\u007f]/.test(args[1]) && isAbsolute(args[1]) && resolve(args[1]) === args[1]
    && inside(join(workspace, 'private'), args[1]) && /^[A-Za-z0-9][A-Za-z0-9._-]{0,100}\.json$/.test(basename(args[1])));
  return args[1];
}

async function privateParent(workspace, path) {
  requireValue(descriptorTarget(['--descriptor', path], workspace) === path);
  let current = workspace;
  for (const part of ['', ...relative(workspace, dirname(path)).split(sep)]) {
    current = join(current, part);
    const stat = await lstat(current);
    requireValue(stat.isDirectory() && !stat.isSymbolicLink() && await realpath(current) === current);
  }
}

// Claim without replacing any stale or active lease. Harden the empty file before writing secrets.
export async function createDescriptorLease(workspace, path, generation) {
  requireValue(typeof generation === 'string' && /^[a-f0-9]{64}$/.test(generation));
  await privateParent(workspace, path);
  const file = await open(path, 'wx', 0o600);
  const identity = await file.stat();
  let published = false;
  const release = async () => {
    await file.close().catch(() => {});
    try {
      await privateParent(workspace, path);
      if (!sameFile(await lstat(path), identity)) return false;
      const current = published ? await readNativeRuntimeFile(path) : null;
      if (published ? current?.generation !== generation : (await lstat(path)).size !== 0) return false;
      if (!sameFile(await lstat(path), identity)) return false;
      await unlink(path); return true;
    } catch { return false; }
  };
  try {
    if (process.platform === 'win32') execFileSync(join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'), ['-NoProfile','-NonInteractive','-Command',
      "$ErrorActionPreference='Stop';[Console]::InputEncoding=[System.Text.UTF8Encoding]::new($false);$p=[Console]::In.ReadToEnd();$sid=[System.Security.Principal.WindowsIdentity]::GetCurrent().User;$a=[System.Security.AccessControl.FileSecurity]::new();$a.SetOwner($sid);$a.SetAccessRuleProtection($true,$false);$a.AddAccessRule([System.Security.AccessControl.FileSystemAccessRule]::new($sid,'FullControl','Allow'));[System.IO.File]::SetAccessControl($p,$a)"], {input:path,windowsHide:true,timeout:5000,stdio:['pipe','ignore','ignore']});
    return {
      async publish(value) {
        requireValue(!published && value?.generation === generation && Object.keys(value).sort().join(',') === 'baseUrl,configHash,directory,generation,password,pid,version');
        await privateParent(workspace, path);
        requireValue(sameFile(await lstat(path), identity));
        published = true;
        await file.writeFile(JSON.stringify(value)); await file.sync();
        const current = await readNativeRuntimeFile(path);
        requireValue(current?.generation === generation && JSON.stringify(current) === JSON.stringify(value));
      },
      release,
    };
  } catch (error) { await release(); throw error; }
}

export function inspectionConfig() {
  return {permissions:[{action:'*',resource:'*',effect:'deny'}],policies:['tool.use','provider.use','integration.use'].map(action => ({action,resource:'*',effect:'deny'})),mcp:{servers:{}},plugins:[],skills:[],update:'disable',share:'disabled'};
}

export function matchesPinnedVersion(output) {
  if (typeof output !== 'string' || output.length > 128) return false;
  const versions = [...output.matchAll(/(?<![\d.])v?(\d+\.\d+\.\d+(?:[-+][\w.-]+)?)(?![\w.])/gi)];
  return versions.length === 1 && versions[0][1] === version;
}

export function inspectionEnvironment(root, password, source = process.env) {
  requireValue(isAbsolute(root) && typeof password === 'string' && /^[a-f0-9]{64}$/.test(password) && isAbsolute(source.SystemRoot ?? ''));
  const env = Object.fromEntries(['SystemRoot','WINDIR','COMSPEC','PATHEXT'].filter(key => typeof source[key] === 'string').map(key => [key, source[key]]));
  return Object.assign(env, {
    PATH:join(source.SystemRoot,'System32'), HOME:join(root,'home'), USERPROFILE:join(root,'home'), ProgramData:join(root,'programdata'), TEMP:join(root,'tmp'), TMP:join(root,'tmp'),
    XDG_DATA_HOME:join(root,'data'), XDG_CONFIG_HOME:join(root,'config'), XDG_CACHE_HOME:join(root,'cache'), XDG_STATE_HOME:join(root,'state'),
    OPENCODE_CONFIG_DIR:join(root,'config'), OPENCODE_CONFIG:join(root,'config','opencode.json'), OPENCODE_CONFIG_PROJECT_DISABLE:'true',
    OPENCODE_DISABLE_CLAUDE_CODE:'true', OPENCODE_DISABLE_CLAUDE_CODE_SKILLS:'true', OPENCODE_DISABLE_MODELS_FETCH:'true', OPENCODE_FILEWATCHER_DISABLE:'true', OPENCODE_DISABLE_FFF:'true', OPENCODE_PASSWORD:password,
    HTTP_PROXY:'http://127.0.0.1:9', HTTPS_PROXY:'http://127.0.0.1:9', ALL_PROXY:'http://127.0.0.1:9', NO_PROXY:'127.0.0.1',
    http_proxy:'http://127.0.0.1:9', https_proxy:'http://127.0.0.1:9', all_proxy:'http://127.0.0.1:9', no_proxy:'127.0.0.1',
  });
}

async function digest(path, algorithm, encoding, size) {
  const stat = await lstat(path); requireValue(stat.isFile() && !stat.isSymbolicLink() && stat.size === size);
  const hash = createHash(algorithm); let bytes = 0;
  for await (const chunk of createReadStream(path)) { bytes += chunk.length; requireValue(bytes <= size); hash.update(chunk); }
  requireValue(bytes === size);
  return hash.digest(encoding);
}

async function get(base, password, path, signal) {
  const bounded = AbortSignal.any([signal, AbortSignal.timeout(3000)]);
  const response = await fetch(base + path, {method:'GET',headers:{Accept:'application/json',Authorization:`Basic ${Buffer.from(`opencode:${password}`).toString('base64')}`},redirect:'error',cache:'no-store',credentials:'omit',signal:bounded});
  requireValue(response.status === 200 && !response.redirected && /^application\/json(?:\s*;[^\r\n]*)?$/i.test(response.headers.get('content-type') ?? '') && response.body);
  const reader = response.body.getReader(), chunks = []; let size = 0;
  try {
    while (true) { const part = await reader.read(); bounded.throwIfAborted(); if (part.done) break; size += part.value.length; requireValue(size <= 1_000_000); chunks.push(part.value); }
    return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks)));
  } finally { void reader.cancel().catch(() => {}); reader.releaseLock(); }
}

export function verifiedConfig(loaded, config, root) {
  return Array.isArray(loaded) && loaded.length > 0 && loaded.length <= 10
    && loaded.every(entry => typeof entry?.path === 'string' && isAbsolute(entry.path) && inside(root, resolve(entry.path)))
    && loaded.some(entry => resolve(entry.path) === join(root,'config','opencode.json') && entry.info && ['permissions','policies','mcp','plugins','skills','update','share'].every(key => configFieldMatches(entry.info,config,key)));
}

function configFieldMatches(info, config, key) {
  // Pinned /config omits the empty configured MCP field; the live MCP catalog must also be empty.
  return JSON.stringify(info[key]) === JSON.stringify(config[key])
    || (key === 'mcp' && info.mcp === undefined && JSON.stringify(config.mcp) === '{"servers":{}}');
}

async function run(args) {
  requireValue(process.platform === 'win32');
  const workspace = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
  const target = descriptorTarget(args, workspace), generation = randomBytes(32).toString('hex');
  let root, rootIdentity, child, exited, lease;
  const controller = new AbortController();
  const stop = () => controller.abort();
  process.once('SIGINT', stop); process.once('SIGTERM', stop);
  try {
    stage = 'lease';
    lease = await createDescriptorLease(workspace, target, generation);
    controller.signal.throwIfAborted();
    stage = 'provenance';
    const assets = join(workspace,'tmp','opencode-2.2.2-review'), executable = join(assets,'opencode.exe');
    requireValue(await digest(executable,'sha256','hex',254943112) === binaryHash
      && await digest(join(assets,'opencode-cli-windows-x64-2.2.2.tgz'),'sha512','base64',119436377) === archiveIntegrity);
    controller.signal.throwIfAborted();
    stage = 'isolation';
    root = await realpath(await mkdtemp(join(await realpath(tmpdir()),'pandabyte-native-inspection-')));
    rootIdentity = await lstat(root);
    for (const dir of ['home','programdata','tmp','config','data','cache','state','workspace']) await mkdir(join(root,dir));
    const config = inspectionConfig(), configBytes = JSON.stringify(config), configPath = join(root,'config','opencode.json');
    await writeFile(configPath,configBytes,{flag:'wx',mode:0o600});
    const password = randomBytes(32).toString('hex'), env = inspectionEnvironment(root,password);
    stage = 'version';
    const reported = await promisify(execFile)(executable,['--version'],{cwd:join(root,'workspace'),env,windowsHide:true,timeout:5000,maxBuffer:128,signal:controller.signal}).catch(error => {
      stage = error.code === 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER' ? 'version_buffer' : error.killed ? 'version_timeout' : 'version_execution';
      throw Error('local_inspection_unavailable');
    });
    // The pinned CLI decorates its version; the later authenticated HTTP check is exact.
    stage = 'version_value'; requireValue(matchesPinnedVersion(reported.stdout)); controller.signal.throwIfAborted();
    const server = createServer(); server.listen(0,'127.0.0.1'); await once(server,'listening');
    const port = server.address().port; await new Promise((done,fail) => server.close(error => error ? fail(error) : done()));
    // A separate hidden process group leaves Ctrl+C cleanup ordering with this supervisor.
    stage = 'spawn';
    child = spawn(executable,['serve','--hostname','127.0.0.1','--port',String(port)],{cwd:join(root,'workspace'),env,stdio:'ignore',windowsHide:true,detached:true});
    exited = new Promise(done => { child.once('exit',() => { stop(); done(); }); child.once('error',() => { stop(); done(); }); });
    const base = `http://127.0.0.1:${port}`, deadline = Date.now() + 25000;
    stage = 'identity';
    let info;
    while (!controller.signal.aborted && Date.now() < deadline) {
      try { info = await get(base,password,'/api/info',controller.signal); break; } catch { /* Only startup GET readiness is retried; no mutations exist. */ }
      if (!controller.signal.aborted) await new Promise(done => setTimeout(done,100));
    }
    requireValue(info?.version === version && info.pid === child.pid); controller.signal.throwIfAborted();
    stage = 'catalogs';
    const inspected = await createNativeInspectionClient({baseUrl:base,password,timeoutMs:5000}).inspect(controller.signal);
    requireValue(inspected.version === version && inspected.execution === 'not_execution_ready' && inspected.counts.skills === 0 && inspected.counts.models === 0 && inspected.counts.mcpServers === 0);
    stage = 'config';
    const loaded = await get(base,password,'/api/config',controller.signal);
    if (!verifiedConfig(loaded,config,root)) {
      stage = 'config_shape'; requireValue(Array.isArray(loaded) && loaded.length > 0 && loaded.length <= 10);
      stage = 'config_paths'; requireValue(loaded.every(entry => typeof entry?.path === 'string' && isAbsolute(entry.path) && inside(root,resolve(entry.path))));
      stage = 'config_document'; const entry = loaded.find(entry => resolve(entry.path) === configPath); requireValue(entry?.info);
      for (const key of ['permissions','policies','mcp','plugins','skills','update','share']) {
        stage = `config_${key}`;
        requireValue(configFieldMatches(entry.info,config,key));
      }
      throw Error('local_inspection_unavailable');
    }
    stage = 'final_identity';
    const finalInfo = await get(base,password,'/api/info',controller.signal);
    requireValue(finalInfo.version === version && finalInfo.pid === child.pid); controller.signal.throwIfAborted();
    stage = 'descriptor';
    await lease.publish({version:1,generation,pid:child.pid,baseUrl:base,directory:join(root,'workspace'),configHash:createHash('sha256').update(configBytes).digest('hex'),password});
    controller.signal.throwIfAborted(); stage = 'ready'; process.stdout.write('local inspection ready\n');
    await new Promise(done => { if (controller.signal.aborted) done(); else controller.signal.addEventListener('abort',done,{once:true}); });
    requireValue(child.exitCode === null && child.signalCode === null);
  } finally {
    // Invalidate the owned generation before stopping its process; unknown replacements stay untouched.
    await lease?.release();
    let stopped = !child;
    if (child) {
      if (child.exitCode === null && child.signalCode === null) child.kill();
      let timer;
      try { stopped = await Promise.race([exited.then(() => true),new Promise(done => { timer = setTimeout(() => done(false),5000); })]); }
      finally { clearTimeout(timer); }
    }
    if (root && stopped) {
      const parent = await realpath(tmpdir()), stat = await lstat(root);
      requireValue(inside(parent,root) && basename(root).startsWith('pandabyte-native-inspection-') && stat.isDirectory() && !stat.isSymbolicLink()
        && stat.dev === rootIdentity.dev && stat.ino === rootIdentity.ino && await realpath(root) === root);
      await rm(root,{recursive:true,force:true});
    }
    process.removeListener('SIGINT',stop); process.removeListener('SIGTERM',stop);
    requireValue(stopped);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  run(process.argv.slice(2)).catch(() => { process.stderr.write(`local inspection unavailable (${stage})\n`); process.exitCode = 1; });
}
