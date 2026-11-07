import test from 'node:test';
import assert from 'node:assert/strict';
import { lstat, mkdir, mkdtemp, readFile, realpath, rm, symlink, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { isAbsolute, join, relative, sep } from 'node:path';
import { createDescriptorLease, descriptorTarget, inspectionConfig, inspectionEnvironment, matchesPinnedVersion, verifiedConfig } from '../scripts/start-native-inspection.mjs';
import { readNativeRuntimeFile } from '../src/server/native-runtime-file.ts';

const generation = 'a'.repeat(64);
const descriptor = root => ({version:1,generation,pid:1234,baseUrl:'http://127.0.0.1:43567',directory:join(root,'workspace'),configHash:'b'.repeat(64),password:'c'.repeat(64)});

test('pinned version accepts CLI decoration and rejects different, ambiguous and prerelease versions',()=>{
  for(const output of ['2.2.2\n','OpenCode v2.2.2\n','Version: 2.2.2 (fixture-build)\n'])assert.equal(matchesPinnedVersion(output),true);
  for(const output of ['2.2.3','2.2.2-preview','2.2.2+other','2.2.2\n2.1.3','3.2.2.2','2.2.2beta','unknown','x'.repeat(129),null])assert.equal(matchesPinnedVersion(output),false);
});
async function fixture(run) {
  const parent = await realpath(tmpdir()), root = await realpath(await mkdtemp(join(parent,'pandabyte-inspection-tests-')));
  await mkdir(join(root,'private'));
  try { await run(root,join(root,'private','native-runtime.json')); }
  finally {
    const rel = relative(parent,root);
    assert.ok(rel && rel !== '..' && !rel.startsWith('..' + sep) && !isAbsolute(rel));
    assert.equal(await realpath(root),root); assert.equal((await lstat(root)).isSymbolicLink(),false);
    await rm(root,{recursive:true,force:true});
  }
}

test('CLI accepts only explicit canonical JSON paths strictly inside workspace private', async () => {
  await fixture(async (root,path) => {
    assert.equal(descriptorTarget(['--descriptor',path],root),path);
    for (const args of [[],[path],['--descriptor'],['--descriptor',path,'--reuse'],['--other',path],['--descriptor','relative.json'],
      ['--descriptor',join(root,'public','native.json')],['--descriptor',join(root,'private-other','native.json')],['--descriptor',join(root,'private','native.txt')],['--descriptor',path+'\u0000']]) {
      assert.throws(() => descriptorTarget(args,root),{message:'local_inspection_unavailable'});
    }
  });
});

test('isolated child environment excludes parent credentials/configuration and fixes loopback-only proxy exception', async () => {
  await fixture(async root => {
    const source = {SystemRoot:join(root,'windows'),WINDIR:join(root,'windows'),COMSPEC:'cmd.exe',PATHEXT:'.EXE',PATH:'unsafe',HOME:'outside',USERPROFILE:'outside',AWS_SECRET_ACCESS_KEY:'secret',OPENROUTER_API_KEY:'secret',NODE_OPTIONS:'--import unsafe',OPENCODE_CONFIG:'outside',HTTP_PROXY:'outside',NO_PROXY:'*'};
    const env = inspectionEnvironment(root,'c'.repeat(64),source);
    for (const key of ['AWS_SECRET_ACCESS_KEY','OPENROUTER_API_KEY','NODE_OPTIONS']) assert.equal(key in env,false);
    assert.equal(env.PATH,join(source.SystemRoot,'System32'));
    assert.equal(env.HOME,join(root,'home')); assert.equal(env.USERPROFILE,join(root,'home'));
    for (const key of ['HTTP_PROXY','HTTPS_PROXY','ALL_PROXY','http_proxy','https_proxy','all_proxy']) assert.equal(env[key],'http://127.0.0.1:9');
    assert.equal(env.NO_PROXY,'127.0.0.1'); assert.equal(env.no_proxy,'127.0.0.1');
    for (const key of ['OPENCODE_CONFIG_PROJECT_DISABLE','OPENCODE_DISABLE_CLAUDE_CODE','OPENCODE_DISABLE_CLAUDE_CODE_SKILLS','OPENCODE_DISABLE_MODELS_FETCH','OPENCODE_FILEWATCHER_DISABLE','OPENCODE_DISABLE_FFF']) assert.equal(env[key],'true');
    for (const key of ['XDG_DATA_HOME','XDG_CONFIG_HOME','XDG_CACHE_HOME','XDG_STATE_HOME','OPENCODE_CONFIG_DIR','OPENCODE_CONFIG','ProgramData','TEMP','TMP']) assert.ok(env[key].startsWith(root + sep));
  });
});

test('reviewed configuration denies every provider/tool/integration and accepts no outside configuration', async () => {
  await fixture(async root => {
    const config=inspectionConfig(), loaded=[{path:join(root,'config','opencode.json'),info:config}];
    assert.deepEqual(config.permissions,[{action:'*',resource:'*',effect:'deny'}]);
    assert.deepEqual(config.policies,['tool.use','provider.use','integration.use'].map(action=>({action,resource:'*',effect:'deny'})));
    assert.deepEqual(config.mcp,{servers:{}}); assert.deepEqual(config.plugins,[]); assert.deepEqual(config.skills,[]);
    assert.equal(config.update,'disable'); assert.equal(config.share,'disabled');
    assert.equal(verifiedConfig(loaded,config,root),true);
    assert.equal(verifiedConfig([...loaded,{path:join(tmpdir(),'unrelated-config'),info:config}],config,root),false);
    assert.equal(verifiedConfig([{...loaded[0],info:{...config,policies:[]}}],config,root),false);
    assert.equal(verifiedConfig([{...loaded[0],path:join(root,'config','different.json')}],config,root),false);
    const omittedMcp={...config}; delete omittedMcp.mcp;
    assert.equal(verifiedConfig([{...loaded[0],info:omittedMcp}],config,root),true);
    assert.equal(verifiedConfig([{...loaded[0],info:{...config,mcp:{servers:{unexpected:{}}}}}],config,root),false);
    assert.equal(verifiedConfig([{...loaded[0],info:omittedMcp}],{...config,mcp:{servers:{unexpected:{}}}},root),false);
  });
});

test('owner-private lease publishes exactly the seven-field descriptor and invalidates its own generation', async () => {
  await fixture(async(root,path)=>{
    const lease=await createDescriptorLease(root,path,generation);
    assert.equal(await readNativeRuntimeFile(path),null);
    await assert.rejects(lease.publish({...descriptor(root),enabled:true}),{message:'local_inspection_unavailable'});
    await assert.rejects(lease.publish({...descriptor(root),generation:'d'.repeat(64)}),{message:'local_inspection_unavailable'});
    await lease.publish(descriptor(root));
    assert.deepEqual(await readNativeRuntimeFile(path),descriptor(root));
    assert.equal(await lease.release(),true);
    await assert.rejects(lstat(path),{code:'ENOENT'});
    assert.equal(await lease.release(),false);
  });
});

test('existing leases are never overwritten or removed and symlink parents are refused', async () => {
  await fixture(async(root,path)=>{
    await writeFile(path,'prior-user-data');
    await assert.rejects(createDescriptorLease(root,path,generation),{code:'EEXIST'});
    assert.equal(await readFile(path,'utf8'),'prior-user-data');
    await mkdir(join(root,'unrelated'));
    try { await symlink(join(root,'unrelated'),join(root,'private','redirect'),process.platform==='win32'?'junction':'dir'); }
    catch(error) { if(error.code==='EPERM')return; throw error; }
    await assert.rejects(createDescriptorLease(root,join(root,'private','redirect','runtime.json'),generation),{message:'local_inspection_unavailable'});
    await assert.rejects(lstat(join(root,'unrelated','runtime.json')),{code:'ENOENT'});
  });
});

test('shutdown preserves a replaced descriptor or a different generation and can remove an unpublished claim', async () => {
  await fixture(async(root,path)=>{
    const empty=await createDescriptorLease(root,path,generation);
    assert.equal(await empty.release(),true);
    const rotated=await createDescriptorLease(root,path,generation); await rotated.publish(descriptor(root));
    await writeFile(path,JSON.stringify({...descriptor(root),generation:'d'.repeat(64)}));
    assert.equal(await rotated.release(),false);
    assert.equal(JSON.parse(await readFile(path,'utf8')).generation,'d'.repeat(64));
    await unlink(path);
    const replaced=await createDescriptorLease(root,path,generation); await replaced.publish(descriptor(root));
    await unlink(path); await writeFile(path,'unrelated replacement');
    assert.equal(await replaced.release(),false); assert.equal(await readFile(path,'utf8'),'unrelated replacement');
  });
});
