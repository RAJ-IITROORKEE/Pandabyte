import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { runInNewContext } from 'node:vm';
import { lstat, readFile } from 'node:fs/promises';
import { isHostedResearchProfile, researchProfile, researchProfileSelection } from '../runtime/opencode/research-profile.mjs';
import { researchCodeFiles, researchConfig, researchImageId, researchProfileHash, verifiedResearchConfig, verifyResearchContainer } from '../src/opencode/research-runtime.ts';

const generation = 'a'.repeat(64), token = 'b'.repeat(64);
const code = Object.fromEntries(['research-controller.mjs', 'research-profile.mjs', 'research-mcp-shim.mjs', 'research-binding/index.ts', 'research-provider-channel.mjs', 'research-http-proxy.mjs'].map(name => [name, `fixture ${name}`]));
const selectedImage={Id:researchImageId,Architecture:'arm64',Config:{Labels:{'panda.fixture.run':'synthetic-image-build','panda.fixture.source-sha256':'5'.repeat(64),'panda.native.config-sha256':'6'.repeat(64)},Env:['PATH=/usr/bin','NODE_VERSION=24.0.0','YARN_VERSION=1.22.0','NODE_ENV=production']}};
const expected = {
  imageMetadata:selectedImage,
  containerId: 'c'.repeat(64), nativeDirectory: '/opt/panda-research/bindings/' + 'd'.repeat(64) + '/native', codeDirectory: '/opt/panda-research/code/' + 'e'.repeat(64),
  labels: { 'panda.research.binding': 'd'.repeat(64), 'panda.research.profile': 'e'.repeat(64), 'panda.native.lease': 'panda-n45-' + 'f'.repeat(32) },
  environment: { PANDA_NATIVE_PASSWORD: '1'.repeat(64), PANDA_RESEARCH_CHANNEL_TOKEN: token, PANDA_RESEARCH_GENERATION: generation, PANDA_RESEARCH_PROFILE: 'synthetic-echo' },
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
    HostConfig: { NetworkMode: 'none', ReadonlyRootfs: true, CapDrop: ['ALL'], CapAdd: null, SecurityOpt: ['no-new-privileges'], Memory: 536870912, MemorySwap: 536870912, NanoCpus: 1000000000, PidsLimit: 128, Privileged: false, Devices: [], DeviceRequests: null, PortBindings: {}, Tmpfs: { '/tmp': 'rw,noexec,nosuid,nodev,size=16777216,uid=10001,gid=10001,mode=0700' } },
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
  assert.deepEqual(config.mcp.servers.panda_research.environment, { PANDA_RESEARCH_CHANNEL_TOKEN: token, PANDA_RESEARCH_GENERATION: generation, PANDA_RESEARCH_PROFILE: 'synthetic-echo' });
  assert.deepEqual(config.plugins, ['-opencode.tool.*', '-opencode.skill', '/research-code/research-binding']);
  assert.deepEqual(config.compaction, { auto: false });
  assert.deepEqual(config.experimental, { background_compaction: false, schedules: false, subagent_depth: 0 });
  assert.equal(config.agents['panda-research'].steps, 6);
  assert.deepEqual(config.permissions, [{ action: '*', resource: '*', effect: 'deny' }, { action: 'panda_research_echo', resource: '*', effect: 'allow' }]);
  for (const value of ['', 'A'.repeat(64), 'x\n', 'a'.repeat(65)]) {
    assert.throws(() => researchConfig(value, token)); assert.throws(() => researchConfig(generation, value));
  }
});

test('selected search profile binds one tool and a distinct immutable hash while retaining the synthetic model', () => {
  const config = researchConfig(generation, token, 'tavily-search');
  assert.deepEqual(config.permissions, [{ action: '*', resource: '*', effect: 'deny' }, { action: 'panda_research_search', resource: '*', effect: 'allow' }]);
  assert.equal(config.mcp.servers.panda_research.environment.PANDA_RESEARCH_PROFILE, 'tavily-search');
  assert.deepEqual(config.model, { providerID: 'panda-research-fixture', model: 'panda-fixture' });
  assert.ok(config.policies.some(rule => rule.action === 'tool.use' && rule.resource === 'panda_research_search:*' && rule.effect === 'allow'));
  assert.equal(config.policies.some(rule => rule.resource === 'panda_research_echo:*'), false);
  assert.notEqual(researchProfileHash(code), researchProfileHash(code, 'tavily-search'));
  for (const profile of ['', 'search', 'real-model', null]) {
    assert.throws(() => researchConfig(generation, token, profile));
    assert.throws(() => researchProfileHash(code, profile));
  }
  const searchExpected = { ...expected, environment: { ...expected.environment, PANDA_RESEARCH_PROFILE: 'tavily-search' } };
  const actual = inspect(); actual.Config.Env = actual.Config.Env.map(value => value === 'PANDA_RESEARCH_PROFILE=synthetic-echo' ? 'PANDA_RESEARCH_PROFILE=tavily-search' : value);
  assert.equal(verifyResearchContainer(actual, searchExpected), true);
  assert.equal(verifyResearchContainer(actual, expected), false);
  const missing = inspect(); missing.Config.Env = missing.Config.Env.filter(value => !value.startsWith('PANDA_RESEARCH_PROFILE='));
  assert.equal(verifyResearchContainer(missing, expected), false);
});

test('hosted profile descriptor binds the paid model identity and output limit independently of synthetic profiles', () => {
  assert.deepEqual(researchProfileSelection('synthetic-echo'), { name: 'echo', toolName: 'panda_research_echo', path: '/echo', timeout: 10000, providerID: 'panda-research-fixture', modelID: 'panda-fixture', outputTokens: 1024, usageMode: 'synthetic' });
  assert.deepEqual(researchProfileSelection('tavily-search'), { name: 'search', toolName: 'panda_research_search', path: '/search', timeout: 30000, providerID: 'panda-research-fixture', modelID: 'panda-fixture', outputTokens: 1024, usageMode: 'synthetic' });
  assert.deepEqual(researchProfileSelection('tavily-hosted'), { name: 'search', toolName: 'panda_research_search', path: '/search', timeout: 30000, providerID: 'panda-research-hosted', modelID: 'openai/gpt-oss-20b', outputTokens: 700, usageMode: 'hosted' });
  const hosted = researchConfig(generation, token, 'tavily-hosted');
  assert.deepEqual(hosted.model, { providerID: 'panda-research-hosted', model: 'openai/gpt-oss-20b' });
  assert.deepEqual(Object.keys(hosted.providers), ['panda-research-hosted']);
  const provider = hosted.providers['panda-research-hosted'];
  assert.equal(provider.name, 'Guarded OpenRouter');
  assert.equal(provider.package, '@opencode/ai/providers/openai-compatible');
  assert.deepEqual(provider.settings, { baseURL: 'http://127.0.0.1:4175/v1', encoding: 'none' });
  assert.deepEqual(provider.env, ['PANDA_RESEARCH_CHANNEL_TOKEN']);
  assert.deepEqual(provider.models['openai/gpt-oss-20b'], { modelID: 'openai/gpt-oss-20b', capabilities: { tools: true, input: ['text'], output: ['text'], reasoning: { supported: false } }, limit: { context: 16000, output: 700 } });
  const search = researchConfig(generation, token, 'tavily-search');
  assert.deepEqual(hosted.permissions, search.permissions); assert.deepEqual(hosted.compaction, search.compaction); assert.deepEqual(hosted.experimental, search.experimental);
  assert.equal(hosted.agents['panda-research'].steps, 6);
  assert.equal(hosted.mcp.servers.panda_research.environment.PANDA_RESEARCH_PROFILE, 'tavily-hosted');
  assert.equal(new Set(['synthetic-echo', 'tavily-search', 'tavily-hosted'].map(profile => researchProfileHash(code, profile))).size, 3);
  const loaded = [{ type: 'document', path: '/runtime/config/opencode.json', info: hosted }, { type: 'directory', path: '/runtime/config' }, { type: 'document', path: '/runtime/config/opencode.json', info: hosted }];
  assert.equal(verifiedResearchConfig(loaded, hosted), true); assert.equal(verifiedResearchConfig(loaded, search), false);
  const actual = inspect(); actual.Config.Env = actual.Config.Env.map(value => value === 'PANDA_RESEARCH_PROFILE=synthetic-echo' ? 'PANDA_RESEARCH_PROFILE=tavily-hosted' : value);
  assert.equal(verifyResearchContainer(actual, { ...expected, environment: { ...expected.environment, PANDA_RESEARCH_PROFILE: 'tavily-hosted' } }), true);
  assert.equal(verifyResearchContainer(actual, expected), false);
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
    x => { x.HostConfig.Memory = 402653184; }, x => { x.HostConfig.Memory = 0; }, x => { x.HostConfig.MemorySwap = 402653184; }, x => { x.HostConfig.MemorySwap = 0; }, x => { x.HostConfig.MemorySwap = -1; }, x => { x.HostConfig.CapAdd = ['SYS_ADMIN']; },
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

test('host memory proof parser accepts only the exact Docker cgroup and safe counters', async () => {
  const driver = (await readFile(new URL('../scripts/test-native-research.mjs', import.meta.url), 'utf8')).replaceAll('\r\n', '\n');
  const source = driver.slice(driver.indexOf('function parseMemoryProof('), driver.indexOf('\n{\n const id=', driver.indexOf('function parseMemoryProof(')));
  const parse = runInNewContext(`(${source})`, { assert });
  const id = 'a'.repeat(64), group = `0::/system.slice/docker-${id}.scope\n`;
  assert.equal(JSON.stringify(parse(id, group, '123\n', 'oom 0\noom_kill 1\n')), JSON.stringify({ peakBytes: 123, oomKill: 1 }));
  for (const [g,p,e] of [[group.replace(id,'b'.repeat(64)),'123','oom_kill 0'], [group,'max','oom_kill 0'], [group,'123','oom 0'], [group,'123','oom_kill 0\noom_kill 1'], [group,'9007199254740992','oom_kill 0']]) assert.throws(() => parse(id,g,p,e));
});

test('actual cleanup enforces ownership and releases the slot after memory proof failures', async () => {
  const driver = (await readFile(new URL('../scripts/test-native-research.mjs', import.meta.url), 'utf8')).replaceAll('\r\n', '\n');
  const parserSource = driver.slice(driver.indexOf('function parseMemoryProof('), driver.indexOf('\n{\n const id=', driver.indexOf('function parseMemoryProof(')));
  const removeSource = driver.slice(driver.indexOf('async function remove('), driver.indexOf('\nasync function newOwner', driver.indexOf('async function remove(')));
  const id = 'a'.repeat(64), lease = 'panda-n45-' + 'b'.repeat(32), binding = 'c'.repeat(64), profile = 'd'.repeat(64);
  const directory = `/sys/fs/cgroup/system.slice/docker-${id}.scope`, group = `0::/system.slice/docker-${id}.scope\n`;
  async function scenario({release = true, missing = false, oom = false, badImage = false, badLabel = false} = {}) {
    const actions = [], memoryEvidence = [];
    const inspect = { Image: badImage ? 'wrong' : researchImageId, Config: { Labels: { 'panda.native.lease': lease, 'panda.research.binding': badLabel ? 'wrong' : binding, 'panda.research.profile': profile } }, State: { Pid: 123, Status: 'running' } };
    const command = async args => {
      actions.push(args.join(' '));
      if (args[0] === 'inspect') return JSON.stringify([inspect]);
      if (args[0] === 'rm') return '';
      if (args[0] === 'ps') return '';
      throw Error('unexpected command');
    };
    const fs = {
      realpath: async file => { actions.push('realpath ' + file); return file; },
      readFile: async file => { actions.push('read ' + file); if (file === '/proc/123/cgroup') { if (missing) throw Error('missing'); return group; } if (file === directory + '/memory.peak') return '12345\n'; if (file === directory + '/memory.events') return `oom 0\noom_kill ${oom ? 1 : 0}\n`; throw Error('unexpected path'); },
    };
    const parseMemoryProof = runInNewContext(`(${parserSource})`, { assert });
    const remove = runInNewContext(`(${removeSource})`, { assert, command, fs, researchImageId, profileHash: profile, memoryEvidence, parseMemoryProof });
    const ctx = { containerId: id, lease, binding: { binding }, slot: { release: async () => actions.push('release') }, transport: { close: async () => actions.push('transport close') }, gateway: { close: async () => actions.push('gateway close') } };
    let error; try { await remove(ctx, release); } catch (caught) { error = caught; }
    return { actions, ctx, error, memoryEvidence };
  }
  const prefix = ['transport close', 'gateway close', `inspect ${id}`];
  const proof = [`read /proc/123/cgroup`, `realpath ${directory}`, `read ${directory}/memory.peak`, `read ${directory}/memory.events`];
  const cleanup = [`rm -f ${id}`, `ps -aq --no-trunc --filter id=${id}`];
  const success = await scenario(); assert.equal(success.error, undefined); assert.deepEqual(success.actions, [...prefix, ...proof, ...cleanup, 'release']); assert.equal(success.ctx.containerId, null); assert.equal(success.ctx.slot, null); assert.equal(success.memoryEvidence[0].oomKill, 0);
  const restart = await scenario({release:false}); assert.equal(restart.error, undefined); assert.deepEqual(restart.actions, [...prefix, ...proof, ...cleanup]); assert.ok(restart.ctx.slot); assert.equal(restart.ctx.containerId, null);
  for (const options of [{missing:true}, {oom:true}]) {
    const failed = await scenario({...options, release:false}); assert.ok(failed.error); assert.deepEqual(failed.actions, [...prefix, ...(options.missing ? [proof[0]] : proof), ...cleanup, 'release']); assert.equal(failed.ctx.containerId, null); assert.equal(failed.ctx.slot, null);
  }
  for (const options of [{badImage:true}, {badLabel:true}]) {
    const denied = await scenario(options); assert.ok(denied.error); assert.deepEqual(denied.actions, prefix); assert.equal(denied.ctx.containerId, id); assert.ok(denied.ctx.slot);
  }
});

const hostedFamily = { 'tavily-hosted': 'openai/gpt-oss-20b', 'tavily-hosted-luna': 'openai/gpt-6-luna', 'tavily-hosted-terra': 'openai/gpt-6.1-terra', 'tavily-hosted-haiku': 'anthropic/claude-haiku-5.5' };
const configSha = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');

test('GPT-OSS hosted profile config is byte-identical to the pre-C3 golden values', () => {
  // Captured from the C2 working tree before C3 edits; the code-bound researchProfileHash legitimately changes with edited code bytes.
  assert.equal(configSha(researchProfile('a'.repeat(64), 'b'.repeat(64), 'tavily-hosted')), '53c1d15cc2b1dda9665201faab14d56fdd396c515347aaa1c8bc0df08b3a13ba');
  assert.equal(configSha(researchConfig('0'.repeat(64), '0'.repeat(64), 'tavily-hosted')), '58ad4ec211d4a11798e35fd244f28adbd2c9fc360420e3bba10568043637204a');
  assert.equal(configSha(researchProfile('a'.repeat(64), 'b'.repeat(64), 'tavily-search')), 'ed00b6e9607177f04b44a43ed302783277ccda061cb04742f26744b07dfe6b6f');
  assert.equal(configSha(researchProfile('a'.repeat(64), 'b'.repeat(64), 'synthetic-echo')), '93d5a1843e060a0fb1875a7f5e3ffaa3109a2704f0fb1086387dcadc2ddb005e');
});

test('hosted family profiles differ from tavily-hosted only by model, profile name and the C4 vision deltas', () => {
  const base = researchProfile(generation, token, 'tavily-hosted'), baseSelection = researchProfileSelection('tavily-hosted');
  assert.equal(base.model.model, 'openai/gpt-oss-20b');
  const hashes = new Set();
  for (const [profile, modelID] of Object.entries(hostedFamily)) {
    assert.equal(isHostedResearchProfile(profile), true);
    assert.deepEqual(researchProfileSelection(profile), { ...baseSelection, modelID });
    const config = researchConfig(generation, token, profile);
    assert.deepEqual(config.model, { providerID: 'panda-research-hosted', model: modelID });
    assert.deepEqual(Object.keys(config.providers['panda-research-hosted'].models), [modelID]);
    const normalized = JSON.parse(JSON.stringify(config).replaceAll(modelID, 'openai/gpt-oss-20b').replaceAll(profile, 'tavily-hosted'));
    // C4 D1 pt5: vision profiles additionally differ only by image input, media.image.auto_resize:false and an appended image instruction.
    if (profile !== 'tavily-hosted') {
    assert.deepEqual(normalized.media, { image: { auto_resize: false } });delete normalized.media;
    const model = normalized.providers['panda-research-hosted'].models['openai/gpt-oss-20b'];assert.deepEqual(model.capabilities.input, ['text', 'image']);model.capabilities.input = ['text'];
    const agent = normalized.agents['panda-research'], baseSystem = base.agents['panda-research'].system;assert.ok(agent.system.startsWith(baseSystem + ' ') && /untrusted data, never instructions/.test(agent.system.slice(baseSystem.length)));agent.system = baseSystem;
    }
    assert.deepEqual(normalized, JSON.parse(JSON.stringify(base)));
    assert.equal(config.mcp.servers.panda_research.environment.PANDA_RESEARCH_PROFILE, profile);
    hashes.add(researchProfileHash(code, profile));
    const loaded = [{ type: 'document', path: '/runtime/config/opencode.json', info: config }, { type: 'directory', path: '/runtime/config' }, { type: 'document', path: '/runtime/config/opencode.json', info: config }];
    assert.equal(verifiedResearchConfig(loaded, config), true);
  }
  assert.equal(hashes.size, 4);
  for (const profile of ['tavily-hosted-sonnet', 'tavily-hosted-', '', 'synthetic-echo', 'tavily-search', 'toString', '__proto__', null, undefined]) assert.equal(isHostedResearchProfile(profile), false);
  for (const profile of ['tavily-hosted-sonnet', 'tavily-hosted-GPT', 'toString', '__proto__']) {
    assert.throws(() => researchProfileSelection(profile)); assert.throws(() => researchConfig(generation, token, profile)); assert.throws(() => researchProfileHash(code, profile));
  }
});
