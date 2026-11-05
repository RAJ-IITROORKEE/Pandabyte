"""Bounded deterministic guide graph. Model/provider access is not part of this workflow."""
import os
import re
import asyncio
import uuid
from typing import TypedDict
from .deterministic_mcu import select_mcu

HEX = re.compile(r'^[0-9a-f]{64}$')
QUESTIONS = ['revision','wiring','framework','component-specifications']

def text(value, limit, *, trimmed=True):
    if not isinstance(value,str) or not value.strip() or (trimmed and value!=value.strip()) or len(value.encode('utf-16-le'))//2>limit: raise ValueError('input')

def validate_input(value, claim):
    def valid_uuid(value):
        try:return isinstance(value,str) and str(uuid.UUID(value))==value
        except (ValueError,AttributeError):return False
    if not isinstance(value,dict) or set(value)!={'version','mode','threadId','turnId','productSku','skill','intent','fragments'} or type(value['version']) is not int or value['version']!=1 or value['mode']!='deterministic-guide-v1' or not valid_uuid(value['threadId']) or value['turnId']!=claim['turnId'] or value['productSku']!=claim['sku']: raise ValueError('input')
    text(value['productSku'],128)
    skill=value['skill']
    if not isinstance(skill,dict) or set(skill)!={'id','version','hash'} or skill['id']!='embedded-project-guide' or type(skill['version']) is not int or skill['version'] not in (1,2) or not isinstance(skill['hash'],str) or not HEX.fullmatch(skill['hash']):raise ValueError('skill')
    intent=value['intent']
    if not isinstance(intent,dict) or set(intent) not in ({'goal','board','components'},{'goal','board','revision','components'}):raise ValueError('intent')
    text(intent['goal'],600);text(intent['board'],128)
    if 'revision' in intent:text(intent['revision'],80)
    if not isinstance(intent['components'],list) or len(intent['components'])>8:raise ValueError('components')
    for component in intent['components']:text(component,80)
    fragments=value['fragments']
    if not isinstance(fragments,list) or len(fragments)>8:raise ValueError('fragments')
    handles=set();total=0
    for item in fragments:
        if not isinstance(item,dict) or set(item)!={'handle','text'}:raise ValueError('fragment')
        text(item['handle'],300,trimmed=False);text(item['text'],12000,trimmed=False)
        if item['handle'] in handles:raise ValueError('duplicate')
        handles.add(item['handle']);total+=len(item['text'].encode('utf-16-le'))//2
    if total>20000:raise ValueError('budget')
    return value

def validate_result(value, fragments):
    if not isinstance(value,dict) or set(value)!={'version','state','guide','selections','usage'} or type(value['version']) is not int or value['version']!=1 or value['state']!='complete':raise ValueError('result')
    g=value['guide']; u=value['usage']; selections=value['selections']
    if not isinstance(g,dict) or set(g)!={'template','questions','nodes','workers'} or g['template'] not in ('parking-monitor','project') or g['questions']!=QUESTIONS or type(g['nodes']) is not int or g['nodes']!=6 or type(g['workers']) is not int or g['workers']!=2:raise ValueError('guide')
    if not isinstance(u,dict) or set(u)!={'modelCalls','inputTokens','outputTokens','costNanoUsd'} or any(type(v) is not int or v!=0 for v in u.values()):raise ValueError('usage')
    if not isinstance(selections,list) or len(selections)>1:raise ValueError('selections')
    for s in selections:
        if not isinstance(s,dict) or set(s)!={'handle','quote'} or not isinstance(s['quote'],str) or not re.fullmatch(r'(?:MCU|Microcontroller):[ \t]*[A-Za-z0-9][A-Za-z0-9_-]{0,63}',s['quote'],re.I) or not re.search('[A-Za-z]',s['quote'].split(':',1)[1]) or not re.search('[0-9]',s['quote'].split(':',1)[1]) or not any(s['handle']==f['handle'] and s['quote'] in f['text'] for f in fragments):raise ValueError('selection')
    if selections and selections!=select_mcu('Which MCU does BOARD use?',fragments):raise ValueError('selection')
    return value

async def run_guide(payload, *, worker_yield=None):
    for key in ('LANGSMITH_TRACING','LANGSMITH_TRACING_V2','LANGCHAIN_TRACING','LANGCHAIN_TRACING_V2','LANGCHAIN_VERBOSE'):
        if os.environ.get(key,'').lower() not in ('','0','false'):raise RuntimeError('tracing unavailable')
    if any(os.environ.get(key) for key in ('LANGSMITH_API_KEY','LANGCHAIN_API_KEY')):raise RuntimeError('tracing unavailable')
    from langgraph.graph import StateGraph, START, END
    class State(TypedDict, total=False):
        selections:list
        template:str
    async def admit(_):return {}
    async def prepare(_):return {}
    async def evidence(_):return {'selections':select_mcu('Which MCU does '+payload['productSku']+' use?',payload['fragments'])}
    async def outline(_):return {'template':'parking-monitor' if re.search(r'\bparking\b',payload['intent']['goal'],re.I) else 'project'}
    async def verify(state):
        if 'template' not in state or 'selections' not in state:raise ValueError('incomplete')
        return {}
    async def release(_):return {}
    graph=StateGraph(State)
    invocations=0;active_workers=0;peak_workers=0
    def measured(name,node):
        async def wrapped(state):
            nonlocal invocations,active_workers,peak_workers
            invocations+=1
            if invocations>6:raise ValueError('node limit')
            worker=name in ('evidence','outline')
            if worker:
                active_workers+=1;peak_workers=max(peak_workers,active_workers)
            try:
                if active_workers>2:raise ValueError('worker limit')
                if worker:await (worker_yield() if worker_yield is not None else asyncio.sleep(0))
                return await node(state)
            finally:
                if worker:active_workers-=1
        return wrapped
    for name,node in [('admit',admit),('prepare',prepare),('evidence',evidence),('outline',outline),('verify',verify),('release',release)]:graph.add_node(name,measured(name,node))
    graph.add_edge(START,'admit');graph.add_edge('admit','prepare');graph.add_edge('prepare','evidence');graph.add_edge('prepare','outline');graph.add_edge(['evidence','outline'],'verify');graph.add_edge('verify','release');graph.add_edge('release',END)
    state=await graph.compile().ainvoke({},config={'callbacks':[],'max_concurrency':2,'recursion_limit':10})
    return validate_result({'version':1,'state':'complete','guide':{'template':state['template'],'questions':QUESTIONS,'nodes':invocations,'workers':peak_workers},'selections':state['selections'],'usage':{'modelCalls':0,'inputTokens':0,'outputTokens':0,'costNanoUsd':0}},payload['fragments'])
