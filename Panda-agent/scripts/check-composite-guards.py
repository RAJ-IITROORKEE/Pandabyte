"""Rollback-only development composite RPC checks. Connection/signer supplied by operator.

Synthetic JWT claims exercise SQL roles only; this is not genuine Clerk evidence.
No canonical source is changed, no private worker or external service is invoked.
"""
import hashlib
import hmac
import json
import time
import uuid
from pathlib import Path

MIGRATIONS=('20261106090000_panda-agent-composite-turns.sql','20261106090001_panda-agent-composite-registry.sql')

def check(conn,key,*,installed=False,candidate_path=None):
    import psycopg
    if not conn.autocommit or int(conn.info.transaction_status)!=0 or not isinstance(key,bytes) or len(key)!=32:
        raise ValueError('Idle operator connection and explicit signer required')
    owner='composite-sql-fixture-'+str(uuid.uuid4());foreign='composite-foreign-'+str(uuid.uuid4())
    passed=[];failed=None;active='preflight';cleanup={};hashes={}
    def value(sql,args=()):return conn.execute(sql,args).fetchone()[0]
    def fingerprint():
        tables=('panda_agent_sources','panda_agent_versions','panda_agent_chunks','panda_agent_vendor_documents','panda_agent_vendor_versions','panda_agent_tools','panda_agent_tool_events','panda_agent_skills','panda_agent_skill_versions','panda_agent_skill_events','panda_agent_chats','panda_agent_chat_turns','panda_agent_lightweight_turns','staff_role_memberships')
        if installed:tables+=('panda_agent_composite_turns','panda_agent_composite_calls')
        return {t:conn.execute('SELECT count(*),md5(coalesce(string_agg(md5(to_jsonb(t)::text),\'\' ORDER BY md5(to_jsonb(t)::text)),\'\')) FROM public.'+t+' t').fetchone() for t in tables}
    def functions():return conn.execute("SELECT proname,pg_get_function_identity_arguments(oid),pg_get_functiondef(oid),proacl::text,proowner FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname LIKE 'panda_agent_%' ORDER BY proname,oid").fetchall()
    def actor(subject=owner):
        conn.execute('SET LOCAL ROLE authenticated');value("SELECT set_config('request.jwt.claims',%s,true)",(json.dumps({'sub':subject,'role':'authenticated'}),))
    def operator():conn.execute('RESET ROLE')
    def signed(action,fields,domain='composite'):
        payload=json.dumps({'v':1,'action':action,'subject':owner,'exp':int(time.time())+60,**fields},separators=(',',':'))
        mac=hmac.new(key,('panda-'+('composite' if domain=='composite' else 'lightweight')+'-db-v1\n'+payload).encode(),hashlib.sha256).hexdigest()
        return value('SELECT public.panda_agent_'+domain+'_'+action+'(%s,%s)',(payload,mac))
    def deny(fn):
        conn.execute('SAVEPOINT denial')
        try:fn()
        except psycopg.Error as e:
            if e.sqlstate!='P0001':raise
            conn.execute('ROLLBACK TO SAVEPOINT denial')
        else:raise AssertionError('Expected SQL guard denial')
        finally:conn.execute('RELEASE SAVEPOINT denial')
    def run(name,fn):
        nonlocal active
        active=name;fn();passed.append(name)
    def begin(task='unit-conversion'):
        inp={'skillId':'panda-project-planner','question':'Convert 500 ms to seconds.','products':[],'frameworkVersion':None,'task':'unit-conversion','conversion':{'value':500,'from':'ms','to':'s'}}
        needs=[{'id':'unit-conversion','toolId':'convert_units','kind':'unit-conversion'}]
        if task=='mcu-comparison':
            inp={'skillId':'panda-project-planner','question':'Compare the MCU of fixtureA and fixtureB.','products':['fixtureA','fixtureB'],'frameworkVersion':None,'task':task}
            needs=[{'id':'mcu-'+str(i+1),'toolId':'panda_scoped_rag','kind':'mcu','productSku':sku} for i,sku in enumerate(inp['products'])]
        if task=='partial-local':needs.append({'id':'second-local-need','toolId':'convert_units','kind':'unit-conversion'})
        if task=='firmware-gpio':
            inp={'skillId':'panda-documented-firmware-help','question':'Find ESP32 GPIO documentation for ESP-IDF 5.5.1.','products':[],'frameworkVersion':'5.5.1','task':task}
            needs=[{'id':'vendor-gpio','toolId':'panda_scoped_rag','kind':'vendor-gpio','documentId':'espressif-esp-idf-5.5.1-esp32-gpio'},{'id':'external-gpio','toolId':'fetch_public_docs_mcp','kind':'external-gpio','documentId':'espressif-esp-idf-5.5.1-esp32-gpio'}]
        plan={'input':inp,'needs':needs};ph=hashlib.sha256(json.dumps(plan,separators=(',',':')).encode()).hexdigest()
        tid=value("SELECT public.panda_agent_chat_create('Disposable Phase 6 SQL guard fixture')")['thread']['id']
        fields={'thread':tid,'request':str(uuid.uuid4()),'input':inp,'plan':plan,'planHash':ph}
        assert signed('begin',fields)['admitted'] is True
        return fields
    def call(fields,need=None):
        need=need or fields['plan']['needs'][0]
        return {'id':str(uuid.uuid4()),'toolId':need['toolId'],'needId':need['id'],'inputHash':hashlib.sha256(json.dumps({'planHash':fields['planHash'],'need':need},separators=(',',':')).encode()).hexdigest()}
    def claim(fields,c):return signed('claim',{k:fields[k] for k in ('thread','request','planHash')}|{'call':c})
    def record(fields,c,result):return signed('record',{k:fields[k] for k in ('thread','request','planHash')}|{'callId':c['id'],'result':result,'resultHash':hashlib.sha256(json.dumps(result,sort_keys=True,separators=(',',':')).encode()).hexdigest()})
    def finish(fields,reason='answered',text='500 ms = 0.5 s.'):
        return signed('finish',{k:fields[k] for k in ('thread','request','planHash')}|{'answer':{'outcome':'conversation','text':text,'citations':[]},'terminalReason':reason})
    def response(result,fields):return next(t['response'] for t in result['turns'] if t['requestId']==fields['request'])
    def enable():
        operator();conn.execute("UPDATE public.panda_agent_skills SET enabled=true,active_version=1 WHERE id LIKE 'panda-%'");conn.execute("UPDATE public.panda_agent_skill_versions SET reviewed=true WHERE skill_id LIKE 'panda-%'");conn.execute("UPDATE public.panda_agent_tools SET enabled=true WHERE id IN ('panda_scoped_rag','fetch_public_docs_mcp','convert_units','format_bom')");actor()
    conn.execute('BEGIN')
    before=functions_before=None
    try:
        conn.execute("SET LOCAL lock_timeout='3s';SET LOCAL statement_timeout='20s';SET LOCAL idle_in_transaction_session_timeout='90s'")
        before=fingerprint();functions_before=functions()
        assert value("SELECT to_regclass('public.panda_agent_composite_turns') IS NOT NULL")==installed
        for name in MIGRATIONS:
            data=(Path(__file__).resolve().parents[1]/'migrations'/name).read_bytes();hashes[name]=hashlib.sha256(data).hexdigest()
            if not installed:conn.execute(data.decode())
        if candidate_path is not None:
            if not installed:raise ValueError('Forward candidate requires already installed baseline')
            data=Path(candidate_path).read_bytes();hashes[Path(candidate_path).name]=hashlib.sha256(data).hexdigest();conn.execute(data.decode())
        enable()
        f=begin();c=call(f)
        run('atomic_claim_executes_once',lambda: (None if claim(f,c)=={'state':'execute'} and claim(f,c)=={'state':'unknown'} else (_ for _ in ()).throw(AssertionError('claim replay'))))
        run('changed_call_digest_denied',lambda:deny(lambda:claim(f,{**c,'inputHash':'0'*64})))
        record(f,c,{'value':0.5})
        run('recorded_claim_is_observation_only',lambda:None if claim(f,c)=={'state':'recorded'} else (_ for _ in ()).throw(AssertionError('recorded claim')))
        run('helper_finishes_with_one_protected_answer',lambda:None if response(finish(f),f)['text']=='500 ms = 0.5 s.' else (_ for _ in ()).throw(AssertionError('helper finish')))
        run('repeated_finish_keeps_first_answer',lambda:None if response(finish(f,text='different'),f)['text']=='500 ms = 0.5 s.' else (_ for _ in ()).throw(AssertionError('duplicate finish')))
        def unsigned():
            deny(lambda:value('SELECT public.panda_agent_composite_execution(%s,%s)',('{}','0'*64)))
        run('owned_jwt_cannot_read_unsigned_cached_results',unsigned)
        def foreign_read():
            actor(foreign);deny(lambda:value('SELECT public.panda_agent_lightweight_read(%s)',(f['thread'],)));actor()
        run('foreign_sql_actor_cannot_read_thread',foreign_read)
        def revoke():
            operator();conn.execute("UPDATE public.panda_agent_tools SET enabled=false,version=version+1 WHERE id='convert_units'");actor()
            for result in (value('SELECT public.panda_agent_lightweight_read(%s)',(f['thread'],)),value('SELECT public.panda_agent_chat_read(%s)',(f['thread'],)),signed('begin',f),finish(f)):
                assert '500 ms' not in response(result,f)['text']
            enable()
            assert '500 ms' not in response(value('SELECT public.panda_agent_lightweight_read(%s)',(f['thread'],)),f)['text']
        run('disable_and_new_epoch_hide_all_history_replays',revoke)
        def aliases():
            nonlocal active
            # User questions may remain; the withdrawn assistant result must not.
            for name,args in (('panda_agent_chat_begin',(f['thread'],f['request'],f['input']['question'])),('panda_agent_chat_begin_v2',(f['thread'],f['request'],f['input']['question'],False))):
                active='legacy_alias_'+name
                marks=','.join(['%s']*len(args));result=value('SELECT public.'+name+'('+marks+')',args)
                assert '500 ms = 0.5 s.' not in json.dumps(result)
            deny(lambda:value('SELECT public.panda_agent_chat_finish(%s,%s,%s::jsonb,%s)',(f['thread'],f['request'],json.dumps({'outcome':'insufficient','text':'500 ms = 0.5 s.','citations':[]}),'0'*64)))
            pending=str(uuid.uuid4())
            value('SELECT public.panda_agent_chat_begin(%s,%s,%s)',(f['thread'],pending,'Following disposable history observation'))
            for name in ('panda_agent_hosted_history_read','panda_agent_hosted_history_safe_read'):
                active='legacy_alias_'+name
                if value('SELECT to_regprocedure(%s) IS NOT NULL',('public.'+name+'(uuid,uuid)',)):
                    result=value('SELECT public.'+name+'(%s,%s)',(f['thread'],pending))
                    assert '500 ms = 0.5 s.' not in json.dumps(result)
        run('legacy_aliases_do_not_release_withdrawn_composite_result',aliases)
        def zero_calls():
            z=begin();assert response(finish(z),z)['outcome']=='insufficient'
        run('zero_call_helper_cannot_finalize_as_answered',zero_calls)
        def partial():
            p=begin('partial-local');x=call(p);assert claim(p,x)['state']=='execute';record(p,x,{'value':0.5});assert response(finish(p),p)['outcome']=='insufficient'
        run('one_complete_local_need_does_not_satisfy_two_need_sql_plan',partial)
        def old_kind():
            z=begin()
            deny(lambda:signed('begin',{'thread':z['thread'],'request':z['request'],'question':z['input']['question']},'lightweight'))
            deny(lambda:signed('cancel',{'thread':z['thread'],'request':z['request'],'digest':None},'lightweight'))
            signed('cancel',{k:z[k] for k in ('thread','request','planHash')});deny(lambda:claim(z,call(z)));finish(z,'cancelled')
        run('cross_kind_and_cancelled_late_claim_denied',old_kind)
        def expired():
            z=begin();x=call(z);claim(z,x);record(z,x,{'value':0.5})
            operator();conn.execute("UPDATE public.panda_agent_composite_turns SET deadline_at=clock_timestamp()-interval '1 second' WHERE thread_id=%s AND request_id=%s",(z['thread'],z['request']));actor()
            assert response(finish(z),z)['outcome']=='insufficient'
        run('expired_admitted_work_cannot_finish_answered',expired)
        def freeze_grant():
            z=begin();operator();conn.execute("UPDATE public.panda_agent_tools SET version=version+1 WHERE id='convert_units'");actor();deny(lambda:claim(z,call(z)));finish(z,'unavailable')
        run('grant_change_after_admission_denies_first_call',freeze_grant)
        def registry():
            deny(lambda:value('SELECT public.panda_agent_composite_tools_read()'))
            deny(lambda:value('SELECT public.panda_agent_skill_change(%s::jsonb)',(json.dumps({'skillId':'panda-project-planner','action':'enable','bundleVersion':1,'expectedVersion':0,'reason':'disposable non-admin test'}),)))
        run('non_admin_cannot_manage_tools_or_skills',registry)
        operator()
        assert value("SELECT bool_and(relrowsecurity) FROM pg_class WHERE oid IN ('public.panda_agent_composite_turns'::regclass,'public.panda_agent_composite_calls'::regclass)")
        for role in ('anon','authenticated'):
            for table in ('panda_agent_composite_calls','panda_agent_composite_turns'):
                assert not value('SELECT has_table_privilege(%s,%s,\'SELECT\')',(role,'public.'+table))
            assert value("SELECT bool_and(NOT has_function_privilege(%s,oid,'EXECUTE')) FROM pg_proc WHERE pronamespace='public'::regnamespace AND (proname IN ('panda_agent_composite_verify','panda_agent_composite_grants_current','panda_agent_composite_answer_current') OR proname LIKE '%%_before_composite')",(role,))
        passed.append('private_rows_verifiers_and_prior_helpers_remain_closed')
        def missing_vendor():
            actor();z=begin('firmware-gpio')
            rag=call(z,z['plan']['needs'][0]);claim(z,rag)
            record(z,rag,{'answer':{'outcome':'insufficient','text':'No approved vendor passage.','citations':[]},'scope':None,'vendorBindings':[],'contextFragments':0,'contextUnits':0})
            external=call(z,z['plan']['needs'][1]);claim(z,external)
            signed('bind',{k:z[k] for k in ('thread','request','planHash')}|{'callId':external['id'],'digest':'1'*64,'scope':None,'contextFragments':0,'contextUnits':0})
            record(z,external,{'reference':{'title':'GPIO & RTC GPIO','url':'https://docs.espressif.com/projects/esp-idf/en/v5.5.1/esp32/api-reference/peripherals/gpio.html','capturedAt':'2026-11-06T00:00:00Z'},'toolResultHash':'2'*64})
            answer={'outcome':'insufficient','text':'Unreviewed external reference; board applicability is unverified.','citations':[]}
            result=signed('finish',{k:z[k] for k in ('thread','request','planHash')}|{'answer':answer,'terminalReason':'insufficient'})
            assert response(result,z)==answer
        run('metadata_reference_after_missing_vendor_preserves_safe_answer',missing_vendor)
    except Exception as e:
        detail=getattr(getattr(e,'diag',None),'message_detail',None)
        failed={'check':active,'type':type(e).__name__,'sqlstate':getattr(e,'sqlstate',None),'guard':detail if detail in ('invalid','conflict','not_found','unauthenticated','unavailable','forbidden','quota') else None}
    finally:
        conn.execute('ROLLBACK')
        tables_absent=value("SELECT to_regclass('public.panda_agent_composite_turns') IS NULL AND to_regclass('public.panda_agent_composite_calls') IS NULL")
        cleanup={'rolledBack':True,'stateUnchanged':fingerprint()==before if before else False,'functionsAclOwnersRestored':functions()==functions_before if functions_before else False,'candidateTablesAbsent':tables_absent,'tablePresencePreserved':tables_absent!=installed}
    return {'candidateSha256':hashes,'evidenceClass':'synthetic SQL roles and fixtures; rollback only','alreadyInstalled':installed,'migrationReapplied':not installed,'passed':passed,'failed':failed,'cleanup':cleanup}
