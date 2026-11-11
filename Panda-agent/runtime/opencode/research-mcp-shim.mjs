import { createHash } from 'node:crypto';
import { request as httpRequest } from 'node:http';
import { researchProfileSelection } from './research-profile.mjs';

const selected = researchProfileSelection(process.env.PANDA_RESEARCH_PROFILE);
const generation = process.env.PANDA_RESEARCH_GENERATION, token = process.env.PANDA_RESEARCH_CHANNEL_TOKEN;
if (!/^[a-f0-9]{64}$/.test(generation ?? '') || !/^[a-f0-9]{64}$/.test(token ?? '')) throw Error('research_configuration_invalid');
const object = value => value !== null && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype;
const keys = (value, names) => object(value) && Object.keys(value).length === names.length && names.every(key => Object.hasOwn(value, key));
const nativeID = (value, prefix) => typeof value === 'string' && new RegExp(`^${prefix}_[A-Za-z0-9]{26}$`).test(value);
const queryValid = query => typeof query === 'string' && query.isWellFormed() && [...query].length >= 1 && [...query].length <= 400 && !/[\u0000-\u001f\u007f-\u009f]/u.test(query);
const tools = [{ name: selected.name, description: selected.name === 'echo' ? 'Echo a public synthetic fixture query. This is synthetic evidence, not web search.' : 'Search public technical documentation. Returns Tavily search excerpts, not inspected full pages. Never include private information in queries.', inputSchema: { type: 'object', properties: { query: { type: 'string', minLength: 1, maxLength: 400 } }, required: ['query'], additionalProperties: false } }];
const send = value => process.stdout.write(JSON.stringify(value) + '\n');
const failure = id => send({ jsonrpc: '2.0', id, result: { isError: true, content: [{ type: 'text', text: selected.name === 'echo' ? 'Synthetic fixture unavailable' : 'Public search unavailable' }] } });
const error = (id, code, message) => send({ jsonrpc: '2.0', id, error: { code, message } });
function binding(params) {
  if (!object(params) || !Object.keys(params).every(key => ['name', 'arguments', '_meta'].includes(key)) || params.name !== selected.name
    || !keys(params.arguments, ['query', '__pandaNative']) || !queryValid(params.arguments.query)) return null;
  const envelope = params.arguments.__pandaNative, meta = params._meta;
  if (!keys(envelope, ['sessionID', 'assistantMessageID', 'toolID', 'generation', 'inputHash'])
    || !nativeID(envelope.sessionID, 'ses') || !nativeID(envelope.assistantMessageID, 'msg')
    || typeof envelope.toolID !== 'string' || !/^[\x20-\x7e]{1,256}$/.test(envelope.toolID) || !envelope.toolID.trim() || envelope.generation !== generation
    || !object(meta) || !Object.keys(meta).every(key => ['ai.opencode/sessionID', 'progressToken'].includes(key)) || meta['ai.opencode/sessionID'] !== envelope.sessionID
    || (meta.progressToken !== undefined && !Number.isSafeInteger(meta.progressToken) && !(typeof meta.progressToken === 'string' && meta.progressToken.length <= 128))) return null;
  const input = { query: params.arguments.query };
  if (envelope.inputHash !== createHash('sha256').update(JSON.stringify(input)).digest('hex')) return null;
  return { ...envelope, input };
}
const digest = value => createHash('sha256').update(value).digest('hex');
const ordered = (value, names) => object(value) && Object.keys(value).join('\n') === names.join('\n');
// Structural only: the host recomputes the broker's single splitter and binds it by result hash; re-splitting here could only add false rejections.
function passageContent(passages) {
  if (!Array.isArray(passages) || passages.length < 1 || passages.length > 64) return null;
  let content = '';
  for (const [index, passage] of passages.entries()) {
    if (!ordered(passage, ['id', 'text']) || passage.id !== 'P' + (index + 1) || typeof passage.text !== 'string'
      || !passage.text || passage.text.length > 180 || !passage.text.isWellFormed()) return null;
    content += passage.text;
  }
  return content;
}
function validSources(value) {
  if (!Array.isArray(value) || value.length > 3) return false;
  const urls = new Set(), handles = new Set(); let size = 0;
  for (const source of value) {
    if (!ordered(source, ['handle', 'url', 'title', 'passages', 'capturedAt'])
      || !['handle', 'url', 'title', 'capturedAt'].every(key => typeof source[key] === 'string' && source[key].isWellFormed())) return false;
    const content = passageContent(source.passages);
    if (content === null || !source.title.trim() || source.title.length > 300 || !content.trim() || content.length > 6000 || !content.isWellFormed() || source.url.length > 500
      || source.capturedAt.length !== 24 || !Number.isFinite(Date.parse(source.capturedAt)) || new Date(source.capturedAt).toISOString() !== source.capturedAt) return false;
    const url = new URL(source.url);
    if (url.href !== source.url || url.protocol !== 'https:' || url.username || url.password || url.port || url.search || url.hash
      || !/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(url.hostname)
      || /(?:^|\.)(?:localhost|localdomain|local|internal|test|example|invalid)$/.test(url.hostname)) return false;
    const contentHash = digest(content);
    const canonicalHandle = `web:${digest(source.url)}:${contentHash}:${contentHash}`;
    if (source.handle !== 'S'+digest(canonicalHandle).slice(0,16) || urls.has(source.url) || handles.has(source.handle)) return false;
    urls.add(source.url); handles.add(source.handle); size += Buffer.byteLength(content);
    if (size > 16000) return false;
  }
  return true;
}
function callBroker(body) {
  const encoded = Buffer.from(JSON.stringify(body));
  if (encoded.length > 16384) return Promise.reject(Error('research_frame_invalid'));
  return new Promise((resolve, reject) => {
    const request = httpRequest({ hostname: '127.0.0.1', port: 4174, path: selected.path, method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', 'content-length': encoded.length }, timeout: selected.timeout, signal: AbortSignal.timeout(selected.timeout) }, response => {
      const chunks = []; let size = 0;
      response.on('data', chunk => { size += chunk.length; if (size > 32768) response.destroy(Error('research_frame_invalid')); else chunks.push(chunk); });
      response.on('error', reject);
      response.on('end', () => {
        try {
          if (response.statusCode !== 200 || response.headers['content-type']?.split(';')[0] !== 'application/json') throw Error();
          const result = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks)));
          if (!keys(result, ['content']) || !Array.isArray(result.content) || result.content.length !== 1 || !keys(result.content[0], ['type', 'text']) || result.content[0].type !== 'text' || typeof result.content[0].text !== 'string') throw Error();
          const item = result.content[0];
          if (!item.text.isWellFormed() || Buffer.byteLength(item.text) > 24000) throw Error();
          const text = JSON.parse(item.text);
          if (selected.name === 'echo') {
            if (!keys(text, ['query', 'marker']) || text.query !== body.input.query || text.marker !== 'synthetic-public-evidence') throw Error();
            resolve({ content: [{ type: 'text', text: JSON.stringify({ query: text.query, marker: text.marker }) }] });
          } else {
            if (!keys(text, ['kind', 'sources']) || text.kind !== 'tavily_excerpt' || !validSources(text.sources)
              || item.text !== JSON.stringify({ kind: 'tavily_excerpt', sources: text.sources })) throw Error();
            resolve(result);
          }
        } catch { reject(Error('research_response_invalid')); }
      });
    });
    request.on('timeout', () => request.destroy(Error('research_timeout')));
    request.on('error', reject); request.end(encoded);
  });
}
// Parallel native tool calls (at most 4 per provider response) are queued and sent to the broker one at a time:
// the host store admits a new operation only after the previous one settled, so concurrent calls would 409.
let initialized = false, queued = 0, tail = Promise.resolve(), pending = Buffer.alloc(0);
function dispatch(line) {
  let frame;
  try { frame = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(line)); } catch { error(null, -32700, 'Parse error'); return; }
  if (!object(frame) || frame.jsonrpc !== '2.0' || typeof frame.method !== 'string' || !Object.keys(frame).every(key => ['jsonrpc', 'id', 'method', 'params'].includes(key))) { error(null, -32600, 'Invalid request'); return; }
  if (!Object.hasOwn(frame, 'id')) return;
  if (!(typeof frame.id === 'string' && frame.id.length <= 128 && frame.id.isWellFormed()) && !Number.isSafeInteger(frame.id)) { error(null, -32600, 'Invalid request'); return; }
  const id = frame.id;
  if (!initialized && frame.method === 'initialize') {
    initialized = true; send({ jsonrpc: '2.0', id, result: { protocolVersion: ['2024-11-05', '2025-03-26'].includes(frame.params?.protocolVersion) ? frame.params.protocolVersion : '2025-03-26', capabilities: { tools: {} }, serverInfo: { name: 'panda-research-fixture', version: '1.0.0' } } }); return;
  }
  if (!initialized) { error(id, -32600, 'Not initialized'); return; }
  if (frame.method === 'ping') { send({ jsonrpc: '2.0', id, result: {} }); return; }
  if (frame.method === 'tools/list') { send({ jsonrpc: '2.0', id, result: { tools } }); return; }
  if (frame.method !== 'tools/call') { error(id, -32601, 'Method not found'); return; }
  const bound = binding(frame.params);
  if (!bound || queued >= 4) { failure(id); return; }
  queued++;
  tail = tail.then(() => callBroker(bound).then(result => send({ jsonrpc: '2.0', id, result }), () => failure(id))).catch(() => {}).finally(() => { queued--; });
}
process.stdin.on('data', chunk => {
  // Cap each frame before accumulating it; a producer cannot stream an unbounded unterminated line.
  let start = 0;
  for (let index = 0; index < chunk.length; index++) if (chunk[index] === 10) {
    const segment = chunk.subarray(start, index);
    if (pending.length + segment.length > 16384) { process.exit(1); }
    dispatch(Buffer.concat([pending, segment])); pending = Buffer.alloc(0); start = index + 1;
  }
  const tail = chunk.subarray(start);
  if (pending.length + tail.length > 16384) { process.exit(1); }
  pending = Buffer.concat([pending, tail]);
});
