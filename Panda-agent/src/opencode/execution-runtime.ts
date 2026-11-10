import { isAbsolute, relative, resolve, sep } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { assistantSystemPrompt } from './assistant-artifacts.ts';

export const nativeExecutionVersion = '2.2.6';
export const nativeProviderID = 'panda-native';
export const nativeModel = 'openai/gpt-6-luna';
export type NativeExecutionDescriptor = { version: string; pid: number; baseUrl: string; directory: string; configHash: string; generation: string };
const inside = (parent: string, path: string) => { const rel = relative(parent, path); return !!rel && rel !== '..' && !rel.startsWith('..' + sep) && !isAbsolute(rel); };
const requireValue = (value: unknown) => { if (!value) throw Error('native_execution_unavailable'); };

export function executionConfig(baseURL: string, pluginDirectory: string) {
  const match = /^http:\/\/127\.0\.0\.1:([1-9][0-9]{0,4})\/v1$/.exec(baseURL);
  requireValue(match && Number(match[1]) <= 65535 && isAbsolute(pluginDirectory));
  return {
    default_agent: 'panda', agents: { panda: { mode: 'primary', system: assistantSystemPrompt, steps: 2, permissions: [{ action: '*', resource: '*', effect: 'deny' }] } },
    model: { providerID: nativeProviderID, model: nativeModel },
    providers: { [nativeProviderID]: { name: 'Panda local gateway', package: '@opencode/ai/providers/openai-compatible', env: ['PANDA_NATIVE_TOKEN'],
      settings: { baseURL, encoding: 'none' }, compatibility: { supportsPromptCacheKey: false },
      models: { [nativeModel]: { modelID: nativeModel, capabilities: { tools: false, input: ['text'], output: ['text'] }, limit: { context: 11024, output: 700 } } } } },
    permissions: [{ action: '*', resource: '*', effect: 'deny' }],
    policies: [{ action: 'provider.use', resource: '*', effect: 'deny' }, { action: 'provider.use', resource: nativeProviderID, effect: 'allow' },
      { action: 'tool.use', resource: '*', effect: 'deny' }, { action: 'skill.use', resource: '*', effect: 'deny' }, { action: 'mcp.use', resource: '*', effect: 'deny' }, { action: 'integration.connect', resource: '*', effect: 'deny' }, { action: 'plugin.use', resource: pluginDirectory, effect: 'allow' }],
    formatter: false, mcp: { servers: {} }, plugins: [pluginDirectory], skills: [], warming: false, snapshots: false, share: 'disabled', update: 'disable',
    compaction: { auto: false }, experimental: { background_compaction: false, schedules: false, subagent_depth: 0 },
  };
}

export function verifiedExecutionConfig(loaded: unknown, config: ReturnType<typeof executionConfig>, root: string): boolean {
  if (!Array.isArray(loaded) || loaded.length < 1 || loaded.length > 10 || !isAbsolute(root)) return false;
  if (!loaded.every(entry => typeof entry?.path === 'string' && isAbsolute(entry.path) && inside(root, resolve(entry.path))
    && [resolve(root, 'config'), resolve(root, 'config', 'opencode.json')].includes(resolve(entry.path)))) return false;
  const entries = loaded.filter(entry => resolve(entry.path) === resolve(root, 'config', 'opencode.json'));
  if (entries.length < 1 || entries.some(entry => !entry.info)) return false;
  return entries.every(entry => Object.entries(config).every(([key, value]) => (key === 'mcp' && entry.info.mcp === undefined) || isDeepStrictEqual(entry.info[key], value)));
}

export function executionIdentityMatches(descriptor: NativeExecutionDescriptor, info: unknown, generation: string, configHash: string): boolean {
  if (!info || typeof info !== 'object') return false;
  const actual = info as { pid?: unknown; version?: unknown };
  return descriptor.version === nativeExecutionVersion && actual.version === descriptor.version && Number.isSafeInteger(descriptor.pid) && descriptor.pid > 0
    && actual.pid === descriptor.pid && /^[a-f0-9]{64}$/.test(generation) && descriptor.generation === generation
    && /^[a-f0-9]{64}$/.test(configHash) && descriptor.configHash === configHash;
}
