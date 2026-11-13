-- Applied 13 Nov 2026 after a rolled-back dry run (8 statements; no Admin check left in the journal; anon no execute; helper and counter table closed to users).
-- Signed-in chat (owner request 13 Nov 2026: clients test the live Panda Agent with the same features as Admin, any signed-in user,
-- 60 messages and 20 web searches per day). The agent-turn journal no longer requires Admin: any signed-in user may run loop turns
-- on their own chats; non-Admins get 60 new agent messages and 20 web searches per India (Asia/Kolkata) day; Admins are uncapped.
-- The app still decides who reaches the loop (PANDA_AGENT_SIGNED_IN_CHAT); the journal RPC is HMAC-signed by the server, so users
-- cannot call it directly. Everything else is the 20261113160000 body unchanged.
-- Rollback: unset PANDA_AGENT_SIGNED_IN_CHAT (app back to Admin-only), then re-run the 20261113160000 function as CREATE OR REPLACE
-- and DROP FUNCTION public.panda_agent_loop_member(); DROP TABLE public.panda_agent_web_search_daily;

CREATE TABLE public.panda_agent_web_search_daily (
 owner_subject text NOT NULL, day date NOT NULL, searches integer NOT NULL CHECK(searches BETWEEN 1 AND 20),
 PRIMARY KEY(owner_subject,day)
);
ALTER TABLE public.panda_agent_web_search_daily ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.panda_agent_web_search_daily FROM PUBLIC,anon,authenticated;

-- Signed-in check for journal ops; true when the caller is an Admin (uncapped).
CREATE FUNCTION public.panda_agent_loop_member() RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE actor text:=public.requesting_user_id();
BEGIN
 IF actor IS NULL THEN PERFORM public.phase3_fail('unauthenticated'); END IF;
 RETURN EXISTS(SELECT 1 FROM public.staff_role_memberships WHERE user_id=actor AND role='ADMIN');
END $$;
REVOKE ALL ON FUNCTION public.panda_agent_loop_member() FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.panda_agent_loop_chat_v1(p_payload text,p_mac text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE n int; v jsonb; op text; tid uuid; rid uuid; d public.panda_agent_loop_turns; t public.panda_agent_chat_turns; u jsonb; a jsonb; digest text; result jsonb;
BEGIN
 v:=public.panda_agent_llm_verify(p_payload,p_mac,'loop_chat');op:=v->>'op';
 IF op IS NULL OR op NOT IN ('begin','state','claim_unmetered','receipt_unmetered','finish','cancel','web_search') OR NOT v?&ARRAY['op','thread','request']
  OR jsonb_typeof(v->'thread') IS DISTINCT FROM 'string' OR jsonb_typeof(v->'request') IS DISTINCT FROM 'string' THEN PERFORM public.phase3_fail('invalid'); END IF;
 tid:=(v->>'thread')::uuid;rid:=(v->>'request')::uuid;
 IF op='begin' THEN
  IF (v-ARRAY['op','thread','request','question'])<>'{}'::jsonb OR jsonb_typeof(v->'question') IS DISTINCT FROM 'string' THEN PERFORM public.phase3_fail('invalid'); END IF;
  -- Any signed-in user; non-Admins get 60 new agent messages per India day (a retried request is not counted again).
  IF NOT public.panda_agent_loop_member() AND NOT EXISTS(SELECT 1 FROM public.panda_agent_loop_turns WHERE thread_id=tid AND request_id=rid)
   AND (SELECT count(*) FROM public.panda_agent_loop_turns d2 JOIN public.panda_agent_chat_turns t2 USING(thread_id,request_id)
    WHERE d2.owner_subject=public.requesting_user_id() AND t2.created_at>=(date_trunc('day',clock_timestamp() AT TIME ZONE 'Asia/Kolkata') AT TIME ZONE 'Asia/Kolkata'))>=60
  THEN PERFORM public.phase3_fail('quota'); END IF;
  result:=public.panda_agent_chat_begin_v2(tid,rid,v->>'question',false);
  IF (result->>'admitted')::boolean THEN
   INSERT INTO public.panda_agent_lightweight_turns(thread_id,request_id,owner_subject) VALUES(tid,rid,public.requesting_user_id());
   INSERT INTO public.panda_agent_loop_turns(thread_id,request_id,owner_subject) VALUES(tid,rid,public.requesting_user_id());
  ELSIF NOT EXISTS(SELECT 1 FROM public.panda_agent_loop_turns WHERE thread_id=tid AND request_id=rid AND owner_subject=public.requesting_user_id()) THEN PERFORM public.phase3_fail('conflict'); END IF;
  RETURN public.panda_agent_lightweight_read(tid)||jsonb_build_object('admitted',result->'admitted');
 END IF;
 IF (op IN ('state','cancel','web_search') AND (v-ARRAY['op','thread','request'])<>'{}'::jsonb)
  OR (op='claim_unmetered' AND (NOT v?'bodyHash' OR (v-ARRAY['op','thread','request','bodyHash'])<>'{}'::jsonb OR coalesce(v->>'bodyHash','') !~ '^[a-f0-9]{64}$'))
  OR (op='receipt_unmetered' AND (NOT v?&ARRAY['bodyHash','answer','usage'] OR (v-ARRAY['op','thread','request','bodyHash','answer','usage'])<>'{}'::jsonb))
  OR (op='finish' AND (NOT v?'answer' OR (v-ARRAY['op','thread','request','answer'])<>'{}'::jsonb)) THEN PERFORM public.phase3_fail('invalid'); END IF;
 PERFORM 1 FROM public.panda_agent_chats WHERE id=tid AND owner_subject=public.requesting_user_id() AND archived_at IS NULL FOR UPDATE;
 IF NOT FOUND THEN PERFORM public.phase3_fail('not_found'); END IF;
 SELECT * INTO d FROM public.panda_agent_loop_turns WHERE thread_id=tid AND request_id=rid AND owner_subject=public.requesting_user_id() FOR UPDATE;
 IF NOT FOUND THEN IF op='state' THEN RETURN 'null'::jsonb; END IF; PERFORM public.phase3_fail('not_found'); END IF;
 SELECT * INTO t FROM public.panda_agent_chat_turns WHERE thread_id=tid AND request_id=rid FOR UPDATE;
 IF NOT FOUND THEN PERFORM public.phase3_fail('not_found'); END IF;
 IF op='state' THEN RETURN jsonb_build_object('question',t.question,'status',t.status,'claimed',d.claimed,'cancelled',d.cancelled); END IF;
 IF op='cancel' AND d.terminal THEN RETURN public.panda_agent_lightweight_read(tid); END IF;
 IF op='finish' AND d.terminal AND NOT d.cancelled AND d.response_hash=encode(sha256(convert_to((v->'answer')::text,'UTF8')),'hex') THEN RETURN public.panda_agent_lightweight_read(tid); END IF;
 IF d.terminal OR t.status<>'pending' OR (p_payload::jsonb->>'exp')::bigint<extract(epoch FROM clock_timestamp()) THEN PERFORM public.phase3_fail('conflict'); END IF;
 -- One web search for this claimed turn: Admins always; others at most 20 per India day.
 IF op='web_search' THEN
  IF NOT d.claimed THEN PERFORM public.phase3_fail('conflict'); END IF;
  IF public.panda_agent_loop_member() THEN RETURN jsonb_build_object('allowed',true); END IF;
  n:=NULL;
  INSERT INTO public.panda_agent_web_search_daily AS w(owner_subject,day,searches) VALUES(d.owner_subject,(clock_timestamp() AT TIME ZONE 'Asia/Kolkata')::date,1)
   ON CONFLICT(owner_subject,day) DO UPDATE SET searches=w.searches+1 WHERE w.searches<20
   RETURNING searches INTO n;
  RETURN jsonb_build_object('allowed',n IS NOT NULL);
 END IF;
 IF op IN ('claim_unmetered','receipt_unmetered','finish') THEN PERFORM public.panda_agent_loop_member(); END IF;
 IF op='claim_unmetered' THEN
  IF d.claimed THEN RETURN jsonb_build_object('execute',false); END IF;
  UPDATE public.panda_agent_loop_turns SET claimed=true,body_hash=v->>'bodyHash' WHERE thread_id=tid AND request_id=rid;
  RETURN jsonb_build_object('execute',true);
 END IF;
 IF op='receipt_unmetered' THEN
  u:=v->'usage';a:=v->'answer';
  -- Ten calls of at most 24,000 input tokens and 30,000 summed output tokens; cost is the worst reviewed model (Qwen 3.8 27B, 92.25M) rounded up.
  IF NOT d.claimed OR d.body_hash IS DISTINCT FROM v->>'bodyHash'
   OR jsonb_typeof(a) IS DISTINCT FROM 'object' OR NOT a?&ARRAY['outcome','text','citations'] OR (a-ARRAY['outcome','text','citations'])<>'{}'::jsonb
   OR coalesce(a->>'outcome','') NOT IN ('evidence','conversation','clarification','insufficient')
   OR jsonb_typeof(a->'text') IS DISTINCT FROM 'string' OR length(btrim(a->>'text')) NOT BETWEEN 1 AND 8000 OR octet_length(a::text)>24000
   OR jsonb_typeof(u) IS DISTINCT FROM 'object' OR NOT u?&ARRAY['inputTokens','outputTokens','costNanoUsd','steps'] OR (u-ARRAY['inputTokens','outputTokens','costNanoUsd','steps'])<>'{}'::jsonb
   OR EXISTS(SELECT 1 FROM jsonb_each(u) x WHERE jsonb_typeof(x.value) IS DISTINCT FROM 'number' OR x.value::text !~ '^[0-9]{1,9}$')
   OR (u->>'inputTokens')::bigint>240000 OR (u->>'outputTokens')::bigint>30000 OR (u->>'costNanoUsd')::bigint>93000000
   OR (u->>'steps')::int NOT BETWEEN 1 AND 10
   OR public.panda_agent_loop_citations_current(a) IS NOT TRUE THEN PERFORM public.phase3_fail('conflict'); END IF;
  digest:=encode(sha256(convert_to(a::text,'UTF8')),'hex');
  IF d.usage IS NOT NULL THEN
   IF d.usage IS DISTINCT FROM u OR d.answer_hash IS DISTINCT FROM digest THEN PERFORM public.phase3_fail('conflict'); END IF;
   RETURN jsonb_build_object('recorded',false);
  END IF;
  UPDATE public.panda_agent_loop_turns SET usage=u,answer_hash=digest WHERE thread_id=tid AND request_id=rid;
  RETURN jsonb_build_object('recorded',true);
 END IF;
 IF op='cancel' THEN
  a:=jsonb_build_object('outcome','insufficient','text',CASE WHEN d.claimed THEN 'Stopped waiting. The provider may still process the request. No late answer will be saved.' ELSE 'Stopped before a model request was sent.' END,'citations','[]'::jsonb);
 ELSE
  a:=v->'answer';
  IF NOT d.claimed OR d.usage IS NULL OR public.panda_agent_loop_citations_current(a) IS NOT TRUE THEN PERFORM public.phase3_fail('conflict'); END IF;
 END IF;
 digest:=encode(sha256(convert_to(a::text,'UTF8')),'hex');
 IF op='finish' AND d.answer_hash IS DISTINCT FROM digest THEN PERFORM public.phase3_fail('conflict'); END IF;
 UPDATE public.panda_agent_loop_turns SET terminal=true,cancelled=(op='cancel'),response_hash=digest WHERE thread_id=tid AND request_id=rid;
 UPDATE public.panda_agent_lightweight_turns SET approved_response_hash=digest,cancelled_at=CASE WHEN op='cancel' THEN clock_timestamp() ELSE NULL END WHERE thread_id=tid AND request_id=rid AND owner_subject=d.owner_subject;
 UPDATE public.panda_agent_chat_turns SET response=a,status='complete',completed_at=clock_timestamp() WHERE thread_id=tid AND request_id=rid;
 UPDATE public.panda_agent_chats SET updated_at=clock_timestamp() WHERE id=tid;
 RETURN public.panda_agent_lightweight_read(tid);
END $$;
REVOKE ALL ON FUNCTION public.panda_agent_loop_chat_v1(text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.panda_agent_loop_chat_v1(text,text) TO authenticated;
