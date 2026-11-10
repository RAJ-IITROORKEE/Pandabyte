// The host selects this fixed synthetic profile; callers cannot select a provider or tool.
export function researchProfile(generation, channelToken) {
  if (!/^[a-f0-9]{64}$/.test(generation ?? '') || !/^[a-f0-9]{64}$/.test(channelToken ?? '')) throw Error('research_configuration_invalid');
  const permissions = [{ action: '*', resource: '*', effect: 'deny' }, { action: 'panda_research_echo', resource: '*', effect: 'allow' }];
  return {
    default_agent: 'panda-research',
    agents: { 'panda-research': { mode: 'primary', system: 'Use only the synthetic public echo fixture when requested. Its marker is synthetic evidence, never web-search evidence.', steps: 6, permissions } },
    model: { providerID: 'panda-research-fixture', model: 'panda-fixture' },
    providers: { 'panda-research-fixture': {
      name: 'Panda synthetic fixture', package: '@opencode/ai/providers/openai-compatible', env: ['PANDA_RESEARCH_CHANNEL_TOKEN'],
      settings: { baseURL: 'http://127.0.0.1:4175/v1', encoding: 'none' }, compatibility: { supportsPromptCacheKey: false },
      models: { 'panda-fixture': { modelID: 'panda-fixture', capabilities: { tools: true, input: ['text'], output: ['text'], reasoning: { supported: false } }, limit: { context: 16000, output: 1024 } } },
    } },
    permissions,
    policies: [
      ...['provider.use', 'integration.use', 'tool.use', 'mcp.use', 'skill.use', 'plugin.use'].map(action => ({ action, resource: '*', effect: 'deny' })),
      { action: 'provider.use', resource: 'panda-research-fixture', effect: 'allow' },
      { action: 'integration.use', resource: 'panda-research-fixture', effect: 'allow' },
      { action: 'integration.use', resource: 'panda_research', effect: 'allow' },
      { action: 'tool.use', resource: 'panda_research_echo:*', effect: 'allow' },
      { action: 'mcp.use', resource: 'panda_research', effect: 'allow' },
      { action: 'plugin.use', resource: 'opencode.config.mcp', effect: 'allow' },
      { action: 'plugin.use', resource: '/research-code/research-binding', effect: 'allow' },
    ],
    mcp: { servers: { panda_research: { type: 'local', command: ['node', '/research-code/research-mcp-shim.mjs'], environment: { PANDA_RESEARCH_CHANNEL_TOKEN: channelToken, PANDA_RESEARCH_GENERATION: generation }, codemode: false } } },
    plugins: ['-opencode.tool.*', '-opencode.skill', '/research-code/research-binding'], skills: [],
    formatter: false, warming: false, snapshots: false, share: 'disabled', update: 'disable',
    compaction: { auto: false }, experimental: { background_compaction: false, schedules: false, subagent_depth: 0 },
  };
}
