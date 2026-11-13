import 'server-only';
import type { HostedDirectModelId } from '../hosted-model.ts';
import { prepareQuestionEvidence } from '../retrieval/answers.ts';
import { createInsforgeAdapters, readRuntimeCatalog } from '../retrieval/insforge-adapters.ts';
import type { BasicRagChatBridge } from '../server/basic-rag-chat-contracts.ts';
import type { ChatActor } from '../server/chat-contracts.ts';
import { createAgentLoopChat } from './chat.ts';
import { createOpenRouterStep } from './openrouter-step.ts';
import { createAgentLoopStore } from './store.ts';
import type { ProductRead } from './tools.ts';
import { searchHostedPublicWeb } from '../search/tavily.ts';
import { SKILL_DESCRIPTION_CHARS, SKILL_MAX_CHARS, SKILL_NAME } from './skill-md.ts';
import type { McpAgentTool, SkillEntry } from './tools.ts';
import { getPublishedRecord } from '../../../lib/editorial/published';
import { pickPinoutImages, type CitationImage } from '../search/citation-image.ts';

async function pinoutImages(actor: ChatActor, sourceUrl: string): Promise<CitationImage[]> {
  const slug = new URL(sourceUrl).pathname.split('/').filter(Boolean).pop() ?? '';
  let record = await getPublishedRecord('products', slug);
  if (record && 'redirectTo' in record) record = await getPublishedRecord('products', record.redirectTo);
  if (!record || 'redirectTo' in record) return [];
  const ids = record.document.mediaIds.filter(id => /^[0-9a-f-]{36}$/.test(id)).slice(0, 12);
  if (!ids.length) return [];
  const { data, error } = await actor.client.database.rpc('panda_agent_media_alts', { p_ids: ids });
  if (error || !Array.isArray(data)) return [];
  return pickPinoutImages(data.filter((m: unknown): m is { id: string; alt: string } => !!m && typeof m === 'object' && typeof (m as { id?: unknown }).id === 'string' && typeof (m as { alt?: unknown }).alt === 'string'));
}
import { createMcpConnection, MCP_SERVER_NAME, MCP_TOOL_NAME, mcpErrorText, publicHttpsUrl } from '../mcp/client.ts';
import { openSecret } from '../mcp/secret.ts';

type McpServerRow = { name: string; url: string; headers: Record<string, string>; tools: McpAgentTool[] };
/** Approved tools of enabled MCP servers. The catalog function requires Admin, so other users get none.
 *  Connections open on the first call to a server and are reused for the rest of the turn. */
async function readMcp(actor: ChatActor) {
  const { data, error } = await actor.client.database.rpc('panda_agent_mcp_agent_catalog');
  if (error || !Array.isArray(data)) return null;
  const servers: McpServerRow[] = [];
  for (const s of data.slice(0, 10)) {
    if (!s || typeof s.name !== 'string' || !MCP_SERVER_NAME.test(s.name) || typeof s.url !== 'string' || !Array.isArray(s.tools)) continue;
    let headers: Record<string, string> = {};
    if (typeof s.authHeader === 'string' && typeof s.secret === 'string') { try { headers = { [s.authHeader]: openSecret(s.name, s.secret) }; } catch { continue; } }
    const tools = s.tools.filter((t: unknown): t is { name: string; description: string; inputSchema: Record<string, unknown> } => !!t && typeof t === 'object'
      && typeof (t as { name?: unknown }).name === 'string' && MCP_TOOL_NAME.test((t as { name: string }).name) && typeof (t as { description?: unknown }).description === 'string'
      && !!(t as { inputSchema?: unknown }).inputSchema && typeof (t as { inputSchema?: unknown }).inputSchema === 'object')
      .map((t: { name: string; description: string; inputSchema: Record<string, unknown> }) => ({ server: s.name, tool: t.name, description: t.description, inputSchema: t.inputSchema }));
    if (tools.length) servers.push({ name: s.name, url: s.url, headers, tools });
  }
  if (!servers.length) return null;
  const connections = new Map<string, ReturnType<typeof createMcpConnection>>();
  return {
    tools: servers.flatMap(s => s.tools),
    async call(server: string, tool: string, args: Record<string, unknown>, signal: AbortSignal) {
      const row = servers.find(s => s.name === server);
      if (!row) throw new Error('unknown server');
      let connection = connections.get(server);
      if (!connection) {
        const url = await publicHttpsUrl(row.url);
        if (!url) throw new Error('server address is not public https');
        connection = createMcpConnection({ url, headers: row.headers, signal });
        connections.set(server, connection);
      }
      try { return await connection.callTool(tool, args); }
      catch (e) { throw new Error(mcpErrorText(e)); }
      finally { try { await actor.client.database.rpc('panda_agent_mcp_record_call', { p_name: server }); } catch { /* A usage counter cannot fail a turn. */ } }
    },
  };
}

/** Enabled skills (name + description) from migration 20261113180000; anything malformed is dropped. */
async function readSkillCatalog(actor: ChatActor): Promise<SkillEntry[]> {
  const { data, error } = await actor.client.database.rpc('panda_agent_agent_skill_catalog');
  if (error || !Array.isArray(data)) return [];
  return data.filter((s): s is SkillEntry => !!s && typeof s === 'object' && typeof s.name === 'string' && SKILL_NAME.test(s.name) && s.name.length <= 64
    && typeof s.description === 'string' && !!s.description.trim() && s.description.length <= SKILL_DESCRIPTION_CHARS && !/[\r\n]/.test(s.description)).slice(0, 12);
}
async function loadSkill(actor: ChatActor, name: string): Promise<string | null> {
  const { data, error } = await actor.client.database.rpc('panda_agent_agent_skill_load', { p_name: name });
  if (error) throw new Error('unavailable');
  return data && typeof data === 'object' && typeof data.content === 'string' && data.content.length <= SKILL_MAX_CHARS && data.name === name ? data.content : null;
}

type Row = Awaited<ReturnType<typeof readRuntimeCatalog>>[number];
/** One product's eligible listing passages through the same scoped, proof-checked reader as cited answers, bound to that product. */
async function readProduct(actor: ChatActor, row: Row, focus: string, signal: AbortSignal): Promise<ProductRead> {
  const adapters = createInsforgeAdapters(actor.client, async () => ({ selections: [] }));
  const evidence = await prepareQuestionEvidence({ subject: actor.subject }, { question: focus ? `${row.title} ${focus}` : row.title, productSku: row.sku },
    { ...adapters, ranking: { mode: 'lexical' }, resolveIdentity: async () => ({ kind: 'resolved', product: { id: row.id, sku: row.sku } }) });
  if (signal.aborted || evidence.kind === 'unauthorized' || evidence.kind === 'invalid' || evidence.kind === 'unavailable' || evidence.kind === 'conflict') return { kind: 'unavailable' };
  if (evidence.kind !== 'ready') return { kind: 'insufficient' };
  const handles = evidence.fragments.map(f => f.handle);
  const passages = evidence.fragments.map(f => { const c = evidence.byHandle.get(f.handle)!;
    return { text: f.text, title: c.title, sourceUrl: c.sourceUrl, capturedAt: c.capturedAt, sectionPath: [...c.sectionPath] }; });
  return { kind: 'ready', passages, revalidate: () => evidence.revalidate(handles) };
}

export function agentLoopChatForActor(options: { actor: ChatActor; key: string; current(): Promise<boolean>; model: HostedDirectModelId;
  policy: Parameters<typeof createAgentLoopChat>[0]['policy'] }): BasicRagChatBridge {
  const { actor } = options;
  return createAgentLoopChat({ store: createAgentLoopStore(actor, options.key), current: options.current, policy: options.policy, model: options.model, step: createOpenRouterStep,
    webHelper: process.env.PANDA_AGENT_WEB_HELPER === 'true',
    tools: { catalog: () => readRuntimeCatalog(actor.client), readProduct: (row, focus, signal) => readProduct(actor, row as Row, focus, signal),
      skills: () => readSkillCatalog(actor), loadSkill: name => loadSkill(actor, name), mcp: () => readMcp(actor),
      pinoutImages: row => pinoutImages(actor, row.sourceUrl),
      ...(process.env.TAVILY_API_KEY?.trim() ? { webSearch: async (query: string, signal: AbortSignal, beforeSend: () => Promise<boolean>) =>
        (await searchHostedPublicWeb(query, { apiKey: process.env.TAVILY_API_KEY!.trim(), signal, beforeSend })).sources } : {}) } });
}
