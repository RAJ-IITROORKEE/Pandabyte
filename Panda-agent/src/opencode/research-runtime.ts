import { createHash } from 'node:crypto';
import { posix } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { researchProfile, researchProfileSelection } from '../../runtime/opencode/research-profile.mjs';
import { researchJSON, researchObject } from './research-values.ts';

export const researchNativeVersion = '2.2.5';
export const researchImageId = 'sha256:bbcbbcf6fd524caefa0063d6334e31889153e2c492713cf7f87e6eeb1cce33df';
export const researchToolName = 'panda_research_echo';
export type ResearchProfileID = 'synthetic-echo' | 'tavily-search';
export const researchCodeFiles = ['research-binding/index.ts', 'research-controller.mjs', 'research-http-proxy.mjs', 'research-mcp-shim.mjs', 'research-profile.mjs', 'research-provider-channel.mjs'] as const;
export const researchConfig = researchProfile;

export function researchProfileHash(codeFiles: Record<string, string | Buffer>, profile: ResearchProfileID = 'synthetic-echo'): string {
  researchProfileSelection(profile);
  if (!codeFiles || !isDeepStrictEqual(Object.keys(codeFiles).sort(), [...researchCodeFiles])) throw Error('research_code_invalid');
  const code = researchCodeFiles.map(name => {
    const value = codeFiles[name];
    if (!(typeof value === 'string' || Buffer.isBuffer(value)) || !value.length) throw Error('research_code_invalid');
    return [name, createHash('sha256').update(value).digest('hex')];
  });
  return createHash('sha256').update(JSON.stringify({ image: researchImageId, version: researchNativeVersion,
    profileID: profile, profile: researchProfile('0'.repeat(64), '0'.repeat(64), profile), code })).digest('hex');
}

export function verifiedResearchConfig(loaded: unknown, config: ReturnType<typeof researchConfig>): boolean {
  if (!researchJSON(loaded,1048576) || !Array.isArray(loaded) || loaded.length !== 3) return false;
  // 2.2.5 loads OPENCODE_CONFIG_DIR's document+directory, then OPENCODE_CONFIG's document.
  return isDeepStrictEqual(loaded,[{type:'document',path:'/runtime/config/opencode.json',info:config},
    {type:'directory',path:'/runtime/config'},{type:'document',path:'/runtime/config/opencode.json',info:config}]);
}

export type ResearchContainerExpected = {
  containerId: string; nativeDirectory: string; codeDirectory: string;
  imageMetadata: {Id:string;Architecture:string;Config:{Labels:Record<string,string>;Env:string[]}};
  labels: { 'panda.research.binding': string; 'panda.research.profile': string; 'panda.native.lease': string };
  environment: { PANDA_NATIVE_PASSWORD: string; PANDA_RESEARCH_CHANNEL_TOKEN: string; PANDA_RESEARCH_GENERATION: string; PANDA_RESEARCH_PROFILE: ResearchProfileID };
};
type Inspect = {
  Id?: unknown; Image?: unknown; Platform?: unknown;
  Config?: { Image?: unknown; User?: unknown; WorkingDir?: unknown; Entrypoint?: unknown; Cmd?: unknown; Labels?: unknown; Env?: unknown };
  HostConfig?: Record<string, unknown>;
  Mounts?: { Type?: unknown; Source?: unknown; Destination?: unknown; RW?: unknown; Propagation?: unknown }[];
  NetworkSettings?: { Networks?: unknown; Ports?: unknown };
};
const empty = (value: unknown) => value === null || value === undefined || (Array.isArray(value) ? value.length === 0 : typeof value === 'object' && Object.keys(value).length === 0);
const absolute = (path: unknown): path is string => typeof path === 'string' && path.startsWith('/') && path !== '/' && !path.includes('\0') && !path.includes('\\') && posix.normalize(path) === path;
const overlaps = (a: string, b: string) => a === b || a.startsWith(b + '/') || b.startsWith(a + '/');

// The host supplies metadata read from Docker for the exact immutable image, never browser JSON.
export function verifyResearchContainer(value: unknown, expected: ResearchContainerExpected): boolean {
  try {
    if (!researchJSON({value,expected},262144,24,4096) || !value || typeof value !== 'object' || !expected || !/^[a-f0-9]{64}$/.test(expected.containerId)
      || !absolute(expected.nativeDirectory) || !absolute(expected.codeDirectory) || overlaps(expected.nativeDirectory, expected.codeDirectory)
      || !/^[a-f0-9]{64}$/.test(expected.labels['panda.research.binding']) || !/^[a-f0-9]{64}$/.test(expected.labels['panda.research.profile'])
      || !/^panda-n45-[a-f0-9]{32}$/.test(expected.labels['panda.native.lease'])
      || !isDeepStrictEqual(Object.keys(expected.labels).sort(), ['panda.native.lease', 'panda.research.binding', 'panda.research.profile'])
      || !isDeepStrictEqual(Object.keys(expected.environment).sort(), ['PANDA_NATIVE_PASSWORD', 'PANDA_RESEARCH_CHANNEL_TOKEN', 'PANDA_RESEARCH_GENERATION', 'PANDA_RESEARCH_PROFILE'])
      || ![expected.environment.PANDA_NATIVE_PASSWORD, expected.environment.PANDA_RESEARCH_CHANNEL_TOKEN, expected.environment.PANDA_RESEARCH_GENERATION].every(v => /^[a-f0-9]{64}$/.test(v))) return false;
    researchProfileSelection(expected.environment.PANDA_RESEARCH_PROFILE);
    const selected=expected.imageMetadata;
    if(!selected||selected.Id!==researchImageId||selected.Architecture!=='arm64'||!selected.Config||!researchObject(selected.Config.Labels)
      ||!isDeepStrictEqual(Object.keys(selected.Config.Labels).sort(),['panda.fixture.run','panda.fixture.source-sha256','panda.native.config-sha256'])
      ||!Object.values(selected.Config.Labels).every(v=>typeof v==='string'&&v.length>0&&v.length<=512&&!/[\r\n\0]/.test(v))||!Array.isArray(selected.Config.Env))return false;
    const inherited=new Map<string,string>();
    for(const item of selected.Config.Env){
      if(typeof item!=='string'||!item.includes('='))return false;const index=item.indexOf('='),key=item.slice(0,index),content=item.slice(index+1);
      if(!['PATH','NODE_VERSION','YARN_VERSION','NODE_ENV'].includes(key)||inherited.has(key)||/[\r\n\0]/.test(content)||content.length>4096)return false;inherited.set(key,content);
    }
    if(!isDeepStrictEqual([...inherited.keys()].sort(),['NODE_ENV','NODE_VERSION','PATH','YARN_VERSION']))return false;
    const actual = value as Inspect, config = actual.Config, host = actual.HostConfig;
    if (actual.Id !== expected.containerId || actual.Image !== researchImageId || actual.Platform !== 'linux' || !config || !host
      || config.Image !== researchImageId || config.User !== '10001:10001' || config.WorkingDir !== '/runtime/workspace'
      || !isDeepStrictEqual(config.Entrypoint, ['node']) || !isDeepStrictEqual(config.Cmd, ['/research-code/research-controller.mjs'])
      || !isDeepStrictEqual(config.Labels, {...selected.Config.Labels,...expected.labels})) return false;
    if (!Array.isArray(config.Env)) return false;
    const environment = new Map<string, string>();
    for (const item of config.Env) {
      if (typeof item !== 'string' || !/^[A-Z_][A-Z0-9_]*=/.test(item)) return false;
      const index = item.indexOf('='), key = item.slice(0, index), content = item.slice(index + 1);
      if (environment.has(key) || ![...inherited.keys(), ...Object.keys(expected.environment)].includes(key) || /[\r\n\0]/.test(content)) return false;
      environment.set(key, content);
    }
    const expectedEnvironment=new Map([...inherited,...Object.entries(expected.environment)]);
    if(environment.size!==expectedEnvironment.size||![...expectedEnvironment].every(([key,val])=>environment.get(key)===val))return false;
    if (host.NetworkMode !== 'none' || host.ReadonlyRootfs !== true || host.Privileged !== false
      || !isDeepStrictEqual(host.CapDrop, ['ALL']) || !empty(host.CapAdd) || !empty(host.Devices) || !empty(host.DeviceRequests)
      || !isDeepStrictEqual(host.SecurityOpt, ['no-new-privileges']) || host.Memory !== 402653184 || host.MemorySwap !== 402653184
      || host.NanoCpus !== 1000000000 || host.PidsLimit !== 128 || !empty(host.PortBindings)
      || !isDeepStrictEqual(host.Tmpfs, { '/tmp': 'rw,noexec,nosuid,nodev,size=16777216,uid=10001,gid=10001,mode=0700' })
      || !empty(host.VolumesFrom) || !empty(host.Links) || !empty(host.ExtraHosts) || !empty(host.Binds) && (!Array.isArray(host.Binds) || host.Binds.length !== 2)
      || !empty(host.Dns) || !empty(host.DnsSearch) || !empty(host.DnsOptions)
      || [host.PidMode, host.IpcMode, host.UTSMode, host.UsernsMode, host.CgroupnsMode].some(mode => mode === 'host' || typeof mode === 'string' && mode.startsWith('container:'))) return false;
    if (!Array.isArray(actual.Mounts) || actual.Mounts.length !== 2) return false;
    const mounts = new Map(actual.Mounts.map(mount => [mount.Destination, mount]));
    for (const [destination, source, rw] of [['/runtime', expected.nativeDirectory, true], ['/research-code', expected.codeDirectory, false]] as const) {
      const mount = mounts.get(destination);
      if (!mount || mount.Type !== 'bind' || mount.Source !== source || mount.RW !== rw || mount.Propagation !== 'rprivate') return false;
    }
    if (!actual.NetworkSettings || !empty(actual.NetworkSettings.Ports) || !actual.NetworkSettings.Networks || !isDeepStrictEqual(Object.keys(actual.NetworkSettings.Networks), ['none'])) return false;
    return true;
  } catch { return false; }
}
