import unittest
import asyncio
import os
import sys
from unittest.mock import patch
from lightweight.mcp_fetch import DOCUMENT_ID, FetchError, _call, _reap_safely, fetch_document

class ClientTests(unittest.IsolatedAsyncioTestCase):
    async def test_repeated_cancellation_waits_for_cleanup(self):
        entered=asyncio.Event();release=asyncio.Event();finished=asyncio.Event()
        async def held(_process):
            entered.set();await release.wait();finished.set()
        with patch('lightweight.mcp_fetch._reap',side_effect=held):
            task=asyncio.create_task(_reap_safely(object()))
            await entered.wait();task.cancel();await asyncio.sleep(0);task.cancel();await asyncio.sleep(0)
            self.assertFalse(task.done());self.assertFalse(finished.is_set())
            release.set()
            with self.assertRaises(asyncio.CancelledError): await task
            self.assertTrue(finished.is_set())
    async def test_unknown_document_is_rejected_before_spawn(self):
        with self.assertRaises(FetchError): await fetch_document('https://example.com/')

    async def test_real_sdk_stdio_handshake_listing_and_denied_call(self):
        process = await asyncio.create_subprocess_exec(sys.executable, '-m', 'lightweight.mcp_fetch_server', stdin=asyncio.subprocess.PIPE, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.DEVNULL, env={**os.environ, 'PYTHONUNBUFFERED': '1'}, limit=32769)
        try:
            async with asyncio.timeout(10):
                init = await _call(process, 1, 'initialize', {'protocolVersion': '2025-11-25', 'capabilities': {}, 'clientInfo': {'name': 'fixture', 'version': '1'}})
                self.assertEqual(init['protocolVersion'], '2025-11-25')
                process.stdin.write(b'{"jsonrpc":"2.0","method":"notifications/initialized"}\n'); await process.stdin.drain()
                listing = await _call(process, 2, 'tools/list', {})
                self.assertEqual([tool['name'] for tool in listing['tools']], ['fetch_document'])
                with self.assertRaises(FetchError):
                    await _call(process, 3, 'tools/call', {'name': 'fetch_document', 'arguments': {'documentId': 'https://example.com'}})
                with self.assertRaises(FetchError):
                    await _call(process, 4, 'tools/call', {'name': 'fetch_document', 'arguments': {'documentId': 'espressif-esp-idf-5.5.1-esp32-gpio', 'url': 'https://example.com'}})
        finally:
            process.terminate(); await process.wait()

    async def test_cancel_terminates_and_reaps_child(self):
        original = asyncio.create_subprocess_exec; spawned = []; entered = asyncio.Event()
        async def spawn(*args, **kwargs):
            process = await original(*args, **kwargs); spawned.append(process); return process
        async def held(*args): entered.set(); await asyncio.Event().wait()
        with patch('lightweight.mcp_fetch.asyncio.create_subprocess_exec', side_effect=spawn), patch('lightweight.mcp_fetch._call', side_effect=held):
            task = asyncio.create_task(fetch_document(DOCUMENT_ID)); await asyncio.wait_for(entered.wait(), 5); task.cancel()
            with self.assertRaises(asyncio.CancelledError): await task
        self.assertEqual(len(spawned), 1); self.assertIsNotNone(spawned[0].returncode)

    async def test_oversized_frame_is_rejected(self):
        class In:
            def write(self, data): pass
            async def drain(self): pass
        class Out:
            async def readline(self): return b'x' * 32769
        class Process: stdin = In(); stdout = Out()
        with self.assertRaises(FetchError): await _call(Process(), 1, 'tools/list', {})

    async def test_protocol_rejects_duplicate_nonfinite_requests_and_notification_flood(self):
        class In:
            def write(self, data): pass
            async def drain(self): pass
        class Out:
            def __init__(self, lines): self.lines = iter(lines)
            async def readline(self): return next(self.lines)
        class Process: stdin = In()
        for lines in ([b'{"jsonrpc":"2.0","id":1,"id":1,"result":{}}\n'], [b'{"jsonrpc":"2.0","id":1,"result":{"n":NaN}}\n'], [b'{"jsonrpc":"2.0","id":1,"method":"server/request"}\n'], [b'{"jsonrpc":"2.0","method":"notice"}\n'] * 8):
            process = Process(); process.stdout = Out(lines)
            with self.assertRaises(FetchError): await _call(process, 1, 'tools/list', {})
        with self.assertRaises(ValueError): FetchError('secret details')

    async def test_cancel_during_spawn_reaps_and_strips_environment(self):
        original = asyncio.create_subprocess_exec; entered = asyncio.Event(); release = asyncio.Event(); spawned = []; passed = []
        async def delayed(*args, **kwargs):
            passed.append(kwargs['env']); entered.set(); await release.wait()
            process = await original(*args, **kwargs); spawned.append(process); return process
        with patch.dict(os.environ, {'PANDA_PRIVATE_FIXTURE': 'secret'}), patch('lightweight.mcp_fetch.asyncio.create_subprocess_exec', side_effect=delayed):
            task = asyncio.create_task(fetch_document(DOCUMENT_ID)); await asyncio.wait_for(entered.wait(), 5); task.cancel(); release.set()
            with self.assertRaises(asyncio.CancelledError): await task
        self.assertNotIn('PANDA_PRIVATE_FIXTURE', passed[0]); self.assertEqual(len(spawned), 1); self.assertIsNotNone(spawned[0].returncode)

    async def test_parent_receives_fixture_over_real_mcp_stdio(self):
        code = '''import lightweight.mcp_fetch_server as s
async def fake(document_id):
 return {"documentId":s.DOCUMENT_ID,"url":s.URL,"title":"GPIO & RTC GPIO","framework":"esp-idf","chip":"esp32","version":"5.5.1","fetchedAt":"2026-11-06T00:00:00Z","bodySha256":"a"*64,"text":"#include \\"driver/gpio.h\\""}
s.fetch_catalog_document=fake
s.server.run(transport="stdio")'''
        original = asyncio.create_subprocess_exec
        async def spawn(executable, *_args, **kwargs): return await original(executable, '-c', code, **kwargs)
        with patch('lightweight.mcp_fetch.asyncio.create_subprocess_exec', side_effect=spawn):
            result = await fetch_document(DOCUMENT_ID)
        self.assertEqual(result.document_id, DOCUMENT_ID)
        self.assertEqual(result.text, '#include "driver/gpio.h"')
