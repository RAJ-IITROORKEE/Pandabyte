"""Applied-schema disposable SQL races. No real source/Clerk/provider claim."""
import concurrent.futures
import hashlib
import hmac
import json
import time
import uuid


def check(connect,key):
    import psycopg
    control,left,right=[connect() for _ in range(3)]
    owner='lightweight-cancel-race-'+str(uuid.uuid4());threads=[];proof={}
    def actor(conn):
        conn.execute('BEGIN')
        conn.execute("SET LOCAL statement_timeout='12s'; SET LOCAL lock_timeout='9s'; SET LOCAL idle_in_transaction_session_timeout='25s'")
        conn.execute('SET LOCAL ROLE authenticated')
        conn.execute("SELECT set_config('request.jwt.claims',%s,true)",(json.dumps({'sub':owner,'role':'authenticated'}),))
    def payload(action,fields,exp=None):
        raw=json.dumps({'v':1,'action':action,'subject':owner,'exp':int(time.time())+60 if exp is None else exp,**fields},separators=(',',':'))
        mac=hmac.new(key,('panda-lightweight-db-v1\n'+raw).encode(),hashlib.sha256).hexdigest()
        return raw,mac
    def signed(conn,action,fields):
        return conn.execute('SELECT public.panda_agent_lightweight_'+action+'(%s,%s)',payload(action,fields)).fetchone()[0]
    def fixture(admitted=False):
        actor(control)
        thread=control.execute("SELECT public.panda_agent_chat_create('Disposable cancellation race')").fetchone()[0]['thread']['id'];threads.append(thread)
        request=str(uuid.uuid4());fields={'thread':thread,'request':request,'question':'Which MCU does the x8266 listing name?'}
        if admitted:signed(control,'begin',fields)
        control.execute('COMMIT');return fields
    def wait_blocked(conn):
        end=time.monotonic()+3
        while time.monotonic()<end:
            if control.execute('SELECT EXISTS(SELECT 1 FROM pg_locks WHERE pid=%s AND NOT granted)',(conn.info.backend_pid,)).fetchone()[0]:return
            time.sleep(.025)
        raise AssertionError('Expected actual blocked database lock')
    def execute(conn,action,args):
        try:
            value=conn.execute('SELECT public.panda_agent_lightweight_'+action+'(%s,%s)',args).fetchone()[0]
            conn.execute('COMMIT');return ('ok',value)
        except psycopg.Error as e:
            conn.execute('ROLLBACK');return ('denied',e.sqlstate)
    def race(fields,first,second):
        control.execute('BEGIN');control.execute('SELECT id FROM public.panda_agent_chats WHERE id=%s AND owner_subject=%s FOR UPDATE',(fields['thread'],owner))
        actor(left);actor(right)
        with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
            a=pool.submit(execute,left,first[0],payload(*first));wait_blocked(left)
            b=pool.submit(execute,right,second[0],payload(*second));wait_blocked(right)
            control.execute('COMMIT');return a.result(timeout=12),b.result(timeout=12)
    try:
        fields=fixture();cancel={'thread':fields['thread'],'request':fields['request'],'digest':None}
        a,b=race(fields,('cancel',cancel),('begin',fields))
        assert a[0]=='ok' and b[0]=='denied';proof['cancel_before_begin_blocks_late_admission']=True
        fields=fixture();cancel={'thread':fields['thread'],'request':fields['request'],'digest':None}
        a,b=race(fields,('begin',fields),('cancel',cancel))
        assert a[0]=='ok' and b[0]=='ok' and b[1]['turns'][0]['status']=='complete';proof['begin_before_cancel_has_one_fixed_terminal']=True
        for cancel_first in (True,False):
            fields=fixture(True)
            actor(control)
            product=next(p for p in control.execute('SELECT public.panda_agent_runtime_products()').fetchone()[0]['items'] if p['sku']=='ESPX8266')
            scope=control.execute('SELECT public.panda_agent_lightweight_scope(%s)',(product['id'],)).fetchone()[0];control.execute('COMMIT')
            prepare={**fields,'product':product['id'],'sku':scope['sku'],'scopeHash':scope['scopeHash'],'digest':'d'*64}
            cancel={'thread':fields['thread'],'request':fields['request'],'digest':None}
            actions=[('cancel',cancel),('prepare',prepare)] if cancel_first else [('prepare',prepare),('cancel',cancel)]
            a,b=race(fields,*actions)
            assert a[0]=='ok' and b[0]=='denied'
            if not cancel_first:assert a[1]['execute'] is True
            proof['cancel_wins_prepare_fenced' if cancel_first else 'prepare_wins_null_cancel_fenced']=True
        fields=fixture();cancel={'thread':fields['thread'],'request':fields['request'],'digest':None}
        control.execute('BEGIN');control.execute('SELECT id FROM public.panda_agent_chats WHERE id=%s AND owner_subject=%s FOR UPDATE',(fields['thread'],owner));actor(left)
        with concurrent.futures.ThreadPoolExecutor(max_workers=1) as pool:
            pending=pool.submit(execute,left,'cancel',payload('cancel',cancel,exp=int(time.time())+2));wait_blocked(left)
            time.sleep(2.2);control.execute('COMMIT');result=pending.result(timeout=12)
        assert result[0]=='denied';proof['expiry_rechecked_after_actual_lock_wait']=True
    finally:
        for conn in (control,left,right):
            try:conn.execute('ROLLBACK')
            except psycopg.Error:pass
        for thread in threads:control.execute('DELETE FROM public.panda_agent_chats WHERE id=%s AND owner_subject=%s',(thread,owner))
        assert control.execute('SELECT count(*) FROM public.panda_agent_chats WHERE owner_subject=%s',(owner,)).fetchone()[0]==0
        assert control.execute('SELECT count(*) FROM public.panda_agent_lightweight_cancelled_requests WHERE owner_subject=%s',(owner,)).fetchone()[0]==0
        for conn in (control,left,right):conn.close()
    return {**proof,'disposableChats':len(threads),'cleanupVerified':True,'realClerk':False,'realSourceWithdrawal':False,'sourceRowsChanged':0,'providerCalls':0}
