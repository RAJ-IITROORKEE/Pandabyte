"""Applied-schema, real two-connection races with coordinated disposable fixtures.

The caller supplies a verified TLS connection factory and signer, and explicitly
reserves the otherwise-empty dedicated vendor catalog. This checker commits only
marked SQL fixtures and removes them in finally. It never loads credentials,
changes migrations or calls Clerk/providers. SQL identities are simulated.
"""
import hashlib
import hmac
import json
import time
import uuid
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

CATALOG = 'espressif-esp-idf-5.5.1-esp32-gpio'
CODE = '#include "driver/gpio.h"'
INPUT = {'errorText': 'fatal error: driver/gpio.h: No such file or directory',
         'chip': 'esp32', 'framework': 'esp-idf', 'frameworkVersion': '5.5.1'}


def check(connect, key, *, fixture_window_reserved=False, apply_followup=False):
    if fixture_window_reserved is not True or not isinstance(key, bytes) or len(key) != 32:
        raise ValueError('Explicit reserved fixture window and signer required')
    import psycopg
    control, worker = connect(), connect()
    owner = 'diagnostic-race-fixture-' + str(uuid.uuid4())
    passed, active, failure = [], 'preflight', None
    observations = {}
    baseline = None
    fixture_started = False
    followup_applied = False
    function_baseline = None
    version_id = None
    cleanup = {'complete': False}
    root = Path(__file__).resolve().parents[1] / 'migrations'
    hashes = {name: hashlib.sha256((root / name).read_bytes()).hexdigest() for name in (
        '20261105090004_panda-agent-diagnostics.sql',
        '20261105090005_panda-agent-vendor-catalog.sql',
        '20261105090006_panda-agent-documentation-bounds.sql')}
    followup_name = '20261105090007_panda-agent-diagnostic-admission-expiry.sql'
    if apply_followup:
        hashes[followup_name] = hashlib.sha256((root / followup_name).read_bytes()).hexdigest()
        assert hashes[followup_name] == 'dfdf13fcf960fe8a315f9ccc69953ec7e4821adaaacbecaf18b7b7a036063123'

    def value(conn, query, args=()):
        return conn.execute(query, args).fetchone()[0]

    def begin(conn, actor=True):
        conn.execute('BEGIN')
        conn.execute("SET LOCAL lock_timeout='12s'; SET LOCAL statement_timeout='18s'; SET LOCAL idle_in_transaction_session_timeout='30s'")
        if actor:
            conn.execute('SET LOCAL ROLE authenticated')
            value(conn, "SELECT set_config('request.jwt.claims',%s,true)",
                  (json.dumps({'sub': owner, 'role': 'authenticated'}),))

    def signed(conn, action, fields, exp=None):
        payload = json.dumps({'v': 1, 'action': action, 'subject': owner,
                              'exp': int(time.time()) + 60 if exp is None else exp,
                              **fields}, separators=(',', ':'))
        mac = hmac.new(key, ('panda-diagnostic-db-v1\n' + payload).encode(), hashlib.sha256).hexdigest()
        name = 'panda_agent_vendor_capture' if action == 'capture' else 'panda_agent_diagnostic_' + action
        return value(conn, 'SELECT public.' + name + '(%s,%s)', (payload, mac))

    def fingerprint(conn):
        result = {}
        for table in ('panda_agent_sources', 'panda_agent_versions', 'panda_agent_chunks',
                      'staff_role_memberships', 'panda_agent_chats'):
            result[table] = conn.execute(
                "SELECT count(*),md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' ORDER BY md5(to_jsonb(t)::text)),'')) FROM public."
                + table + ' t').fetchone()
        return result

    def doc(conn):
        return next(d for d in value(conn, 'SELECT public.panda_agent_documentation_read()')['documents']
                    if d['catalogId'] == CATALOG)

    def change(conn, action):
        return value(conn, 'SELECT public.panda_agent_vendor_change(%s)', (json.dumps({
            'versionId': version_id, 'expectedVersion': doc(conn)['version'],
            'action': action, 'rights': 'permitted' if action == 'approve' else 'denied',
            'rightsEvidence': 'Synthetic committed SQL race fixture; not real source approval',
            'reason': owner}),))

    def new_turn():
        begin(control)
        tid = value(control, "SELECT public.panda_agent_chat_create('Disposable diagnostic race')")['thread']['id']
        fields = {'thread': tid, 'request': str(uuid.uuid4()), 'diagnostic': INPUT}
        signed(control, 'begin', fields)
        snapshot = value(control, "SELECT public.panda_agent_vendor_scope('esp32','5.5.1')")
        control.execute('COMMIT')
        return fields, snapshot

    def complete_fields(fields, snapshot):
        return {'thread': fields['thread'], 'request': fields['request'],
                'answer': {'outcome': 'evidence', 'text': 'Reviewed include: ' + CODE + ' [S1]',
                           'citations': [{'kind': 'vendor', 'vendor': 'espressif', 'chip': 'esp32',
                               'framework': 'esp-idf', 'frameworkVersion': '5.5.1', 'id': 'S1',
                               'title': snapshot['title'], 'sourceUrl': snapshot['sourceUrl'],
                               'capturedAt': snapshot['capturedAt'], 'quote': CODE,
                               'sectionPath': ['API Reference - Normal GPIO', 'Header File']}]},
                'scopeHash': snapshot['scopeHash'], 'bindings': [{'sourceId': snapshot['sourceId'],
                    'versionId': snapshot['versionId'], 'contentHash': snapshot['contentHash']}]}

    def response(result, request):
        return next(t['response'] for t in result['turns'] if t['requestId'] == request)

    def call_worker(fn):
        begin(worker)
        try:
            result = fn()
            worker.execute('COMMIT')
            return {'ok': True, 'result': result}
        except psycopg.Error as error:
            worker.execute('ROLLBACK')
            return {'ok': False, 'sqlstate': error.sqlstate}
        except BaseException:
            worker.execute('ROLLBACK')
            raise

    def wait_blocked(future):
        until = time.monotonic() + 5
        while time.monotonic() < until:
            if value(control, 'SELECT EXISTS(SELECT 1 FROM pg_locks WHERE pid=%s AND NOT granted)',
                     (worker.info.backend_pid,)):
                observations.setdefault(active, {})['actualLockWaitObserved'] = True
                return
            if future.done():
                raise AssertionError('Contender completed before observed lock barrier')
            time.sleep(.025)
        raise AssertionError('No actual PostgreSQL lock wait observed')

    def wait_clock_after(timestamp):
        until = time.monotonic() + 12
        while float(value(control, 'SELECT extract(epoch FROM clock_timestamp())')) <= timestamp + .1:
            if time.monotonic() > until:
                raise AssertionError('Clock wait exceeded bounded fixture budget')
            time.sleep(.025)

    try:
        for conn in (control, worker):
            if not conn.autocommit or int(conn.info.transaction_status) != 0:
                raise ValueError('Idle autocommit connections required')
        assert control.info.backend_pid != worker.info.backend_pid
        baseline = control.execute('SELECT current_version,version FROM public.panda_agent_vendor_documents WHERE id=%s', (CATALOG,)).fetchone()
        assert baseline and baseline[0] is None
        assert value(control, 'SELECT count(*) FROM public.panda_agent_vendor_versions') == 0
        assert value(control, 'SELECT count(*) FROM public.panda_agent_diagnostic_turns') == 0
        assert value(control, "SELECT enabled FROM public.panda_agent_tools WHERE id='search_vendor_docs'") is False
        before = fingerprint(control)
        function_baseline = control.execute("SELECT pg_get_functiondef(oid),proacl::text,proowner FROM pg_proc WHERE oid='public.panda_agent_diagnostic_begin(text,text)'::regprocedure").fetchone()
        if apply_followup:
            begin(control, False)
            control.execute((root / followup_name).read_text(encoding='utf8'))
            control.execute('COMMIT')
            followup_applied = True
        begin(control, False)
        control.execute("INSERT INTO public.staff_role_memberships(user_id,role,assigned_by) VALUES(%s,'ADMIN',%s)", (owner, owner))
        control.execute('COMMIT')
        fixture_started = True
        begin(control)
        signed(control, 'capture', {'catalogId': CATALOG,
            'contentHash': hashlib.sha256(owner.encode()).hexdigest(), 'fragments': [CODE],
            'fetchedAt': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
            'rightsEvidence': 'Synthetic committed SQL race fixture; no real vendor bytes',
            'attribution': owner})
        version_id = doc(control)['versions'][0]['id']
        change(control, 'approve')
        control.execute('COMMIT')
        with ThreadPoolExecutor(max_workers=1) as pool:
            active = 'withdrawal_wins_selection_to_save'
            fields, snapshot = new_turn()
            begin(control)
            change(control, 'withdraw')
            future = pool.submit(call_worker, lambda: signed(worker, 'complete', complete_fields(fields, snapshot)))
            wait_blocked(future)
            control.execute('COMMIT')
            result = future.result(timeout=18)
            assert result['ok']
            answer = response(result['result'], fields['request'])
            assert answer['citations'] == [] and CODE not in answer['text']
            assert value(control, "SELECT status='complete' FROM public.panda_agent_chat_turns WHERE thread_id=%s AND request_id=%s", (fields['thread'], fields['request']))
            passed.append(active)

            active = 'save_wins_then_withdrawal_redacts_history'
            begin(control);change(control, 'approve');control.execute('COMMIT')
            fields, snapshot = new_turn()
            begin(control)
            saved = signed(control, 'complete', complete_fields(fields, snapshot))
            assert response(saved, fields['request'])['citations'][0]['quote'] == CODE
            future = pool.submit(call_worker, lambda: change(worker, 'withdraw'))
            wait_blocked(future)
            control.execute('COMMIT')
            assert future.result(timeout=18)['ok']
            begin(control)
            saved = value(control, 'SELECT public.panda_agent_lightweight_read(%s)', (fields['thread'],))
            answer = response(saved, fields['request'])
            assert answer['citations'] == [] and CODE not in answer['text']
            control.execute('COMMIT')
            passed.append(active)

            active = 'screenshot_expires_during_admission_lock_wait'
            begin(control)
            tid = value(control, "SELECT public.panda_agent_chat_create('Disposable screenshot expiry race')")['thread']['id']
            asset = str(uuid.uuid4())
            signed(control, 'assetreserve', {'thread': tid, 'asset': asset, 'sha256': 'a'*64,
                'inputSha256': 'b'*64, 'bytes': 100, 'width': 1, 'height': 1})
            signed(control, 'assetrecord', {'thread': tid, 'asset': asset, 'state': 'ready'})
            control.execute('RESET ROLE')
            expiry = value(control, "UPDATE public.panda_agent_diagnostic_assets SET expires_at=clock_timestamp()+interval '8 seconds' WHERE id=%s RETURNING extract(epoch FROM expires_at)", (asset,))
            control.execute('COMMIT')
            begin(control, False)
            control.execute('SELECT id FROM public.panda_agent_diagnostic_assets WHERE id=%s FOR UPDATE', (asset,))
            request = str(uuid.uuid4())
            future = pool.submit(call_worker, lambda: signed(worker, 'begin', {'thread': tid,
                'request': request, 'diagnostic': {**INPUT, 'screenshotId': asset}}))
            wait_blocked(future);wait_clock_after(float(expiry));control.execute('COMMIT')
            result = future.result(timeout=18)
            observations.setdefault(active, {}).update({'requestSucceeded': result['ok'],
                'sqlstate': result.get('sqlstate'), 'admittedDiagnosticRows': value(control,
                    'SELECT count(*) FROM public.panda_agent_diagnostic_turns WHERE thread_id=%s AND request_id=%s', (tid, request))})
            assert not result['ok'] and result['sqlstate'] == 'P0001'
            assert value(control, 'SELECT count(*) FROM public.panda_agent_diagnostic_turns WHERE thread_id=%s AND request_id=%s', (tid, request)) == 0
            passed.append(active)

            active = 'capability_expires_during_asset_record_lock_wait'
            begin(control, False)
            control.execute('SELECT id FROM public.panda_agent_diagnostic_assets WHERE id=%s FOR UPDATE', (asset,))
            expiry = int(time.time()) + 8
            future = pool.submit(call_worker, lambda: signed(worker, 'assetrecord',
                {'thread': tid, 'asset': asset, 'state': 'unknown'}, exp=expiry))
            wait_blocked(future);wait_clock_after(expiry);control.execute('COMMIT')
            result = future.result(timeout=18)
            observations.setdefault(active, {}).update({'requestSucceeded': result['ok'], 'sqlstate': result.get('sqlstate')})
            assert not result['ok'] and result['sqlstate'] == 'P0001'
            assert value(control, 'SELECT status FROM public.panda_agent_diagnostic_assets WHERE id=%s', (asset,)) == 'ready'
            passed.append(active)
    except Exception as error:
        failure = {'check': active, 'class': type(error).__name__}
    finally:
        for conn in (control, worker):
            if not conn.closed:
                conn.execute('ROLLBACK')
        if fixture_started:
            begin(control, False)
            remaining = control.execute('SELECT id,created_by FROM public.panda_agent_vendor_versions WHERE document_id=%s', (CATALOG,)).fetchall()
            assert all(row[1] == owner for row in remaining), 'Refusing cleanup of another actor source'
            control.execute('UPDATE public.panda_agent_vendor_documents SET current_version=NULL WHERE id=%s', (CATALOG,))
            control.execute('DELETE FROM public.panda_agent_document_events WHERE actor=%s', (owner,))
            control.execute('DELETE FROM public.panda_agent_vendor_versions WHERE created_by=%s', (owner,))
            control.execute('UPDATE public.panda_agent_vendor_documents SET current_version=%s,version=%s WHERE id=%s', (*baseline, CATALOG))
            control.execute('DELETE FROM public.panda_agent_chats WHERE owner_subject=%s', (owner,))
            control.execute('DELETE FROM public.staff_role_memberships WHERE user_id=%s', (owner,))
            control.execute('COMMIT')
            cleanup = {'complete': True, 'fixtureChats': value(control, 'SELECT count(*) FROM public.panda_agent_chats WHERE owner_subject=%s', (owner,)),
                'fixtureRoles': value(control, 'SELECT count(*) FROM public.staff_role_memberships WHERE user_id=%s', (owner,)),
                'vendorVersions': value(control, 'SELECT count(*) FROM public.panda_agent_vendor_versions'),
                'catalogBaselineRestored': control.execute('SELECT current_version,version FROM public.panda_agent_vendor_documents WHERE id=%s', (CATALOG,)).fetchone() == baseline,
                'canonicalAndOwnerFingerprintUnchanged': fingerprint(control) == before}
            assert all(cleanup[k] for k in ('complete', 'catalogBaselineRestored', 'canonicalAndOwnerFingerprintUnchanged'))
            assert cleanup['fixtureChats'] == cleanup['fixtureRoles'] == cleanup['vendorVersions'] == 0
        if followup_applied:
            control.execute(function_baseline[0])
            restored = control.execute("SELECT pg_get_functiondef(oid),proacl::text,proowner FROM pg_proc WHERE oid='public.panda_agent_diagnostic_begin(text,text)'::regprocedure").fetchone()
            cleanup['priorFunctionDefinitionAclOwnerRestored'] = restored == function_baseline
            assert cleanup['priorFunctionDefinitionAclOwnerRestored']
        for conn in (control, worker):
            conn.close()
    return {'passed': passed, 'failed': failure, 'observations': observations, 'cleanup': cleanup, 'migrationSha256': hashes,
            'candidate07CommittedOnlyForTestThenRestored': followup_applied,
            'method': 'Real two-connection PostgreSQL lock waits; coordinated committed synthetic SQL fixtures with exact cleanup',
            'realClerk': False, 'actualVendorCapture': False, 'canonicalSourceChanges': 0, 'providerCalls': 0}


if __name__ == '__main__':
    raise SystemExit('Import check(connect, key, fixture_window_reserved=True) through a verified local operator wrapper; no automatic credential loading')
