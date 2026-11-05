"""Rollback-only diagnostic authority checks; SQL actors are not genuine Clerk users.

The operator supplies an already verified development connection and signer bytes.
This module never loads credentials, opens a connection, calls providers or commits.
"""
import hashlib
import hmac
import json
import sys
import time
import uuid
from pathlib import Path

MIGRATIONS = (
    '20261105090004_panda-agent-diagnostics.sql',
    '20261105090005_panda-agent-vendor-catalog.sql',
)
MIGRATION_ROOT = Path(__file__).resolve().parents[1] / 'migrations'


def migration_sources():
    return [(name, (MIGRATION_ROOT / name).read_bytes())
            for name in MIGRATIONS]


def check(conn, key):
    import psycopg
    sources = migration_sources()
    if not isinstance(key, bytes) or len(key) != 32 or not conn.autocommit:
        raise ValueError('Explicit signer bytes and idle autocommit connection required')
    if int(conn.info.transaction_status) != 0:
        raise ValueError('Refusing to roll back an existing operator transaction')
    owner = 'diagnostic-fixture-' + str(uuid.uuid4())
    other = owner + '-other'
    catalog = 'espressif-esp-idf-5.5.1-esp32-gpio'
    code = '#include "driver/gpio.h"'
    content_hash = hashlib.sha256(b'explicit synthetic rollback vendor bytes').hexdigest()
    passed = []
    active = 'setup'
    original_functions = [
        'panda_agent_diagnostic_begin(text,text)',
        'panda_agent_diagnostic_complete(text,text)',
        'panda_agent_vendor_scope(text,text)',
    ]

    def sql(query, params=()):
        return conn.execute(query, params).fetchone()[0]

    def operator():
        conn.execute('RESET ROLE')

    def actor(subject=owner):
        conn.execute('SET LOCAL ROLE authenticated')
        conn.execute("SELECT set_config('request.jwt.claims',%s,true)",
                     (json.dumps({'sub': subject, 'role': 'authenticated'}),))

    def denied(fn):
        conn.execute('SAVEPOINT expected_denial')
        try:
            fn()
        except psycopg.Error as error:
            if error.sqlstate not in ('P0001', '42501'):
                raise AssertionError('Unexpected SQL failure class') from None
            conn.execute('ROLLBACK TO SAVEPOINT expected_denial')
        else:
            raise AssertionError('Expected authority denial was allowed')
        finally:
            conn.execute('RELEASE SAVEPOINT expected_denial')

    def run(name, fn):
        nonlocal active
        active = name
        fn()
        passed.append(name)

    def signed(action, fields, domain='diagnostic', subject=owner, bad=False, exp=None):
        payload = json.dumps({'v': 1, 'action': action, 'subject': subject,
                              'exp': int(time.time()) + 60 if exp is None else exp,
                              **fields}, separators=(',', ':'))
        mac = hmac.new(key, ('panda-' + domain + '-db-v1\n' + payload).encode(),
                       hashlib.sha256).hexdigest()
        function = 'panda_agent_vendor_capture' if action == 'capture' else 'panda_agent_' + domain + '_' + action
        return sql('SELECT public.' + function + '(%s,%s)',
                   (payload, '0' * 64 if bad else mac))

    def fingerprint():
        operator()
        result = {}
        for table in ('panda_agent_sources', 'panda_agent_versions', 'panda_agent_chunks'):
            result[table] = conn.execute(
                'SELECT count(*),md5(coalesce(string_agg(md5(to_jsonb(t)::text),\'\' ORDER BY md5(to_jsonb(t)::text)),\'\')) FROM public.' + table + ' t'
            ).fetchone()
        return result

    conn.execute('BEGIN')
    try:
        conn.execute("SET LOCAL lock_timeout='3s';SET LOCAL statement_timeout='20s';SET LOCAL idle_in_transaction_session_timeout='90s'")
        before = fingerprint()
        for function in original_functions:
            assert sql('SELECT to_regprocedure(%s) IS NULL', ('public.' + function,))
        for name, raw in sources:
            active = 'setup:' + name
            conn.execute(raw.decode('utf8'))
        active = 'setup:fixture_threads'
        inp = {'errorText': 'fatal error: driver/gpio.h: No such file or directory',
               'chip': 'esp32', 'framework': 'esp-idf', 'frameworkVersion': '5.5.1'}
        actor()
        tid = sql("SELECT public.panda_agent_chat_create('Disposable diagnostic SQL check')")['thread']['id']
        actor(other)
        foreign_tid = sql("SELECT public.panda_agent_chat_create('Disposable foreign diagnostic SQL check')")['thread']['id']
        actor()

        def capture():
            return signed('capture', {'catalogId': catalog, 'contentHash': content_hash,
                'fragments': [code], 'fetchedAt': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
                'rightsEvidence': 'Synthetic rollback fixture; no real vendor capture or source approval',
                'attribution': 'Explicit fixture using the reviewed include-code excerpt; no generated prose'})

        def document():
            return next(d for d in sql('SELECT public.panda_agent_documentation_read()')['documents'] if d['catalogId'] == catalog)

        def change(action, version_id, **overrides):
            data = {'versionId': version_id, 'expectedVersion': document()['version'],
                    'action': action, 'rights': 'permitted' if action == 'approve' else 'denied',
                    'rightsEvidence': 'Rollback-only synthetic rights statement', 'reason': 'Disposable diagnostic check', **overrides}
            return sql('SELECT public.panda_agent_vendor_change(%s)', (json.dumps(data),))

        def tool(enabled, **overrides):
            state = sql('SELECT public.panda_agent_tool_state()')
            value = {'toolId': 'search_vendor_docs', 'expectedVersion': state['version'],
                     'enabled': enabled, 'reason': 'Disposable tool check', **overrides}
            return sql('SELECT public.panda_agent_tool_change(%s)', (json.dumps(value),))

        def reserve(asset=None, thread=tid, subject=owner, **overrides):
            value = {'thread': thread, 'asset': asset or str(uuid.uuid4()),
                     'sha256': 'a' * 64, 'inputSha256': 'b' * 64,
                     'bytes': 100, 'width': 1, 'height': 1, **overrides}
            return value, signed('assetreserve', value, subject=subject)

        def record(fields, state, subject=owner):
            return signed('assetrecord', {'thread': fields['thread'], 'asset': fields['asset'], 'state': state}, subject=subject)

        def begin(data=None, thread=tid, request=None, subject=owner):
            fields = {'thread': thread, 'request': request or str(uuid.uuid4()), 'diagnostic': data or inp}
            return fields, signed('begin', fields, subject=subject)

        def scope(chip='esp32', version='5.5.1'):
            return sql('SELECT public.panda_agent_vendor_scope(%s,%s)', (chip, version))

        def answer(snapshot, **citation_overrides):
            citation = {'kind': 'vendor', 'vendor': 'espressif', 'chip': 'esp32', 'framework': 'esp-idf',
                'frameworkVersion': '5.5.1', 'id': 'S1', 'title': snapshot['title'], 'sourceUrl': snapshot['sourceUrl'],
                'capturedAt': snapshot['capturedAt'], 'quote': code,
                'sectionPath': ['API Reference - Normal GPIO', 'Header File'], **citation_overrides}
            return {'outcome': 'evidence', 'text': 'The reviewed documentation shows this include: ' + code + ' [S1]', 'citations': [citation]}

        def complete(fields, snapshot=None, result=None, bindings=None, scope_hash=None):
            snapshot = snapshot or scope()
            value = result or answer(snapshot)
            return signed('complete', {'thread': fields['thread'], 'request': fields['request'], 'answer': value,
                'scopeHash': snapshot['scopeHash'] if scope_hash is None else scope_hash,
                'bindings': [{'sourceId': snapshot['sourceId'], 'versionId': snapshot['versionId'], 'contentHash': snapshot['contentHash']}] if bindings is None else bindings})

        def response(read, request):
            return next(t['response'] for t in read['turns'] if t['requestId'] == request)

        def terminal(read, request):
            turn = next(t for t in read['turns'] if t['requestId'] == request)
            assert turn['status'] == 'complete' and turn['response']['citations'] == []
            assert code not in turn['response']['text']

        def nonadmin():
            denied(lambda: sql('SELECT public.panda_agent_documentation_read()'))
            denied(capture)
            denied(lambda: sql('SELECT public.panda_agent_vendor_change(%s)', (json.dumps({'versionId': str(uuid.uuid4()), 'expectedVersion': 0, 'action': 'approve', 'rights': 'permitted', 'rightsEvidence': 'fixture', 'reason': 'fixture'}),)))
            denied(lambda: sql('SELECT public.panda_agent_tool_change(%s)', (json.dumps({'toolId': 'search_vendor_docs', 'expectedVersion': 0, 'enabled': True, 'reason': 'fixture'}),)))
        run('nonadmin_management_surfaces_denied', nonadmin)

        def private_surfaces():
            for table in ('panda_agent_vendor_documents', 'panda_agent_vendor_versions', 'panda_agent_document_events', 'panda_agent_tools', 'panda_agent_tool_events', 'panda_agent_diagnostic_assets', 'panda_agent_diagnostic_turns'):
                denied(lambda table=table: conn.execute('SELECT * FROM public.' + table))
            for function in ('panda_agent_diagnostic_verify(text,text,text)', 'panda_agent_diagnostic_answer_current(jsonb,jsonb,text,jsonb)', 'panda_agent_lightweight_read_before_diagnostics(uuid)', 'panda_agent_lightweight_begin_before_diagnostics(text,text)', 'panda_agent_lightweight_prepare_before_diagnostics(text,text)', 'panda_agent_lightweight_complete_before_diagnostics(text,text)'):
                assert not sql("SELECT has_function_privilege('authenticated',%s,'EXECUTE')", ('public.' + function,))
        run('private_metadata_verifiers_and_raw_helpers', private_surfaces)
        def strict():
            denied(lambda: signed('begin', {'thread': tid, 'request': str(uuid.uuid4()), 'diagnostic': inp}, bad=True))
            denied(lambda: signed('begin', {'thread': tid, 'request': str(uuid.uuid4()), 'diagnostic': {**inp, 'extra': True}}))
            denied(lambda: signed('begin', {'thread': tid, 'request': str(uuid.uuid4()), 'diagnostic': {**inp, 'frameworkVersion': '5.4.0'}}))
        run('strict_signed_input_and_bad_mac', strict)

        asset, leased = reserve()
        def lease():
            assert leased['created'] and leased['status'] == 'reserved'
            assert 895 <= leased['expiresAt'] - int(time.time()) <= 900
            assert reserve(asset['asset'])[1]['created'] is False
            denied(lambda: reserve(asset['asset'], sha256='c' * 64))
        run('asset_fixed_lease_and_immutable_replay', lease)
        def no_revive():
            record(asset, 'expired');record(asset, 'unknown')
            denied(lambda: record(asset, 'ready'))
            assert sql('SELECT public.panda_agent_diagnostic_asset_read(%s,%s)', (tid, asset['asset']))['status'] == 'expired'
        run('expired_asset_cannot_revive', no_revive)
        deleted_asset, _ = reserve()
        def no_delete_revive():
            record(deleted_asset, 'deleted');record(deleted_asset, 'unknown')
            denied(lambda: record(deleted_asset, 'ready'))
        run('deleted_asset_cannot_revive', no_delete_revive)
        def asset_isolation():
            actor(other)
            denied(lambda: sql('SELECT public.panda_agent_diagnostic_asset_read(%s,%s)', (tid, deleted_asset['asset'])))
            denied(lambda: record(deleted_asset, 'deleted', other))
            actor()
            denied(lambda: reserve(deleted_asset['asset'], thread=sql("SELECT public.panda_agent_chat_create('Disposable wrong asset thread')")['thread']['id']))
        run('asset_foreign_owner_and_thread_fenced', asset_isolation)
        screenshot, _ = reserve();record(screenshot, 'ready')
        def screenshot_reference():
            fields, _ = begin({**inp, 'screenshotId': screenshot['asset']})
            signed('cancel', {'thread': tid, 'request': fields['request'], 'digest': None}, 'lightweight')
            actor(other)
            denied(lambda: begin({**inp, 'screenshotId': screenshot['asset']}, foreign_tid, subject=other))
            operator();conn.execute('UPDATE public.panda_agent_diagnostic_assets SET expires_at=clock_timestamp()-interval \'1 second\' WHERE id=%s', (screenshot['asset'],));actor()
            denied(lambda: begin({**inp, 'screenshotId': screenshot['asset']}))
        run('diagnostic_requires_owned_live_screenshot', screenshot_reference)

        operator();conn.execute("INSERT INTO public.staff_role_memberships(user_id,role,assigned_by) VALUES(%s,'ADMIN',%s)", (owner, owner));actor()
        capture()
        run('captured_pending_vendor_not_eligible', lambda: (_ for _ in ()).throw(AssertionError('Pending source became eligible')) if scope() is not None else None)
        version_id = document()['versions'][0]['id']
        def admin_guards():
            denied(lambda: change('approve', version_id, expectedVersion=-1))
            denied(lambda: change('approve', version_id, rights='denied'))
            denied(lambda: change('approve', version_id, rightsEvidence=True))
            denied(lambda: change('approve', version_id, reason=5))
            denied(lambda: tool(True, reason=False))
        run('admin_epoch_rights_and_json_types', admin_guards)
        change('approve', version_id)
        original_scope = scope()
        def exact_scope():
            assert set(original_scope) == {'sourceId','versionId','contentHash','scopeHash','approved','rights','current','chip','framework','frameworkVersion','fragments','sourceUrl','title','capturedAt'}
            assert original_scope['sourceId'] == catalog and original_scope['contentHash'] == content_hash
            assert original_scope['approved'] is True and original_scope['current'] is True and original_scope['rights'] == 'permitted'
        run('approved_vendor_snapshot_exact_fourteen_fields', exact_scope)
        run('wrong_chip_and_version_have_no_scope', lambda: None if scope('esp32c3') is None and scope(version='5.4.0') is None else (_ for _ in ()).throw(AssertionError('Wrong scope eligible')))
        first, started = begin()
        def replay():
            assert started['admitted'] and signed('begin', first)['admitted'] is False
        run('same_diagnostic_identity_admitted_once', replay)
        run('changed_diagnostic_input_conflicts', lambda: denied(lambda: signed('begin', {**first, 'diagnostic': {**inp, 'errorText': 'different'}})))
        def foreign():
            actor(other)
            denied(lambda: begin(thread=tid, subject=other))
            denied(lambda: sql('SELECT public.panda_agent_lightweight_read(%s)', (tid,)))
            denied(lambda: sql('SELECT public.panda_agent_diagnostic_execution(%s,%s)', (tid, first['request'])))
            actor()
        run('foreign_diagnostic_begin_read_execution_denied', foreign)
        qa_product = next(p for p in sql('SELECT public.panda_agent_runtime_products()')['items'] if p['sku'] == 'ESPX8266')
        qa_scope = sql('SELECT public.panda_agent_lightweight_scope(%s)', (qa_product['id'],))
        empty = {'outcome': 'insufficient', 'text': 'No fixture evidence.', 'citations': []}
        def qa_crosskind():
            denied(lambda: signed('begin', {'thread': tid, 'request': first['request'], 'question': 'Fixture'}, 'lightweight'))
            denied(lambda: signed('prepare', {'thread': tid, 'request': first['request'], 'question': 'Fixture', 'product': qa_product['id'], 'sku': qa_scope['sku'], 'scopeHash': qa_scope['scopeHash'], 'digest': 'd' * 64}, 'lightweight'))
            denied(lambda: signed('complete', {'thread': tid, 'request': first['request'], 'answer': empty}, 'lightweight'))
        run('generic_qa_cannot_operate_diagnostic_identity', qa_crosskind)
        guide = {'goal': 'Fixture goal', 'board': 'x8266', 'components': [], 'expectedVersion': 0}
        def guide_crosskind():
            denied(lambda: signed('begin', {'thread': tid, 'request': first['request'], 'guide': guide}, 'guide'))
            denied(lambda: signed('complete', {'thread': tid, 'request': first['request'], 'answer': empty, 'success': False}, 'guide'))
        run('guide_cannot_operate_diagnostic_identity', guide_crosskind)
        def diagnostic_crosskind():
            for kind in ('lightweight', 'guide'):
                thread = sql("SELECT public.panda_agent_chat_create('Disposable crosskind check')")['thread']['id'];request = str(uuid.uuid4())
                value = {'thread': thread, 'request': request, **({'question': 'Fixture'} if kind == 'lightweight' else {'guide': guide})}
                signed('begin', value, kind)
                denied(lambda thread=thread, request=request: begin(thread=thread, request=request))
                denied(lambda thread=thread, request=request: signed('complete', {'thread': thread, 'request': request, 'answer': empty, 'scopeHash': None, 'bindings': []}))
                signed('cancel', {'thread': thread, 'request': request, 'digest': None}, 'lightweight')
        run('diagnostic_cannot_reinterpret_qa_or_guide', diagnostic_crosskind)
        saved = complete(first)
        def protected():
            assert response(saved, first['request'])['citations'][0]['quote'] == code
            operator()
            assert sql('SELECT m.approved_response_hash=encode(sha256(convert_to(t.response::text,\'UTF8\')),\'hex\') FROM public.panda_agent_lightweight_turns m JOIN public.panda_agent_chat_turns t USING(thread_id,request_id) WHERE m.thread_id=%s AND m.request_id=%s', (tid, first['request'])) is True
            actor()
        run('current_vendor_quote_saved_with_protected_hash', protected)
        def complete_replay():
            assert response(complete(first, result=empty, bindings=[]), first['request']) == response(saved, first['request'])
            operator();assert sql('SELECT count(*) FROM public.panda_agent_chat_turns WHERE thread_id=%s AND request_id=%s', (tid, first['request'])) == 1;actor()
        run('completed_replay_does_not_save_twice', complete_replay)
        def quote_tamper():
            fields, _ = begin();terminal(complete(fields, result=answer(scope(), quote='forged fixture quote')), fields['request'])
        run('literal_quote_tamper_fixed_terminal', quote_tamper)
        def binding_tamper():
            for args in ({'scope_hash': '0' * 64}, {'bindings': [{'sourceId': catalog, 'versionId': str(uuid.uuid4()), 'contentHash': content_hash}]}):
                fields, _ = begin();terminal(complete(fields, **args), fields['request'])
        run('scope_or_binding_tamper_fixed_terminal', binding_tamper)
        def shape_tamper():
            for extra in ({'chip': 'esp32c3'}, {'frameworkVersion': '5.4.0'}, {'sectionPath': 'Header File'}, {'id': 'vendor-1'}):
                fields, _ = begin();terminal(complete(fields, result=answer(scope(), **extra)), fields['request'])
            fields, _ = begin({**inp, 'chip': 'esp32c3'});terminal(complete(fields), fields['request'])
        run('citation_and_input_scope_tamper_fixed_terminal', shape_tamper)
        buffered, _ = begin();change('withdraw', version_id)
        run('withdrawal_removes_vendor_context', lambda: None if scope() is None else (_ for _ in ()).throw(AssertionError('Withdrawn source eligible')))
        def withheld():
            for read in (sql('SELECT public.panda_agent_lightweight_read(%s)', (tid,)), signed('begin', first)):
                terminal(read, first['request'])
            operator();assert sql('SELECT response->\'citations\'->0->>\'quote\' FROM public.panda_agent_chat_turns WHERE thread_id=%s AND request_id=%s', (tid, first['request'])) == code;actor()
        run('withdrawal_masks_history_replay_retains_original', withheld)
        change('approve', version_id);fresh_scope = scope()
        run('reapproval_advances_scope_epoch', lambda: None if fresh_scope['scopeHash'] != original_scope['scopeHash'] else (_ for _ in ()).throw(AssertionError('Old epoch revived')))
        run('buffered_old_epoch_fixed_terminal_no_stranding', lambda: terminal(complete(buffered, original_scope), buffered['request']))
        def qa_epoch():
            fields, _ = begin();operator();conn.execute('UPDATE public.panda_agent_diagnostic_turns SET qa_skill_epoch=qa_skill_epoch+1 WHERE thread_id=%s AND request_id=%s', (tid, fields['request']));actor();terminal(complete(fields), fields['request'])
        run('fixture_recorded_qa_epoch_mismatch_fixed_terminal', qa_epoch)
        tool_fields, _ = begin()
        run('disabled_tool_cannot_claim', lambda: denied(lambda: signed('toolclaim', {'thread': tid, 'request': tool_fields['request'], 'toolVersion': sql('SELECT public.panda_agent_tool_state()')['version']})))
        def tool_once():
            tool(True);epoch = sql('SELECT public.panda_agent_tool_state()')['version'];args = {'thread': tid, 'request': tool_fields['request'], 'toolVersion': epoch}
            assert signed('toolclaim', args)['execute'] is True and signed('toolclaim', args)['execute'] is False
            tool(False);denied(lambda: signed('toolrecord', {**args, 'result': {'state': 'unavailable'}}));terminal(complete(tool_fields), tool_fields['request'])
        run('tool_claim_once_and_disable_fences_completion', tool_once)
        def cancelled():
            fields, _ = begin();read = signed('cancel', {'thread': tid, 'request': fields['request'], 'digest': None}, 'lightweight');terminal(read, fields['request']);terminal(complete(fields), fields['request'])
        run('generic_cancel_protected_and_late_complete_safe', cancelled)

        def expiry_fault():
            conn.execute('SAVEPOINT expiry_fault')
            try:
                operator()
                definition = sql("SELECT pg_get_functiondef('public.panda_agent_diagnostic_verify(text,text,text)'::regprocedure)")
                assert definition.count('RETURN v;') == 1
                injection = "IF p_action IN ('complete','assetreserve') THEN v:=jsonb_set(v,'{exp}',to_jsonb(floor(extract(epoch FROM clock_timestamp()))::bigint-1));END IF;RETURN v;"
                conn.execute(definition.replace('RETURN v;', injection, 1))
                actor()
                denied(lambda: complete(first))
                denied(lambda: reserve(asset['asset']))
            finally:
                conn.execute('ROLLBACK TO SAVEPOINT expiry_fault');conn.execute('RELEASE SAVEPOINT expiry_fault');actor()
        run('post_verification_expiry_replay_fault_injection', expiry_fault)
        def cascade():
            thread = sql("SELECT public.panda_agent_chat_create('Disposable asset cascade')")['thread']['id'];item, _ = reserve(thread=thread)
            sql('SELECT public.panda_agent_chat_delete(%s)', (thread,));operator();assert sql('SELECT count(*) FROM public.panda_agent_diagnostic_assets WHERE id=%s', (item['asset'],)) == 0;actor()
        run('owned_chat_delete_cascades_only_asset_metadata', cascade)
        def quota():
            actor(other)
            for _ in range(3):reserve(thread=foreign_tid, subject=other)
            denied(lambda: reserve(thread=foreign_tid, subject=other));actor()
        run('owner_asset_admission_budget', quota)
        def unchanged():
            assert fingerprint() == before;actor()
        run('existing_listing_corpus_unchanged', unchanged)
        def source_read_aliases():
            terminal(sql('SELECT public.panda_agent_chat_read(%s)', (tid,)), first['request'])
            terminal(sql('SELECT public.panda_agent_chat_begin(%s,%s,%s)', (tid, first['request'], 'Diagnostic (esp32, esp-idf 5.5.1): ' + inp['errorText'])), first['request'])
        run('retained_public_aliases_do_not_revive_old_epoch', source_read_aliases)
        assert len(passed) == 36
    except Exception as error:
        state = getattr(error, 'sqlstate', None)
        suffix = '; SQLSTATE ' + state if state and len(state) == 5 else ''
        raise AssertionError('Diagnostic rollback check failed: ' + active + ' (completed ' + str(len(passed)) + ' checks' + suffix + '; private details suppressed)') from None
    finally:
        try:
            conn.execute('ROLLBACK')
        except Exception:
            raise RuntimeError('Diagnostic rollback could not be verified') from None
    try:
        for function in original_functions:
            assert sql('SELECT to_regprocedure(%s) IS NULL', ('public.' + function,))
        assert fingerprint() == before
    except Exception:
        raise RuntimeError('Post-rollback verification failed; private details suppressed') from None
    return {'passed': len(passed), 'checks': passed,
            'migrationHashes': {name: hashlib.sha256(raw).hexdigest() for name, raw in sources},
            'rolledBack': True, 'simulatedSqlActors': 2, 'realClerk': False,
            'realSourceWithdrawal': False, 'syntheticVendorContentHash': True,
            'postVerificationExpiryFaultInjection': True, 'actualTwoConnectionLockWait': False,
            'canonicalSourceRowsChanged': 0, 'providerCalls': 0}


def check_followup(conn, key, *, apply_followup=True):
    """Test 90006 over applied 90004/5; all new versions/roles/DDL roll back.

    apply_followup=False is a test-only predecessor RED run, never an app flag.
    """
    import psycopg
    name = '20261105090006_panda-agent-documentation-bounds.sql'
    raw = (MIGRATION_ROOT / name).read_bytes()
    if not isinstance(key, bytes) or len(key) != 32 or not conn.autocommit or int(conn.info.transaction_status) != 0:
        raise ValueError('Explicit signer and idle autocommit connection required')
    owner = 'diagnostic-bounds-fixture-' + str(uuid.uuid4())
    foreign = owner + '-foreign'
    catalog = 'espressif-esp-idf-5.5.1-esp32-gpio'
    passed = []
    active = 'setup'

    def sql(query, params=()):
        return conn.execute(query, params).fetchone()[0]

    def operator():
        conn.execute('RESET ROLE')

    def actor(subject=owner):
        conn.execute('SET LOCAL ROLE authenticated')
        conn.execute("SELECT set_config('request.jwt.claims',%s,true)",
                     (json.dumps({'sub': subject, 'role': 'authenticated'}),))

    def run(label, fn):
        nonlocal active
        active = label
        fn()
        passed.append(label)

    def denied(fn, detail=None):
        conn.execute('SAVEPOINT expected_bounds_denial')
        try:
            fn()
        except psycopg.Error as error:
            assert error.sqlstate in ('P0001', '42501')
            if detail is not None:
                assert error.diag.message_detail == detail
            conn.execute('ROLLBACK TO SAVEPOINT expected_bounds_denial')
        else:
            raise AssertionError('Expected bounds denial was allowed')
        finally:
            conn.execute('RELEASE SAVEPOINT expected_bounds_denial')

    def payload(content_hash, subject=owner):
        text = json.dumps({'v': 1, 'action': 'capture', 'subject': subject,
            'exp': int(time.time()) + 60, 'catalogId': catalog,
            'contentHash': content_hash, 'fragments': ['#include "driver/gpio.h"'],
            'fetchedAt': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
            'rightsEvidence': 'Synthetic rollback bounds fixture, not actual capture',
            'attribution': 'Reviewed include-code fixture only'}, separators=(',', ':'))
        mac = hmac.new(key, ('panda-diagnostic-db-v1\n' + text).encode(), hashlib.sha256).hexdigest()
        return text, mac

    def capture(content_hash, subject=owner):
        return sql('SELECT public.panda_agent_vendor_capture(%s,%s)', payload(content_hash, subject))

    def read():
        return sql('SELECT public.panda_agent_documentation_read()')

    def state_fingerprint():
        operator()
        result = {}
        for table in ('panda_agent_sources', 'panda_agent_versions', 'panda_agent_chunks',
                      'staff_role_memberships', 'panda_agent_vendor_documents',
                      'panda_agent_vendor_versions', 'panda_agent_document_events',
                      'panda_agent_tools', 'panda_agent_tool_events'):
            result[table] = conn.execute('SELECT count(*),md5(coalesce(string_agg(md5(to_jsonb(t)::text),\'\' ORDER BY md5(to_jsonb(t)::text)),\'\')) FROM public.' + table + ' t').fetchone()
        return result

    conn.execute('BEGIN')
    try:
        conn.execute("SET LOCAL lock_timeout='3s';SET LOCAL statement_timeout='20s';SET LOCAL idle_in_transaction_session_timeout='90s'")
        assert sql("SELECT to_regprocedure('public.panda_agent_diagnostic_begin(text,text)') IS NOT NULL")
        assert sql("SELECT to_regprocedure('public.panda_agent_vendor_capture_before_bounds(text,text)') IS NULL")
        assert sql('SELECT count(*) FROM public.panda_agent_vendor_versions WHERE document_id=%s', (catalog,)) == 0, 'Refusing to test over actual vendor versions'
        before = state_fingerprint()
        old_capture = sql("SELECT pg_get_functiondef('public.panda_agent_vendor_capture(text,text)'::regprocedure)")
        old_read = sql("SELECT pg_get_functiondef('public.panda_agent_documentation_read()'::regprocedure)")
        if apply_followup:
            conn.execute(raw.decode('utf8'))
        actor()
        def nonadmin():
            for subject in (owner, foreign):
                actor(subject)
                denied(read, 'forbidden')
                denied(lambda subject=subject: capture('a' * 64, subject), 'forbidden')
            actor()
        run('both_nonadmin_sql_management_denied', nonadmin)
        operator()
        conn.execute("INSERT INTO public.staff_role_memberships(user_id,role,assigned_by) VALUES(%s,'ADMIN',%s)", (owner, owner))
        actor()
        hashes = [hashlib.sha256((owner + ':' + str(i)).encode()).hexdigest() for i in range(21)]
        def twenty():
            for content_hash in hashes[:20]:
                capture(content_hash)
            current = read()
            assert len(current['documents']) == 1 and len(current['documents'][0]['versions']) == 20
            assert {v['contentHash'] for v in current['documents'][0]['versions']} == set(hashes[:20])
        run('twenty_synthetic_versions_allowed', twenty)
        run('twenty_first_new_hash_denied', lambda: denied(lambda: capture(hashes[20]), 'quota'))
        def idempotent():
            first = read();again = capture(hashes[0])
            assert first == again
            operator();assert sql('SELECT count(*) FROM public.panda_agent_vendor_versions WHERE document_id=%s', (catalog,)) == 20;actor()
        run('same_hash_idempotent_at_capture_cap', idempotent)
        def private_helper():
            assert not sql("SELECT has_function_privilege('authenticated','public.panda_agent_vendor_capture_before_bounds(text,text)','EXECUTE')")
            denied(lambda: sql('SELECT public.panda_agent_vendor_capture_before_bounds(%s,%s)', payload(hashes[0])))
        run('raw_before_bounds_helper_not_executable', private_helper)
        def expired_after_verify():
            conn.execute('SAVEPOINT bounds_expiry_fault')
            try:
                operator()
                definition = sql("SELECT pg_get_functiondef('public.panda_agent_diagnostic_verify(text,text,text)'::regprocedure)")
                assert definition.count('RETURN v;') == 1
                injection = "IF p_action='capture' THEN v:=jsonb_set(v,'{exp}',to_jsonb(floor(extract(epoch FROM clock_timestamp()))::bigint-1));END IF;RETURN v;"
                conn.execute(definition.replace('RETURN v;', injection, 1));actor()
                denied(lambda: capture(hashes[0]), 'unauthenticated')
            finally:
                conn.execute('ROLLBACK TO SAVEPOINT bounds_expiry_fault');conn.execute('RELEASE SAVEPOINT bounds_expiry_fault');actor()
        run('post_verification_capture_expiry_fault_injection', expired_after_verify)
        active = 'setup:synthetic_audit_rows'
        operator()
        version = sql('SELECT id FROM public.panda_agent_vendor_versions WHERE document_id=%s ORDER BY id LIMIT 1', (catalog,))
        conn.execute("INSERT INTO public.panda_agent_document_events(document_id,version_id,action,actor,reason,at) SELECT %s,%s,'capture',%s,'fixture-doc-'||lpad(n::text,2,'0'),clock_timestamp()+n*interval '1 second' FROM generate_series(0,34) n", (catalog, version, owner))
        conn.execute("INSERT INTO public.panda_agent_tool_events(tool_id,enabled,actor,reason,at) SELECT 'search_vendor_docs',mod(n,2)=0,%s,'fixture-tool-'||lpad(n::text,2,'0'),clock_timestamp()+n*interval '1 second' FROM generate_series(0,34) n", (owner,))
        raw_before_projection = state_fingerprint();actor();projected = read()
        doc = projected['documents'][0];tool = projected['tools'][0]
        run('last_twenty_document_events_only', lambda: None if [e['reason'] for e in doc['history']] == ['fixture-doc-' + str(i).zfill(2) for i in range(34,14,-1)] else (_ for _ in ()).throw(AssertionError('Document history not bounded/ordered')))
        run('last_twenty_tool_events_only', lambda: None if [e['reason'] for e in tool['history']] == ['fixture-tool-' + str(i).zfill(2) for i in range(34,14,-1)] else (_ for _ in ()).throw(AssertionError('Tool history not bounded/ordered')))
        def whitelisted():
            assert len(projected['documents']) == 1 and doc['catalogId'] == catalog
            assert len(projected['tools']) == 1 and tool['id'] == 'search_vendor_docs'
            assert all(set(e) == {'versionId','action','reason','at'} for e in doc['history'])
            assert all(set(e) == {'enabled','reason','at'} for e in tool['history'])
            assert all(set(v) == {'id','contentHash','fragments','fetchedAt','status','rights','rightsEvidence','attribution'} for v in doc['versions'])
        run('fixed_catalog_and_whitelisted_no_actor_projection', whitelisted)
        def no_trim():
            assert state_fingerprint() == raw_before_projection
            assert sql('SELECT count(*) FROM public.panda_agent_document_events WHERE document_id=%s', (catalog,)) == 55
            assert sql("SELECT count(*) FROM public.panda_agent_tool_events WHERE tool_id='search_vendor_docs'") == before['panda_agent_tool_events'][0] + 35
            actor()
        run('bounded_projection_does_not_trim_raw_rows', no_trim)
    except Exception as error:
        state = getattr(error, 'sqlstate', None)
        suffix = '; SQLSTATE ' + state if state and len(state) == 5 else ''
        raise AssertionError('Diagnostic bounds rollback check failed: ' + active + ' (completed ' + str(len(passed)) + ' checks' + suffix + '; private details suppressed)') from None
    finally:
        try:
            conn.execute('ROLLBACK')
        except Exception:
            raise RuntimeError('Diagnostic bounds rollback could not be verified') from None
    try:
        assert state_fingerprint() == before
        assert sql("SELECT to_regprocedure('public.panda_agent_vendor_capture_before_bounds(text,text)') IS NULL")
        assert sql("SELECT pg_get_functiondef('public.panda_agent_vendor_capture(text,text)'::regprocedure)") == old_capture
        assert sql("SELECT pg_get_functiondef('public.panda_agent_documentation_read()'::regprocedure)") == old_read
    except Exception:
        raise RuntimeError('Diagnostic bounds post-rollback verification failed; private details suppressed') from None
    passed.append('applied_base_definitions_roles_and_rows_restored')
    return {'passed': len(passed), 'checks': passed, 'migrationSha256': hashlib.sha256(raw).hexdigest(),
            'appliedBase04And05': True, 'followupAppliedInsideRollbackOnly': apply_followup,
            'rolledBack': True, 'simulatedSqlActors': 2, 'realClerk': False,
            'actualHttp403': False, 'nonadminSqlError': 'forbidden',
            'syntheticVersionsCreated': 20, 'actualSourceWithdrawal': False,
            'postVerificationExpiryFaultInjection': True, 'actualTwoConnectionLockWait': False,
            'canonicalSourceRowsChanged': 0, 'realRoleChanges': 0, 'providerCalls': 0}


if __name__ == '__main__':
    if sys.argv[1:] != ['--preflight']:
        raise SystemExit('Use --preflight; database checks require an explicit operator-supplied connection')
    missing = [name for name in MIGRATIONS if not (MIGRATION_ROOT / name).is_file()]
    print(json.dumps({'ready': not missing, 'missingMigrations': missing,
                      'databaseContacted': False, 'providerCalls': 0}))
    raise SystemExit(1 if missing else 0)
