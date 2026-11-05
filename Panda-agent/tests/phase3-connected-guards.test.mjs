import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
test('connected guard operator script requires explicit opt-in',()=>{
 const result=spawnSync(process.execPath,['Panda-agent/scripts/phase3-connected-guards.mjs'],{encoding:'utf8'});
 assert.equal(result.status,2);assert.match(result.stderr,/Explicit --run required/);assert.equal(result.stdout,'');
});
