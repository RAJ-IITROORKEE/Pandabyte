import asyncio
import json
import math
import os
import re
import signal
import sys
from dataclasses import dataclass
from datetime import datetime

DOCUMENT_ID = 'espressif-esp-idf-5.5.1-esp32-gpio'
URL = 'https://docs.espressif.com/projects/esp-idf/en/v5.5.1/esp32/api-reference/peripherals/gpio.html'
_SLOT = asyncio.Lock()
ERROR_CODES = frozenset({'invalid_document', 'invalid_result', 'protocol', 'timeout', 'unavailable'})

class FetchError(Exception):
    def __init__(self, code):
        if code not in ERROR_CODES: raise ValueError('invalid error code')
        self.code = code; super().__init__(code)

def _pairs(values):
    result = {}
    for key, value in values:
        if key in result: raise ValueError('duplicate')
        result[key] = value
    return result

def _strict_json(raw):
    value = json.loads(raw, object_pairs_hook=_pairs, parse_constant=lambda _: (_ for _ in ()).throw(ValueError('number')))
    def visit(item):
        if isinstance(item, str): item.encode('utf-16-le')
        elif isinstance(item, float) and not math.isfinite(item): raise ValueError('number')
        elif isinstance(item, list):
            for child in item: visit(child)
        elif isinstance(item, dict):
            for key, child in item.items(): visit(key); visit(child)
    visit(value)
    return value

@dataclass(frozen=True)
class FetchDocument:
    document_id: str
    url: str
    title: str
    framework: str
    chip: str
    version: str
    fetched_at: str
    body_sha256: str
    text: str

def parse_document(value):
    keys = {'documentId', 'url', 'title', 'framework', 'chip', 'version', 'fetchedAt', 'bodySha256', 'text'}
    if not isinstance(value, dict) or set(value) != keys or value['documentId'] != DOCUMENT_ID or value['url'] != URL or value['title'] != 'GPIO & RTC GPIO' or value['framework'] != 'esp-idf' or value['chip'] != 'esp32' or value['version'] != '5.5.1': raise FetchError('invalid_result')
    if not isinstance(value['fetchedAt'], str) or len(value['fetchedAt']) > 40: raise FetchError('invalid_result')
    try:
        if datetime.fromisoformat(value['fetchedAt'].replace('Z', '+00:00')).utcoffset() is None: raise ValueError()
        if not isinstance(value['bodySha256'], str) or not re.fullmatch(r'[0-9a-f]{64}', value['bodySha256']): raise ValueError()
        if value['text'] != '#include "driver/gpio.h"': raise ValueError()
    except (ValueError, UnicodeError): raise FetchError('invalid_result') from None
    return FetchDocument(value['documentId'], value['url'], value['title'], value['framework'], value['chip'], value['version'], value['fetchedAt'], value['bodySha256'], value['text'])

async def _call(process, ident, method, params):
    request = json.dumps({'jsonrpc': '2.0', 'id': ident, 'method': method, 'params': params}, separators=(',', ':')).encode() + b'\n'
    process.stdin.write(request); await process.stdin.drain()
    for _ in range(8):
        line = await process.stdout.readline()
        if not line or len(line) > 32768: raise FetchError('protocol')
        try: message = _strict_json(line)
        except (ValueError, UnicodeError, RecursionError): raise FetchError('protocol') from None
        if not isinstance(message, dict) or message.get('jsonrpc') != '2.0': raise FetchError('protocol')
        if 'id' not in message and isinstance(message.get('method'), str) and set(message) <= {'jsonrpc', 'method', 'params'}: continue
        if set(message) != {'jsonrpc', 'id', 'result'} or type(message['id']) is not int or message['id'] != ident or not isinstance(message['result'], dict): raise FetchError('protocol')
        return message['result']
    raise FetchError('protocol')

async def _reap(process):
    if os.name != 'nt':
        try: os.killpg(process.pid, signal.SIGTERM)
        except ProcessLookupError: pass
    elif process.returncode is None:
        try: process.terminate()
        except ProcessLookupError: pass
    try: await asyncio.wait_for(process.wait(), .5)
    except asyncio.TimeoutError:
        if os.name != 'nt':
            try: os.killpg(process.pid, signal.SIGKILL)
            except ProcessLookupError: pass
        else:
            try: process.kill()
            except ProcessLookupError: pass
        await process.wait()
    if os.name != 'nt':
        try: os.killpg(process.pid, signal.SIGKILL)
        except ProcessLookupError: pass

async def _reap_safely(process):
    # Repeated cancellation must not interrupt child cleanup or imply it succeeded.
    task = asyncio.create_task(_reap(process))
    interrupted = False
    while not task.done():
        try: await asyncio.shield(task)
        except asyncio.CancelledError: interrupted = True
    task.result()
    if interrupted: raise asyncio.CancelledError

async def fetch_document(document_id: str) -> FetchDocument:
    if document_id != DOCUMENT_ID: raise FetchError('invalid_document')
    try:
        async with asyncio.timeout(10):
            async with _SLOT:
                env = {key: os.environ[key] for key in ('SYSTEMROOT', 'WINDIR') if key in os.environ}
                env.update({'PYTHONIOENCODING': 'utf-8', 'PYTHONUNBUFFERED': '1'})
                spawning = asyncio.create_task(asyncio.create_subprocess_exec(sys.executable, '-m', 'lightweight.mcp_fetch_server', stdin=asyncio.subprocess.PIPE, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.DEVNULL, env=env, limit=32769, start_new_session=os.name != 'nt'))
                try: process = await asyncio.shield(spawning)
                except asyncio.CancelledError:
                    try:
                        while not spawning.done():
                            try: await asyncio.shield(spawning)
                            except asyncio.CancelledError: continue
                        process = spawning.result()
                        await _reap_safely(process)
                    except Exception as exc: raise RuntimeError('MCP cleanup outcome unknown') from exc
                    raise
                try:
                    init = await _call(process, 1, 'initialize', {'protocolVersion': '2025-11-25', 'capabilities': {}, 'clientInfo': {'name': 'pandabyte-fetch-client', 'version': '1'}})
                    if init.get('protocolVersion') != '2025-11-25' or not isinstance(init.get('capabilities', {}).get('tools'), dict): raise FetchError('protocol')
                    process.stdin.write(b'{"jsonrpc":"2.0","method":"notifications/initialized"}\n'); await process.stdin.drain()
                    listing = await _call(process, 2, 'tools/list', {})
                    if not isinstance(listing.get('tools'), list) or [x.get('name') for x in listing['tools']] != ['fetch_document']: raise FetchError('protocol')
                    result = await _call(process, 3, 'tools/call', {'name': 'fetch_document', 'arguments': {'documentId': document_id}})
                    content = result.get('content')
                    if result.get('isError') or not isinstance(content, list) or len(content) != 1 or content[0].get('type') != 'text': raise FetchError('unavailable')
                    try: return parse_document(_strict_json(content[0]['text']))
                    except (ValueError, KeyError, TypeError, UnicodeError, RecursionError): raise FetchError('invalid_result') from None
                finally:
                    try: await _reap_safely(process)
                    except Exception as exc: raise RuntimeError('MCP cleanup outcome unknown') from exc
    except asyncio.TimeoutError: raise FetchError('timeout') from None
    except (OSError, ValueError, KeyError, TypeError, asyncio.LimitOverrunError): raise FetchError('unavailable') from None
