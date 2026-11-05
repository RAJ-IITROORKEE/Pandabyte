import unittest
import asyncio
from unittest.mock import patch
from lightweight.guide import validate_input, validate_result, run_guide

class GuideContractTests(unittest.TestCase):
    def setUp(self):
        self.value={'version':1,'mode':'deterministic-guide-v1','threadId':'11111111-1111-4111-8111-111111111111','turnId':'22222222-2222-4222-8222-222222222222','productSku':'BOARD','skill':{'id':'embedded-project-guide','version':1,'hash':'a'*64},'intent':{'goal':'Parking monitor','board':'BOARD','components':['sensor']},'fragments':[]}
        self.claim={'turnId':self.value['turnId'],'sku':'BOARD'}
    def test_input_rejects_surrogates_extra_and_bounds(self):
        validate_input(self.value,self.claim)
        for patch in [{'extra':1},{'intent':{'goal':'😀'*301,'board':'BOARD','components':[]}},{'intent':{'goal':'x','board':'BOARD','components':['\ud800']}},{'skill':{'id':'embedded-project-guide','version':3,'hash':'a'*64}}]:
            with self.assertRaises((ValueError,UnicodeError)):validate_input({**self.value,**patch},self.claim)
    def test_result_requires_exact_shape_and_literal_selection(self):
        result={'version':1,'state':'complete','guide':{'template':'project','questions':['revision','wiring','framework','component-specifications'],'nodes':6,'workers':2},'selections':[],'usage':{'modelCalls':0,'inputTokens':0,'outputTokens':0,'costNanoUsd':0}}
        validate_result(result,[])
        with self.assertRaises(ValueError):validate_result({**result,'selections':[{'handle':'invented','quote':'x'}]},[])
        with self.assertRaises(ValueError):validate_result({**result,'usage':{'modelCalls':1,'inputTokens':0,'outputTokens':0,'costNanoUsd':0}},[])
    def test_tracing_credentials_are_denied_before_graph_import(self):
        for name in ('LANGSMITH_API_KEY','LANGCHAIN_API_KEY'):
            with patch.dict('os.environ',{name:'fixture-key'},clear=True):
                with self.assertRaisesRegex(RuntimeError,'tracing unavailable'):asyncio.run(run_guide(self.value))
