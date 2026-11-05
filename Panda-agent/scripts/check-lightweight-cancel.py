"""Rollback-only cancellation checks. SQL fixture actors are not genuine Clerk users."""
import hashlib
import hmac
import json
import time
import uuid
from pathlib import Path


def check(conn,key):
    import psycopg
    migration=Path(__file__).resolve().parents[1]/'migrations/20261105090001_panda-agent-lightweight-cancel.sql'
    owner='lightweight-cancel-fixture-'+str(uuid.uuid4())
    passed=[]
    conn.execute('BEGIN')
    try:
        conn.execute("SET LOCAL lock_timeout='3s'; SET LOCAL statement_timeout='15s'; SET LOCAL idle_in_transaction_session_timeout='60s'")
        assert conn.execute("SELECT count(*) FROM pg_proc WHERE proname='panda_agent_lightweight_cancel'").fetchone()[0]==0
        conn.execute(migration.read_text(encoding='utf8'))
        conn.execute('SET LOCAL ROLE authenticated')
        def actor(sub=owner):conn.execute("SELECT set_config('request.jwt.claims',%s,true)",(json.dumps({'sub':sub,'role':'authenticated'}),))
        actor()
        def signed(action,fields,*,bad=False):
            payload=json.dumps({'v':1,'action':action,'subject':owner,'exp':int(time.time())+60,**fields},separators=(',',':'))
            mac=hmac.new(key,('panda-lightweight-db-v1\n'+payload).encode(),hashlib.sha256).hexdigest()
            return conn.execute('SELECT public.panda_agent_lightweight_'+action+'(%s,%s)',(payload,'0'*64 if bad else mac)).fetchone()[0]
        def denied(name,fn):
            conn.execute('SAVEPOINT expected_denial')
            try:fn()
            except psycopg.Error as e:
                assert e.sqlstate in ('P0001','42501'),(name,e.sqlstate)
                conn.execute('ROLLBACK TO SAVEPOINT expected_denial');passed.append(name)
            else:raise AssertionError(name+' unexpectedly succeeded')
            finally:conn.execute('RELEASE SAVEPOINT expected_denial')
        def create():
            thread=conn.execute("SELECT public.panda_agent_chat_create('Disposable cancellation check')").fetchone()[0]['thread']['id']
            request=str(uuid.uuid4());question='x8266 cancellation SQL fixture'
            signed('begin',{'thread':thread,'request':request,'question':question})
            return thread,request,question
        thread,request,question=create()
        fields={'thread':thread,'request':request,'digest':None}
        denied('bad_mac',lambda:signed('cancel',fields,bad=True))
        denied('missing_digest',lambda:signed('cancel',{'thread':thread,'request':request}))
        denied('extra_answer',lambda:signed('cancel',{**fields,'answer':{'text':'forged'}}))
        denied('invalid_digest_type',lambda:signed('cancel',{**fields,'digest':4}))
        denied('wrong_digest_for_unprepared',lambda:signed('cancel',{**fields,'digest':'d'*64}))
        actor(owner+'-other')
        denied('foreign_actor',lambda:signed('cancel',fields))
        actor()
        marker_thread=conn.execute("SELECT public.panda_agent_chat_create('Disposable preadmission cancellation')").fetchone()[0]['thread']['id']
        marker_request=str(uuid.uuid4())
        marker_fields={'thread':marker_thread,'request':marker_request,'digest':None}
        empty=signed('cancel',marker_fields)
        assert not empty['turns'];passed.append('preadmission_cancel_creates_no_fake_turn')
        assert signed('cancel',marker_fields)==empty;passed.append('preadmission_cancel_idempotent')
        denied('late_signed_begin_fenced',lambda:signed('begin',{'thread':marker_thread,'request':marker_request,'question':'Late admitted question'}))
        denied('late_legacy_begin_fenced',lambda:conn.execute('SELECT public.panda_agent_chat_begin(%s,%s,%s)',(marker_thread,marker_request,'Late legacy question')))
        denied('late_v2_begin_fenced',lambda:conn.execute('SELECT public.panda_agent_chat_begin_v2(%s,%s,%s,false)',(marker_thread,marker_request,'Late v2 question')))
        denied('private_admission_guard',lambda:conn.execute('SELECT public.panda_agent_lightweight_admission_guard(%s,%s)',(marker_thread,str(uuid.uuid4()))))
        denied('private_marker_table',lambda:conn.execute('SELECT * FROM public.panda_agent_lightweight_cancelled_requests'))
        other_thread=conn.execute("SELECT public.panda_agent_chat_create('Disposable marker owner bound')").fetchone()[0]['thread']['id']
        denied('marker_cannot_move_between_chats',lambda:signed('cancel',{**marker_fields,'thread':other_thread}))
        conn.execute('SELECT public.panda_agent_chat_delete(%s)',(marker_thread,))
        conn.execute('RESET ROLE')
        assert conn.execute('SELECT count(*) FROM public.panda_agent_lightweight_cancelled_requests WHERE owner_subject=%s AND request_id=%s',(owner,marker_request)).fetchone()[0]==0
        passed.append('marker_cascades_on_owned_chat_delete')
        conn.execute('INSERT INTO public.panda_agent_lightweight_cancelled_requests(owner_subject,thread_id,request_id) SELECT %s,%s,gen_random_uuid() FROM generate_series(1,100)',(owner,other_thread))
        conn.execute('SET LOCAL ROLE authenticated');actor()
        denied('marker_budget_bounds_new_cancel',lambda:signed('cancel',{'thread':other_thread,'request':str(uuid.uuid4()),'digest':None}))
        denied('combined_budget_bounds_new_begin',lambda:signed('begin',{'thread':other_thread,'request':str(uuid.uuid4()),'question':'Over budget'}))
        done=signed('cancel',fields)
        assert done['turns'][0]['status']=='complete' and done['turns'][0]['response']['citations']==[]
        assert 'cancelled before evidence selection' in done['turns'][0]['response']['text'];passed.append('unprepared_cancel_terminal')
        assert signed('cancel',fields)==done;passed.append('cancel_replay_idempotent')
        denied('late_complete_cannot_overwrite',lambda:signed('complete',{'thread':thread,'request':request,'answer':{'outcome':'insufficient','text':'late answer','citations':[]}}))
        denied('late_prepare_cannot_execute',lambda:signed('prepare',{'thread':thread,'request':request,'question':question,'product':str(uuid.uuid4()),'sku':'fixture','scopeHash':'a'*64,'digest':'d'*64}))
        signed('begin',{'thread':thread,'request':str(uuid.uuid4()),'question':'Next bounded question'})
        passed.append('new_turn_admitted_after_cancel')
        second,second_request,second_question=create()
        product=next(p for p in conn.execute('SELECT public.panda_agent_runtime_products()').fetchone()[0]['items'] if p['sku']=='ESPX8266')
        scope=conn.execute('SELECT public.panda_agent_lightweight_scope(%s)',(product['id'],)).fetchone()[0]
        assert signed('prepare',{'thread':second,'request':second_request,'question':second_question,'product':product['id'],'sku':scope['sku'],'scopeHash':scope['scopeHash'],'digest':'d'*64})['execute']
        second_fields={'thread':second,'request':second_request,'digest':None}
        denied('prepare_wins_null_cancel_conflicts',lambda:signed('cancel',second_fields))
        denied('wrong_prepared_digest',lambda:signed('cancel',{**second_fields,'digest':'e'*64}))
        conn.execute('RESET ROLE')
        conn.execute("UPDATE public.panda_agent_lightweight_turns SET scope_hash=repeat('0',64) WHERE thread_id=%s AND request_id=%s AND owner_subject=%s",(second,second_request,owner))
        conn.execute('SET LOCAL ROLE authenticated');actor()
        cancelled=signed('cancel',{**second_fields,'digest':'d'*64})
        assert cancelled['turns'][0]['status']=='complete' and 'cancelled before evidence selection' in cancelled['turns'][0]['response']['text'] and cancelled['turns'][0]['response']['citations']==[]
        passed.append('prepared_cancel_fixed_note_ignores_stale_scope_without_quote')
        denied('late_prepared_completion_denied',lambda:signed('complete',{'thread':second,'request':second_request,'answer':{'outcome':'insufficient','text':'late prepared answer','citations':[]}}))
        denied('private_cancel_metadata',lambda:conn.execute('SELECT cancelled_at FROM public.panda_agent_lightweight_turns'))
        conn.execute('RESET ROLE')
        row=conn.execute('SELECT request_hash,scope_hash,cancelled_at IS NOT NULL FROM public.panda_agent_lightweight_turns WHERE thread_id=%s AND request_id=%s',(second,second_request)).fetchone()
        assert row==('d'*64,'0'*64,True);passed.append('original_execution_metadata_retained')
    finally:conn.execute('ROLLBACK')
    assert conn.execute("SELECT count(*) FROM pg_proc WHERE proname='panda_agent_lightweight_cancel'").fetchone()[0]==0
    return {'migrationSha256':hashlib.sha256(migration.read_bytes()).hexdigest(),'passed':len(passed),'checks':passed,'rolledBack':True,'realClerk':False,'realSourceWithdrawal':False,'canonicalSourceRowsChanged':0,'providerCalls':0}
