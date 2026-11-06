import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawn } from 'node:child_process';

const cli = resolve('scripts/agent-tasks.mjs');
function run(file, ...args) {
  return new Promise((resolveResult, reject) => {
    const child = spawn(process.execPath, [cli, '--file', file, ...args]); let stdout = '', stderr = '';
    child.stdout.on('data', x => stdout += x); child.stderr.on('data', x => stderr += x);
    child.on('error', reject); child.on('close', code => resolveResult({code, stdout, stderr}));
  });
}
async function fixture(fn) {
  const dir = await mkdtemp(join(tmpdir(), 'panda-tasks-')), file = join(dir, 'tasks.json');
  const row = (id, dependsOn = []) => ({id, owner:'Parent', status:'not_started', dependsOn});
  try { await writeFile(file, JSON.stringify({schemaVersion:'1.0', requirements:[row('A'), row('B',['A'])]})); await fn(file); }
  finally { await rm(dir, {recursive:true, force:true}); }
}
test('fresh processes persist claims and statuses, with safe release', () => fixture(async file => {
  assert.equal((await run(file, 'validate')).code, 0);
  assert.notEqual((await run(file, 'claim', 'B', 'worker')).code, 0);
  assert.equal((await run(file, 'claim', 'A', 'worker')).code, 0);
  assert.equal(JSON.parse((await run(file, 'show', 'A')).stdout).claim, 'worker');
  assert.notEqual((await run(file, 'release', 'A', 'other')).code, 0);
  assert.equal((await run(file, 'status', 'A', 'worker', 'verified')).code, 0);
  assert.equal((await run(file, 'release', 'A', 'worker')).code, 0);
  assert.equal((await run(file, 'claim', 'B', 'other')).code, 0);
  assert.equal((await run(file, 'release', 'B', 'other')).code, 0);
  const data = JSON.parse(await readFile(file)); assert.equal(data.requirements[1].status, 'partial'); assert.equal(data.requirements[1].claim, null);
}));
test('concurrent claims do not both succeed', () => fixture(async file => {
  const results = await Promise.all([run(file, 'claim', 'A', 'one'), run(file, 'claim', 'A', 'two')]);
  assert.equal(results.filter(x => x.code === 0).length, 1);
  assert.ok(['one', 'two'].includes(JSON.parse((await run(file, 'show', 'A')).stdout).claim));
}));
test('missing and cyclic dependencies fail validation without writes', () => fixture(async file => {
  const data = JSON.parse(await readFile(file)); data.requirements[0].dependsOn = ['missing'];
  await writeFile(file, JSON.stringify(data)); assert.match((await run(file, 'validate')).stderr, /Missing dependency/);
  data.requirements[0].dependsOn = ['B']; await writeFile(file, JSON.stringify(data));
  assert.match((await run(file, 'validate')).stderr, /cycle/i); assert.notEqual((await run(file, 'claim', 'A', 'one')).code, 0);
}));
test('unstructured legacy dependencies cannot silently permit a claim', () => fixture(async file => {
  const data = JSON.parse(await readFile(file)); delete data.requirements[0].dependsOn; await writeFile(file, JSON.stringify(data));
  assert.match((await run(file, 'claim', 'A', 'one')).stderr, /dependsOn/);
}));
test('verification rechecks dependencies after a claim', () => fixture(async file => {
  assert.equal((await run(file, 'claim', 'A', 'first')).code, 0);
  assert.equal((await run(file, 'status', 'A', 'first', 'verified')).code, 0);
  assert.equal((await run(file, 'claim', 'B', 'second')).code, 0);
  assert.equal((await run(file, 'status', 'A', 'first', 'partial')).code, 0);
  const result = await run(file, 'status', 'B', 'second', 'verified');
  assert.notEqual(result.code, 0);
  assert.match(result.stderr, /Unmet dependencies: A/);
  assert.equal(JSON.parse((await run(file, 'show', 'B')).stdout).status, 'in_progress');
}));
