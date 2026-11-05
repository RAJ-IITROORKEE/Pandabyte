"""Rollback-only applied-function tests; simulated subjects, no provider or corpus writes."""
import hashlib,hmac,json,time,uuid
from pathlib import Path
def check(conn,key):
 import psycopg
 owner='guide-fixture-'+str(uuid.uuid4());passed=[]
 conn.execute('BEGIN')
 try:
  conn.execute("SET LOCAL lock_timeout='3s';SET LOCAL statement_timeout='20s';SET LOCAL idle_in_transaction_session_timeout='90s'")
  assert conn.execute("SELECT count(*) FROM pg_proc WHERE proname='panda_agent_guide_begin'").fetchone()[0]==0
  for name in ['20261105090002_panda-agent-guides-skills.sql','20261105090003_panda-agent-bundled-skills.sql']:
   conn.execute((Path(__file__).resolve().parents[1]/'migrations'/name).read_text(encoding='utf8'))
  def actor(sub=owner):
   conn.execute('SET LOCAL ROLE authenticated');conn.execute("SELECT set_config('request.jwt.claims',%s,true)",(json.dumps({'sub':sub,'role':'authenticated'}),))
  def denied(name,fn):
   conn.execute('SAVEPOINT negative')
   try:fn()
   except psycopg.Error as e:
    assert e.sqlstate in ('P0001','42501'),(name,e.sqlstate);conn.execute('ROLLBACK TO SAVEPOINT negative');passed.append(name)
   else:raise AssertionError(name+' unexpectedly allowed')
   finally:conn.execute('RELEASE SAVEPOINT negative')
  def signed(action,fields,domain='guide',bad=False):
   payload=json.dumps({'v':1,'action':action,'subject':owner,'exp':int(time.time())+60,**fields},separators=(',',':'))
   mac=hmac.new(key,('panda-'+domain+'-db-v1\n'+payload).encode(),hashlib.sha256).hexdigest()
   return conn.execute('SELECT public.panda_agent_'+domain+'_'+action+'(%s,%s)',(payload,'0'*64 if bad else mac)).fetchone()[0]
  actor();denied('nonadmin_registry_denied',lambda:conn.execute('SELECT public.panda_agent_skills_read()'))
  conn.execute('RESET ROLE');conn.execute("INSERT INTO public.staff_role_memberships(user_id,role,assigned_by) VALUES(%s,'ADMIN',%s)",(owner,owner));actor()
  def registry():return conn.execute('SELECT public.panda_agent_skills_read()').fetchone()[0]
  def change(action,ver=1,**extra):
   state=next(s for s in registry()['skills'] if s['id']=='embedded-project-guide')
   v={'skillId':state['id'],'action':action,'bundleVersion':ver,'expectedVersion':state['version'],'reason':'Disposable guide check',**extra}
   return conn.execute('SELECT public.panda_agent_skill_change(%s)',(json.dumps(v),)).fetchone()[0]
  denied('null_action_denied',lambda:change(None));denied('string_version_denied',lambda:change('review',expectedVersion='0'))
  denied('enable_unreviewed_denied',lambda:change('enable'));change('review');change('enable');passed.append('actual_review_enable_history')
  denied('registry_conflict',lambda:change('disable',expectedVersion=0))
  tid=conn.execute("SELECT public.panda_agent_chat_create('Disposable guide database check')").fetchone()[0]['thread']['id']
  products=conn.execute('SELECT public.panda_agent_runtime_products()').fetchone()[0]['items'];product=next(x for x in products if x['sku']=='ESPX8266')
  sc=conn.execute('SELECT public.panda_agent_lightweight_scope(%s)',(product['id'],)).fetchone()[0]
  guide={'goal':'Parking monitor','board':'x8266','components':['distance sensor'],'expectedVersion':0}
  def begin(g=guide):
   rid=str(uuid.uuid4());f={'thread':tid,'request':rid,'guide':g};r=signed('begin',f);return rid,f,r
  def prepare(rid):return signed('prepare',{'thread':tid,'request':rid,'product':product['id'],'sku':sc['sku'],'scopeHash':sc['scopeHash'],'digest':'d'*64})
  answer={'outcome':'insufficient','text':'Conceptual fixture only. Wiring unknown.','citations':[]}
  def complete(rid,success=True):return signed('complete',{'thread':tid,'request':rid,'answer':answer,'success':success})
  rid,fields,started=begin();assert started['admitted'];assert not signed('begin',fields)['admitted'];passed.append('same_input_replay_once')
  denied('changed_intent_replay_denied',lambda:signed('begin',{**fields,'guide':{**guide,'goal':'Other'}}))
  denied('qa_cannot_begin_guide_identity',lambda:signed('begin',{'thread':tid,'request':rid,'question':'Project guide: Parking monitor'},'lightweight'))
  denied('bad_mac',lambda:signed('begin',fields,bad=True))
  assert prepare(rid)['execute'];assert not prepare(rid)['execute'];passed.append('prepare_once_status_only')
  denied('qa_cannot_complete_guide',lambda:signed('complete',{'thread':tid,'request':rid,'answer':answer},'lightweight'))
  complete(rid);complete(rid)
  memory=conn.execute('SELECT public.panda_agent_project_read(%s)',(tid,)).fetchone()[0]
  assert memory['version']==1 and memory['guideTurns']==1;passed.append('atomic_memory_once')
  for n in range(1,8):
   rid,_,_=begin({**guide,'expectedVersion':n});prepare(rid);complete(rid)
  memory=conn.execute('SELECT public.panda_agent_project_read(%s)',(tid,)).fetchone()[0]
  assert memory['version']==8 and memory['guideTurns']==8 and memory['compactions']==1 and memory['recentGoals']==[] and memory['intent']['goal']==guide['goal'];passed.append('actual_eighth_intent_compaction')
  denied('stale_memory_cas',lambda:begin(guide))
  rid,_,_=begin({**guide,'expectedVersion':8});change('disable');denied('disable_before_prepare_denied',lambda:prepare(rid));saved=complete(rid,False)
  terminal=next(t['response'] for t in saved['turns'] if t['requestId']==rid);assert terminal['citations']==[] and 'skill, project version or evidence changed' in terminal['text'];passed.append('predispatch_invalidation_terminal_without_memory')
  assert conn.execute('SELECT public.panda_agent_project_read(%s)',(tid,)).fetchone()[0]['version']==8;change('enable')
  rid,_,_=begin({**guide,'expectedVersion':8});prepare(rid);change('disable');saved=complete(rid)
  terminal=next(t['response'] for t in saved['turns'] if t['requestId']==rid)
  assert terminal['citations']==[] and 'skill, project version or evidence changed' in terminal['text'];passed.append('disable_inflight_fixed_terminal')
  assert conn.execute('SELECT public.panda_agent_project_read(%s)',(tid,)).fetchone()[0]['version']==8;passed.append('disabled_run_does_not_change_memory')
  denied('disabled_next_run',lambda:begin({**guide,'expectedVersion':8}))
  change('enable');change('review',2);change('enable',2);change('rollback',1)
  state=next(s for s in registry()['skills'] if s['id']=='embedded-project-guide');assert state['activeVersion']==1 and any(e['action']=='rollback' for e in state['history']);passed.append('review_version_enable_actual_rollback')
  rid,_,_=begin({**guide,'expectedVersion':8});prepare(rid)
  conn.execute('RESET ROLE');conn.execute("UPDATE public.panda_agent_lightweight_turns SET scope_hash=repeat('0',64) WHERE thread_id=%s AND request_id=%s",(tid,rid));actor()
  saved=complete(rid);terminal=next(t['response'] for t in saved['turns'] if t['requestId']==rid);assert terminal['citations']==[] and 'evidence changed' in terminal['text'];passed.append('stale_source_metadata_fixed_terminal')
  assert conn.execute('SELECT public.panda_agent_project_read(%s)',(tid,)).fetchone()[0]['version']==8
  rid,_,_=begin({**guide,'expectedVersion':8});prepare(rid);complete(rid,False)
  assert conn.execute('SELECT public.panda_agent_project_read(%s)',(tid,)).fetchone()[0]['version']==8;passed.append('rejected_worker_no_memory_update')
  actor(owner+'-foreign');denied('foreign_project_memory',lambda:conn.execute('SELECT public.panda_agent_project_read(%s)',(tid,)))
  denied('foreign_execution',lambda:conn.execute('SELECT public.panda_agent_guide_execution(%s,%s)',(tid,rid)));actor()
  for table in ['panda_agent_skill_versions','panda_agent_project_memory','panda_agent_guide_turns','panda_agent_project_skills']:
   denied('private_'+table,lambda t=table:conn.execute('SELECT * FROM public.'+t))
  passed.append('no_corpus_mutation')
 finally:conn.execute('ROLLBACK')
 assert conn.execute("SELECT count(*) FROM pg_proc WHERE proname='panda_agent_guide_begin'").fetchone()[0]==0
 hashes={p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in (Path(__file__).resolve().parents[1]/'migrations').glob('2026110509000[23]*.sql')}
 return {'passed':len(passed),'checks':passed,'migrationHashes':hashes,'rolledBack':True,'realClerk':False,'realSourceWithdrawal':False,'canonicalSourceRowsChanged':0,'providerCalls':0}
