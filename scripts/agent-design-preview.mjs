import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

// Review only the proposal and exact logo; never expose the repository directory.
const assets = new Map([
  ['/', ['../docs/agent-experience-upgrade/design-proposal.html', 'text/html; charset=utf-8']],
  ['/public/brand/pandabyte-logo.png', ['../public/brand/pandabyte-logo.png', 'image/png']],
]);
const port = Number(process.env.AGENT_DESIGN_PORT ?? 3000);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw Error('Invalid preview port');
const server = createServer(async (request, response) => {
  const path = new URL(request.url, 'http://localhost').pathname;
  const asset = assets.get(path);
  if (!asset || request.method !== 'GET') { response.writeHead(404); response.end(); return; }
  try {
    const bytes = await readFile(fileURLToPath(new URL(asset[0], import.meta.url)));
    response.writeHead(200, {'Content-Type': asset[1], 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'"});
    response.end(bytes);
  } catch { response.writeHead(500); response.end('Preview asset unavailable'); }
});
server.on('error', error => { console.error(error.message); process.exitCode = 1; });
server.listen(port, '127.0.0.1', () => console.log(`Design proposal: http://localhost:${port}`));
