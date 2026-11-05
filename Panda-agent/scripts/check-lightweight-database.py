"""Rollback-only PostgreSQL fixture. Never a Clerk, provider or real withdrawal test.

Install the pinned developer-only psycopg[binary]==3.3.7 outside the runtime.
The caller supplies an explicitly verified test connection; no project discovery.
"""
import hashlib
import hmac
import json
import secrets
import time
import uuid
from pathlib import Path


def check(conn):
    import psycopg
    migration = Path(__file__).resolve().parents[1] / 'migrations/20261105090000_panda-agent-lightweight-turns.sql'
    key = secrets.token_bytes(32)
    subject = 'lightweight-sql-fixture-' + str(uuid.uuid4())
    passed = []
    conn.execute('BEGIN')
    try:
        conn.execute("SET LOCAL lock_timeout='3s'; SET LOCAL statement_timeout='15s'; SET LOCAL idle_in_transaction_session_timeout='60s'")
        assert conn.execute("SELECT count(*) FROM pg_proc WHERE proname='panda_agent_lightweight_begin'").fetchone()[0] == 0
        conn.execute(migration.read_text(encoding='utf-8'))
        conn.execute('INSERT INTO public.panda_agent_lightweight_key(key_bytes) VALUES (%s)', (key,))
        conn.execute('SET LOCAL ROLE authenticated')

        def actor(value):
            conn.execute("SELECT set_config('request.jwt.claims',%s,true)", (json.dumps({'sub': value, 'role': 'authenticated'}),))

        actor(subject)

        def call(action, fields, *, bad_mac=False):
            raw = json.dumps({'v': 1, 'action': action, 'subject': subject, 'exp': int(time.time()) + 60, **fields}, separators=(',', ':'))
            mac = hmac.new(key, ('panda-lightweight-db-v1\n' + raw).encode(), hashlib.sha256).hexdigest()
            return conn.execute(f'SELECT public.panda_agent_lightweight_{action}(%s,%s)', (raw, '0' * 64 if bad_mac else mac)).fetchone()[0]

        def denied(name, fn, states=('P0001', '42501')):
            conn.execute('SAVEPOINT negative_case')
            try:
                fn()
            except psycopg.Error as error:
                assert error.sqlstate in states, (name, error.sqlstate)
                conn.execute('ROLLBACK TO SAVEPOINT negative_case')
                passed.append(name)
            else:
                raise AssertionError(name + ' unexpectedly allowed')
            finally:
                conn.execute('RELEASE SAVEPOINT negative_case')

        for table in ('panda_agent_lightweight_key', 'panda_agent_lightweight_turns', 'panda_agent_chat_turns'):
            denied('private_table_' + table, lambda table=table: conn.execute('SELECT * FROM public.' + table))
        for function, args in [('panda_agent_chat_read_before_lightweight', '(NULL::uuid)'), ('panda_agent_chat_begin_before_lightweight', '(NULL::uuid,NULL::uuid,NULL::text)'), ('panda_agent_hosted_history_read_before_lightweight', '(NULL::uuid,NULL::uuid)')]:
            denied('private_function_' + function, lambda function=function, args=args: conn.execute('SELECT public.' + function + args))
        denied('bad_mac', lambda: call('begin', {'thread': str(uuid.uuid4()), 'request': str(uuid.uuid4()), 'question': 'Fixture'}, bad_mac=True))
        denied('missing_required_fields', lambda: call('begin', {}))

        thread = conn.execute("SELECT public.panda_agent_chat_create('Disposable SQL fixture')").fetchone()[0]['thread']['id']
        request = str(uuid.uuid4())
        question = 'Which MCU does the x8266 listing name?'
        start = call('begin', {'thread': thread, 'request': request, 'question': question})
        assert start['admitted'] is True and len(start['messages']) == 1 and start['messages'][0]['role']=='user'
        passed.append('signed_begin')
        execution = conn.execute('SELECT public.panda_agent_lightweight_execution(%s,%s)', (thread, request)).fetchone()[0]
        assert execution == {'prepared': False, 'digest': None, 'sku': None, 'scopeHash': None, 'productId': None}
        passed.append('unprepared_projection')
        actor(subject + '-other')
        denied('foreign_read', lambda: conn.execute('SELECT public.panda_agent_chat_read(%s)', (thread,)))
        denied('foreign_execution', lambda: conn.execute('SELECT public.panda_agent_lightweight_execution(%s,%s)', (thread, request)))
        actor(subject)

        items = conn.execute('SELECT public.panda_agent_runtime_products()').fetchone()[0]['items']
        product = next(item for item in items if 'x8266' in item['title'].lower())
        scope = conn.execute('SELECT public.panda_agent_lightweight_scope(%s)', (product['id'],)).fetchone()[0]
        prepare = {'thread': thread, 'request': request, 'question': question, 'product': product['id'], 'sku': scope['sku'], 'scopeHash': scope['scopeHash'], 'digest': 'a' * 64}
        missing = {k: v for k, v in prepare.items() if k != 'digest'}
        denied('missing_digest', lambda: call('prepare', missing))
        assert call('prepare', prepare) == {'execute': True}
        assert call('prepare', prepare) == {'execute': False}
        passed.append('prepare_once_then_status_only')
        denied('changed_digest', lambda: call('prepare', {**prepare, 'digest': 'b' * 64}))

        conn.execute('SET LOCAL ROLE postgres')
        denied('protected_write_forgery', lambda: conn.execute("UPDATE public.panda_agent_chat_turns SET response='{}',status='complete',completed_at=now() WHERE thread_id=%s AND request_id=%s", (thread, request)))
        conn.execute('SET LOCAL ROLE authenticated')
        source = conn.execute('SELECT public.panda_agent_runtime_scope(%s)', (product['id'],)).fetchone()[0]
        chunk = next(c for c in source['chunks'] if c['logicalChunkId'] not in ('21638b9445898f6a03aa24d24a7e60cc344c6bbb2bccd33959537178c2bd4fb4', '3ea5b9267d4102142b48cf8e5393e1f9a42fe0c3ff283c13cff04b5bdf3864ac'))
        citation = {'id': 'S1', 'title': source['product']['title'], 'sourceUrl': source['product']['sourceUrl'], 'capturedAt': chunk['capturedAt'], 'quote': chunk['text'][:80], 'sectionPath': chunk['sectionPath']}
        answer = {'outcome': 'evidence', 'text': 'Disposable quote fixture [S1]', 'citations': [citation]}
        fields = {'thread': thread, 'request': request, 'answer': answer}
        denied('malformed_answer_missing_outcome', lambda: call('complete', {**fields, 'answer': {'text': 'x', 'citations': [], 'other': True}}))
        saved = call('complete', fields)
        assert len(saved['messages']) == 2
        assert call('complete', fields)['messages'] == saved['messages']
        passed.append('same_result_replay_without_duplicate')
        denied('changed_complete', lambda: call('complete', {**fields, 'answer': {**answer, 'text': 'Changed fixture'}}))

        # Simulate a changed scope in this transaction. No corpus/source row changes.
        conn.execute('SET LOCAL ROLE postgres')
        conn.execute("""CREATE OR REPLACE FUNCTION public.panda_agent_lightweight_scope(p_product uuid) RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$ SELECT jsonb_build_object('productId',p_product,'sku','fixture','scopeHash',repeat('0',64)) $$""")
        conn.execute('SET LOCAL ROLE authenticated')
        hidden = conn.execute('SELECT public.panda_agent_chat_read(%s)', (thread,)).fetchone()[0]
        assert hidden['messages'][1]['citations'] == [] and hidden['turns'][0]['response']['citations'] == []
        replay = conn.execute('SELECT public.panda_agent_chat_begin_v2(%s,%s,%s,false)', (thread, request, question)).fetchone()[0]
        assert replay['turn']['response']['citations'] == []
        passed.append('changed_scope_redacts_legacy_read_and_begin_replay')
        next_request=str(uuid.uuid4())
        call('begin',{'thread':thread,'request':next_request,'question':'Follow-up fixture'})
        hosted=conn.execute('SELECT public.panda_agent_hosted_history_read(%s,%s)',(thread,next_request)).fetchone()[0]
        assert len(hosted['history'])==2 and citation['quote'] not in hosted['history'][1]['text']
        assert 'no longer current' in hosted['history'][1]['text']
        passed.append('hosted_compatibility_signature_with_safe_history')
    finally:
        conn.execute('ROLLBACK')
    assert conn.execute("SELECT count(*) FROM pg_proc WHERE proname='panda_agent_lightweight_begin'").fetchone()[0] == 0
    return {'passed': len(passed), 'checks': passed, 'rolledBack': True, 'realClerk': False, 'realSourceWithdrawal': False, 'migrationSha256': hashlib.sha256(migration.read_bytes()).hexdigest()}


if __name__ == '__main__':
    import os
    from urllib.parse import urlsplit
    import psycopg
    dsn = os.environ['PANDA_AGENT_TEST_DATABASE_URL']
    expected = os.environ['PANDA_AGENT_TEST_DATABASE_HOST']
    if urlsplit(dsn).hostname != expected:
        raise RuntimeError('Explicit test target mismatch')
    with psycopg.connect(dsn, sslmode='verify-full', connect_timeout=15, autocommit=True) as connection:
        print(json.dumps(check(connection), indent=2))
