"""Fixed-document MCP server; fetched pages remain untrusted data."""
import asyncio
import hashlib
import ipaddress
import json
import re
import socket
from datetime import datetime, timezone
from html.parser import HTMLParser
from urllib.robotparser import RobotFileParser

import httpcore
from httpcore._backends.auto import AutoBackend
from mcp.server import MCPServer
from mcp.shared.exceptions import MCPError
from mcp.types import ErrorData

DOCUMENT_ID = 'espressif-esp-idf-5.5.1-esp32-gpio'
HOST = 'docs.espressif.com'
PATH = '/projects/esp-idf/en/v5.5.1/esp32/api-reference/peripherals/gpio.html'
URL = 'https://' + HOST + PATH
AGENT = 'PandaByteDocs/1.0'
MAX_BYTES = 256 * 1024
RISK = re.compile(r'\b(?:ignore|disregard|override)\b.{0,80}\b(?:instruction|system|previous|prompt)\b|\b(?:reveal|exfiltrate)\b.{0,80}\b(?:secret|token|credential)', re.I | re.S)
BLOCKED = tuple(ipaddress.ip_network(value) for value in ('0.0.0.0/8', '10.0.0.0/8', '100.64.0.0/10', '127.0.0.0/8', '169.254.0.0/16', '172.16.0.0/12', '192.0.0.0/24', '192.0.2.0/24', '192.168.0.0/16', '198.18.0.0/15', '198.51.100.0/24', '203.0.113.0/24', '224.0.0.0/4', '240.0.0.0/4', '::/96', '64:ff9b::/96', '64:ff9b:1::/48', '100::/64', '2001::/23', '2001:db8::/32', '2002::/16', '3fff::/20', 'fc00::/7', 'fe80::/10', 'ff00::/8'))

def validate_addresses(values):
    if not values or len(values) > 32: raise ValueError('address')
    parsed = [ipaddress.ip_address(v) for v in values]
    if any(not p.is_global or p.is_multicast or getattr(p, 'ipv4_mapped', None) is not None or any(p in network for network in BLOCKED) for p in parsed): raise ValueError('address')
    return str(parsed[0])

class PinnedBackend(httpcore.AsyncNetworkBackend):
    def __init__(self, address): self.address = address; self.backend = AutoBackend()
    async def connect_tcp(self, host, port, timeout=None, local_address=None, socket_options=None):
        if host != HOST or port != 443 or local_address is not None: raise ValueError('destination')
        stream = await self.backend.connect_tcp(self.address, port, timeout=timeout, socket_options=socket_options)
        peer = stream.get_extra_info('server_addr')
        if not peer or ipaddress.ip_address(peer[0]) != ipaddress.ip_address(self.address):
            await stream.aclose(); raise ValueError('peer')
        return stream
    async def connect_unix_socket(self, *args, **kwargs): raise ValueError('destination')
    async def sleep(self, seconds): await self.backend.sleep(seconds)

class TextExtractor(HTMLParser):
    def __init__(self): super().__init__(convert_charrefs=True); self.depth = 0; self.skip = 0; self.parts = []; self.tag = None; self.block = []; self.normal = False; self.header = False; self.matches = []; self.nest = 0; self.hidden_depth = 0
    def handle_starttag(self, tag, attrs):
        void = tag in ('area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr')
        if not void: self.nest += 1
        attributes = dict(attrs)
        if not self.hidden_depth and ('hidden' in attributes or attributes.get('aria-hidden') == 'true'):
            if void: return
            self.hidden_depth = self.nest
        if self.hidden_depth: return
        if tag == 'main' or dict(attrs).get('role') == 'main': self.depth += 1
        if self.depth and tag in ('script', 'style', 'nav', 'noscript', 'svg', 'template', 'header', 'footer'): self.skip += 1
        if self.depth and not self.skip and tag in ('h2', 'h3', 'p', 'pre') and self.tag is None: self.tag = tag; self.block = []
        if self.depth and not self.skip and tag in ('p', 'li', 'h1', 'h2', 'h3', 'pre', 'div', 'br'): self.parts.append('\n')
    def handle_endtag(self, tag):
        if tag in ('area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr'): return
        if self.hidden_depth:
            if self.nest == self.hidden_depth: self.hidden_depth = 0
            self.nest = max(0, self.nest - 1)
            return
        if self.depth and tag in ('script', 'style', 'nav', 'noscript', 'svg') and self.skip: self.skip -= 1
        if self.depth and tag in ('template', 'header', 'footer') and self.skip: self.skip -= 1
        if self.depth and self.tag == tag:
            block = ' '.join(''.join(self.block).split()).strip('¶\uf0c1 ')
            if tag == 'h2': self.normal = block == 'API Reference - Normal GPIO'; self.header = False
            elif tag == 'h3': self.header = self.normal and block == 'Header File'
            elif self.header and '#include "driver/gpio.h"' in block: self.matches.append('#include "driver/gpio.h"')
            self.tag = None; self.block = []
        if tag == 'main' and self.depth: self.depth -= 1
        self.nest = max(0, self.nest - 1)
    def handle_startendtag(self, tag, attrs):
        self.handle_starttag(tag, attrs)
        self.handle_endtag(tag)
    def handle_data(self, data):
        if self.depth and not self.skip:
            self.parts.append(data)
            if self.tag: self.block.append(data)

def extract_safe_text(html):
    parser = TextExtractor(); parser.feed(html); parser.close()
    text = '\n'.join(' '.join(line.split()) for line in ''.join(parser.parts).splitlines() if line.strip())
    if not text or RISK.search(text) or len(parser.matches) != 1: raise ValueError('content')
    return parser.matches[0]

async def bounded_get(pool, path, media, budget):
    async with pool.stream('GET', 'https://' + HOST + path, headers={'User-Agent': AGENT, 'Accept': media, 'Accept-Encoding': 'identity'}) as response:
        if response.status != 200: raise ValueError('status')
        headers = {}
        for key, value in response.headers:
            key = key.lower()
            if key in (b'content-encoding', b'content-type') and key in headers: raise ValueError('headers')
            headers[key] = value
        if headers.get(b'content-encoding', b'identity').lower() != b'identity': raise ValueError('encoding')
        if media == 'text/html' and headers.get(b'content-type', b'').split(b';', 1)[0].strip().lower() != b'text/html': raise ValueError('media')
        data = bytearray()
        async for chunk in response.aiter_stream():
            if len(chunk) > MAX_BYTES - budget[0]: raise ValueError('size')
            budget[0] += len(chunk)
            data.extend(chunk)
        return bytes(data)

async def fetch_catalog_document(document_id):
    if document_id != DOCUMENT_ID: raise ValueError('document')
    async with asyncio.timeout(10):
        addresses = await asyncio.get_running_loop().getaddrinfo(HOST, 443, type=socket.SOCK_STREAM)
        address = validate_addresses(list(dict.fromkeys(item[4][0] for item in addresses)))
        budget = [0]
        async with httpcore.AsyncConnectionPool(network_backend=PinnedBackend(address), retries=0, http2=False, max_connections=1) as pool:
            robots = await bounded_get(pool, '/robots.txt', 'text/plain', budget)
            rules = RobotFileParser(); rules.parse(robots.decode('utf-8', 'strict').splitlines())
            if not rules.can_fetch(AGENT, URL): raise ValueError('robots')
            page = await bounded_get(pool, PATH, 'text/html', budget)
        text = extract_safe_text(page.decode('utf-8', 'strict'))
        return {'documentId': DOCUMENT_ID, 'url': URL, 'title': 'GPIO & RTC GPIO', 'framework': 'esp-idf', 'chip': 'esp32', 'version': '5.5.1', 'fetchedAt': datetime.now(timezone.utc).isoformat().replace('+00:00', 'Z'), 'bodySha256': hashlib.sha256(page).hexdigest(), 'text': text}

server = MCPServer('pandabyte-restricted-fetch', version='1')

async def enforce_arguments(ctx, next_handler):
    if ctx.method == 'tools/call':
        params = ctx.params
        if not isinstance(params, dict) or params.get('name') != 'fetch_document' or not isinstance(params.get('arguments'), dict) or set(params['arguments']) != {'documentId'} or params['arguments']['documentId'] != DOCUMENT_ID:
            raise MCPError(ErrorData(code=-32602, message='Invalid arguments'))
    return await next_handler(ctx)

server.middleware.append(enforce_arguments)

@server.tool(name='fetch_document', structured_output=False)
async def fetch_document(documentId: str) -> str:
    if documentId != DOCUMENT_ID: raise ValueError('document unavailable')
    try: return json.dumps(await fetch_catalog_document(documentId), ensure_ascii=True, separators=(',', ':'))
    except Exception: raise ValueError('document unavailable') from None

if __name__ == '__main__': server.run(transport='stdio')
