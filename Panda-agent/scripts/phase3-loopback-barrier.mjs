// Explicit local test instrumentation. No synthesized evidence, credentials or retries.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
if (process.argv[2] !== '--run') {
  console.log('Opt in with --run; loopback 8183 forwards unchanged bytes to 8182.');
  process.exit(0);
}
const dir = path.resolve('Panda-agent/infra/lightweight/artifacts');
const control = path.join(dir, 'phase3-barrier-control.json');
const output = path.join(dir, 'phase3-barrier-counts.json');
const counts = { instrument: 'loopback HTTP delay; no fake provider/source', requests: {}, forwarded: {}, statuses: {}, holds: {before: 0, after: 0}, disconnects: 0, active: 0 };
const save = () => fs.writeFileSync(output, JSON.stringify(counts, null, 2));
const allowed = new Set(['/v1/evidence/select', '/v1/evidence/status', '/v1/evidence/cancel']);
const server = http.createServer(async (req, res) => {
  const kind = req.url?.split('/').at(-1);
  if (req.method !== 'POST' || !allowed.has(req.url) || counts.active >= 2) { res.writeHead(503).end(); return; }
  counts.active++; counts.requests[kind] = (counts.requests[kind] ?? 0) + 1; save();
  let upstream, timer, closed = false;
  const deadline = setTimeout(() => { upstream?.destroy(); if (!closed) res.destroy(); }, 55000);
  const bodyDeadline = setTimeout(() => { req.destroy(); res.destroy(); }, 5000);
  res.once('close', () => {
    closed = true; clearTimeout(timer); clearTimeout(deadline); clearTimeout(bodyDeadline); upstream?.destroy();
    counts.active--; if (!res.writableFinished) counts.disconnects++; save();
  });
  try {
    const chunks = []; let bytes = 0;
    for await (const chunk of req) { bytes += chunk.length; if (bytes > 98304) throw Error('bound'); chunks.push(chunk); }
    clearTimeout(bodyDeadline);
    const body = Buffer.concat(chunks);
    let hold;
    if (kind === 'select' && fs.existsSync(control)) {
      hold = JSON.parse(fs.readFileSync(control, 'utf8')); fs.unlinkSync(control);
      if (!['before', 'after'].includes(hold.stage) || !Number.isInteger(hold.ms) || hold.ms < 1 || hold.ms > 20000) throw Error('control');
      counts.holds[hold.stage]++; save();
    }
    const later = (fn) => { timer = setTimeout(() => { if (!closed) fn(); }, hold.ms); };
    const forward = () => {
      if (closed) return;
      counts.forwarded[kind] = (counts.forwarded[kind] ?? 0) + 1; save();
      upstream = http.request({hostname: '127.0.0.1', port: 8182, path: req.url, method: 'POST', headers: {...req.headers, host: '127.0.0.1:8182'}, timeout: 35000}, response => {
        const parts = []; let size = 0;
        response.on('error', () => { if (!closed) res.destroy(); });
        response.on('aborted', () => { if (!closed) res.destroy(); });
        response.on('data', chunk => { size += chunk.length; if (size > 16384) { upstream.destroy(); res.destroy(); } else parts.push(chunk); });
        response.on('end', () => {
          if (closed || size > 16384) return;
          counts.statuses[`${kind} ${response.statusCode}`] = (counts.statuses[`${kind} ${response.statusCode}`] ?? 0) + 1; save();
          const deliver = () => { if (closed) return; res.writeHead(response.statusCode, response.headers); res.end(Buffer.concat(parts)); };
          if (hold?.stage === 'after') later(deliver); else deliver();
        });
      });
      upstream.once('timeout', () => upstream.destroy());
      upstream.once('error', () => { if (!closed) res.writeHead(502).end(); });
      upstream.end(body);
    };
    if (hold?.stage === 'before') later(forward); else forward();
  } catch { if (!closed) res.writeHead(502).end(); }
});
server.listen(8183, '127.0.0.1', () => { save(); console.log('Phase3 bounded loopback barrier ready; aggregate counts only.'); });
process.once('SIGINT', () => { server.close(); setTimeout(() => process.exit(0), 1000).unref(); });
