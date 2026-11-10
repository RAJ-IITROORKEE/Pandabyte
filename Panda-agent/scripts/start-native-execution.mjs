// Dedicated, per-turn local process. The caller must bind the gateway to one owned run.
import { createReadStream } from 'node:fs';
import { lstat, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { createHash, randomBytes } from 'node:crypto';
import { spawn, execFile, execFileSync } from 'node:child_process';
import { promisify } from 'node:util';
import { createServer } from 'node:net';
import { once } from 'node:events';
import { basename, dirname, join, relative, resolve, sep, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inspectionEnvironment } from './start-native-inspection.mjs';
import { executionConfig, executionIdentityMatches, nativeExecutionVersion, nativeModel, nativeProviderID, verifiedExecutionConfig } from '../src/opencode/execution-runtime.ts';

const workspace = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const required = value => { if (!value) throw Error('native_execution_unavailable'); };
const hash = value => createHash('sha256').update(value).digest('hex');
const inside = (parent, path) => { const rel = relative(parent,path); return !!rel && rel !== '..' && !rel.startsWith('..' + sep) && !isAbsolute(rel); };
const sleep = ms => new Promise(done => setTimeout(done,ms));
async function digest(path) { const stream = createHash('sha256'); for await (const chunk of createReadStream(path)) stream.update(chunk); return stream.digest('hex'); }
async function freePort() { const s = createServer(); s.listen(0,'127.0.0.1'); await once(s,'listening'); const port = s.address().port; await new Promise((done,fail) => s.close(error => error ? fail(error) : done())); return port; }

/** Read-only readiness; every execution still revalidates the binary and effective runtime. */
export async function nativeExecutionAvailable(workspaceRoot = workspace) {
  try {
    if (process.platform !== 'win32' || !isAbsolute(workspaceRoot) || await realpath(workspaceRoot) !== resolve(workspaceRoot)) return false;
    const executable = join(workspaceRoot,'tmp','opencode-2.2.6-review','package','bin','opencode.exe');
    const stat = await lstat(executable);
    return stat.isFile() && !stat.isSymbolicLink() && stat.size === 265650568
      && await digest(executable) === '98cb0aa854c7c015cf6febafa7afb872c359bfe5a823a526f3b4fd347a9e9677'
      && hash(await readFile(join(workspaceRoot,'Panda-agent','runtime','opencode','plugins','no-retry.ts'))) === '80f2ba05e00389eb200e53f0ee3e4c663627c7abda8cf36bd72e94d40d30a12e';
  } catch { return false; }
}

/** Server-only: caller supplies a loopback gateway with its own per-run admission. */
export async function startNativeExecution({ gatewayUrl, token, workspaceRoot = workspace, signal = AbortSignal.timeout(120000) }) {
  required(process.platform === 'win32' && typeof token === 'string' && /^[a-f0-9]{64}$/.test(token) && !signal.aborted);
  required(isAbsolute(workspaceRoot) && await realpath(workspaceRoot) === resolve(workspaceRoot));
  const executable = join(workspaceRoot,'tmp','opencode-2.2.6-review','package','bin','opencode.exe');
  const stat = await lstat(executable);
  required(stat.isFile() && !stat.isSymbolicLink() && stat.size === 265650568 && await digest(executable) === '98cb0aa854c7c015cf6febafa7afb872c359bfe5a823a526f3b4fd347a9e9677');
  let root, identity, parent, marker, child, exited, closed = false, ready = false;
  const controller = new AbortController(), bounded = AbortSignal.any([signal,controller.signal]);
  async function close({ preserveContext = false } = {}) {
    required(typeof preserveContext === 'boolean');
    if (closed) return; closed = true; ready = false; controller.abort();
    let stopped = !child;
    if (child) { if (child.exitCode === null && child.signalCode === null) child.kill(); let timer; try { stopped = await Promise.race([exited,new Promise(done => { timer=setTimeout(() => done(false),5000); })]); } finally { clearTimeout(timer); } }
    if (root && stopped && !preserveContext) { const stat = await lstat(root); required(inside(parent,root) && basename(root).startsWith('pandabyte-native-execution-') && await readFile(join(root,'.pandabyte-marker'),'utf8') === marker && stat.isDirectory() && !stat.isSymbolicLink() && stat.dev === identity.dev && stat.ino === identity.ino && await realpath(root) === root); await rm(root,{recursive:true,force:true}); }
    required(stopped);
  }
  try {
        for (const candidate of ['C:\\ProgramData\\PandaByte\\AgentRuntime','C:\\PandaByteAgentRuntime']) {
      try {
        await mkdir(candidate,{recursive:true});
        const parentStat=await lstat(candidate), actual=await realpath(candidate);
        required(parentStat.isDirectory() && !parentStat.isSymbolicLink() && actual.toLowerCase() === resolve(candidate).toLowerCase());
        parent=actual; root=await realpath(await mkdtemp(join(parent,'pandabyte-native-execution-'))); break;
      } catch { parent=undefined; root=undefined; }
    }
    required(root && parent);
    // Protect the new instance before writing config, auth, or session data.
    execFileSync(join(process.env.SystemRoot ?? 'C:\\Windows','System32','WindowsPowerShell','v1.0','powershell.exe'),['-NoProfile','-NonInteractive','-Command',
      "$ErrorActionPreference='Stop';$p=[Console]::In.ReadToEnd();$sid=[System.Security.Principal.WindowsIdentity]::GetCurrent().User;$a=[System.Security.AccessControl.DirectorySecurity]::new();$a.SetOwner($sid);$a.SetAccessRuleProtection($true,$false);foreach($id in @($sid,[System.Security.Principal.SecurityIdentifier]::new('S-1-5-18'),[System.Security.Principal.SecurityIdentifier]::new('S-1-5-32-544'))){$a.AddAccessRule([System.Security.AccessControl.FileSystemAccessRule]::new($id,'FullControl','ContainerInherit,ObjectInherit','None','Allow'))};[System.IO.Directory]::SetAccessControl($p,$a)"],{input:root,windowsHide:true,timeout:5000,stdio:['pipe','ignore','ignore']});
    identity=await lstat(root); marker=randomBytes(32).toString('hex');
    await writeFile(join(root,'.pandabyte-marker'),marker,{flag:'wx',mode:0o600});
    for (const dir of ['home','programdata','tmp','config','data','cache','state','workspace','retry-plugin']) await mkdir(join(root,dir));
    const pluginDirectory = join(root,'retry-plugin');
    const plugin = await readFile(join(workspaceRoot,'Panda-agent','runtime','opencode','plugins','no-retry.ts'));
    required(hash(plugin) === '80f2ba05e00389eb200e53f0ee3e4c663627c7abda8cf36bd72e94d40d30a12e');
    await writeFile(join(pluginDirectory,'no-retry.ts'),plugin,{flag:'wx'});
    await writeFile(join(pluginDirectory,'package.json'),JSON.stringify({name:'panda-no-retry-local',type:'module',exports:{'.':'./no-retry.ts'}}),{flag:'wx'});
    const config = executionConfig(gatewayUrl,pluginDirectory), bytes = JSON.stringify(config), configHash = hash(bytes), generation = randomBytes(32).toString('hex');
    await writeFile(join(root,'config','opencode.json'),bytes,{flag:'wx',mode:0o600});
    const password = randomBytes(32).toString('hex'), env = inspectionEnvironment(root,password); env.PANDA_NATIVE_TOKEN = token; env.APPDATA = join(root,'home'); env.LOCALAPPDATA = join(root,'home');
    const version = await promisify(execFile)(executable,['--version'],{cwd:join(root,'workspace'),env,windowsHide:true,timeout:5000,maxBuffer:256,signal:bounded});
    required(/^opencode v2\.2\.6\s*$/.test(version.stdout));
    const baseUrl = `http://127.0.0.1:${await freePort()}`;
    child = spawn(executable,['serve','--hostname','127.0.0.1','--port',new URL(baseUrl).port],{cwd:join(root,'workspace'),env,windowsHide:true,stdio:'ignore'});
    exited = new Promise(done => { child.once('exit',() => done(true)); child.once('error',() => done(true)); });
    const descriptor = Object.freeze({version:nativeExecutionVersion,pid:child.pid,baseUrl,directory:join(root,'workspace'),configHash,generation});
    async function get(path) {
      const response = await fetch(baseUrl+path,{headers:{Accept:'application/json',Authorization:'Basic '+Buffer.from('opencode:'+password).toString('base64'),'x-opencode-directory':encodeURIComponent(descriptor.directory)},redirect:'error',cache:'no-store',signal:AbortSignal.any([bounded,AbortSignal.timeout(3000)])});
      required(response.status === 200 && !response.redirected && /^application\/json(?:\s*;|$)/i.test(response.headers.get('content-type') ?? '') && response.body);
      const chunks=[]; let size=0; for await (const chunk of response.body) { size+=chunk.length; required(size<=1000000); chunks.push(chunk); }
      return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks)));
    }
    async function current() {
      if (!ready || bounded.aborted || child.exitCode !== null || child.signalCode !== null) return false;
      try {
        const [info,loaded,plugins,models,skills,mcp] = await Promise.all(['/api/info','/api/config','/api/plugin','/api/model','/api/skill','/api/mcp'].map(get));
        return executionIdentityMatches(descriptor,info,generation,configHash) && hash(await readFile(join(root,'config','opencode.json'))) === configHash
          && verifiedExecutionConfig(loaded,config,root) && await digest(join(pluginDirectory,'no-retry.ts')) === '80f2ba05e00389eb200e53f0ee3e4c663627c7abda8cf36bd72e94d40d30a12e' && Array.isArray(plugins.data) && plugins.data.filter(item => item.source?.type === 'local').length === 1
          && plugins.data.some(item => item.id === 'panda-no-retry' && item.state?.status === 'active')
          && Array.isArray(skills.data) && skills.data.length === 0 && Array.isArray(mcp.data) && mcp.data.length === 0
          && Array.isArray(models.data) && models.data.length === 1 && models.data[0].providerID === nativeProviderID && models.data[0].id === nativeModel;
      } catch { return false; }
    }
    const deadline=Date.now()+25000;
    while (Date.now()<deadline && !bounded.aborted) { ready=true; if (await current()) break; ready=false; required(child.exitCode===null && child.signalCode===null); await sleep(100); }
    required(ready && await current());
    return {descriptor,password,current,close};
  } catch (error) { await close(); throw error; }
}
