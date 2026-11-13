import 'server-only';
import { createHash } from 'node:crypto';
import { lookup } from 'node:dns/promises';
import { BlockList, isIP } from 'node:net';

// Minimal MCP client for remote servers (Streamable HTTP, JSON-RPC 2.0): initialize, tools/list, tools/call.
// shortcut: no OAuth, no server-to-client requests, no resumable streams; add them (or the official SDK) when a needed server requires them.
export const MCP_SERVER_NAME = /^[a-z0-9]+(-[a-z0-9]+)*$/, MCP_TOOL_NAME = /^[A-Za-z0-9_-]{1,38}$/;
export const MCP_DESCRIPTION_CHARS = 1000, MCP_SCHEMA_BYTES = 4000, MCP_RESULT_CHARS = 2500, MCP_MAX_TOOLS = 40;
const PROTOCOL = '2025-06-18', RESPONSE_BYTES = 512 * 1024, REQUEST_MS = 15000;
export type McpTool = { name: string; description: string; inputSchema: Record<string, unknown>; hash: string; mode: 'allow' | 'ask' | 'never' };
export class McpError extends Error { constructor(message: string) { super(message); this.name = 'McpError'; } }

const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const clean = (s: string, max: number) => s.replace(/[\p{Cc}\p{Cf}]/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, max);

// Separate lists: a BlockList also matches IPv4 addresses against IPv6 rules (as ::ffff:a.b.c.d), so ::/8 would block every IPv4 host.
const blocked4 = new BlockList(), blocked6 = new BlockList();
for (const [net, prefix] of [['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.0.2.0', 24],
  ['192.168.0.0', 16], ['198.18.0.0', 15], ['198.51.100.0', 24], ['203.0.113.0', 24], ['224.0.0.0', 4], ['240.0.0.0', 4]] as const) blocked4.addSubnet(net, prefix, 'ipv4');
for (const [net, prefix] of [['::', 8], ['fc00::', 7], ['fe80::', 10], ['ff00::', 8], ['2001:db8::', 32], ['64:ff9b::', 96]] as const) blocked6.addSubnet(net, prefix, 'ipv6');
export const publicAddress = (address: string, family: number) =>
  family === 4 ? isIP(address) === 4 && !blocked4.check(address, 'ipv4') : family === 6 && isIP(address) === 6 && !blocked6.check(address, 'ipv6');

/** An https URL on the default port whose host name resolves only to public addresses; null otherwise.
 *  shortcut: checked at save, test and turn start; a host that changes DNS between the check and the request is not re-checked. */
export async function publicHttpsUrl(raw: unknown, resolve: (host: string) => Promise<{ address: string; family: number }[]> = host => lookup(host, { all: true, verbatim: true })): Promise<URL | null> {
  if (typeof raw !== 'string' || raw.length > 300 || /\s/.test(raw)) return null;
  let url: URL; try { url = new URL(raw); } catch { return null; }
  const host = url.hostname.toLowerCase();
  if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443') || url.hash || isIP(host.replace(/^\[|\]$/g, ''))
    || !/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(host) || /(?:^|\.)(?:localhost|local|internal|test|example|invalid)$/.test(host)) return null;
  try {
    const addresses = await Promise.race([resolve(host), new Promise<never>((_, reject) => setTimeout(() => reject(new Error('dns')), 3000))]);
    if (!addresses.length || !addresses.every(a => publicAddress(a.address, a.family))) return null;
  } catch { return null; }
  return url;
}

async function readBody(response: Response): Promise<string> {
  if (!response.body) return '';
  const reader = response.body.getReader(), parts: Uint8Array[] = []; let size = 0;
  try { for (;;) { const { done, value } = await reader.read(); if (done) break; size += value.byteLength; if (size > RESPONSE_BYTES) throw new McpError('response too large'); parts.push(value); } }
  finally { void reader.cancel().catch(() => undefined); }
  return new TextDecoder().decode(Buffer.concat(parts));
}

/** JSON-RPC messages from a JSON body (object or batch) or a text/event-stream body. */
export function rpcMessages(contentType: string, body: string): unknown[] {
  if (/^text\/event-stream/i.test(contentType)) {
    const out: unknown[] = [];
    for (const event of body.split(/\r?\n\r?\n/)) {
      const data = event.split(/\r?\n/).filter(l => l.startsWith('data:')).map(l => l.slice(5).replace(/^ /, '')).join('\n');
      if (data) { try { out.push(JSON.parse(data)); } catch { /* not JSON: ignore */ } }
    }
    return out;
  }
  if (!body.trim()) return [];
  const parsed: unknown = JSON.parse(body);
  return Array.isArray(parsed) ? parsed : [parsed];
}

export function normalizeTools(raw: unknown, previous: readonly McpTool[] = []): McpTool[] {
  const out: McpTool[] = [];
  for (const t of Array.isArray(raw) ? raw : []) {
    if (!record(t) || typeof t.name !== 'string' || !MCP_TOOL_NAME.test(t.name) || out.some(o => o.name === t.name)) continue;
    const description = clean(typeof t.description === 'string' ? t.description : '', MCP_DESCRIPTION_CHARS);
    const inputSchema = record(t.inputSchema) ? t.inputSchema : { type: 'object', properties: {} };
    if (Buffer.byteLength(JSON.stringify(inputSchema)) > MCP_SCHEMA_BYTES || (inputSchema.type !== undefined && inputSchema.type !== 'object')) continue;
    const hash = createHash('sha256').update(JSON.stringify([t.name, description, inputSchema])).digest('hex');
    // A tool keeps its Admin mode only while its definition is unchanged; new or changed tools start as 'never'.
    const kept = previous.find(p => p.name === t.name && p.hash === hash);
    out.push({ name: t.name, description, inputSchema: { type: 'object', ...inputSchema }, hash, mode: kept?.mode ?? 'never' });
    if (out.length === MCP_MAX_TOOLS) break;
  }
  return out;
}

/** Text of a tools/call result, capped; non-text parts are summarised by type. */
export function resultText(result: unknown): { text: string; isError: boolean } {
  if (!record(result)) throw new McpError('invalid tool result');
  const parts: string[] = [];
  for (const c of Array.isArray(result.content) ? result.content : []) {
    if (!record(c)) continue;
    if (c.type === 'text' && typeof c.text === 'string') parts.push(c.text);
    else if (c.type === 'resource' && record(c.resource) && typeof c.resource.text === 'string') parts.push(c.resource.text);
    else if (typeof c.type === 'string') parts.push(`[${c.type} content omitted]`);
  }
  if (!parts.length && result.structuredContent !== undefined) parts.push(JSON.stringify(result.structuredContent));
  const text = parts.join('\n').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '');
  return { text: text.length > MCP_RESULT_CHARS ? text.slice(0, MCP_RESULT_CHARS) + '\n[truncated]' : text, isError: result.isError === true };
}

export function createMcpConnection(options: { url: URL; headers?: Record<string, string>; signal?: AbortSignal; fetchImpl?: typeof fetch }) {
  let session: string | null = null, protocol: string | null = null, nextId = 1, ready: Promise<void> | null = null;
  async function send(method: string, params?: Record<string, unknown>, notification = false): Promise<unknown> {
    const id = notification ? undefined : nextId++;
    const signal = AbortSignal.any([AbortSignal.timeout(REQUEST_MS), ...(options.signal ? [options.signal] : [])]);
    const response = await (options.fetchImpl ?? fetch)(options.url, { method: 'POST', redirect: 'error', cache: 'no-store', credentials: 'omit', signal,
      headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', ...(options.headers ?? {}),
        ...(session ? { 'mcp-session-id': session } : {}), ...(protocol ? { 'mcp-protocol-version': protocol } : {}) },
      body: JSON.stringify({ jsonrpc: '2.0', ...(id === undefined ? {} : { id }), method, ...(params ? { params } : {}) }) });
    if (response.status === 401 || response.status === 403) { void response.body?.cancel().catch(() => undefined); throw new McpError(`not authorised (HTTP ${response.status})`); }
    if (!response.ok) { void response.body?.cancel().catch(() => undefined); throw new McpError(`HTTP ${response.status}`); }
    if (method === 'initialize') session = response.headers.get('mcp-session-id');
    const body = await readBody(response);
    if (notification) return null;
    const message = rpcMessages(response.headers.get('content-type') ?? '', body).find(m => record(m) && m.id === id);
    if (!record(message)) throw new McpError('no response from the server');
    if (record(message.error)) throw new McpError(clean(String(message.error.message ?? 'server error'), 200));
    return message.result;
  }
  const initialize = () => ready ??= (async () => {
    const result = await send('initialize', { protocolVersion: PROTOCOL, capabilities: {}, clientInfo: { name: 'panda-agent', version: '1.0' } });
    if (!record(result) || typeof result.protocolVersion !== 'string') throw new McpError('not an MCP server');
    protocol = result.protocolVersion;
    await send('notifications/initialized', undefined, true);
  })();
  return {
    async listTools(previous: readonly McpTool[] = []): Promise<McpTool[]> {
      await initialize();
      const raw: unknown[] = []; let cursor: string | undefined;
      for (let page = 0; page < 3; page++) {
        const result = await send('tools/list', cursor ? { cursor } : undefined);
        if (!record(result) || !Array.isArray(result.tools)) throw new McpError('invalid tools list');
        raw.push(...result.tools);
        cursor = typeof result.nextCursor === 'string' && result.nextCursor ? result.nextCursor : undefined;
        if (!cursor || raw.length >= MCP_MAX_TOOLS) break;
      }
      return normalizeTools(raw, previous);
    },
    async callTool(name: string, args: Record<string, unknown>) {
      await initialize();
      return resultText(await send('tools/call', { name, arguments: args }));
    },
  };
}

/** A short, safe error for Admin screens and tool results (no URLs, headers or server internals). */
export function mcpErrorText(error: unknown): string {
  if (error instanceof McpError) return error.message;
  if (error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')) return 'timed out';
  return 'connection failed';
}
