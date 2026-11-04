// Fixed, aggregate-only operator. Importing this module does not access a project.
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { lstat, readFile, realpath } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { verifiedInsforgeCli } from './verified-insforge-cli.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sqlPath = path.join(root, 'docs/verification/rag-vector-audit-readonly.sql');
export const SQL_SHA256 = '2d0261989900b77fe808aab4bd5ef7a36d6b68e9697e1104a023d9aec02fbb3a';
const targetHost = 'feh4966v.us-east.insforge.app';
const projectId = '9f27721e-78d0-4259-8878-eeb94c7103e2';
const orgId = '09dad465-be7d-4245-9d2f-70c9c9f5a032';
const expected = Object.freeze({candidate_count:1,set_count:1,ready_matching_set_count:1,eligible_count:284,blocked_eligible_count:2,blocked_distinct_count:2,allowed_count:282,inconsistent_text_count:0,vector_count:282,unique_input_count:190,invalid_vector_count:0,blocked_vector_count:0,missing_vector_count:0,inconsistent_vector_count:0});
const exec = promisify(execFile);

export function cleanEnvironment(source) {
  return Object.fromEntries(Object.entries(source).filter(([key])=>!/^(?:INSFORGE_|NEXT_PUBLIC_INSFORGE_|NODE_OPTIONS$|NODE_PATH$)/i.test(key)));
}
export function validateTarget(current) {
  let u; try { u=new URL(current?.project?.oss_host); } catch { throw Error('invalid_target'); }
  if (current?.authenticated!==true || current.project.project_id!==projectId || current.project.org_id!==orgId || u.protocol!=='https:' || u.hostname!==targetHost || u.port || u.username || u.password || u.pathname!=='/' || u.search || u.hash) throw Error('invalid_target');
}
export function validateSql(bytes) {
  if (!Buffer.isBuffer(bytes) || bytes.length>65536 || createHash('sha256').update(bytes).digest('hex')!==SQL_SHA256) throw Error('unreviewed_sql');
  const sql=new TextDecoder('utf-8',{fatal:true}).decode(bytes);
  // The immutable digest is the authority; this secondary check rejects obvious write statements.
  const code=sql.replace(/--[^\r\n]*/g,'');
  if (!/^\s*WITH\b/i.test(code) || (code.match(/;/g)??[]).length!==1 || !/;\s*$/.test(code) || /\b(?:INSERT|UPDATE|DELETE|MERGE|ALTER|DROP|CREATE|TRUNCATE|COPY|CALL|DO|GRANT|REVOKE|REFRESH|VACUUM|LOCK|SET|RESET|EXECUTE)\b/i.test(code)) throw Error('unsafe_sql');
  return sql;
}
export function parseAggregate(raw) {
  const parsed=JSON.parse(raw);
  const rows=parsed?.rows ?? parsed?.data;
  if (!parsed || !Array.isArray(rows) || rows.length!==1 || !rows[0] || Object.keys(rows[0]).sort().join(',')!==Object.keys(expected).sort().join(',')) throw Error('invalid_result');
  const metrics={};
  for(const key of Object.keys(expected)) {
    const value=rows[0][key];
    if (!(typeof value==='number' && Number.isSafeInteger(value) && value>=0) && !(typeof value==='string' && /^(0|[1-9]\d{0,9})$/.test(value))) throw Error('invalid_result');
    metrics[key]=Number(value);
  }
  return { aggregatePass:Object.entries(expected).every(([key,value])=>metrics[key]===value), metrics, fullFloatReadbackVerified:false };
}
async function anchor(cwd) {
  const dir=await realpath(cwd), configDir=path.join(dir,'.insforge'), file=path.join(configDir,'project.json');
  if (dir===await realpath(root) || dir===await realpath(path.dirname(root))) throw Error('isolated_cwd_required');
  const ds=await lstat(configDir), fs=await lstat(file);
  if (!ds.isDirectory() || ds.isSymbolicLink() || !fs.isFile() || fs.isSymbolicLink() || fs.nlink!==1 || await realpath(configDir)!==configDir || await realpath(file)!==file) throw Error('isolated_cwd_required');
  return { dir, file, dev:fs.dev, ino:fs.ino, size:fs.size, mtimeMs:fs.mtimeMs, ctimeMs:fs.ctimeMs };
}
function sameAnchor(a,b) { return ['dir','file','dev','ino','size','mtimeMs','ctimeMs'].every(key=>a[key]===b[key]); }

// `run` is only invoked with an explicit execute flag by the command entry point.
// Injection points allow offline tests; the CLI entry cannot accept injected runners.
export async function run({cwd,cliEntry,environment=process.env,verifyCli=verifiedInsforgeCli,runner=exec}) {
  if (!path.isAbsolute(cwd??'') || !path.isAbsolute(cliEntry??'')) throw Error('absolute_paths_required');
  const original=await anchor(cwd), entry=await verifyCli(cliEntry), env=cleanEnvironment(environment);
  const options={cwd:original.dir,env,timeout:45000,maxBuffer:65536,windowsHide:true};
  const invoke=async args=>{ const result=await runner(process.execPath,[entry,...args],options); if(typeof result.stdout!=='string')throw Error('invalid_cli_output'); return result.stdout; };
  const unchanged=async()=>{ if(!sameAnchor(original,await anchor(cwd))) throw Error('target_changed'); };
  if ((await invoke(['--version'])).trim()!=='0.2.8') throw Error('invalid_cli_version');
  const query=validateSql(await readFile(sqlPath));
  validateTarget(JSON.parse(await invoke(['current','--json'])));
  await unchanged();
  const result=parseAggregate(await invoke(['db','query','--json','--',query]));
  await unchanged();
  validateTarget(JSON.parse(await invoke(['current','--json'])));
  await unchanged();
  return result;
}
function argumentsForRun(args) {
  if(args.length!==5 || args[0]!=='--execute' || args[1]!=='--target-cwd' || args[3]!=='--cli-entry') throw Error('invalid_arguments');
  return {cwd:args[2],cliEntry:args[4]};
}
if (process.argv[1] && import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href) {
  try { const result=await run(argumentsForRun(process.argv.slice(2)));console.log(JSON.stringify(result));if(!result.aggregatePass)process.exitCode=1; }
  catch { console.error('Vector aggregate audit unavailable; no result established.');process.exitCode=1; }
}
