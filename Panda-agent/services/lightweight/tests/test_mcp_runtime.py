import hashlib
import threading
import asyncio
import concurrent.futures
import httpx
import tempfile
import unittest
from unittest.mock import patch
from pathlib import Path

from fastapi.testclient import TestClient
from lightweight.app import create_app
from test_runtime import SECRET, TURN, body, capability

DOCUMENT_ID = 'espressif-esp-idf-5.5.1-esp32-gpio'

class McpRuntimeTests(unittest.TestCase):
    def token(self, raw, action='runmcp'):
        import base64, hmac, json
        token, claims = capability(raw, action, sku=DOCUMENT_ID)
        claims['aud'] = 'panda-lightweight-mcp-v1'
        segment = base64.urlsafe_b64encode(body(claims)).rstrip(b'=').decode()
        return segment + '.' + base64.urlsafe_b64encode(hmac.new(SECRET, segment.encode(), hashlib.sha256).digest()).rstrip(b'=').decode()

    def test_disabled_does_not_dispatch_and_wrong_audience_is_denied(self):
        with tempfile.TemporaryDirectory() as tmp:
            app=create_app(secret=SECRET,journal_path=str(Path(tmp)/'journal.sqlite'),selector_mode='deterministic-mcu-v1',mcp_enabled=False,clock=lambda:1000)
            with TestClient(app) as client:
                raw=body({'version':1,'turnId':TURN,'documentId':DOCUMENT_ID})
                def post(token): return client.post('/v1/mcp/run',content=raw,headers={'content-type':'application/json','authorization':'Bearer '+token})
                self.assertEqual(post(self.token(raw)).json()['code'],'disabled')
                old,_=capability(raw,'runmcp',sku=DOCUMENT_ID)
                self.assertEqual(post(old).status_code,401)

    def test_fixed_catalog_input_rejects_extra_url_before_execution(self):
        with tempfile.TemporaryDirectory() as tmp:
            app=create_app(secret=SECRET,journal_path=str(Path(tmp)/'journal.sqlite'),selector_mode='deterministic-mcu-v1',mcp_enabled=True,clock=lambda:1000)
            with TestClient(app) as client:
                raw=body({'version':1,'turnId':TURN,'documentId':DOCUMENT_ID,'url':'http://169.254.169.254'})
                response=client.post('/v1/mcp/run',content=raw,headers={'content-type':'application/json','authorization':'Bearer '+self.token(raw)})
                self.assertEqual(response.status_code,400)

    def test_reaped_fetch_failure_is_terminal_and_not_reexecuted(self):
        from lightweight.mcp_fetch import FetchError
        calls=[]
        async def failed(_document):
            calls.append(1)
            raise FetchError('unavailable')
        with tempfile.TemporaryDirectory() as tmp, patch('lightweight.mcp_fetch.fetch_document',failed):
            app=create_app(secret=SECRET,journal_path=str(Path(tmp)/'journal.sqlite'),selector_mode='deterministic-mcu-v1',mcp_enabled=True,clock=lambda:1000)
            with TestClient(app) as client:
                raw=body({'version':1,'turnId':TURN,'documentId':DOCUMENT_ID})
                first=client.post('/v1/mcp/run',content=raw,headers={'content-type':'application/json','authorization':'Bearer '+self.token(raw)})
                self.assertEqual(first.status_code,503)
                self.assertEqual(first.json()['code'],'provider_unavailable')
                status=body({'version':1,'turnId':TURN,'requestBodySha256':hashlib.sha256(raw).hexdigest()})
                again=client.post('/v1/mcp/status',content=status,headers={'content-type':'application/json','authorization':'Bearer '+self.token(status,'readmcp')})
                self.assertEqual(again.json(),first.json())
                self.assertEqual(len(calls),1)

    def test_cancel_cleanup_failure_stays_unknown(self):
        entered=threading.Event()
        async def failed_cleanup(_document):
            entered.set()
            try: await asyncio.Event().wait()
            except asyncio.CancelledError: raise RuntimeError('cleanup unknown') from None
        with tempfile.TemporaryDirectory() as tmp, patch('lightweight.mcp_fetch.fetch_document',failed_cleanup):
            app=create_app(secret=SECRET,journal_path=str(Path(tmp)/'journal.sqlite'),selector_mode='deterministic-mcu-v1',mcp_enabled=True,clock=lambda:1000)
            with TestClient(app) as client, concurrent.futures.ThreadPoolExecutor(max_workers=1) as executor:
                raw=body({'version':1,'turnId':TURN,'documentId':DOCUMENT_ID})
                first=executor.submit(client.post,'/v1/mcp/run',content=raw,headers={'content-type':'application/json','authorization':'Bearer '+self.token(raw)})
                self.assertTrue(entered.wait(5))
                cancel=body({'version':1,'turnId':TURN,'requestBodySha256':hashlib.sha256(raw).hexdigest()})
                response=client.post('/v1/mcp/cancel',content=cancel,headers={'content-type':'application/json','authorization':'Bearer '+self.token(cancel,'cancelmcp')})
                self.assertEqual(response.status_code,409)
                self.assertEqual(response.json()['code'],'outcome_unknown')
                self.assertEqual(first.result(timeout=5).json()['code'],'outcome_unknown')

    def test_status_does_not_confirm_cancel_before_cleanup(self):
        entered=threading.Event(); cleaning=threading.Event(); release=threading.Event()
        async def held_cleanup(_document):
            entered.set()
            try: await asyncio.Event().wait()
            except asyncio.CancelledError:
                cleaning.set()
                await asyncio.to_thread(release.wait,5)
                raise RuntimeError('cleanup unknown') from None
        with tempfile.TemporaryDirectory() as tmp, patch('lightweight.mcp_fetch.fetch_document',held_cleanup):
            app=create_app(secret=SECRET,journal_path=str(Path(tmp)/'journal.sqlite'),selector_mode='deterministic-mcu-v1',mcp_enabled=True,clock=lambda:1000)
            with TestClient(app) as client, concurrent.futures.ThreadPoolExecutor(max_workers=2) as executor:
                raw=body({'version':1,'turnId':TURN,'documentId':DOCUMENT_ID})
                first=executor.submit(client.post,'/v1/mcp/run',content=raw,headers={'content-type':'application/json','authorization':'Bearer '+self.token(raw)})
                self.assertTrue(entered.wait(5))
                observation=body({'version':1,'turnId':TURN,'requestBodySha256':hashlib.sha256(raw).hexdigest()})
                cancel=executor.submit(client.post,'/v1/mcp/cancel',content=observation,headers={'content-type':'application/json','authorization':'Bearer '+self.token(observation,'cancelmcp')})
                try:
                    self.assertTrue(cleaning.wait(5))
                    status=client.post('/v1/mcp/status',content=observation,headers={'content-type':'application/json','authorization':'Bearer '+self.token(observation,'readmcp')})
                    self.assertNotEqual(status.json()['code'],'cancelled')
                finally:
                    release.set()
                    cancel.result(timeout=5);first.result(timeout=5)

class McpShutdownTests(unittest.IsolatedAsyncioTestCase):
    async def test_failed_cleanup_does_not_hang_shutdown(self):
        entered=asyncio.Event()
        async def failed_cleanup(_document):
            entered.set()
            try: await asyncio.Event().wait()
            except asyncio.CancelledError: raise RuntimeError('cleanup unknown') from None
        with tempfile.TemporaryDirectory() as tmp, patch('lightweight.mcp_fetch.fetch_document',failed_cleanup):
            app=create_app(secret=SECRET,journal_path=str(Path(tmp)/'journal.sqlite'),selector_mode='deterministic-mcu-v1',mcp_enabled=True,clock=lambda:1000)
            lifecycle=app.router.lifespan_context(app);await lifecycle.__aenter__()
            async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app),base_url='http://test') as client:
                raw=body({'version':1,'turnId':TURN,'documentId':DOCUMENT_ID})
                token=McpRuntimeTests().token(raw)
                request=asyncio.create_task(client.post('/v1/mcp/run',content=raw,headers={'content-type':'application/json','authorization':'Bearer '+token}))
                await asyncio.wait_for(entered.wait(),5)
                await asyncio.wait_for(lifecycle.__aexit__(None,None,None),5)
                response=await asyncio.wait_for(request,5)
                self.assertEqual(response.json()['code'],'outcome_unknown')

    async def test_suppressed_cancel_does_not_commit_success_during_shutdown(self):
        from lightweight.mcp_fetch import FetchDocument, URL
        entered=asyncio.Event()
        async def suppressed(_document):
            entered.set()
            try: await asyncio.Event().wait()
            except asyncio.CancelledError:
                return FetchDocument(DOCUMENT_ID,URL,'GPIO & RTC GPIO','esp-idf','esp32','5.5.1','2026-11-06T00:00:00Z','a'*64,'#include "driver/gpio.h"')
        with tempfile.TemporaryDirectory() as tmp, patch('lightweight.mcp_fetch.fetch_document',suppressed):
            app=create_app(secret=SECRET,journal_path=str(Path(tmp)/'journal.sqlite'),selector_mode='deterministic-mcu-v1',mcp_enabled=True,clock=lambda:1000)
            lifecycle=app.router.lifespan_context(app);await lifecycle.__aenter__()
            async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app),base_url='http://test') as client:
                raw=body({'version':1,'turnId':TURN,'documentId':DOCUMENT_ID})
                request=asyncio.create_task(client.post('/v1/mcp/run',content=raw,headers={'content-type':'application/json','authorization':'Bearer '+McpRuntimeTests().token(raw)}))
                await asyncio.wait_for(entered.wait(),5)
                await asyncio.wait_for(lifecycle.__aexit__(None,None,None),5)
                response=await asyncio.wait_for(request,5)
                self.assertEqual(response.json()['code'],'outcome_unknown')
