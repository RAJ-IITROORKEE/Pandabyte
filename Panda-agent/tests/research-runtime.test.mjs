import test from 'node:test';
import assert from 'node:assert/strict';
import { lstat, readFile } from 'node:fs/promises';
import { researchProfile } from '../runtime/opencode/research-profile.mjs';
import { researchCodeFiles, researchConfig, researchImageId, researchProfileHash, verifiedResearchConfig, verifyResearchContainer } from '../src/opencode/research-runtime.ts';

const generation = 'a'.repeat(64), token = 'b'.repeat(64);
const code = Object.fromEntries(['research-controller.mjs', 'research-profile.mjs', 'research-mcp-shim.mjs', 'research-binding/index.ts', 'research-provider-channel.mjs', 'research-http-proxy.mjs'].map(name => [name, `fixture ${name}`]));
const selectedImage={Id:researchImageId,Architecture:'arm64',Config:{Labels:{'panda.fixture.run':'synthetic-image-build','panda.fixture.source-sha256':'5'.repeat(64),'panda.native.config-sha256':'6'.repeat(64)},Env:['PATH=/usr/bin','NODE_VERSION=24.0.0','YARN_VERSION=1.22.0','NODE_ENV=production']}};
const expected = {
  imageMetadata:selectedImage,
  containerId: 'c'.repeat(64), nativeDirectory: '/opt/panda-research/bindings/' + 'd'.repeat(64) + '/native', codeDirectory: '/opt/panda-research/code/' + 'e'.repeat(64),
  labels: { 'panda.research.binding': 'd'.repeat(64), 'panda.research.profile': 'e'.repeat(64), 'panda.native.lease': 'panda-n45-' + 'f'.repeat(32) },
  environment: { PANDA_NATIVE_PASSWORD: '1'.repeat(64), PANDA_RESEARCH_CHANNEL_TOKEN: token, PANDA_RESEARCH_GENERATION: generation },
};

test('configured binding is a directory with its conventional entrypoint inside the immutable code hash', async () => {
  const config = researchConfig(generation, token);
  const configured = config.plugins.filter(value => !value.startsWith('-'));
  assert.equal(configured.length, 1);
  const mountedPath = configured[0].replace('/research-code/', '');
  const directory = new URL('../runtime/opencode/' + mountedPath, import.meta.url);
  assert.equal((await lstat(directory)).isDirectory(), true, '2.2.5 rejects configured absolute file paths');
  const entrypoint = mountedPath + '/index.ts';
  assert.equal((await lstat(new URL(entrypoint, new URL('../runtime/opencode/', import.meta.url)))).isFile(), true);
  assert.deepEqual(config.policies.filter(value => value.action === 'plugin.use' && value.effect === 'allow'), [
    { action: 'plugin.use', resource: 'opencode.config.mcp', effect: 'allow' },
    { action: 'plugin.use', resource: configured[0], effect: 'allow' },
  ]);
  const mountedCode = Object.fromEntries(await Promise.all(researchCodeFiles.map(async name => [name, await readFile(new URL('../runtime/opencode/' + name, import.meta.url))])));
  assert.equal(Object.keys(mountedCode).length, 6);
  assert.ok(Object.hasOwn(mountedCode, entrypoint));
  assert.notEqual(researchProfileHash(mountedCode), researchProfileHash({ ...mountedCode, [entrypoint]: Buffer.concat([mountedCode[entrypoint], Buffer.from('\n// changed entrypoint')]) }));
});
function inspect() {
  return { Id: expected.containerId, Image: researchImageId, Platform: 'linux',
    Config: { Image: researchImageId, User: '10001:10001', WorkingDir: '/runtime/workspace', Entrypoint: ['node'], Cmd: ['/research-code/research-controller.mjs'], Labels: {...selectedImage.Config.Labels,...expected.labels}, Env: [...selectedImage.Config.Env, ...Object.entries(expected.environment).map(([key,value]) => `${key}=${value}`)] },
    HostConfig: { NetworkMode: 'none', ReadonlyRootfs: true, CapDrop: ['ALL'], CapAdd: null, SecurityOpt: ['no-new-privileges'], Memory: 402653184, MemorySwap: 402653184, NanoCpus: 1000000000, PidsLimit: 128, Privileged: false, Devices: [], DeviceRequests: null, PortBindings: {}, Tmpfs: { '/tmp': 'rw,noexec,nosuid,nodev,size=16777216,uid=10001,gid=10001,mode=0700' } },
    Mounts: [{ Type: 'bind', Source: expected.nativeDirectory, Destination: '/runtime', RW: true, Propagation: 'rprivate' }, { Type: 'bind', Source: expected.codeDirectory, Destination: '/research-code', RW: false, Propagation: 'rprivate' }],
    NetworkSettings: { Networks: { none: {} }, Ports: {} },
  };
}

test('research profile exposes only the fixture model and echo tool with automatic work disabled', () => {
  const config = researchConfig(generation, token);
  assert.deepEqual(config, researchProfile(generation, token));
  assert.deepEqual(Object.keys(config.providers), ['panda-research-fixture']);
  assert.equal(config.providers['panda-research-fixture'].settings.baseURL, 'http://127.0.0.1:4175/v1');
  assert.equal(config.providers['panda-research-fixture'].models['panda-fixture'].capabilities.tools, true);
  assert.deepEqual(config.mcp.servers.panda_research.command, ['node', '/research-code/research-mcp-shim.mjs']);
  assert.deepEqual(config.mcp.servers.panda_research.environment, { PANDA_RESEARCH_CHANNEL_TOKEN: token, PANDA_RESEARCH_GENERATION: generation });
  assert.deepEqual(config.plugins, ['-opencode.tool.*', '-opencode.skill', '/research-code/research-binding']);
  assert.deepEqual(config.compaction, { auto: false });
  assert.deepEqual(config.experimental, { background_compaction: false, schedules: false, subagent_depth: 0 });
  assert.equal(config.agents['panda-research'].steps, 6);
  assert.deepEqual(config.permissions, [{ action: '*', resource: '*', effect: 'deny' }, { action: 'panda_research_echo', resource: '*', effect: 'allow' }]);
  for (const value of ['', 'A'.repeat(64), 'x\n', 'a'.repeat(65)]) {
    assert.throws(() => researchConfig(value, token)); assert.throws(() => researchConfig(generation, value));
  }
});

test('immutable profile hash binds every reviewed code file and refuses missing or added code', () => {
  const hash = researchProfileHash(code);
  assert.match(hash, /^[a-f0-9]{64}$/);
  assert.equal(hash, researchProfileHash(Object.fromEntries(Object.entries(code).reverse())));
  assert.notEqual(hash, researchProfileHash({ ...code, 'research-mcp-shim.mjs': 'changed' }));
  const missing = { ...code }; delete missing['research-binding/index.ts'];
  assert.throws(() => researchProfileHash(missing)); assert.throws(() => researchProfileHash({ ...code, 'foreign.mjs': 'bad' }));
  assert.throws(() => researchProfileHash());
});

test('loaded configuration must match this generation and cannot inherit foreign config or skills', () => {
  const config = researchConfig(generation, token), entry={type:'document',path:'/runtime/config/opencode.json',info:config}, loaded = [entry,{type:'directory',path:'/runtime/config'},entry];
  assert.equal(verifiedResearchConfig(loaded, config), true);
  assert.equal(verifiedResearchConfig([{ ...loaded[0], info: researchConfig('f'.repeat(64), token) }], config), false);
  assert.equal(verifiedResearchConfig([...loaded, { path: '/etc/opencode.json', info: {} }], config), false);
  assert.equal(verifiedResearchConfig([{ ...loaded[0], info: { ...config, skills: ['foreign'] } }], config), false);
  assert.equal(verifiedResearchConfig([{ ...loaded[0], info: { ...config, mcp: undefined } }], config), false);
});
test('tagged 2.2.5 config entries bind document and directory variants without extra instructions',()=>{
 const config=researchConfig(generation,token),entry={type:'document',path:'/runtime/config/opencode.json',info:config},directory={type:'directory',path:'/runtime/config'};
 assert.equal(verifiedResearchConfig([entry,directory,entry],config),true);
 for(const extra of [{instructions:['foreign']},{commands:{foreign:{}}},{websearch:'tavily'}])assert.equal(verifiedResearchConfig([{...entry,info:{...config,...extra}},directory,entry],config),false);
 assert.equal(verifiedResearchConfig([entry,directory,{...entry,info:{...config,instructions:['foreign']}}],config),false);
 assert.equal(verifiedResearchConfig([{...directory,info:{instructions:['foreign']}},entry],config),false);
 assert.equal(verifiedResearchConfig([{...entry,type:'directory'}],config),false);
});

test('container admission checks exact identity, fixed command, isolation, mounts and transient credentials', () => {
  assert.equal(verifyResearchContainer(inspect(), expected), true);
  const mutations = [
    x => { x.Image = 'sha256:' + '0'.repeat(64); }, x => { x.Id = '0'.repeat(64); },
    x => { x.Config.User = 'root'; }, x => { x.Config.Entrypoint = ['node', '/app/old-controller.mjs']; },
    x => { x.Config.Cmd = ['shell']; }, x => { x.Config.Labels = { ...x.Config.Labels, foreign: 'value' }; },
    x => { x.Config.Env.push('OPENROUTER_API_KEY=private'); }, x => { x.Config.Env.push('PANDA_RESEARCH_GENERATION=' + generation); },
    x => { x.Config.Env = x.Config.Env.map(v => v.startsWith('PANDA_RESEARCH_GENERATION=') ? 'PANDA_RESEARCH_GENERATION=' + 'f'.repeat(64) : v); },
    x => { x.HostConfig.NetworkMode = 'bridge'; }, x => { x.HostConfig.ReadonlyRootfs = false; },
    x => { x.HostConfig.MemorySwap = -1; }, x => { x.HostConfig.CapAdd = ['SYS_ADMIN']; },
    x => { x.HostConfig.Privileged = true; }, x => { x.HostConfig.SecurityOpt = []; },
    x => { x.HostConfig.Tmpfs['/tmp'] = 'rw,size=16777216'; },
    x => { x.Mounts[0].Source = '/opt/foreign/native'; }, x => { x.Mounts[1].RW = true; },
    x => { x.Mounts.push({ Type: 'bind', Source: '/var/run/docker.sock', Destination: '/sock', RW: false }); },
    x => { x.NetworkSettings.Ports = { '4172/tcp': [{ HostPort: '4172' }] }; },
  ];
  for (const mutate of mutations) { const actual = inspect(); mutate(actual); assert.equal(verifyResearchContainer(actual, expected), false, mutate.toString()); }
  assert.equal(verifyResearchContainer(inspect(), { ...expected, codeDirectory: expected.nativeDirectory + '/code' }), false);
});
test('image metadata must be inherited exactly from the inspected immutable ARM64 image',()=>{
 const imageMetadata={Id:researchImageId,Architecture:'arm64',Config:{Labels:{'panda.fixture.run':'synthetic-image-build','panda.fixture.source-sha256':'5'.repeat(64),'panda.native.config-sha256':'6'.repeat(64)},Env:['PATH=/usr/bin','NODE_VERSION=24.0.0','YARN_VERSION=1.22.0','NODE_ENV=production']}};
 const expectedWithImage={...expected,imageMetadata},container=inspect();container.Config.Labels={...imageMetadata.Config.Labels,...expected.labels};container.Config.Env=[...imageMetadata.Config.Env,...Object.entries(expected.environment).map(([k,v])=>k+'='+v)];
 assert.equal(verifyResearchContainer(container,expectedWithImage),true);
 for(const mutate of [i=>i.Id='sha256:'+'0'.repeat(64),i=>i.Architecture='amd64',i=>i.Config.Labels.foreign='unexpected',i=>i.Config.Env.push('OPENROUTER_API_KEY=private')]){const changed=structuredClone(imageMetadata);mutate(changed);assert.equal(verifyResearchContainer(container,{...expected,imageMetadata:changed}),false);}
 const overridden=structuredClone(container);overridden.Config.Env=overridden.Config.Env.map(v=>v==='NODE_ENV=production'?'NODE_ENV=development':v);assert.equal(verifyResearchContainer(overridden,expectedWithImage),false);
});
