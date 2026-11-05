"""Disposable SQL concurrency checks. Simulated actors; no Clerk, HTTP or provider calls."""
import concurrent.futures
import hashlib
import hmac
import json
import time
import uuid


def check(connect, key):
    import psycopg

    observer, left, right = [connect() for _ in range(3)]
    owner = 'guide-race-' + str(uuid.uuid4())
    threads = []
    proof = {}

    def actor(conn):
        conn.execute('BEGIN')
        conn.execute("SET LOCAL statement_timeout='12s'; SET LOCAL lock_timeout='9s'; SET LOCAL idle_in_transaction_session_timeout='25s'")
        conn.execute('SET LOCAL ROLE authenticated')
        conn.execute("SELECT set_config('request.jwt.claims',%s,true)", (json.dumps({'sub': owner, 'role': 'authenticated'}),))

    def payload(action, fields, exp=None):
        raw = json.dumps({'v': 1, 'action': action, 'subject': owner, 'exp': int(time.time()) + 60 if exp is None else exp, **fields}, separators=(',', ':'))
        mac = hmac.new(key, ('panda-guide-db-v1\n' + raw).encode(), hashlib.sha256).hexdigest()
        return raw, mac

    def call(conn, action, fields, exp=None):
        return conn.execute('SELECT public.panda_agent_guide_' + action + '(%s,%s)', payload(action, fields, exp)).fetchone()[0]

    def execute(conn, action, fields, exp=None):
        try:
            value = call(conn, action, fields, exp)
            conn.execute('COMMIT')
            return ('ok', value)
        except psycopg.Error as error:
            detail = error.diag.message_detail
            conn.execute('ROLLBACK')
            return ('denied', detail)

    def wait_lock(conn):
        deadline = time.monotonic() + 4
        while time.monotonic() < deadline:
            observer.execute('SELECT pg_stat_clear_snapshot()')
            waiting = observer.execute("SELECT wait_event_type = 'Lock' FROM pg_stat_activity WHERE pid=%s", (conn.info.backend_pid,)).fetchone()
            if waiting and waiting[0]:
                return
            time.sleep(.025)
        raise AssertionError('Expected an observed PostgreSQL lock wait')

    def fixture():
        actor(observer)
        thread = observer.execute("SELECT public.panda_agent_chat_create('Disposable guide concurrency')").fetchone()[0]['thread']['id']
        threads.append(thread)
        observer.execute('COMMIT')
        return {'thread': thread, 'request': str(uuid.uuid4()), 'guide': {'goal': 'A conceptual project', 'board': 'Board', 'components': [], 'expectedVersion': 0}}

    def admit(fields):
        actor(observer)
        result = call(observer, 'begin', fields)
        assert result['admitted'] is True
        observer.execute('COMMIT')

    def prepare_fields(fields):
        actor(observer)
        products = observer.execute('SELECT public.panda_agent_guide_products()').fetchone()[0]['items']
        assert products, 'A permitted published product is required for this disposable fixture'
        product = products[0]
        observer.execute('COMMIT')
        return {'thread': fields['thread'], 'request': fields['request'], 'product': product['id'], 'sku': product['sku'], 'scopeHash': None, 'digest': 'd' * 64}

    def lock_chat(conn, fields):
        conn.execute('BEGIN')
        conn.execute("SET LOCAL statement_timeout='12s'; SET LOCAL lock_timeout='9s'; SET LOCAL idle_in_transaction_session_timeout='25s'")
        assert conn.execute('SELECT id FROM public.panda_agent_chats WHERE id=%s AND owner_subject=%s FOR UPDATE', (fields['thread'], owner)).fetchone()

    try:
        # First begin holds the chat lock; identical begin must observe the committed turn.
        fields = fixture()
        actor(left)
        assert call(left, 'begin', fields)['admitted'] is True
        actor(right)
        with concurrent.futures.ThreadPoolExecutor(max_workers=1) as pool:
            pending = pool.submit(execute, right, 'begin', fields)
            wait_lock(right)
            left.execute('COMMIT')
            result = pending.result(timeout=12)
        assert result[0] == 'ok' and result[1]['admitted'] is False
        assert observer.execute('SELECT count(*) FROM public.panda_agent_guide_turns WHERE thread_id=%s AND request_id=%s AND owner_subject=%s', (fields['thread'], fields['request'], owner)).fetchone()[0] == 1
        observer.commit()
        proof['same_request_one_admission'] = True

        # The prepare capability must still be valid after acquiring its lock.
        fields = fixture()
        admit(fields)
        prepare = prepare_fields(fields)
        lock_chat(left, fields)
        actor(right)
        with concurrent.futures.ThreadPoolExecutor(max_workers=1) as pool:
            pending = pool.submit(execute, right, 'prepare', prepare, int(time.time()) + 1)
            wait_lock(right)
            time.sleep(2.2)
            left.execute('COMMIT')
            result = pending.result(timeout=12)
        assert result == ('denied', 'unauthenticated')
        assert observer.execute('SELECT request_hash FROM public.panda_agent_lightweight_turns WHERE thread_id=%s AND request_id=%s AND owner_subject=%s', (fields['thread'], fields['request'], owner)).fetchone()[0] is None
        observer.commit()
        proof['prepare_expiry_after_lock'] = True

        # Change only this fixture's memory version while completion waits on the chat lock.
        fields = fixture()
        admit(fields)
        prepare = prepare_fields(fields)
        actor(observer)
        assert call(observer, 'prepare', prepare)['execute'] is True
        observer.execute('COMMIT')
        lock_chat(left, fields)
        changed = left.execute('UPDATE public.panda_agent_project_memory SET version=1 WHERE thread_id=%s AND owner_subject=%s AND version=0 RETURNING thread_id', (fields['thread'], owner)).fetchone()
        assert changed
        actor(right)
        answer = {'outcome': 'insufficient', 'text': 'STALE_GUIDE_SENTINEL', 'citations': []}
        complete = {'thread': fields['thread'], 'request': fields['request'], 'answer': answer, 'success': True}
        with concurrent.futures.ThreadPoolExecutor(max_workers=1) as pool:
            pending = pool.submit(execute, right, 'complete', complete)
            wait_lock(right)
            left.execute('COMMIT')
            result = pending.result(timeout=12)
        assert result[0] == 'ok'
        row = observer.execute('SELECT response,status FROM public.panda_agent_chat_turns WHERE thread_id=%s AND request_id=%s', (fields['thread'], fields['request'])).fetchone()
        assert row[1] == 'complete' and row[0] == {'outcome': 'insufficient', 'text': 'This guide was not saved because its skill, project version or evidence changed. Start a new guide run.', 'citations': []}
        assert observer.execute('SELECT version,guide_turns FROM public.panda_agent_project_memory WHERE thread_id=%s AND owner_subject=%s', (fields['thread'], owner)).fetchone() == (1, 0)
        observer.commit()
        proof['memory_version_fences_completion'] = True
    finally:
        for conn in (observer, left, right):
            try:
                conn.rollback()
            except psycopg.Error:
                pass
        try:
            for thread in threads:
                observer.execute('DELETE FROM public.panda_agent_chats WHERE id=%s AND owner_subject=%s', (thread, owner))
            observer.commit()
            assert observer.execute('SELECT count(*) FROM public.panda_agent_chats WHERE owner_subject=%s', (owner,)).fetchone()[0] == 0
            assert observer.execute('SELECT count(*) FROM public.panda_agent_project_memory WHERE owner_subject=%s', (owner,)).fetchone()[0] == 0
            assert observer.execute('SELECT count(*) FROM public.panda_agent_guide_turns WHERE owner_subject=%s', (owner,)).fetchone()[0] == 0
            assert observer.execute('SELECT count(*) FROM public.panda_agent_project_skills WHERE owner_subject=%s', (owner,)).fetchone()[0] == 0
            assert observer.execute('SELECT count(*) FROM public.panda_agent_lightweight_turns WHERE owner_subject=%s', (owner,)).fetchone()[0] == 0
            observer.commit()
        finally:
            for conn in (observer, left, right):
                conn.close()
    return {**proof, 'disposableChats': len(threads), 'cleanupVerified': True, 'simulatedSqlActors': True, 'realClerk': False, 'realSourceWithdrawal': False, 'sourceRowsChanged': 0, 'providerCalls': 0, 'memoryVersionFixtureOnly': True}
