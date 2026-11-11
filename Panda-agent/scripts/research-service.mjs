// Phase D2 host research service entrypoint (root only, Linux). Not run in development; started by panda-research.service.
// Refuses to start unless every secret/config file has the expected owner, mode and shape. Startup errors are fixed
// messages only (never file content, parse errors or key material), and nothing derived from a secret is logged.
import https from 'node:https';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createResearchTurnRunner } from '../src/server/research-turn-runner.ts';
import { createResearchServiceHandler, researchBodyMax, isPrivateBindAddress } from '../src/server/research-service-handler.ts';

const etc = '/etc/panda-research';
const bad = message => Object.assign(Error(message), { fixed: true });
const fail = error => { console.error('research-service refused to start: ' + (error?.fixed ? error.message : 'startup check failed')); process.exit(1); };
if (process.platform !== 'linux' || process.getuid?.() !== 0) fail(bad('root on Linux required'));

// A secret/config file: regular, root-owned, single link, exactly `mode`. Returns parsed JSON.
async function jsonFile(file, mode) {
  const st = await fs.lstat(file).catch(() => null);
  if (!st || !st.isFile() || st.isSymbolicLink() || st.nlink !== 1 || st.uid !== 0 || (st.mode & 0o777) !== mode || st.size > 16384) throw bad(path.basename(file) + ' denied');
  try { return JSON.parse(await fs.readFile(file, 'utf8')); } catch { throw bad(path.basename(file) + ' is not valid JSON'); }
}
const key32 = (v, name) => { const b = typeof v === 'string' ? Buffer.from(v, 'base64') : null; if (!b || b.length !== 32 || b.toString('base64') !== v) throw bad(name + ' invalid'); return b; };

// Re-read per turn (never cached, never unlinked) so a rotation or removal takes effect immediately.
async function credentials() {
  const c = await jsonFile(path.join(etc, 'credentials.json'), 0o600);
  if (Object.keys(c).sort().join(',') !== 'OPENROUTER_API_KEY,TAVILY_API_KEY' || !/^sk-or-v1-[a-f0-9]{64}$/i.test(c.OPENROUTER_API_KEY) || typeof c.TAVILY_API_KEY !== 'string' || !c.TAVILY_API_KEY.trim() || /[\r\n\0]/.test(c.TAVILY_API_KEY)) throw bad('credentials.json invalid');
  return { openrouterKey: c.OPENROUTER_API_KEY, tavilyKey: c.TAVILY_API_KEY };
}

let config, keys, cert, tlsKey;
try {
  const dirStat = await fs.lstat(etc).catch(() => null);
  if (!dirStat || !dirStat.isDirectory() || dirStat.isSymbolicLink() || dirStat.uid !== 0 || ![0o700, 0o750].includes(dirStat.mode & 0o777)) throw bad(etc + ' denied');
  config = await jsonFile(path.join(etc, 'service.json'), 0o600);
  if (Object.keys(config).sort().join(',') !== 'address,port' || !isPrivateBindAddress(config.address) || !Number.isInteger(config.port) || config.port < 1024 || config.port > 65535) throw bad('service.json invalid (loopback or private IPv4 required)');
  const k = await jsonFile(path.join(etc, 'keys.json'), 0o600);
  if (Object.keys(k).sort().join(',') !== 'dispatchKey,resultKey,serviceToken') throw bad('keys.json invalid');
  keys = { dispatchKey: key32(k.dispatchKey, 'dispatchKey'), resultKey: key32(k.resultKey, 'resultKey'), serviceToken: key32(k.serviceToken, 'serviceToken') };
  if (new Set([k.dispatchKey, k.resultKey, k.serviceToken]).size !== 3) throw bad('keys must be distinct');
  await credentials(); // attestation.json is optional at startup: until the owner installs one, turns fail attestation_expired
  const keyStat = await fs.lstat(path.join(etc, 'tls', 'key.pem')).catch(() => null);
  if (!keyStat || !keyStat.isFile() || keyStat.isSymbolicLink() || keyStat.uid !== 0 || (keyStat.mode & 0o777) !== 0o600) throw bad('tls key denied');
  [cert, tlsKey] = await Promise.all([fs.readFile(path.join(etc, 'tls', 'cert.pem')), fs.readFile(path.join(etc, 'tls', 'key.pem'))]);
} catch (error) { fail(error); }

const runner = createResearchTurnRunner({
  codeSource: fileURLToPath(new URL('../runtime/opencode/', import.meta.url)),
  keys: credentials,
  diagnostic: code => console.log(JSON.stringify({ diagnostic: code })), // runner codes are pre-sanitized to [a-z0-9_:.-], at most 80 chars
  attestation: async () => { try { await fs.lstat(path.join(etc, 'attestation.json')); } catch (e) { if (e?.code === 'ENOENT') return null; throw e; } return jsonFile(path.join(etc, 'attestation.json'), 0o600); },
});
const handler = createResearchServiceHandler({ keys, runner });
const startup = await handler.reconcile().catch(() => fail(bad('request store reconcile failed')));
console.log(JSON.stringify({ service: 'panda-research', reconciled: startup }));

const server = https.createServer({ cert, key: tlsKey, minVersion: 'TLSv1.2' }, (req, res) => {
  const chunks = []; let size = 0;
  const tooLarge = () => { // refuse and drop the connection instead of draining an oversized body
    chunks.length = 0; res.writeHead(413, { 'content-type': 'application/json', connection: 'close' }); res.end(JSON.stringify({ error: 'body_too_large' }), () => req.destroy());
  };
  if (Number(req.headers['content-length'] ?? 0) > researchBodyMax) { tooLarge(); return; }
  req.on('data', part => { size += part.length; if (size > researchBodyMax) { req.removeAllListeners('data'); req.removeAllListeners('end'); tooLarge(); return; } chunks.push(part); });
  req.on('error', () => res.destroy());
  req.on('end', async () => {
    try {
      const reply = await handler.handle({ method: req.method ?? '', path: req.url ?? '', headers: req.headers, body: Buffer.concat(chunks) });
      if ('json' in reply) { res.writeHead(reply.status, { 'content-type': 'application/json', 'cache-control': 'no-store' }); res.end(JSON.stringify(reply.json)); return; }
      res.writeHead(reply.status, { 'content-type': reply.contentType, 'cache-control': 'no-store' });
      let closed = false; res.on('close', () => { closed = true; });
      // The runner is detached from this response: a client that drops simply stops receiving lines.
      for await (const line of reply.stream) { if (closed) break; res.write(line); }
      res.end();
    } catch { if (!res.headersSent) res.writeHead(500, { 'content-type': 'application/json' }); res.end(JSON.stringify({ error: 'service_error' })); }
  });
});
server.requestTimeout = 30000; server.headersTimeout = 10000; server.keepAliveTimeout = 5000;
server.listen(config.port, config.address, () => console.log(JSON.stringify({ listening: { address: config.address, port: config.port } })));
// Stop accepting, then give an in-flight turn (300 s deadline plus cleanup) up to 310 s before exiting.
let stopping = false;
const stop = async () => { if (stopping) return; stopping = true; server.close(); await Promise.race([handler.idle(), new Promise(r => setTimeout(r, 310000))]); process.exit(0); };
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, stop);
