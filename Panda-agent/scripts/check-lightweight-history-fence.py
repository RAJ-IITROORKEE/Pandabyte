"""Applied-schema rollback check; simulated identity and metadata invalidation, not source withdrawal."""
import hashlib
import hmac
import json
import time
import uuid


def check(conn, key):
    owner = 'lightweight-history-fixture-' + str(uuid.uuid4())
    checks = []
    thread = None
    conn.execute('BEGIN')
    try:
        conn.execute("SET LOCAL lock_timeout='3s'; SET LOCAL statement_timeout='15s'; SET LOCAL idle_in_transaction_session_timeout='60s'")
        conn.execute('SET LOCAL ROLE authenticated')
        conn.execute("SELECT set_config('request.jwt.claims',%s,true)", (json.dumps({'sub':owner,'role':'authenticated'}),))

        def signed(action, fields):
            payload = json.dumps({'v':1,'action':action,'subject':owner,'exp':int(time.time())+60,**fields}, separators=(',',':'))
            mac = hmac.new(key, ('panda-lightweight-db-v1\n'+payload).encode(), hashlib.sha256).hexdigest()
            return conn.execute('SELECT public.panda_agent_lightweight_'+action+'(%s,%s)', (payload,mac)).fetchone()[0]

        thread = conn.execute("SELECT public.panda_agent_chat_create('Disposable history fence')").fetchone()[0]['thread']['id']
        # Both turns share transaction-time created_at; deterministic UUID order keeps the follow-up latest.
        request = '11111111-1111-4111-8111-111111111111'
        question = 'Disposable history fence question'
        assert signed('begin',{'thread':thread,'request':request,'question':question})['admitted'] is True
        products = conn.execute('SELECT public.panda_agent_runtime_products()').fetchone()[0]['items']
        product = next(p for p in products if 'x8266' in p['title'].lower())
        scope = conn.execute('SELECT public.panda_agent_lightweight_scope(%s)',(product['id'],)).fetchone()[0]
        assert signed('prepare',{'thread':thread,'request':request,'question':question,'product':product['id'],'sku':scope['sku'],'scopeHash':scope['scopeHash'],'digest':'d'*64})['execute'] is True
        source = conn.execute('SELECT public.panda_agent_runtime_scope(%s)',(product['id'],)).fetchone()[0]
        blocked = {'21638b9445898f6a03aa24d24a7e60cc344c6bbb2bccd33959537178c2bd4fb4','3ea5b9267d4102142b48cf8e5393e1f9a42fe0c3ff283c13cff04b5bdf3864ac'}
        chunk = next(c for c in source['chunks'] if c['logicalChunkId'] not in blocked and c['text'].strip())
        quote = chunk['text'].strip()[:80]
        citation = {'id':'S1','title':source['product']['title'],'sourceUrl':source['product']['sourceUrl'],'capturedAt':chunk['capturedAt'],'quote':quote,'sectionPath':chunk['sectionPath']}
        answer = {'outcome':'evidence','text':'Fixture: '+quote+' [S1]','citations':[citation]}
        saved = signed('complete',{'thread':thread,'request':request,'answer':answer})
        assert quote in saved['messages'][1]['text'] and saved['messages'][1]['citations']==[citation]
        checks.append('quoted_answer_present_before_invalidation')

        conn.execute('SET LOCAL ROLE postgres')
        changed = conn.execute("UPDATE public.panda_agent_lightweight_turns SET scope_hash=repeat('0',64) WHERE thread_id=%s AND request_id=%s AND owner_subject=%s",(thread,request,owner)).rowcount
        assert changed==1
        original = conn.execute('SELECT response FROM public.panda_agent_chat_turns WHERE thread_id=%s AND request_id=%s',(thread,request)).fetchone()[0]
        assert original==answer
        checks.append('protected_original_retained')
        conn.execute('SET LOCAL ROLE authenticated')

        hidden = conn.execute('SELECT public.panda_agent_lightweight_read(%s)',(thread,)).fetchone()[0]
        assert quote not in hidden['messages'][1]['text'] and hidden['messages'][1]['citations']==[]
        assert quote not in hidden['turns'][0]['response']['text'] and hidden['turns'][0]['response']['citations']==[]
        checks.append('history_redacts_quote_and_citations')
        replay = conn.execute('SELECT public.panda_agent_chat_begin_v2(%s,%s,%s,false)',(thread,request,question)).fetchone()[0]
        assert quote not in replay['turn']['response']['text'] and replay['turn']['response']['citations']==[]
        assert quote not in replay['messages'][1]['text'] and replay['messages'][1]['citations']==[]
        checks.append('begin_replay_redacts_quote_and_citations')
        next_request='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'
        signed('begin',{'thread':thread,'request':next_request,'question':'Disposable follow-up'})
        hosted=conn.execute('SELECT public.panda_agent_hosted_history_read(%s,%s)',(thread,next_request)).fetchone()[0]
        assert quote not in json.dumps(hosted['history'],ensure_ascii=False)
        assert 'no longer current' in hosted['history'][1]['text']
        checks.append('hosted_history_redacts_quote')
    finally:
        conn.execute('ROLLBACK')
    assert conn.execute('SELECT count(*) FROM public.panda_agent_chats WHERE id=%s AND owner_subject=%s',(thread,owner)).fetchone()[0]==0
    return {'checks':checks,'rolledBack':True,'simulatedIdentity':True,'metadataHashInvalidation':True,'realSourceWithdrawal':False,'canonicalSourceRowsChanged':0,'providerCalls':0}
