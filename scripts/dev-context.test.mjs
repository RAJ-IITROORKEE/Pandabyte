import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';

const script = resolve('scripts/dev-context.mjs');

test('fresh processes read current allowlisted sources, rank archives last and exclude private paths', async () => {
  const root = await mkdtemp(join(tmpdir(), 'panda-context-'));
  try {
    await mkdir(join(root, 'docs/archive'), { recursive: true });
    await mkdir(join(root, 'docs/agent-experience-upgrade'), { recursive: true });
    await writeFile(join(root, 'README.md'), 'first line\nneedle current\n');
    await writeFile(join(root, 'docs/archive/old.md'), 'needle needle archived\n');
    await writeFile(join(root, 'docs/agent-experience-upgrade/private-notes.md'), 'needle private\n');
    await writeFile(join(root, '.env'), 'needle secret\n');
    const run = () => execFileSync(process.execPath, [script, 'needle'], { cwd: root, encoding: 'utf8' });
    const first = run();
    assert.match(first, /^README\.md:2: needle current/m);
    assert.ok(first.indexOf('README.md') < first.indexOf('docs/archive/old.md'));
    assert.doesNotMatch(first, /private|secret|\.env/);
    await writeFile(join(root, 'README.md'), 'needle changed\n');
    const second = run();
    assert.match(second, /README\.md:1: needle changed/);
    assert.doesNotMatch(second, /needle current/);
  } finally { await rm(root, { recursive: true, force: true }); }
});
