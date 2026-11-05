"""Rollback-only applied-schema diagnostic grant/read/replay checks.

An operator supplies verified TLS connection and signer bytes. Grant changes,
synthetic SQL owner/chat/turns and optional forward DDL exist only in this one
transaction. No credentials are loaded; no vendor source or provider is changed.
"""
import hashlib
import hmac
import json
import re
import time
import uuid
from pathlib import Path

FOLLOWUP = '20261105090008_panda-agent-diagnostic-grant-replay.sql'


def check(conn, key, *, apply_followup=False, followup_name=FOLLOWUP):
    if not conn.autocommit or int(conn.info.transaction_status) != 0 or not isinstance(key, bytes) or len(key) != 32:
        raise ValueError('Explicit signer and idle autocommit connection required')
    import psycopg
    owner = 'diagnostic-read-guard-fixture-' + str(uuid.uuid4())
    marker = 'Synthetic diagnostic read-guard reference ' + str(uuid.uuid4())
    passed, active, failed = [], 'preflight', None
    cleanup, observations = {}, {}
    migration_hash = None
    before = None
    functions_before = None
    source = None
    if apply_followup:
        if Path(followup_name).name != followup_name or not followup_name.startswith('20261105090008_'):
            raise ValueError('Only the assigned forward08 file is permitted')
        source = (Path(__file__).resolve().parents[1] / 'migrations' / followup_name).read_bytes()
        if re.search(rb'^\s*(?:BEGIN|COMMIT|ROLLBACK)\s*;', source, re.MULTILINE | re.IGNORECASE):
            raise ValueError('Forward test file must not control the transaction')
        migration_hash = hashlib.sha256(source).hexdigest()

    def value(query, args=()):
        return conn.execute(query, args).fetchone()[0]

    def actor():
        conn.execute('SET LOCAL ROLE authenticated')
        value("SELECT set_config('request.jwt.claims',%s,true)", (json.dumps({'sub': owner, 'role': 'authenticated'}),))

    def operator():
        conn.execute('RESET ROLE')

    def fingerprint():
        result = {}
        for name in ('panda_agent_sources', 'panda_agent_versions', 'panda_agent_chunks',
                     'panda_agent_vendor_documents', 'panda_agent_vendor_versions', 'panda_agent_document_events',
                     'panda_agent_tools', 'panda_agent_tool_events', 'panda_agent_skills',
                     'staff_role_memberships', 'panda_agent_chats', 'panda_agent_diagnostic_turns',
                     'panda_agent_lightweight_turns', 'panda_agent_diagnostic_assets'):
            result[name] = conn.execute("SELECT count(*),md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' ORDER BY md5(to_jsonb(t)::text)),'')) FROM public." + name + ' t').fetchone()
        return result

    def function_fingerprint():
        return conn.execute("SELECT proname,pg_get_functiondef(oid),proacl::text,proowner FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname IN ('panda_agent_lightweight_read','panda_agent_diagnostic_complete','panda_agent_diagnostic_toolclaim','panda_agent_diagnostic_grants_current') ORDER BY proname,oid").fetchall()

    def signed(action, fields):
        payload = json.dumps({'v': 1, 'action': action, 'subject': owner,
                              'exp': int(time.time()) + 60, **fields}, separators=(',', ':'))
        mac = hmac.new(key, ('panda-diagnostic-db-v1\n' + payload).encode(), hashlib.sha256).hexdigest()
        return value('SELECT public.panda_agent_diagnostic_' + action + '(%s,%s)', (payload, mac))

    def change_grants(*, qa_enabled=True, qa_offset=0, tool_enabled=True, tool_offset=0):
        operator()
        conn.execute("UPDATE public.panda_agent_skills SET enabled=%s,version=%s WHERE id='product-evidence-qa'", (qa_enabled, qa_epoch + qa_offset))
        conn.execute("UPDATE public.panda_agent_tools SET enabled=%s,version=%s WHERE id='search_vendor_docs'", (tool_enabled, tool_epoch + tool_offset))
        actor()

    def turn(result, request):
        return next(t['response'] for t in result['turns'] if t['requestId'] == request)

    def begin_turn(with_tool=True):
        fields = {'thread': tid, 'request': str(uuid.uuid4()), 'diagnostic': {
            'errorText': 'Synthetic missing GPIO include', 'chip': 'esp32',
            'framework': 'esp-idf', 'frameworkVersion': '5.5.1'}}
        assert signed('begin', fields)['admitted'] is True
        if with_tool:
            assert signed('toolclaim', {'thread': tid, 'request': fields['request'], 'toolVersion': tool_epoch})['execute'] is True
            signed('toolrecord', {'thread': tid, 'request': fields['request'], 'toolVersion': tool_epoch,
                'result': {'state': 'complete', 'references': []}})
        return fields

    def complete_fields(fields):
        return {'thread': tid, 'request': fields['request'],
            'answer': {'outcome': 'insufficient', 'text': marker, 'citations': []},
            'scopeHash': None, 'bindings': []}

    def raw_fingerprint(fields):
        operator()
        result = conn.execute('SELECT t.response,m.approved_response_hash,g.input FROM public.panda_agent_chat_turns t JOIN public.panda_agent_lightweight_turns m USING(thread_id,request_id) JOIN public.panda_agent_diagnostic_turns g USING(thread_id,request_id) WHERE t.thread_id=%s AND t.request_id=%s', (tid, fields['request'])).fetchone()
        actor()
        return result

    def assert_projection(fields, visible):
        before_raw = raw_fingerprint(fields)
        results = {
            'lightweight_read': value('SELECT public.panda_agent_lightweight_read(%s)', (tid,)),
            'chat_read': value('SELECT public.panda_agent_chat_read(%s)', (tid,)),
            'diagnostic_begin_replay': signed('begin', fields),
            'diagnostic_complete_replay': signed('complete', complete_fields(fields)),
        }
        observations.setdefault(active, {})['markerVisibleByAlias'] = {
            name: marker in turn(result, fields['request'])['text']
            for name, result in results.items()}
        for name, result in results.items():
            answer = turn(result, fields['request'])
            assert (marker in answer['text']) is visible, name + ' released wrong grant projection'
            assert answer['citations'] == []
            assistant = next(m for m in result['messages'] if m.get('role') == 'assistant' and (marker in m.get('text', '')) is visible) if visible else None
            if visible:
                assert assistant is not None
            else:
                assert all(marker not in m.get('text', '') for m in result['messages'])
        assert raw_fingerprint(fields) == before_raw

    def run(name, fn):
        nonlocal active
        active = name
        fn()
        passed.append(name)

    conn.execute('BEGIN')
    try:
        conn.execute("SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='20s'; SET LOCAL idle_in_transaction_session_timeout='90s'")
        before, functions_before = fingerprint(), function_fingerprint()
        if source is not None:
            conn.execute(source.decode('utf8'))
        qa_epoch = value("SELECT version FROM public.panda_agent_skills WHERE id='product-evidence-qa'")
        tool_epoch = value("SELECT version FROM public.panda_agent_tools WHERE id='search_vendor_docs'")
        change_grants()
        tid = value("SELECT public.panda_agent_chat_create('Disposable read-guard SQL fixture')")['thread']['id']
        fields = begin_turn()
        signed('complete', complete_fields(fields))
        original = raw_fingerprint(fields)
        run('current_grants_show_protected_fixture', lambda: assert_projection(fields, True))
        for name, mutation in (
            ('tool_off_withholds_read_and_replays', {'tool_enabled': False}),
            ('tool_epoch_change_withholds_read_and_replays', {'tool_offset': 1}),
            ('qa_off_withholds_read_and_replays', {'qa_enabled': False}),
            ('qa_epoch_change_withholds_read_and_replays', {'qa_offset': 1}),
        ):
            change_grants(**mutation)
            run(name, lambda: assert_projection(fields, False))
            change_grants()
        def missing_result():
            operator();conn.execute('UPDATE public.panda_agent_diagnostic_turns SET tool_result=NULL WHERE thread_id=%s AND request_id=%s', (tid, fields['request']));actor()
            assert_projection(fields, False)
        run('missing_tool_result_withholds_read_and_replays', missing_result)
        operator();conn.execute("UPDATE public.panda_agent_diagnostic_turns SET tool_result=%s::jsonb WHERE thread_id=%s AND request_id=%s", (json.dumps({'state': 'complete', 'references': []}), tid, fields['request']));actor()
        run('projection_never_rewrites_original_response_or_protected_hash', lambda: None if raw_fingerprint(fields) == original else (_ for _ in ()).throw(AssertionError('Read mutated stored response')))
        def no_tool_path():
            change_grants()
            plain = begin_turn(False)
            change_grants(tool_enabled=False)
            assert marker in turn(signed('complete', complete_fields(plain)), plain['request'])['text']
            assert_projection(plain, True)
            change_grants()
        run('undispatched_diagnostic_not_blocked_by_tool_off', no_tool_path)
        def final_complete():
            pending = begin_turn()
            change_grants(tool_enabled=False)
            result = signed('complete', complete_fields(pending))
            answer = turn(result, pending['request'])
            assert marker not in answer['text'] and answer['citations'] == []
            operator()
            assert value("SELECT status='complete' FROM public.panda_agent_chat_turns WHERE thread_id=%s AND request_id=%s", (tid, pending['request']))
            actor();change_grants()
        run('disabled_grant_before_final_save_fixed_terminal', final_complete)
        pending = begin_turn(False)
        def claim_denied(**mutation):
            change_grants(**mutation)
            conn.execute('SAVEPOINT expected_claim_denial')
            try:
                signed('toolclaim', {'thread': tid, 'request': pending['request'], 'toolVersion': tool_epoch})
            except psycopg.Error as error:
                assert error.sqlstate == 'P0001'
                conn.execute('ROLLBACK TO SAVEPOINT expected_claim_denial')
            else:
                raise AssertionError('Revoked QA grant still admitted tool dispatch')
            finally:
                conn.execute('RELEASE SAVEPOINT expected_claim_denial')
            change_grants()
        run('qa_disabled_between_begin_and_toolclaim_denied', lambda: claim_denied(qa_enabled=False))
        run('qa_epoch_changed_between_begin_and_toolclaim_denied', lambda: claim_denied(qa_offset=1))
        signed('complete', complete_fields(pending))
        def private_helpers():
            operator()
            helper = conn.execute("SELECT oid,pg_get_functiondef(oid) FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname='panda_agent_diagnostic_grants_current'").fetchall()
            assert len(helper) == 1
            assert len(re.findall(r'FOR\s+SHARE\s+NOWAIT', helper[0][1], re.IGNORECASE)) >= 2
            read_definition = value("SELECT pg_get_functiondef('public.panda_agent_lightweight_read(uuid)'::regprocedure)")
            assert re.search(r'panda_agent_skills[\s\S]*?FOR\s+SHARE\s+NOWAIT', read_definition, re.IGNORECASE)
            assert re.search(r'panda_agent_diagnostic_turns[\s\S]*?FOR\s+SHARE\s+NOWAIT', read_definition, re.IGNORECASE)
            complete_definition = value("SELECT pg_get_functiondef('public.panda_agent_diagnostic_complete(text,text)'::regprocedure)")
            ordered_skills = re.search(r'PERFORM\s+1\s+FROM\s+public.panda_agent_skills\s+WHERE\s+id\s+IN\s*\(([^)]+)\)\s+ORDER\s+BY\s+id\s+FOR\s+SHARE', complete_definition, re.IGNORECASE)
            assert ordered_skills and set(re.findall(r"'([^']+)'", ordered_skills[1])) == {'product-evidence-qa', 'embedded-project-guide'}
            assert ordered_skills.start() < complete_definition.index('pg_advisory_xact_lock')
            observations['lockOrderingSourceAssertions'] = 'Helper/read use NOWAIT; new complete prelocks ordered QA+guide rows before lifecycle. Source assertions, not a new concurrency experiment.'
            for oid in [helper[0][0], value("SELECT 'public.panda_agent_lightweight_read_before_diagnostics(uuid)'::regprocedure::oid")]:
                for role in ('authenticated', 'anon'):
                    assert value('SELECT has_function_privilege(%s,%s,\'EXECUTE\')', (role, oid)) is False
            observations['qaAndToolRelationRowShareLockPresent'] = value("SELECT count(DISTINCT relation)=2 FROM pg_locks WHERE pid=pg_backend_pid() AND mode='RowShareLock' AND relation IN ('public.panda_agent_skills'::regclass,'public.panda_agent_tools'::regclass)")
            assert observations['qaAndToolRelationRowShareLockPresent']
            observations['lockEvidenceLimit'] = 'Combined fixture/read transaction, not isolated per-call attribution or a two-connection race'
            actor()
        run('helper_private_and_grant_share_lock_intent', private_helpers)
    except Exception as error:
        failed = {'check': active, 'class': type(error).__name__}
    finally:
        conn.execute('ROLLBACK')
        if before is not None:
            cleanup = {'rolledBack': True, 'allTrackedStateFingerprintsUnchanged': fingerprint() == before,
                       'functionDefinitionsAclOwnersRestored': function_fingerprint() == functions_before,
                       'fixtureChats': value('SELECT count(*) FROM public.panda_agent_chats WHERE owner_subject=%s', (owner,))}
            assert cleanup['allTrackedStateFingerprintsUnchanged'] and cleanup['functionDefinitionsAclOwnersRestored'] and cleanup['fixtureChats'] == 0
    return {'passed': passed, 'failed': failed, 'observations': observations, 'cleanup': cleanup,
            'candidateMigration': followup_name if source is not None else None, 'candidateSha256': migration_hash,
            'method': 'One rollback-only transaction; simulated SQL owner; transaction-local grant changes; no vendor mutation or commits',
            'realClerk': False, 'twoConnections': False, 'providerCalls': 0}


if __name__ == '__main__':
    raise SystemExit('Import check(conn,key) through verified local operator helper; no automatic credential loading')
