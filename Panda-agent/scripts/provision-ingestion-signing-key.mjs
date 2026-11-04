// One-shot operator: importing is inert. The database generates the key; no key enters SQL or argv.
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { lstat, open, readFile, realpath } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { verifiedInsforgeCli } from './verified-insforge-cli.mjs';
import { inspectLocalWindowsPrivacy } from '../src/control-room/playground-local-windows.ts';
import { validateTarget } from './rag-vector-audit-readonly.mjs';

const agentRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const sql="INSERT INTO public.panda_agent_ingestion_signing_key(singleton,key_bytes) VALUES (true,public.gen_random_bytes(32)) RETURNING encode(key_bytes,'hex') AS key";
const execute=promisify(execFile);
export const CLI_SHA256='af352bf5f5dd5ffb5f6a5fa3c15cc95f2bc428db30642ff5fcbdc372a568b815';
export async function pinnedCli(input) {const entry=await verifiedInsforgeCli(input);if(createHash('sha256').update(await readFile(entry)).digest('hex')!==CLI_SHA256)throw Error('invalid_cli');return entry;}
const within=(base,target)=>{const r=path.relative(base,target);return r!==''&&r!=='..'&&!r.startsWith('..'+path.sep)&&!path.isAbsolute(r);};
async function anchor(cwd) {
 const dir=await realpath(cwd), config=path.join(dir,'.insforge','project.json');
 const ds=await lstat(path.dirname(config)), f=await lstat(config);
 if(dir===await realpath(agentRoot)||dir===await realpath(path.dirname(agentRoot))||!ds.isDirectory()||ds.isSymbolicLink()||!f.isFile()||f.isSymbolicLink()||f.nlink!==1||await realpath(config)!==config)throw Error('invalid_target');
 return {dir,config,dev:f.dev,ino:f.ino,size:f.size,mtime:f.mtimeMs,ctime:f.ctimeMs};
}
const unchanged=(a,b)=>Object.keys(a).every(k=>a[k]===b[k]);
async function privateOutput(filename,inspect) {
 if(!path.isAbsolute(filename))throw Error('invalid_destination');
 const root=await realpath(path.join(agentRoot,'artifacts')),parent=await realpath(path.dirname(filename));
 if(!within(root,parent)||parent!==path.dirname(path.resolve(filename)))throw Error('invalid_destination');
 const ps=await lstat(parent);
 if(!ps.isDirectory()||ps.isSymbolicLink()||(process.platform!=='win32'&&((ps.mode&0o077)!==0||(typeof process.getuid==='function'&&ps.uid!==process.getuid()))))throw Error('invalid_destination');
 const handle=await open(filename,'wx',0o600);
 try {
  const f=await handle.stat(),current=await lstat(filename);
  if(!f.isFile()||f.nlink!==1||current.isSymbolicLink()||f.dev!==current.dev||f.ino!==current.ino||await realpath(filename)!==filename||(process.platform==='win32'&&!await inspect(filename))||(process.platform!=='win32'&&((f.mode&0o077)!==0||f.uid!==ps.uid)))throw Error('invalid_destination');
  return {handle,dev:f.dev,ino:f.ino};
 } catch {await handle.close();throw Error('invalid_destination');}
}
// Runners and ACL inspection are injectable for offline tests only; CLI never accepts injections.
export async function provision({cwd,cliEntry,filename,environment=process.env,runner=execute,verifyCli=pinnedCli,inspect=inspectLocalWindowsPrivacy}) {
 if(!path.isAbsolute(cwd??'')||!path.isAbsolute(cliEntry??'')||!path.isAbsolute(filename??''))throw Error('invalid_arguments');
 filename=path.resolve(filename);
 const pinned=await anchor(cwd),entry=await verifyCli(cliEntry),env=Object.fromEntries(Object.entries(environment).filter(([name,value])=>value!==undefined&&/^(?:PATH|SYSTEMROOT|WINDIR|TEMP|TMP|USERPROFILE|HOME|APPDATA|LOCALAPPDATA)$/i.test(name)));
 const options={cwd:pinned.dir,env,timeout:45000,maxBuffer:65536,windowsHide:true,encoding:'utf8'};
 const invoke=async args=>{const out=await runner(process.execPath,[entry,...args],options);if(typeof out.stdout!=='string')throw Error('invalid_response');return out.stdout;};
 if((await invoke(['--version'])).trim()!=='0.2.8')throw Error('invalid_cli');
 validateTarget(JSON.parse(await invoke(['current','--json'])));
 if(!unchanged(pinned,await anchor(cwd)))throw Error('invalid_target');
 const output=await privateOutput(filename,inspect);
 try {
  if(!unchanged(pinned,await anchor(cwd)))throw Error('invalid_target');
  const result=JSON.parse(await invoke(['db','query','--json','--',sql]));
  const rows=result?.rows??result?.data;
  if(!Array.isArray(rows)||rows.length!==1||!rows[0]||Object.keys(rows[0]).join(',')!=='key'||typeof rows[0].key!=='string'||!/^[a-f0-9]{64}$/.test(rows[0].key))throw Error('unknown_result');
  const f=await output.handle.stat(),current=await lstat(filename);
  if(!f.isFile()||f.nlink!==1||f.dev!==output.dev||f.ino!==output.ino||current.isSymbolicLink()||current.dev!==f.dev||current.ino!==f.ino||f.size!==0||(process.platform==='win32'&&!await inspect(filename)))throw Error('unknown_result');
  await output.handle.writeFile(rows[0].key+'\n','utf8');await output.handle.sync();
  const final=await output.handle.stat(),finalPath=await lstat(filename);
  if(final.dev!==output.dev||final.ino!==output.ino||final.nlink!==1||final.size!==65||finalPath.isSymbolicLink()||finalPath.dev!==final.dev||finalPath.ino!==final.ino||(process.platform==='win32'&&!await inspect(filename))||(process.platform!=='win32'&&(final.mode&0o077)!==0))throw Error('unknown_result');
  if(!unchanged(pinned,await anchor(cwd)))throw Error('unknown_result');
  validateTarget(JSON.parse(await invoke(['current','--json'])));
  return {status:'provisioned',keyBytes:32};
 } finally {await output.handle.close();}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
 try {const a=process.argv.slice(2);if(a.length!==7||a[0]!=='--execute'||a[1]!=='--target-cwd'||a[3]!=='--cli-entry'||a[5]!=='--private-file')throw Error('invalid_arguments');const result=await provision({cwd:a[2],cliEntry:a[4],filename:a[6]});console.log(JSON.stringify(result));}
 catch {console.error('Provisioning failed or outcome is unknown; do not retry without reconciliation.');process.exitCode=1;}
}
