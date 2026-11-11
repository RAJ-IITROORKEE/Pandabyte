"""Rollback-only PostgreSQL fixture for the D1 research-turn migration.

Run only against a disposable InsForge branch. Install the developer-only psycopg[binary]==3.3.7 outside the runtime.
The caller supplies an explicitly verified test connection; no project discovery. Everything is rolled back.
"""
import hashlib
import hmac
import json
import secrets
import time
import uuid
from pathlib import Path

MIGRATION = Path(__file__).resolve().parents[1] / 'migrations/20261112090000_panda-agent-research-turns.sql'
ZERO = {'calls': 0, 'inputTokens': 0, 'outputTokens': 0, 'costNanoUsd': 0}


def sha(text):
    return hashlib.sha256(text.encode()).hexdigest()


def check(conn):
    key = secrets.token_bytes(32)
    owner = 'research-fixture-owner-' + str(uuid.uuid4())
    other = 'research-fixture-other-' + str(uuid.uuid4())
    passed = []
    state = {'subject': owner}
    conn.execute('BEGIN')
    try:
        conn.execute("SET LOCAL lock_timeout='3s'; SET LOCAL statement_timeout='20s'; SET LOCAL idle_in_transaction_session_timeout='90s'")
        assert conn.execute("SELECT count(*) FROM pg_proc WHERE proname='panda_agent_research_chat_v1'").fetchone()[0] == 0
        conn.execute(MIGRATION.read_text(encoding='utf-8'))
        conn.execute('DELETE FROM public.panda_agent_lightweight_key')
        conn.execute('INSERT INTO public.panda_agent_lightweight_key(key_bytes) VALUES (%s)', (key,))
        # A schema-only branch has no seeded built-in roles; seed ADMIN inside this rolled-back transaction only.
        conn.execute("INSERT INTO public.staff_role_definitions(key,name,description,permissions,built_in) VALUES ('ADMIN','Admin','Fixture',ARRAY[]::text[],true) ON CONFLICT (key) DO NOTHING")
        conn.execute("INSERT INTO public.staff_role_memberships(user_id,role,assigned_by) VALUES (%s,'ADMIN','research-fixture')", (owner,))
        conn.execute('SET LOCAL ROLE authenticated')

        def actor(subject):
            state['subject'] = subject
            conn.execute("SELECT set_config('request.jwt.claims',%s,true)", (json.dumps({'sub': subject, 'role': 'authenticated'}),))

        def signed(action, fields, *, exp=60, mac_ok=True):
            raw = json.dumps({'v': 1, 'action': action, 'subject': state['subject'], 'exp': int(time.time()) + exp, 'input': fields}, separators=(',', ':'))
            mac = hmac.new(key, ('panda-llm-db-v1\n' + raw).encode(), hashlib.sha256).hexdigest() if mac_ok else '0' * 64
            return raw, mac

        def rpc(fields, **kw):
            raw, mac = signed('research_chat', fields, **kw)
            return conn.execute('SELECT public.panda_agent_research_chat_v1(%s,%s)', (raw, mac)).fetchone()[0]

        def direct(fields):
            raw, mac = signed('direct_chat', fields)
            return conn.execute('SELECT public.panda_agent_direct_chat_v2(%s,%s)', (raw, mac)).fetchone()[0]

        def denied(name, fn):
            conn.execute('SAVEPOINT negative_case')
            try:
                fn()
            except Exception as error:  # noqa: BLE001 - any database refusal counts; the transaction state is restored below
                conn.execute('ROLLBACK TO SAVEPOINT negative_case')
                passed.append(name)
                return str(getattr(error, 'sqlstate', '') or '')
            conn.execute('ROLLBACK TO SAVEPOINT negative_case')
            raise AssertionError('expected refusal: ' + name)

        def ledger():
            conn.execute('RESET ROLE')
            row = conn.execute('SELECT reserved_nano_usd,charged_nano_usd FROM public.panda_agent_research_daily WHERE owner_subject=%s', (owner,)).fetchone()
            conn.execute('SET LOCAL ROLE authenticated')
            actor(state['subject'])
            return tuple(row) if row else (0, 0)

        actor(owner)
        thread = conn.execute("SELECT public.panda_agent_chat_create('Research fixture')").fetchone()[0]
        tid = thread['id'] if 'id' in thread else thread['thread']['id']

        # Happy path: begin, state, claim, receipt (and replay), finish (and replay), read restores the cited answer.
        rid = str(uuid.uuid4())
        q = 'Which interfaces are RP2040 PIO examples?'
        begun = rpc({'op': 'begin', 'thread': tid, 'request': rid, 'question': q, 'profile': 'tavily-hosted-haiku'})
        assert begun['admitted'] is True
        replay = rpc({'op': 'begin', 'thread': tid, 'request': rid, 'question': q, 'profile': 'tavily-hosted-haiku'})
        assert replay['admitted'] is False
        st = rpc({'op': 'state', 'thread': tid, 'request': rid})
        assert st == {'question': q, 'status': 'pending', 'claimed': False, 'cancelled': False, 'failed': False, 'unknown': False, 'profile': 'tavily-hosted-haiku'}
        passed.append('begin_replay_and_state')
        ph, run = sha('prompt'), sha('run')
        assert rpc({'op': 'claim', 'thread': tid, 'request': rid, 'promptHash': ph, 'runId': run}) == {'execute': True}
        assert rpc({'op': 'claim', 'thread': tid, 'request': rid, 'promptHash': ph, 'runId': run}) == {'execute': False}
        assert ledger() == (40500006, 0)
        passed.append('claim_reserves_once')
        answer = {'outcome': 'evidence', 'text': 'PIO examples include UART, SPI and I2C.', 'citations': [
            {'id': 'S1', 'title': 'RP2040 Datasheet', 'sourceUrl': 'https://datasheets.raspberrypi.com/rp2040/rp2040-datasheet.pdf',
             'capturedAt': '2026-11-11T12:00:00Z', 'quote': 'Programs for common interfaces, such as UART, SPI, or I2C, are available.', 'sectionPath': []}]}
        usage = {'calls': 3, 'inputTokens': 9000, 'outputTokens': 500, 'costNanoUsd': 2172800}
        for bad, label in [({**answer, 'outcome': None}, 'null_outcome'), ({**answer, 'citations': []}, 'evidence_without_citation'),
                           ({**answer, 'citations': [{**answer['citations'][0], 'sourceUrl': 'javascript:alert(1)'}]}, 'bad_url'),
                           ({**answer, 'citations': [{**answer['citations'][0], 'id': 'S2'}]}, 'citation_id_order'),
                           ({**answer, 'citations': [{**answer['citations'][0], 'quote': 'x' * 181}]}, 'quote_too_long'),
                           ({**answer, 'extra': 1}, 'extra_key')]:
            denied('receipt_rejects_' + label, lambda bad=bad: rpc({'op': 'receipt', 'thread': tid, 'request': rid, 'promptHash': ph, 'runId': run, 'answer': bad, 'usage': usage}))
        denied('receipt_rejects_cost_above_reservation', lambda: rpc({'op': 'receipt', 'thread': tid, 'request': rid, 'promptHash': ph, 'runId': run, 'answer': answer, 'usage': {**usage, 'costNanoUsd': 40500007}}))
        denied('receipt_rejects_wrong_prompt', lambda: rpc({'op': 'receipt', 'thread': tid, 'request': rid, 'promptHash': sha('other'), 'runId': run, 'answer': answer, 'usage': usage}))
        assert rpc({'op': 'receipt', 'thread': tid, 'request': rid, 'promptHash': ph, 'runId': run, 'answer': answer, 'usage': usage}) == {'recorded': True}
        assert rpc({'op': 'receipt', 'thread': tid, 'request': rid, 'promptHash': ph, 'runId': run, 'answer': answer, 'usage': usage}) == {'recorded': False}
        denied('receipt_replay_rejects_other_run', lambda: rpc({'op': 'receipt', 'thread': tid, 'request': rid, 'promptHash': ph, 'runId': sha('x'), 'answer': answer, 'usage': usage}))
        assert ledger() == (0, 2172800)
        passed.append('receipt_settles_charged_cost')
        denied('fail_after_receipt_rejected', lambda: rpc({'op': 'fail', 'thread': tid, 'request': rid, 'reason': 'invalid', 'usage': ZERO}))
        denied('finish_rejects_other_answer', lambda: rpc({'op': 'finish', 'thread': tid, 'request': rid, 'answer': {**answer, 'text': 'Different.'}}))
        done = rpc({'op': 'finish', 'thread': tid, 'request': rid, 'answer': answer})
        saved = next(t for t in done['turns'] if t['requestId'] == rid)
        assert saved['response'] == answer, saved
        assert rpc({'op': 'finish', 'thread': tid, 'request': rid, 'answer': answer})['turns']
        read = conn.execute('SELECT public.panda_agent_lightweight_read(%s)', (tid,)).fetchone()[0]
        assert next(t for t in read['turns'] if t['requestId'] == rid)['response'] == answer
        passed.append('finish_and_read_restore_cited_answer')

        # Fail before claim, budget fail text, cancel texts.
        rid2 = str(uuid.uuid4())
        rpc({'op': 'begin', 'thread': tid, 'request': rid2, 'question': 'Second question', 'profile': 'tavily-hosted-terra'})
        out = rpc({'op': 'fail', 'thread': tid, 'request': rid2, 'reason': 'budget', 'usage': ZERO})
        assert 'budget is used up' in next(t for t in out['turns'] if t['requestId'] == rid2)['response']['text']
        passed.append('fail_before_claim_budget_reason')
        rid3 = str(uuid.uuid4())
        rpc({'op': 'begin', 'thread': tid, 'request': rid3, 'question': 'Third question', 'profile': 'tavily-hosted-terra'})
        assert rpc({'op': 'claim', 'thread': tid, 'request': rid3, 'promptHash': ph, 'runId': run})['execute'] is True
        before = ledger()
        out = rpc({'op': 'fail', 'thread': tid, 'request': rid3, 'reason': 'tool_not_ready', 'usage': ZERO})
        assert ledger() == (before[0] - 287100006, before[1])
        passed.append('claimed_zero_usage_fail_releases_reservation')
        rid4 = str(uuid.uuid4())
        rpc({'op': 'begin', 'thread': tid, 'request': rid4, 'question': 'Fourth question', 'profile': 'tavily-hosted-terra'})
        rpc({'op': 'claim', 'thread': tid, 'request': rid4, 'promptHash': ph, 'runId': run})
        out = rpc({'op': 'cancel', 'thread': tid, 'request': rid4})
        assert 'No late answer will be saved' in next(t for t in out['turns'] if t['requestId'] == rid4)['response']['text']
        assert ledger()[0] == 287100006
        passed.append('cancel_after_claim_keeps_reservation')

        # Daily cap: three Terra reservations fit (with earlier usage), the next refuses.
        refused = None
        for i in range(4):
            r = str(uuid.uuid4())
            rpc({'op': 'begin', 'thread': tid, 'request': r, 'question': f'Cap {i}', 'profile': 'tavily-hosted-terra'})
            c = rpc({'op': 'claim', 'thread': tid, 'request': r, 'promptHash': ph, 'runId': run})
            if c['execute'] is False:
                refused = c
                rpc({'op': 'fail', 'thread': tid, 'request': r, 'reason': 'budget', 'usage': ZERO})
                break
            rpc({'op': 'cancel', 'thread': tid, 'request': r})
        assert refused == {'execute': False, 'reason': 'budget'}, refused
        assert sum(ledger()) <= 1000000000
        passed.append('daily_cap_refuses_claim')

        # Cross-journal fence in both directions.
        rid5 = str(uuid.uuid4())
        direct({'op': 'begin', 'thread': tid, 'request': rid5, 'question': 'Direct turn'})
        denied('research_begin_on_direct_request', lambda: rpc({'op': 'begin', 'thread': tid, 'request': rid5, 'question': 'Direct turn', 'profile': 'tavily-hosted-haiku'}))
        direct({'op': 'cancel', 'thread': tid, 'request': rid5})
        rid6 = str(uuid.uuid4())
        rpc({'op': 'begin', 'thread': tid, 'request': rid6, 'question': 'Research turn', 'profile': 'tavily-hosted-haiku'})
        denied('direct_begin_on_research_request', lambda: direct({'op': 'begin', 'thread': tid, 'request': rid6, 'question': 'Research turn'}))
        denied('generic_chat_finish_cannot_complete_research_turn', lambda: conn.execute(
            "SELECT public.panda_agent_chat_finish(%s,%s,%s::jsonb,%s)", (tid, rid6, json.dumps({'outcome': 'insufficient', 'text': 'x', 'citations': []}), 'f' * 64)))
        rpc({'op': 'cancel', 'thread': tid, 'request': rid6})

        # The overlay leaves every non-research turn exactly as the previous read function returns it.
        research_ids = {rid, rid2, rid3, rid4, rid6} | {t['requestId'] for t in read['turns'] if t['question'].startswith('Cap ')}
        conn.execute('RESET ROLE')
        before_overlay = conn.execute("SELECT set_config('request.jwt.claims',%s,true), public.panda_agent_lightweight_read_before_research(%s)", (json.dumps({'sub': owner, 'role': 'authenticated'}), tid)).fetchone()[1]
        conn.execute('SET LOCAL ROLE authenticated')
        actor(owner)
        after_overlay = conn.execute('SELECT public.panda_agent_lightweight_read(%s)', (tid,)).fetchone()[0]
        research_ids |= {t['requestId'] for t in after_overlay['turns'] if t['question'].startswith('Cap ')}
        others = lambda r: [t for t in r['turns'] if t['requestId'] not in research_ids]
        assert others(after_overlay) == others(before_overlay) and others(after_overlay), 'non-research turns changed'
        passed.append('overlay_leaves_non_research_turns_identical')

        # Access control: bad MAC, expired payload, non-admin, other owner, anon.
        denied('bad_mac_rejected', lambda: rpc({'op': 'state', 'thread': tid, 'request': rid}, mac_ok=False))
        denied('expired_payload_rejected', lambda: rpc({'op': 'state', 'thread': tid, 'request': rid}, exp=-5))
        actor(other)
        denied('non_admin_rejected', lambda: rpc({'op': 'state', 'thread': tid, 'request': rid}))
        conn.execute('RESET ROLE')
        conn.execute("INSERT INTO public.staff_role_memberships(user_id,role,assigned_by) VALUES (%s,'ADMIN','research-fixture')", (other,))
        conn.execute('SET LOCAL ROLE authenticated')
        actor(other)
        denied('other_owner_state_hidden', lambda: rpc({'op': 'state', 'thread': tid, 'request': rid}))
        denied('other_owner_cannot_claim', lambda: rpc({'op': 'claim', 'thread': tid, 'request': rid6, 'promptHash': ph, 'runId': run}))
        passed.append('other_admin_cannot_see_or_act')
        conn.execute('SET LOCAL ROLE anon')
        denied('anon_cannot_execute', lambda: conn.execute('SELECT public.panda_agent_research_chat_v1(%s,%s)', ('{}', '0' * 64)))
        conn.execute('SET LOCAL ROLE authenticated')
        actor(owner)
        denied('direct_table_access_denied', lambda: conn.execute('SELECT * FROM public.panda_agent_research_turns').fetchall())
    finally:
        conn.execute('ROLLBACK')
    assert conn.execute("SELECT count(*) FROM pg_proc WHERE proname='panda_agent_research_chat_v1'").fetchone()[0] == 0
    return {'passed': len(passed), 'checks': passed, 'rolledBack': True, 'realClerk': False, 'migrationSha256': hashlib.sha256(MIGRATION.read_bytes()).hexdigest()}


if __name__ == '__main__':
    import os
    from urllib.parse import urlsplit
    import psycopg
    dsn = os.environ['PANDA_AGENT_TEST_DATABASE_URL']
    expected = os.environ['PANDA_AGENT_TEST_DATABASE_HOST']
    if urlsplit(dsn).hostname != expected:
        raise RuntimeError('Explicit test target mismatch')
    with psycopg.connect(dsn, sslmode='require', connect_timeout=15, autocommit=True) as connection:
        print(json.dumps(check(connection), indent=2))
