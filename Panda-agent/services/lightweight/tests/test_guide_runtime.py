import base64
import asyncio
import hashlib
import hmac
import json
import sqlite3
import tempfile
import unittest
import uuid
from pathlib import Path
from fastapi.testclient import TestClient
from lightweight.app import create_app
from lightweight.guide import run_guide

SECRET=b'fixture-secret-at-least-32-bytes-long'; THREAD='11111111-1111-4111-8111-111111111111'; TURN='22222222-2222-4222-8222-222222222222'; SKU='BOARD'
def encoded(value):return base64.urlsafe_b64encode(value).rstrip(b'=').decode()
def wire(value):return json.dumps(value,separators=(',',':')).encode()
def token(body,action,aud='panda-lightweight-guide-v1',turn=TURN,actor='a'*64):
    claim={'v':1,'aud':aud,'action':action,'sub':actor,'sid':'b'*64,'turnId':turn,'sku':SKU,'nonce':str(uuid.uuid4()),'iat':1000,'exp':1050,'bodySha256':hashlib.sha256(body).hexdigest()}
    part=encoded(wire(claim));return part+'.'+encoded(hmac.new(SECRET,part.encode(),hashlib.sha256).digest())
def payload():return {'version':1,'mode':'deterministic-guide-v1','threadId':THREAD,'turnId':TURN,'productSku':SKU,'skill':{'id':'embedded-project-guide','version':1,'hash':'a'*64},'intent':{'goal':'Parking monitor','board':SKU,'components':[]},'fragments':[{'handle':'h','text':'MCU: RP2040'}]}
class GuideRuntimeTests(unittest.TestCase):
    def post(self,client,path,body,action,aud='panda-lightweight-guide-v1',turn=TURN,actor='a'*64):
        raw=wire(body);return client.post(path,content=raw,headers={'content-type':'application/json','authorization':'Bearer '+token(raw,action,aud,turn,actor)})
    def test_disabled_default_and_cross_kind_cancel_isolation(self):
        with tempfile.TemporaryDirectory() as directory:
            with TestClient(create_app(secret=SECRET,journal_path=str(Path(directory)/'db'),selector_mode='deterministic-mcu-v1',clock=lambda:1000)) as c:
                self.assertEqual(self.post(c,'/v1/guides/run',payload(),'runguide').json()['code'],'disabled')
                evidence={'version':1,'mode':'deterministic-mcu-v1','turnId':TURN,'productSku':SKU,'question':'Which MCU does BOARD use?','fragments':[{'handle':'h','text':'MCU: RP2040'}]}
                self.assertEqual(self.post(c,'/v1/evidence/select',evidence,'select','panda-lightweight-evidence-v1').status_code,200)
                control={'version':1,'threadId':THREAD,'turnId':TURN,'requestBodySha256':hashlib.sha256(wire(evidence)).hexdigest()}
                self.assertEqual(self.post(c,'/v1/guides/cancel',control,'cancelguide').json()['code'],'turn_conflict')
    def test_guide_cancel_tombstone_blocks_late_run_and_other_actor(self):
        with tempfile.TemporaryDirectory() as directory:
            with TestClient(create_app(secret=SECRET,journal_path=str(Path(directory)/'db'),guide_enabled=True,clock=lambda:1000)) as c:
                body=payload();digest=hashlib.sha256(wire(body)).hexdigest();control={'version':1,'threadId':THREAD,'turnId':TURN,'requestBodySha256':digest}
                self.assertEqual(self.post(c,'/v1/guides/cancel',control,'cancelguide').json()['code'],'cancelled')
                self.assertEqual(self.post(c,'/v1/guides/run',body,'runguide').json()['code'],'cancelled')
                self.assertEqual(self.post(c,'/v1/guides/status',control,'readguide',actor='c'*64).status_code,404)
    def test_graph_result_and_cache(self):
        with tempfile.TemporaryDirectory() as directory:
            with TestClient(create_app(secret=SECRET,journal_path=str(Path(directory)/'db'),guide_enabled=True,clock=lambda:1000)) as c:
                body=payload();r=self.post(c,'/v1/guides/run',body,'runguide');self.assertEqual(r.status_code,200);self.assertEqual(r.json()['guide']['nodes'],6);self.assertEqual(r.json()['selections'],[{'handle':'h','quote':'MCU: RP2040'}]);self.assertEqual(r.json()['usage']['modelCalls'],0)
                control={'version':1,'threadId':THREAD,'turnId':TURN,'requestBodySha256':hashlib.sha256(wire(body)).hexdigest()}
                self.assertEqual(self.post(c,'/v1/guides/status',control,'readguide').json(),r.json())
    def test_existing_evidence_journal_migrates_without_reset(self):
        with tempfile.TemporaryDirectory() as directory:
            path=str(Path(directory)/'db');db=sqlite3.connect(path)
            db.execute('CREATE TABLE turns(actor TEXT,turn_id TEXT,sku TEXT,digest TEXT,state TEXT,result TEXT,PRIMARY KEY(actor,turn_id))')
            db.execute('INSERT INTO turns VALUES(?,?,?,?,?,?)',('a'*64,TURN,SKU,'d'*64,'unknown',None));db.commit();db.close()
            with TestClient(create_app(secret=SECRET,journal_path=path,selector_mode='deterministic-mcu-v1',clock=lambda:1000)) as c:
                status={'version':1,'turnId':TURN,'requestBodySha256':'d'*64}
                self.assertEqual(self.post(c,'/v1/evidence/status',status,'readturn','panda-lightweight-evidence-v1').json()['code'],'outcome_unknown')
                guide={'version':1,'threadId':THREAD,'turnId':TURN,'requestBodySha256':'d'*64}
                self.assertEqual(self.post(c,'/v1/guides/status',guide,'readguide').status_code,404)
    def test_graph_cancellation_unwinds_both_started_workers(self):
        async def run():
            both=asyncio.Event();never=asyncio.Event();active=0;peak=0
            async def barrier():
                nonlocal active,peak
                active+=1;peak=max(peak,active)
                if active==2:both.set()
                try:await never.wait()
                finally:active-=1
            task=asyncio.create_task(run_guide(payload(),worker_yield=barrier))
            await asyncio.wait_for(both.wait(),2)
            task.cancel()
            with self.assertRaises(asyncio.CancelledError):await task
            self.assertEqual(peak,2);self.assertEqual(active,0)
        asyncio.run(run())
