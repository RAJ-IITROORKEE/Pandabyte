// Opt-in Windows development launcher. Each accepted request spends one fixture case.
import { execFile, spawn } from 'node:child_process';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { once } from 'node:events';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseEnv, promisify } from 'node:util';

const file = path => fileURLToPath(new URL(path, import.meta.url));
const exec = promisify(execFile);
const [dotenv, clientRoot, ...extra] = process.argv.slice(2);
const owner = process.env.PANDA_PLAYGROUND_FIXTURE_OWNER;
if (process.platform !== 'win32' || extra.length || !dotenv || !clientRoot
  || !isAbsolute(dotenv) || !isAbsolute(clientRoot) || !/^[a-f0-9]{64}$/.test(owner ?? ''))
  throw Error('Provide the development env path, pinned SDK path and fixture owner subject hash.');
if (!parseEnv(await readFile(dotenv, 'utf8')).CLERK_SECRET_KEY?.startsWith('sk_test_') || process.env.VERCEL)
  throw Error('Use a local Clerk development environment.');

const expires = Date.now() + 30 * 60_000;
const token = randomBytes(32).toString('hex');
const credential = Buffer.from(`Bearer ${token}`);
const env = Object.fromEntries(['SystemRoot', 'WINDIR', 'COMSPEC', 'PATHEXT', 'TEMP', 'TMP']
  .filter(key => process.env[key]).map(key => [key, process.env[key]]));
const spent = new Set();
let running = false;
const server = createServer(async (request, response) => {
  const supplied = Buffer.from(request.headers.authorization ?? '');
  if (supplied.length !== credential.length || !timingSafeEqual(supplied, credential)) {
    response.writeHead(401).end();
    return;
  }
  const mode = request.url === '/allow' ? 'allow' : request.url === '/deny' ? 'deny' : null;
  if (!mode || request.method !== 'POST' || request.headers['transfer-encoding']
    || Number(request.headers['content-length'] ?? '0') !== 0 || Date.now() >= expires) {
    response.writeHead(404).end();
    return;
  }
  if (running || spent.has(mode)) {
    response.writeHead(409).end();
    return;
  }
  running = true;
  spent.add(mode);
  try {
    const { stdout } = await exec(process.execPath, [file('opencode-mcp-contract-probe.mjs'), '--client-root', clientRoot, mode],
      { env, windowsHide: true, maxBuffer: 8192, timeout: 120_000 });
    const proof = JSON.parse(stdout);
    const allow = mode === 'allow';
    const toolStatus = allow ? 'completed' : 'error';
    const toolCalls = allow ? 1 : 0;
    if (proof.result !== 'completed' || proof.dispatchMode !== mode || proof.checks?.dispatchPermissionDecision !== mode
      || proof.dispatch?.toolStatus !== toolStatus || proof.toolCalls !== toolCalls
      || proof.dispatch?.[allow ? 'fixtureResultRecorded' : 'nativeToolErrorRecorded'] !== true
      || !proof.permissionSessionRemoved || !proof.fixtureChildrenStopped || !proof.childStopped
      || !proof.descriptorRemoved || !proof.fixtureRemoved) throw Error('unverified');
    const body = JSON.stringify({ toolStatus, toolCalls });
    process.stdout.write(`Verified and cleaned native tool fixture ${mode} (${toolCalls} MCP invocations).\n`);
    response.writeHead(200, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }).end(body);
  } catch {
    process.stderr.write(`Native tool fixture ${mode} could not be verified. The case is spent.\n`);
    response.writeHead(503).end();
  } finally {
    running = false;
  }
});
server.listen(0, '127.0.0.1');
await once(server, 'listening');
const next = spawn(process.execPath, [file('../infra/lightweight/artifacts/launch-baseline.cjs'), dotenv, 'dev', '--hostname', 'localhost', '--port', '3001'], {
  env: {
    ...process.env, NODE_ENV: 'development', PANDABYTE_NEXT_DIST_DIR: '.next-agent-playground-tool-fixture',
    PANDA_AGENT_NATIVE_NEW_MESSAGES: 'false',
    PANDA_PLAYGROUND_FIXTURE_PORT: String(server.address().port),
    PANDA_PLAYGROUND_FIXTURE_TOKEN: token, PANDA_PLAYGROUND_FIXTURE_EXPIRES: String(expires),
  },
  stdio: 'inherit', windowsHide: true,
});
next.once('error', () => { process.exitCode = 1; server.close(); });
next.once('exit', code => { process.exitCode = code ?? 1; server.close(); });
const expire = setTimeout(() => server.close(), expires - Date.now());
expire.unref();
