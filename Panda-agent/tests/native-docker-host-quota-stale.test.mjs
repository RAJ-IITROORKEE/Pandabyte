import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {reserveDockerHostSlot,releaseStaleDockerHostSlot} from '../src/server/native-docker-host-quota.ts';
const lease=n=>'panda-n45-'+n.repeat(32);
test('releaseStaleDockerHostSlot frees only the exact lease slot and validates the lease name',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'panda-stale-slot-'));fs.chmodSync(dir,0o700);
 try{
  await reserveDockerHostSlot(dir,lease('a'));
  assert.equal(await releaseStaleDockerHostSlot(dir,lease('b')),false,'another lease keeps its slot');
  assert.ok(fs.existsSync(path.join(dir,'slot-0')));
  await assert.rejects(releaseStaleDockerHostSlot(dir,'panda-n45-short'));
  await assert.rejects(releaseStaleDockerHostSlot('relative',lease('a')));
  assert.equal(await releaseStaleDockerHostSlot(dir,lease('a')),true);
  assert.equal(fs.existsSync(path.join(dir,'slot-0')),false);
  assert.equal(await releaseStaleDockerHostSlot(dir,lease('a')),false,'idempotent when already free');
  const next=await reserveDockerHostSlot(dir,lease('c'),true);assert.ok(next);await next.release();
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
