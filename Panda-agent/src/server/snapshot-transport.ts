import https from 'node:https';
import { Readable, pipeline } from 'node:stream';
import type { ReadableStream as NodeWebStream } from 'node:stream/web';
import { createBrotliDecompress, createGunzip, createInflate } from 'node:zlib';
import { boundedAgentFetch } from './lightweight-fetch.ts';

// The agent holds only transport connections, keyed by TLS origin. Actor headers belong to each request.
const agent = new https.Agent({ keepAlive: true, maxSockets: 8, maxFreeSockets: 2, timeout: 60_000 });
const snapshotPath = '/api/database/rpc/panda_agent_runtime_admin_snapshot';

const fetchSnapshot = boundedAgentFetch(async (input, init) => {
    const request = new Request(input, init);
    request.signal.throwIfAborted();
    const headers = new Headers(request.headers);
    headers.set('accept-encoding', 'gzip, deflate, br');
    headers.set('cache-control', 'no-store');
    headers.set('pragma', 'no-cache');
    // Compute framing from the actual SDK body and take the Host only from the verified URL.
    for (const key of ['host', 'connection', 'transfer-encoding', 'content-length']) headers.delete(key);
    const payload = typeof init?.body === 'string' ? init.body : undefined;
    if (payload !== undefined) headers.set('content-length', String(Buffer.byteLength(payload)));
    return new Promise<Response>((resolve, reject) => {
        const outgoing = https.request(request.url, {
            method: 'POST', agent, rejectUnauthorized: true, headers: Object.fromEntries(headers), signal: request.signal,
        }, response => {
            try {
                const status = response.statusCode ?? 0;
                if ([301, 302, 303, 307, 308].includes(status)) throw Error('Snapshot redirect rejected');
                const responseHeaders = new Headers();
                for (const [key, value] of Object.entries(response.headers)) {
                    if (Array.isArray(value)) for (const item of value) responseHeaders.append(key, item);
                    else if (value !== undefined) responseHeaders.set(key, value);
                }
                const metadata = { status, statusText: response.statusMessage, headers: responseHeaders };
                if ([204, 205, 304].includes(status)) {
                    response.resume();
                    resolve(new Response(null, metadata));
                    return;
                }
                const encoding = (response.headers['content-encoding'] ?? 'identity').trim().toLowerCase();
                const decode = {gzip: createGunzip, deflate: createInflate, br: createBrotliDecompress};
                let body: Readable = response;
                if (encoding !== 'identity') {
                    if (!Object.hasOwn(decode, encoding)) throw Error('Unsupported snapshot encoding');
                    const decoded = decode[encoding as keyof typeof decode]();
                    pipeline(response, decoded, () => { /* Body errors propagate through the decoded stream. */ });
                    body = decoded;
                }
                // boundedAgentFetch applies the 4 MiB limit and the deadline to the decoded bytes.
                resolve(new Response(Readable.toWeb(body) as ReadableStream<Uint8Array>, metadata));
            } catch (error) {
                response.destroy();
                reject(error);
            }
        });
        outgoing.once('error', reject);
        if (payload !== undefined) outgoing.end(payload);
        else if (request.body) {
            pipeline(Readable.fromWeb(request.body as NodeWebStream<Uint8Array>), outgoing, error => {
                if (error) reject(error);
            });
        } else outgoing.end();
    });
});

export function createSnapshotTransport(baseUrl: string, fallback: typeof fetch = fetch): typeof fetch {
    const origin = new URL(baseUrl);
    if (origin.protocol !== 'https:' || !/^[a-z0-9]+\.[a-z0-9-]+\.insforge\.app$/.test(origin.hostname)
        || origin.href !== origin.origin + '/' || origin.port) throw Error('Invalid snapshot origin');
    const endpoint = new URL(snapshotPath, origin).href;
    return (input, init) => {
        const url = input instanceof Request ? input.url : input.toString();
        const method = init?.method ?? (input instanceof Request ? input.method : 'GET');
        return url === endpoint && method.toUpperCase() === 'POST' ? fetchSnapshot(input, init) : fallback(input, init);
    };
}
