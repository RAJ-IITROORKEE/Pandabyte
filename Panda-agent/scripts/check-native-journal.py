"""Rollback-only native journal SQL guards; operator supplies idle connection and key.

Claims are synthetic SQL roles, not Clerk, native runtime, or provider evidence.
The candidate migration and all disposable records are rolled back.
"""
import hashlib
import hmac
import json
import secrets
import time
import uuid
from pathlib import Path

MIGRATION = '20261106090004_panda-agent-native-journal.sql'


def check(conn, key):
    import psycopg
    if not conn.autocommit or int(conn.info.transaction_status) != 0 or not isinstance(key, bytes) or len(key) != 32:
        raise ValueError('Idle autocommit connection and 32-byte signer required')
    owner = 'native-sql-fixture-' + str(uuid.uuid4())
    foreign = 'native-sql-foreign-' + str(uuid.uuid4())
    passed, failed, before, before_schema = [], None, None, None
    stage = 'preflight'
    digest = None
    def value(sql, args=()):
        return conn.execute(sql, args).fetchone()[0]
    def fingerprint():
        tables = ('panda_agent_chats', 'panda_agent_chat_turns', 'panda_agent_lightweight_turns', 'panda_agent_skills', 'panda_agent_skill_versions', 'panda_agent_sources', 'panda_agent_versions', 'panda_agent_chunks', 'staff_role_memberships')
        return {t: conn.execute("SELECT count(*),md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' ORDER BY md5(to_jsonb(t)::text)),'')) FROM public." + t + ' t').fetchone() for t in tables}
    def schema():
        functions = conn.execute("SELECT proname,pg_get_function_identity_arguments(oid),pg_get_functiondef(oid),proacl::text,proowner FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname LIKE 'panda_agent_%' ORDER BY proname,oid").fetchall()
        triggers = conn.execute("SELECT c.relname,t.tgname,pg_get_triggerdef(t.oid) FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND NOT t.tgisinternal AND c.relname LIKE 'panda_agent_%' ORDER BY c.relname,t.tgname").fetchall()
        tables = conn.execute("SELECT c.relname,c.relrowsecurity,c.relforcerowsecurity,c.relacl::text,c.relowner,a.attnum,a.attname,format_type(a.atttypid,a.atttypmod),a.attnotnull FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_attribute a ON a.attrelid=c.oid WHERE n.nspname='public' AND c.relname LIKE 'panda_agent_%' AND c.relkind IN ('r','p') AND a.attnum>0 AND NOT a.attisdropped ORDER BY c.relname,a.attnum").fetchall()
        return functions, triggers, tables
    def actor(subject=owner):
        conn.execute('SET LOCAL ROLE authenticated')
        value("SELECT set_config('request.jwt.claims',%s,true)", (json.dumps({'sub':subject,'role':'authenticated'}),))
    def operator():
        conn.execute('RESET ROLE')
    def signed(action, fields, domain='native', subject=owner, expires=None):
        payload = {'v':1,'action':action,'subject':subject,'exp':int(time.time())+60 if expires is None else expires}
        if domain == 'native': payload['input'] = fields
        else: payload.update(fields)
        raw = json.dumps(payload, separators=(',',':'))
        mac = hmac.new(key, ('panda-'+domain+'-db-v1\n'+raw).encode(), hashlib.sha256).hexdigest()
        return value('SELECT public.panda_agent_'+domain+'_'+action+'(%s,%s)', (raw,mac))
    def deny(fn, states=('P0001',), detail=None):
        conn.execute('SAVEPOINT denial')
        try:
            fn()
        except psycopg.Error as exc:
            if exc.sqlstate not in states: raise
            if detail is not None and getattr(exc.diag,'message_detail',None) != detail: raise
            conn.execute('ROLLBACK TO SAVEPOINT denial')
        else:
            raise AssertionError('expected denial')
        finally:
            conn.execute('RELEASE SAVEPOINT denial')
    def run(name, fn):
        nonlocal stage
        stage=name
        fn()
        passed.append(name)
    def new():
        thread = value("SELECT public.panda_agent_chat_create('Disposable native SQL fixture')")['thread']['id']
        nonce = secrets.token_hex(16)
        receipt = {'sessionID':'ses_'+secrets.token_hex(6)+'A'*14,'title':'panda-agent-customer-'+nonce,'nonce':nonce,'scope':'customer','binding':secrets.token_hex(32)}
        fields = {'thread':thread,'request':str(uuid.uuid4()),'question':'Disposable native question','receipt':receipt,'messageID':'msg_'+secrets.token_hex(6)+'B'*14,'promptHash':secrets.token_hex(32),'runtimeBinding':secrets.token_hex(32),'scopes':[]}
        result = signed('admit',fields)
        assert result['admitted'] is True and result['state']['version']==1 and result['state']['removalClaimed'] is False
        return fields
    def ref(fields): return {'thread':fields['thread'],'request':fields['request']}
    def transition(fields, version, event): return signed('transition',ref(fields)|{'expectedVersion':version,'event':event})
    def complete(fields, version, reason, native_outcome, answer):
        return signed('complete',ref(fields)|{'expectedVersion':version,'terminalReason':reason,'nativeOutcome':native_outcome,'answer':answer})
    def cancel_answer(): return {'outcome':'insufficient','text':'This request was cancelled. Start a new question when ready.','citations':[]}
    def claim_removal(fields, version): return signed('claim_removal',ref(fields)|{'expectedVersion':version})
    def retire(fields, version): return signed('retire',ref(fields)|{'expectedVersion':version})
    def response(fields):
        result = value('SELECT public.panda_agent_native_read(%s)',(fields['thread'],))
        return next(turn['response'] for turn in result['turns'] if turn['requestId']==fields['request'])
    def claim_created(fields):
        assert transition(fields,1,'claim_create')['version']==2
        assert transition(fields,2,'created')['version']==3
    conn.execute('BEGIN')
    try:
        conn.execute("SET LOCAL lock_timeout='3s';SET LOCAL statement_timeout='20s';SET LOCAL idle_in_transaction_session_timeout='90s'")
        before, before_schema = fingerprint(), schema()
        assert value("SELECT to_regclass('public.panda_agent_native_runs') IS NULL")
        data = (Path(__file__).resolve().parents[1]/'migrations'/MIGRATION).read_bytes()
        digest = hashlib.sha256(data).hexdigest()
        conn.execute(data.decode('utf-8'))
        conn.execute("UPDATE public.panda_agent_skills SET enabled=true WHERE id='product-evidence-qa'")
        actor()
        def replay_and_cas():
            f = new()
            assert signed('admit',f)['admitted'] is False
            assert signed('admit',dict(f,question='  '+f['question']+'  '))['admitted'] is False
            altered = dict(f); altered['receipt'] = dict(f['receipt'], binding=secrets.token_hex(32))
            deny(lambda:signed('admit',altered))
            assert transition(f,1,'claim_create')['phase']=='create_claimed'
            deny(lambda:transition(f,1,'claim_create'))
            assert transition(f,2,'created')['phase']=='created'
            assert transition(f,3,'claim_prompt')['phase']=='prompt_claimed'
            deny(lambda:transition(f,3,'claim_prompt'))
            assert transition(f,4,'unknown')['phase']=='unknown'
            deny(lambda:transition(f,5,'claim_prompt'))
            deny(lambda:transition(f,5,'claim_create'))
        run('exact_admission_cas_and_unknown_never_redispatch', replay_and_cas)
        def cancel_cases():
            pre = new(); claim_created(pre)
            deny(lambda:claim_removal(pre,3))
            assert transition(pre,3,'cancel_requested')['version']==4
            deny(lambda:complete(pre,4,'cancelled','interrupted',cancel_answer()))
            assert complete(pre,4,'cancelled',None,cancel_answer())['phase']=='terminal'
            post = new(); claim_created(post); transition(post,3,'claim_prompt'); transition(post,4,'cancel_requested')
            deny(lambda:complete(post,5,'cancelled',None,cancel_answer()))
            assert complete(post,5,'cancelled','interrupted',cancel_answer())['phase']=='terminal'
            deny(lambda:retire(post,6))
            claimed=claim_removal(post,6)
            assert claimed['removalClaimed'] is True and claimed['version']==7
            deny(lambda:claim_removal(post,6))
            deny(lambda:claim_removal(post,7))
            retired=retire(post,7)
            assert retired['runtimeRetired'] is True and retired['removalClaimed'] is True and retired['version']==8
            assert retire(post,7)['runtimeRetired'] is True
            operator(); conn.execute('DELETE FROM public.panda_agent_native_runs WHERE thread_id=%s AND request_id=%s',(post['thread'],post['request'])); actor()
        run('cancel_requires_matching_native_outcome_and_retire_before_delete',cancel_cases)
        def grants_and_replay():
            f = new(); claim_created(f); transition(f,3,'claim_prompt'); transition(f,4,'accepted')
            answer={'outcome':'conversation','text':'Disposable verified conversation.','citations':[]}
            result=complete(f,5,'answered','succeeded',answer)
            assert result['phase']=='terminal' and response(f)==answer
            assert complete(f,5,'answered','succeeded',answer)['phase']=='terminal'
            deny(lambda:complete(f,5,'answered','succeeded',dict(answer,text='different')))
            operator();conn.execute("UPDATE public.panda_agent_skills SET enabled=false,version=version+1 WHERE id='product-evidence-qa'");actor()
            assert response(f)['outcome']=='insufficient'
            operator();conn.execute("UPDATE public.panda_agent_skills SET enabled=true WHERE id='product-evidence-qa'");actor()
            assert response(f)['outcome']=='insufficient'
            assert claim_removal(f,6)['removalClaimed'] is True
            assert retire(f,7)['runtimeRetired'] is True
        run('completion_replay_and_qa_grant_revocation',grants_and_replay)
        def revoke_before_dispatch():
            f=new();claim_created(f)
            operator();conn.execute("UPDATE public.panda_agent_skills SET version=version+1 WHERE id='product-evidence-qa'");actor()
            deny(lambda:transition(f,3,'claim_prompt'))
        run('qa_epoch_change_denies_prompt_even_without_scopes',revoke_before_dispatch)
        def invalid_scope():
            thread=value("SELECT public.panda_agent_chat_create('Disposable native scope fixture')")['thread']['id']
            nonce=secrets.token_hex(16)
            f={'thread':thread,'request':str(uuid.uuid4()),'question':'Disposable scope','receipt':{'sessionID':'ses_'+secrets.token_hex(6)+'C'*14,'title':'panda-agent-customer-'+nonce,'nonce':nonce,'scope':'customer','binding':secrets.token_hex(32)},'messageID':'msg_'+secrets.token_hex(6)+'D'*14,'promptHash':secrets.token_hex(32),'runtimeBinding':secrets.token_hex(32),'scopes':[{'productId':str(uuid.uuid4()),'scopeHash':'a'*64}]}
            deny(lambda:signed('admit',f))
        run('nonexistent_source_scope_denied',invalid_scope)
        def duplicate_uuid_scopes():
            operator()
            conn.execute('ALTER FUNCTION public.panda_agent_lightweight_scope(uuid) RENAME TO panda_agent_lightweight_scope_before_fixture')
            conn.execute("CREATE FUNCTION public.panda_agent_lightweight_scope(uuid) RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$ SELECT jsonb_build_object('scopeHash',repeat('a',64)) $$")
            conn.execute('REVOKE ALL ON FUNCTION public.panda_agent_lightweight_scope(uuid) FROM PUBLIC,anon,authenticated')
            try:
                product=str(uuid.uuid4())
                one=[{'productId':product,'scopeHash':'a'*64}]
                both=one+[{'productId':product.upper(),'scopeHash':'a'*64}]
                assert value('SELECT public.panda_agent_native_scopes_current(%s::jsonb)',(json.dumps(one),)) is True
                assert value('SELECT public.panda_agent_native_scopes_current(%s::jsonb)',(json.dumps(both),)) is False
            finally:
                conn.execute('DROP FUNCTION public.panda_agent_lightweight_scope(uuid)')
                conn.execute('ALTER FUNCTION public.panda_agent_lightweight_scope_before_fixture(uuid) RENAME TO panda_agent_lightweight_scope')
                actor()
        run('scope_uuid_case_duplicate_rejected_with_injected_scope',duplicate_uuid_scopes)
        def access():
            f=new(); actor(foreign)
            deny(lambda:signed('state',ref(f),subject=foreign))
            actor(); deny(lambda:value('SELECT public.panda_agent_native_state(%s,%s)',('{}','0'*64)))
            deny(lambda:value('SELECT count(*) FROM public.panda_agent_native_runs'),('42501',))
            deny(lambda:value('SELECT public.panda_agent_native_verify(%s,%s,%s)',('{}','0'*64,'state')),('42501',))
            operator()
            for role in ('anon','authenticated'):
                assert not value("SELECT has_table_privilege(%s,'public.panda_agent_native_runs','SELECT')",(role,))
                assert not value("SELECT has_function_privilege(%s,'public.panda_agent_native_scopes_current(jsonb)','EXECUTE')",(role,))
            actor()
        run('foreign_unsigned_raw_table_and_helper_denied',access)
        def old_writes():
            f=new()
            legacy={'thread':f['thread'],'request':f['request'],'digest':None}
            deny(lambda:signed('cancel',legacy,'lightweight'),detail='conflict')
            assert signed('state',ref(f))['phase']=='admitted'
            operator()
            assert value('SELECT status FROM public.panda_agent_chat_turns WHERE thread_id=%s AND request_id=%s',(f['thread'],f['request']))=='pending'
            deny(lambda:conn.execute('UPDATE public.panda_agent_lightweight_turns SET request_hash=%s WHERE thread_id=%s AND request_id=%s',('a'*64,f['thread'],f['request'])))
            deny(lambda:conn.execute("UPDATE public.panda_agent_chat_turns SET response=%s::jsonb,status='complete' WHERE thread_id=%s AND request_id=%s",(json.dumps({'outcome':'insufficient','text':'Legacy overwrite','citations':[]}),f['thread'],f['request'])))
            deny(lambda:conn.execute('DELETE FROM public.panda_agent_native_runs WHERE thread_id=%s AND request_id=%s',(f['thread'],f['request'])))
            actor()
        run('legacy_cancel_prepare_and_unretired_delete_blocked',old_writes)
        def delayed_expiry():
            f=new(); claim_created(f); transition(f,3,'claim_prompt'); transition(f,4,'accepted')
            answer={'outcome':'conversation','text':'Disposable expiry fixture.','citations':[]}
            complete(f,5,'answered','succeeded',answer); claim_removal(f,6); retire(f,7)
            operator()
            conn.execute('ALTER FUNCTION public.panda_agent_native_verify(text,text,text) RENAME TO panda_agent_native_verify_before_fixture')
            conn.execute('''CREATE FUNCTION public.panda_agent_native_verify(text,text,text) RETURNS jsonb
                LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
                DECLARE result jsonb; BEGIN
                  result:=public.panda_agent_native_verify_before_fixture($1,$2,$3);
                  IF current_setting('panda.fixture_delayed',true)='0' THEN
                    PERFORM set_config('panda.fixture_delayed','1',true); PERFORM pg_sleep(2.1);
                  END IF;
                  RETURN result;
                END $$''')
            conn.execute('REVOKE ALL ON FUNCTION public.panda_agent_native_verify(text,text,text) FROM PUBLIC,anon,authenticated')
            try:
                actor()
                cases=[('state',ref(f)),('admit',f),('complete',ref(f)|{'expectedVersion':5,'answer':answer,'nativeOutcome':'succeeded','terminalReason':'answered'}),('retire',ref(f)|{'expectedVersion':7})]
                for action,fields in cases:
                    value("SELECT set_config('panda.fixture_delayed','0',true)")
                    expires=value('SELECT floor(extract(epoch FROM clock_timestamp()))::bigint + 2')
                    deny(lambda:signed(action,fields,expires=expires),detail='unauthenticated')
            finally:
                operator()
                conn.execute('DROP FUNCTION public.panda_agent_native_verify(text,text,text)')
                conn.execute('ALTER FUNCTION public.panda_agent_native_verify_before_fixture(text,text,text) RENAME TO panda_agent_native_verify')
                actor()
        run('injected_post_verify_delay_rejects_expired_replays',delayed_expiry)
    except Exception as exc:
        failed={'check':stage,'type':type(exc).__name__,'sqlstate':getattr(exc,'sqlstate',None)}
    finally:
        conn.execute('ROLLBACK')
        cleanup={'rolledBack':True,'rowsUnchanged':fingerprint()==before if before is not None else False,'schemaFunctionsTriggersAclRestored':schema()==before_schema if before_schema is not None else False,'candidateTableAbsent':value("SELECT to_regclass('public.panda_agent_native_runs') IS NULL")}
    return {'migrationSha256':digest,'evidenceClass':'synthetic SQL roles and disposable records; rollback only','expiryDelayEvidence':'injected after entry verification; not real lock contention','sourceWithdrawalTested':False,'passed':passed,'failed':failed,'cleanup':cleanup}
