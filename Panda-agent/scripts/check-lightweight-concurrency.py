"""Disposable SQL role fixtures against the applied schema; no genuine Clerk/model claim.

Uses three preconnected sessions: reader, mutator and a bounded lifecycle-lock barrier.
No existing source, product, customer, receipt or runtime-journal row is changed.
"""
import concurrent.futures
import hashlib
import hmac
import json
import time
import uuid


def check(connect, key):
    import psycopg
    owner='lightweight-race-fixture-'+str(uuid.uuid4())
    connections=[connect() for _ in range(3)]
    control,reader,mutator=connections
    threads=[]
    results={}

    def actor(conn):
        conn.execute('BEGIN')
        conn.execute("SET LOCAL statement_timeout='8s'; SET LOCAL lock_timeout='6s'; SET LOCAL idle_in_transaction_session_timeout='20s'")
        conn.execute('SET LOCAL ROLE authenticated')
        conn.execute("SELECT set_config('request.jwt.claims',%s,true)",(json.dumps({'sub':owner,'role':'authenticated'}),))

    def signed(conn,action,fields):
        payload=json.dumps({'v':1,'action':action,'subject':owner,'exp':int(time.time())+60,**fields},separators=(',',':'))
        mac=hmac.new(key,('panda-lightweight-db-v1\n'+payload).encode(),hashlib.sha256).hexdigest()
        return conn.execute('SELECT public.panda_agent_lightweight_'+action+'(%s,%s)',(payload,mac)).fetchone()[0]

    def fixture(complete):
        actor(control)
        thread=control.execute("SELECT public.panda_agent_chat_create('Disposable concurrency fixture')").fetchone()[0]['thread']['id']
        threads.append(thread)
        request=str(uuid.uuid4());question='x8266 SQL concurrency fixture'
        signed(control,'begin',{'thread':thread,'request':request,'question':question})
        products=control.execute('SELECT public.panda_agent_runtime_products()').fetchone()[0]['items']
        product=next(p for p in products if 'x8266' in p['title'].lower())
        scope=control.execute('SELECT public.panda_agent_lightweight_scope(%s)',(product['id'],)).fetchone()[0]
        signed(control,'prepare',{'thread':thread,'request':request,'question':question,'product':product['id'],'sku':scope['sku'],'scopeHash':scope['scopeHash'],'digest':'c'*64})
        source=control.execute('SELECT public.panda_agent_runtime_scope(%s)',(product['id'],)).fetchone()[0]
        chunk=next(c for c in source['chunks'] if c['logicalChunkId'] not in ('21638b9445898f6a03aa24d24a7e60cc344c6bbb2bccd33959537178c2bd4fb4','3ea5b9267d4102142b48cf8e5393e1f9a42fe0c3ff283c13cff04b5bdf3864ac'))
        quote=chunk['text'][:80]
        answer={'outcome':'evidence','text':'Disposable concurrency quote [S1]','citations':[{'id':'S1','title':source['product']['title'],'sourceUrl':source['product']['sourceUrl'],'capturedAt':chunk['capturedAt'],'quote':quote,'sectionPath':chunk['sectionPath']}]}
        if complete:signed(control,'complete',{'thread':thread,'request':request,'answer':answer})
        control.execute('COMMIT')
        # Only this fixture's protected metadata is made stale; canonical sources stay untouched.
        control.execute("UPDATE public.panda_agent_lightweight_turns SET scope_hash=repeat('0',64) WHERE thread_id=%s AND request_id=%s AND owner_subject=%s",(thread,request,owner))
        return thread,request,answer,quote

    def barrier():
        control.execute('BEGIN')
        control.execute("SET LOCAL statement_timeout='8s'; SET LOCAL idle_in_transaction_session_timeout='10s'")
        control.execute("SELECT pg_advisory_xact_lock(hashtext('panda_agent_lifecycle'))")

    def waits(conn,advisory=False):
        end=time.monotonic()+3
        while time.monotonic()<end:
            if control.execute("SELECT EXISTS(SELECT 1 FROM pg_locks WHERE pid=%s AND NOT granted AND (%s=false OR locktype='advisory'))",(conn.info.backend_pid,advisory)).fetchone()[0]:return True
            time.sleep(0.025)
        return False

    try:
        thread,request,answer,quote=fixture(True)
        actor(reader);actor(mutator);barrier()
        with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
            read=pool.submit(lambda:reader.execute('SELECT public.panda_agent_lightweight_read(%s)',(thread,)).fetchone()[0])
            assert waits(reader,True),'Reader did not enter the source fence'
            delete=pool.submit(lambda:mutator.execute('SELECT public.panda_agent_chat_delete(%s)',(thread,)).fetchone()[0])
            try:
                assert waits(mutator) and not delete.done(),'Delete bypassed the reader chat lock'
                control.execute('COMMIT')
                hidden=read.result(timeout=8)
                assert hidden['messages'][1]['citations']==[] and hidden['turns'][0]['response']['citations']==[]
                assert quote not in hidden['messages'][1]['text']
                reader.execute('COMMIT')
                assert delete.result(timeout=8)=={'ok':True}
                mutator.execute('COMMIT')
                results['deleteWaitedForSourceFencedRead']=True
            finally:
                control.execute('ROLLBACK');reader.execute('ROLLBACK');mutator.execute('ROLLBACK')

        thread,request,answer,_=fixture(False)
        actor(reader);barrier()
        with concurrent.futures.ThreadPoolExecutor(max_workers=1) as pool:
            complete=pool.submit(lambda:signed(reader,'complete',{'thread':thread,'request':request,'answer':answer}))
            try:
                assert waits(reader,True),'Commit bypassed the source lifecycle fence'
                control.execute('COMMIT')
                try:complete.result(timeout=8)
                except psycopg.Error as error:assert error.sqlstate=='P0001' and error.diag.message_detail=='conflict'
                else:raise AssertionError('Stale fixture scope was committed')
                reader.execute('ROLLBACK')
                assert control.execute('SELECT response IS NULL FROM public.panda_agent_chat_turns WHERE thread_id=%s AND request_id=%s',(thread,request)).fetchone()[0]
                results['commitWaitedThenRejectedStaleScope']=True
            finally:
                control.execute('ROLLBACK');reader.execute('ROLLBACK')
    finally:
        for connection in connections:
            try:connection.execute('ROLLBACK')
            except Exception:pass
        for thread in threads:
            control.execute('DELETE FROM public.panda_agent_chats WHERE id=%s AND owner_subject=%s',(thread,owner))
        assert control.execute('SELECT count(*) FROM public.panda_agent_chats WHERE owner_subject=%s',(owner,)).fetchone()[0]==0
        for connection in connections:connection.close()
    return {**results,'disposableThreads':len(threads),'cleanupVerified':True,'realClerk':False,'realSourceWithdrawal':False,'canonicalSourceRowsChanged':0,'providerCalls':0}
