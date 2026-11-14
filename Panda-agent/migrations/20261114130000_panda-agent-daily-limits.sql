-- Applied 14 Nov 2026 after a rolled-back dry run (owner picked "Admin-set, split by tier" the same day).
-- Daily limits per signed-in user, set on the Admin Models page; Admins stay unlimited. Paid-model and free-pool messages are
-- counted separately (the server signs the turn's tier into the journal request), plus web searches and compiles.
-- Defaults: 20 paid messages, 60 free-pool messages, 20 web searches, 10 compiles per India (Asia/Kolkata) day.
-- Rollback: re-run the panda_agent_loop_chat_v1 and panda_agent_compile_reserve bodies from 20261113210000 / 20261114100000,
-- drop the four functions below, drop panda_agent_daily_limits and panda_agent_loop_turns.tier.

CREATE TABLE public.panda_agent_daily_limits (
 name text PRIMARY KEY CHECK (name IN ('paid_messages','free_messages','web_searches','compiles')),
 per_day integer NOT NULL CHECK (per_day BETWEEN 0 AND 10000),
 version integer NOT NULL DEFAULT 1 CHECK (version >= 1),
 updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 updated_by text
);
ALTER TABLE public.panda_agent_daily_limits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.panda_agent_daily_limits FROM PUBLIC, anon, authenticated;
INSERT INTO public.panda_agent_daily_limits(name, per_day) VALUES ('paid_messages',20),('free_messages',60),('web_searches',20),('compiles',10);

-- Existing turns predate tiers and count as paid.
ALTER TABLE public.panda_agent_loop_turns ADD COLUMN tier text NOT NULL DEFAULT 'paid' CHECK (tier IN ('free','paid'));
ALTER TABLE public.panda_agent_web_search_daily DROP CONSTRAINT panda_agent_web_search_daily_searches_check,
 ADD CONSTRAINT panda_agent_web_search_daily_searches_check CHECK (searches BETWEEN 1 AND 10000);
ALTER TABLE public.panda_agent_compile_daily DROP CONSTRAINT panda_agent_compile_daily_builds_check,
 ADD CONSTRAINT panda_agent_compile_daily_builds_check CHECK (builds BETWEEN 1 AND 10000);

-- Internal: one limit (0 when a row is missing, so nothing is allowed by accident).
CREATE FUNCTION public.panda_agent_daily_limit(p_name text) RETURNS integer
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
 SELECT coalesce((SELECT per_day FROM public.panda_agent_daily_limits WHERE name = p_name), 0)
$$;
REVOKE ALL ON FUNCTION public.panda_agent_daily_limit(text) FROM PUBLIC, anon, authenticated;

-- Signed-in: today's limits and the caller's use (Admins: unlimited true).
CREATE FUNCTION public.panda_agent_daily_usage() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE actor text := public.requesting_user_id(); day0 timestamptz; today date;
BEGIN
 IF actor IS NULL THEN PERFORM public.phase3_fail('unauthenticated'); END IF;
 today := (clock_timestamp() AT TIME ZONE 'Asia/Kolkata')::date;
 day0 := date_trunc('day', clock_timestamp() AT TIME ZONE 'Asia/Kolkata') AT TIME ZONE 'Asia/Kolkata';
 RETURN jsonb_build_object(
  'unlimited', EXISTS (SELECT 1 FROM public.staff_role_memberships WHERE user_id = actor AND role = 'ADMIN'),
  'limits', (SELECT jsonb_object_agg(name, per_day) FROM public.panda_agent_daily_limits),
  'used', jsonb_build_object(
   'paid_messages', (SELECT count(*) FROM public.panda_agent_loop_turns d JOIN public.panda_agent_chat_turns t USING (thread_id, request_id)
     WHERE d.owner_subject = actor AND d.tier = 'paid' AND t.created_at >= day0),
   'free_messages', (SELECT count(*) FROM public.panda_agent_loop_turns d JOIN public.panda_agent_chat_turns t USING (thread_id, request_id)
     WHERE d.owner_subject = actor AND d.tier = 'free' AND t.created_at >= day0),
   'web_searches', coalesce((SELECT searches FROM public.panda_agent_web_search_daily WHERE owner_subject = actor AND day = today), 0),
   'compiles', coalesce((SELECT builds FROM public.panda_agent_compile_daily WHERE owner_subject = actor AND day = today), 0)));
END $$;

-- Admin: the limit rows with versions.
CREATE FUNCTION public.panda_agent_daily_limits_admin() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
BEGIN
 PERFORM public.panda_agent_control_room_admin();
 RETURN coalesce((SELECT jsonb_agg(jsonb_build_object('name', name, 'perDay', per_day, 'version', version, 'updatedAt', updated_at) ORDER BY name)
  FROM public.panda_agent_daily_limits), '[]'::jsonb);
END $$;

-- Admin: set one limit (0 to 10000) with a version check.
CREATE FUNCTION public.panda_agent_daily_limit_set(p_name text, p_per_day integer, p_expected integer) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE actor text; s public.panda_agent_daily_limits;
BEGIN
 actor := public.panda_agent_control_room_admin();
 IF p_name IS NULL OR p_per_day IS NULL OR p_expected IS NULL OR p_per_day NOT BETWEEN 0 AND 10000 THEN PERFORM public.phase3_fail('invalid'); END IF;
 SELECT * INTO s FROM public.panda_agent_daily_limits WHERE name = p_name FOR UPDATE;
 IF NOT FOUND THEN PERFORM public.phase3_fail('not_found'); END IF;
 IF s.version <> p_expected THEN PERFORM public.phase3_fail('conflict'); END IF;
 UPDATE public.panda_agent_daily_limits SET per_day = p_per_day, version = version + 1, updated_at = clock_timestamp(), updated_by = actor
  WHERE name = p_name RETURNING * INTO s;
 RETURN jsonb_build_object('name', s.name, 'perDay', s.per_day, 'version', s.version, 'updatedAt', s.updated_at);
END $$;

REVOKE ALL ON FUNCTION public.panda_agent_daily_usage(), public.panda_agent_daily_limits_admin(), public.panda_agent_daily_limit_set(text,integer,integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.panda_agent_daily_usage(), public.panda_agent_daily_limits_admin(), public.panda_agent_daily_limit_set(text,integer,integer) TO authenticated;

-- Compiles: the Admin-set number instead of 10.
CREATE OR REPLACE FUNCTION public.panda_agent_compile_reserve() RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'pg_catalog', 'public', 'pg_temp' AS $function$
DECLARE actor text := public.requesting_user_id(); n integer; lim integer;
BEGIN
 IF actor IS NULL THEN PERFORM public.phase3_fail('unauthenticated'); END IF;
 IF NOT EXISTS (SELECT 1 FROM public.panda_agent_tool_settings WHERE name = 'compile_sketch' AND enabled) THEN RETURN jsonb_build_object('allowed', false); END IF;
 IF EXISTS (SELECT 1 FROM public.staff_role_memberships WHERE user_id = actor AND role = 'ADMIN') THEN RETURN jsonb_build_object('allowed', true); END IF;
 lim := public.panda_agent_daily_limit('compiles');
 IF lim < 1 THEN RETURN jsonb_build_object('allowed', false); END IF;
 INSERT INTO public.panda_agent_compile_daily AS c(owner_subject, day, builds) VALUES (actor, (clock_timestamp() AT TIME ZONE 'Asia/Kolkata')::date, 1)
  ON CONFLICT (owner_subject, day) DO UPDATE SET builds = c.builds + 1 WHERE c.builds < lim
  RETURNING builds INTO n;
 RETURN jsonb_build_object('allowed', n IS NOT NULL);
END $function$;

-- Journal: tier-aware message limits and the Admin-set web search limit (rest unchanged from the live body).
CREATE OR REPLACE FUNCTION public.panda_agent_loop_chat_v1(p_payload text, p_mac text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
DECLARE n int; lim int; ttier text; v jsonb; op text; tid uuid; rid uuid; d public.panda_agent_loop_turns; t public.panda_agent_chat_turns; u jsonb; a jsonb; digest text; result jsonb;
BEGIN
 v:=public.panda_agent_llm_verify(p_payload,p_mac,'loop_chat');op:=v->>'op';
 IF op IS NULL OR op NOT IN ('begin','state','claim_unmetered','receipt_unmetered','finish','cancel','web_search') OR NOT v?&ARRAY['op','thread','request']
  OR jsonb_typeof(v->'thread') IS DISTINCT FROM 'string' OR jsonb_typeof(v->'request') IS DISTINCT FROM 'string' THEN PERFORM public.phase3_fail('invalid'); END IF;
 tid:=(v->>'thread')::uuid;rid:=(v->>'request')::uuid;
 IF op='begin' THEN
  IF (v-ARRAY['op','thread','request','question','tier'])<>'{}'::jsonb OR jsonb_typeof(v->'question') IS DISTINCT FROM 'string'
   OR (v?'tier' AND coalesce(v->>'tier','') NOT IN ('free','paid')) THEN PERFORM public.phase3_fail('invalid'); END IF;
  -- The server signs which tier the turn's model is (the free pool or a paid model); older callers count as paid.
  ttier:=coalesce(v->>'tier','paid');
  -- Any signed-in user; non-Admins get the Admin-set daily messages for this tier per India day (a retried request is not counted again).
  IF NOT public.panda_agent_loop_member() AND NOT EXISTS(SELECT 1 FROM public.panda_agent_loop_turns WHERE thread_id=tid AND request_id=rid)
   AND (SELECT count(*) FROM public.panda_agent_loop_turns d2 JOIN public.panda_agent_chat_turns t2 USING(thread_id,request_id)
    WHERE d2.owner_subject=public.requesting_user_id() AND d2.tier=ttier AND t2.created_at>=(date_trunc('day',clock_timestamp() AT TIME ZONE 'Asia/Kolkata') AT TIME ZONE 'Asia/Kolkata'))>=public.panda_agent_daily_limit(ttier||'_messages')
  THEN PERFORM public.phase3_fail('quota'); END IF;
  result:=public.panda_agent_chat_begin_v2(tid,rid,v->>'question',false);
  IF (result->>'admitted')::boolean THEN
   INSERT INTO public.panda_agent_lightweight_turns(thread_id,request_id,owner_subject) VALUES(tid,rid,public.requesting_user_id());
   INSERT INTO public.panda_agent_loop_turns(thread_id,request_id,owner_subject,tier) VALUES(tid,rid,public.requesting_user_id(),ttier);
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
 -- One web search for this claimed turn: Admins always; others the Admin-set number per India day.
 IF op='web_search' THEN
  IF NOT d.claimed THEN PERFORM public.phase3_fail('conflict'); END IF;
  IF public.panda_agent_loop_member() THEN RETURN jsonb_build_object('allowed',true); END IF;
  n:=NULL; lim:=public.panda_agent_daily_limit('web_searches');
  IF lim<1 THEN RETURN jsonb_build_object('allowed',false); END IF;
  INSERT INTO public.panda_agent_web_search_daily AS w(owner_subject,day,searches) VALUES(d.owner_subject,(clock_timestamp() AT TIME ZONE 'Asia/Kolkata')::date,1)
   ON CONFLICT(owner_subject,day) DO UPDATE SET searches=w.searches+1 WHERE w.searches<lim
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
END $function$;
