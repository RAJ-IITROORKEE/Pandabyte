import { spawnSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const sources = [
  ['src/server/chat-store.ts', /\brpc\(\s*['"]([a-z0-9_]+)['"]/g, 'panda_agent_'],
  ['src/retrieval/insforge-adapters.ts', /\brpc\(\s*client\s*,\s*['"](panda_agent_[a-z0-9_]+)['"]/g, ''],
];

export function inspectDependencies(packageRoot) {
  const issues = [], required = new Set();
  for (const [path, pattern, prefix] of sources) {
    let text;
    try { text = readFileSync(join(packageRoot, path), 'utf8'); }
    catch { issues.push(`missing source: ${path}`); continue; }
    const matches = [...text.matchAll(pattern)];
    if (!matches.length) issues.push(`no static RPC references: ${path}`);
    for (const match of matches) required.add(prefix + match[1]);
  }
  let files;
  try { files = readdirSync(join(packageRoot, 'migrations')).filter(name => name.endsWith('.sql')); }
  catch { files = []; }
  if (!files.length) issues.push('missing SQL migrations: migrations');
  const definitions = new Set();
  for (const file of files) {
    let sql;
    try { sql = readFileSync(join(packageRoot, 'migrations', file), 'utf8'); }
    catch { issues.push('unreadable SQL migration: migrations'); continue; }
    // This recognizes the repository's ordinary CREATE FUNCTION declarations, not arbitrary SQL execution.
    sql = sql.replace(/--[^\r\n]*|\/\*[\s\S]*?\*\/|'(?:''|[^'])*'|\$([a-zA-Z_][a-zA-Z_0-9]*|)\$[\s\S]*?\$\1\$/g, ' ');
    for (const match of sql.matchAll(/\bCREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+public\.(panda_agent_[a-z0-9_]+)\s*\(/gi)) definitions.add(match[1].toLowerCase());
  }
  for (const name of [...required].sort()) if (!definitions.has(name)) issues.push(`missing definition: public.${name}`);
  return issues;
}

function main() {
  const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const issues = inspectDependencies(packageRoot);
  const docker = spawnSync('docker', ['--version'], { encoding: 'utf8', timeout: 5000, windowsHide: true });
  const version = docker.status === 0 && /^Docker version (\d+(?:\.\d+){1,3})\b/.exec(docker.stdout);
  console.log(version ? `Docker CLI: ${version[1]}` : 'Docker CLI: unavailable');
  console.log('Scope: Panda-agent source references and local SQL declarations; no database or provider contacted.');
  if (issues.length) {
    for (const issue of issues) console.error(issue);
    process.exitCode = 1;
  } else console.log('Referenced RPC declarations found in local migrations.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main();
