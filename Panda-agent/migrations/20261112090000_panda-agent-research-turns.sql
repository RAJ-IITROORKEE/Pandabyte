-- Phase D1: owner/Admin-only native research turns with cited answers and a per-user daily budget.
-- Additive and forward-only; existing journals and RPCs are unchanged except one new fence trigger on direct turns.
-- Contract: docs/agent-experience-upgrade/opencode-web-harness/phase-d-plan.md (R1, R2, review 3).

CREATE TABLE public.panda_agent_research_turns (
 thread_id uuid NOT NULL, request_id uuid NOT NULL, owner_subject text NOT NULL,
 profile text NOT NULL CHECK(profile IN ('tavily-hosted-haiku','tavily-hosted-luna','tavily-hosted-terra')),
 claimed boolean NOT NULL DEFAULT false, claimed_at timestamptz, claim_day date,
 prompt_hash text CHECK(prompt_hash ~ '^[a-f0-9]{64}$'), run_id text CHECK(run_id ~ '^[a-f0-9]{64}$'),
 reserved_nano_usd bigint CHECK(reserved_nano_usd BETWEEN 1 AND 1000000000),
 terminal boolean NOT NULL DEFAULT false, cancelled boolean NOT NULL DEFAULT false, failed boolean NOT NULL DEFAULT false,
 usage jsonb, answer_hash text CHECK(answer_hash ~ '^[a-f0-9]{64}$'), response_hash text CHECK(response_hash ~ '^[a-f0-9]{64}$'),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(thread_id,request_id), UNIQUE(owner_subject,request_id),
 FOREIGN KEY(thread_id,request_id) REFERENCES public.panda_agent_lightweight_turns(thread_id,request_id) ON DELETE CASCADE,
 CHECK(claimed=(prompt_hash IS NOT NULL AND run_id IS NOT NULL AND claimed_at IS NOT NULL AND claim_day IS NOT NULL AND reserved_nano_usd IS NOT NULL)),
 CHECK(usage IS NULL OR failed OR answer_hash IS NOT NULL), CHECK(answer_hash IS NULL OR usage IS NOT NULL), CHECK(usage IS NULL OR claimed),
 CHECK(terminal=(response_hash IS NOT NULL)), CHECK(NOT cancelled OR terminal), CHECK(NOT failed OR terminal), CHECK(NOT (cancelled AND failed))
);
ALTER TABLE public.panda_agent_research_turns ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.panda_agent_research_turns FROM PUBLIC,anon,authenticated;

CREATE TABLE public.panda_agent_research_daily (
 owner_subject text NOT NULL, day date NOT NULL,
 reserved_nano_usd bigint NOT NULL DEFAULT 0 CHECK(reserved_nano_usd>=0), charged_nano_usd bigint NOT NULL DEFAULT 0 CHECK(charged_nano_usd>=0),
 PRIMARY KEY(owner_subject,day), CHECK(reserved_nano_usd+charged_nano_usd<=1000000000)
);
ALTER TABLE public.panda_agent_research_daily ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.panda_agent_research_daily FROM PUBLIC,anon,authenticated;

-- Single shared definition of the derived unknown state (state op and read overlay).
CREATE FUNCTION public.panda_agent_research_unknown(p_claimed boolean,p_terminal boolean,p_claimed_at timestamptz) RETURNS boolean
LANGUAGE sql VOLATILE SET search_path=pg_catalog AS $$
 SELECT coalesce(p_claimed AND NOT p_terminal AND p_claimed_at < clock_timestamp()-interval '10 minutes',false)
$$;
REVOKE ALL ON FUNCTION public.panda_agent_research_unknown(boolean,boolean,timestamptz) FROM PUBLIC,anon,authenticated;

-- Per-turn reservation = per-call model reservation x 6 provider calls (hosted-model-policy.ts maxInput 32,000).
CREATE FUNCTION public.panda_agent_research_reservation(p_profile text) RETURNS bigint
LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $$
 SELECT CASE p_profile WHEN 'tavily-hosted-haiku' THEN 40500006 WHEN 'tavily-hosted-luna' THEN 28710006 WHEN 'tavily-hosted-terra' THEN 287100006 END::bigint
$$;
REVOKE ALL ON FUNCTION public.panda_agent_research_reservation(text) FROM PUBLIC,anon,authenticated;

-- Fences: one request id belongs to exactly one journal.
CREATE FUNCTION public.panda_agent_research_insert_fence() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM public.panda_agent_direct_turns WHERE thread_id=NEW.thread_id AND request_id=NEW.request_id)
 OR EXISTS(SELECT 1 FROM public.panda_agent_llm_turns WHERE thread_id=NEW.thread_id AND request_id=NEW.request_id)
 OR EXISTS(SELECT 1 FROM public.panda_agent_native_runs WHERE thread_id=NEW.thread_id AND request_id=NEW.request_id)
 THEN PERFORM public.phase3_fail('conflict'); END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.panda_agent_research_insert_fence() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER panda_agent_research_insert_fence BEFORE INSERT ON public.panda_agent_research_turns FOR EACH ROW EXECUTE FUNCTION public.panda_agent_research_insert_fence();

CREATE FUNCTION public.panda_agent_direct_research_fence() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM public.panda_agent_research_turns WHERE thread_id=NEW.thread_id AND request_id=NEW.request_id) THEN PERFORM public.phase3_fail('conflict'); END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.panda_agent_direct_research_fence() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER panda_agent_direct_research_fence BEFORE INSERT ON public.panda_agent_direct_turns FOR EACH ROW EXECUTE FUNCTION public.panda_agent_direct_research_fence();

-- A research-owned chat turn may only complete with its own verified terminal response.
CREATE FUNCTION public.panda_agent_research_write_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE r public.panda_agent_research_turns;
BEGIN
 SELECT * INTO r FROM public.panda_agent_research_turns WHERE thread_id=NEW.thread_id AND request_id=NEW.request_id;
 IF FOUND AND (NOT r.terminal OR NEW.status<>'complete' OR r.response_hash IS DISTINCT FROM encode(sha256(convert_to(NEW.response::text,'UTF8')),'hex')) THEN PERFORM public.phase3_fail('conflict'); END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.panda_agent_research_write_guard() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER panda_agent_research_write_guard BEFORE UPDATE OF response,status ON public.panda_agent_chat_turns FOR EACH ROW EXECUTE FUNCTION public.panda_agent_research_write_guard();

-- Exact research answer shape. Quote/answer containment is verified on the host and bound by the result MAC (checked by the app).
CREATE FUNCTION public.panda_agent_research_answer_valid(a jsonb) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog AS $$
DECLARE c jsonb; n integer; i integer:=0;
BEGIN
 IF jsonb_typeof(a) IS DISTINCT FROM 'object' OR NOT a?&ARRAY['outcome','text','citations'] OR (a-ARRAY['outcome','text','citations'])<>'{}'::jsonb
 OR jsonb_typeof(a->'outcome') IS DISTINCT FROM 'string'
 OR jsonb_typeof(a->'text') IS DISTINCT FROM 'string' OR length(btrim(a->>'text')) NOT BETWEEN 1 AND 8000 OR octet_length(a::text)>24000
 OR jsonb_typeof(a->'citations') IS DISTINCT FROM 'array' THEN RETURN false; END IF;
 n:=jsonb_array_length(a->'citations');
 IF NOT coalesce((a->>'outcome'='evidence' AND n BETWEEN 1 AND 2) OR (a->>'outcome'='insufficient' AND n=0),false) THEN RETURN false; END IF;
 FOR c IN SELECT value FROM jsonb_array_elements(a->'citations') LOOP
  i:=i+1;
  IF jsonb_typeof(c) IS DISTINCT FROM 'object' OR NOT c?&ARRAY['id','title','sourceUrl','capturedAt','quote','sectionPath']
  OR (c-ARRAY['id','title','sourceUrl','capturedAt','quote','sectionPath'])<>'{}'::jsonb
  OR c->>'id' IS DISTINCT FROM 'S'||i
  OR jsonb_typeof(c->'title') IS DISTINCT FROM 'string' OR length(btrim(c->>'title')) NOT BETWEEN 1 AND 300
  OR jsonb_typeof(c->'sourceUrl') IS DISTINCT FROM 'string' OR length(c->>'sourceUrl')>2048 OR c->>'sourceUrl' !~ '^https?://[^[:space:]]+$'
  OR jsonb_typeof(c->'capturedAt') IS DISTINCT FROM 'string' OR c->>'capturedAt' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]{1,9})?(Z|[+-][0-9]{2}:[0-9]{2})$'
  OR jsonb_typeof(c->'quote') IS DISTINCT FROM 'string' OR length(btrim(c->>'quote')) NOT BETWEEN 1 AND 180
  OR c->'sectionPath' IS DISTINCT FROM '[]'::jsonb THEN RETURN false; END IF;
 END LOOP;
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.panda_agent_research_answer_valid(jsonb) FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.panda_agent_research_usage_valid(u jsonb,p_reserved bigint,p_zero boolean) RETURNS boolean
LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $$
 SELECT jsonb_typeof(u)='object' AND u?&ARRAY['calls','inputTokens','outputTokens','costNanoUsd'] AND (u-ARRAY['calls','inputTokens','outputTokens','costNanoUsd'])='{}'::jsonb
  AND NOT EXISTS(SELECT 1 FROM jsonb_each(u) x WHERE jsonb_typeof(x.value)<>'number' OR x.value::text !~ '^[0-9]{1,10}$')
  AND (u->>'calls')::bigint BETWEEN (CASE WHEN p_zero THEN 0 ELSE 1 END) AND 6 AND (u->>'inputTokens')::bigint<=192000 AND (u->>'outputTokens')::bigint<=4200
  AND (u->>'costNanoUsd')::bigint<=coalesce(p_reserved,0)
$$;
REVOKE ALL ON FUNCTION public.panda_agent_research_usage_valid(jsonb,bigint,boolean) FROM PUBLIC,anon,authenticated;

-- Read overlay: restores verified research answers (the base layer blanks turns without product/scope); other turns are untouched.
ALTER FUNCTION public.panda_agent_lightweight_read(uuid) RENAME TO panda_agent_lightweight_read_before_research;
REVOKE ALL ON FUNCTION public.panda_agent_lightweight_read_before_research(uuid) FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.panda_agent_lightweight_read(p_thread uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE r jsonb; x record; ms jsonb; ts jsonb; valid boolean; answer jsonb;
BEGIN
 r:=public.panda_agent_lightweight_read_before_research(p_thread);ms:=r->'messages';ts:=r->'turns';
 IF r IS NULL OR jsonb_typeof(ms) IS DISTINCT FROM 'array' OR jsonb_typeof(ts) IS DISTINCT FROM 'array' THEN RETURN r; END IF;
 FOR x IN SELECT t.*,d.owner_subject,d.terminal,d.answer_hash,d.response_hash,d.failed,d.cancelled,m.approved_response_hash
 FROM public.panda_agent_research_turns d JOIN public.panda_agent_chat_turns t USING(thread_id,request_id)
 JOIN public.panda_agent_lightweight_turns m USING(thread_id,request_id)
 WHERE d.thread_id=p_thread AND t.status='complete' LOOP
  valid:=x.owner_subject=public.requesting_user_id() AND x.terminal AND x.response_hash=x.approved_response_hash
   AND x.response_hash=encode(sha256(convert_to(x.response::text,'UTF8')),'hex')
   AND (x.cancelled OR x.failed OR (x.answer_hash=x.response_hash AND public.panda_agent_research_answer_valid(x.response)));
  answer:=CASE WHEN valid THEN x.response ELSE jsonb_build_object('outcome','insufficient','text','This saved answer is unavailable because its source or verification is no longer current.','citations','[]'::jsonb) END;
  SELECT jsonb_agg(CASE WHEN z.item->>'id'=x.assistant_message_id::text THEN z.item||jsonb_build_object('text',answer->>'text','citations',answer->'citations') ELSE z.item END ORDER BY z.ord) INTO ms FROM jsonb_array_elements(ms) WITH ORDINALITY z(item,ord);
  SELECT jsonb_agg(CASE WHEN z.item->>'requestId'=x.request_id::text THEN z.item||jsonb_build_object('response',answer) ELSE z.item END ORDER BY z.ord) INTO ts FROM jsonb_array_elements(ts) WITH ORDINALITY z(item,ord);
 END LOOP;
 RETURN r||jsonb_build_object('messages',coalesce(ms,'[]'::jsonb),'turns',coalesce(ts,'[]'::jsonb));
END $$;
REVOKE ALL ON FUNCTION public.panda_agent_lightweight_read(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.panda_agent_lightweight_read(uuid) TO authenticated;

CREATE FUNCTION public.panda_agent_research_chat_v1(p_payload text,p_mac text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE v jsonb; op text; tid uuid; rid uuid; d public.panda_agent_research_turns; t public.panda_agent_chat_turns; result jsonb; a jsonb; u jsonb;
 digest text; reservation bigint; today date; release boolean:=false; charged bigint;
BEGIN
 v:=public.panda_agent_llm_verify(p_payload,p_mac,'research_chat');
 PERFORM public.panda_agent_control_room_admin();
 op:=v->>'op';
 IF op IS NULL OR op NOT IN ('begin','state','claim','receipt','finish','fail','cancel') OR NOT v?&ARRAY['op','thread','request']
 OR jsonb_typeof(v->'thread') IS DISTINCT FROM 'string' OR jsonb_typeof(v->'request') IS DISTINCT FROM 'string' THEN PERFORM public.phase3_fail('invalid'); END IF;
 tid:=(v->>'thread')::uuid;rid:=(v->>'request')::uuid;
 IF op='begin' THEN
  IF (v-ARRAY['op','thread','request','question','profile'])<>'{}'::jsonb OR jsonb_typeof(v->'question') IS DISTINCT FROM 'string'
  OR public.panda_agent_research_reservation(v->>'profile') IS NULL THEN PERFORM public.phase3_fail('invalid'); END IF;
  result:=public.panda_agent_chat_begin_v2(tid,rid,v->>'question',false);
  IF (result->>'admitted')::boolean THEN
   INSERT INTO public.panda_agent_lightweight_turns(thread_id,request_id,owner_subject) VALUES(tid,rid,public.requesting_user_id());
   INSERT INTO public.panda_agent_research_turns(thread_id,request_id,owner_subject,profile) VALUES(tid,rid,public.requesting_user_id(),v->>'profile');
  ELSIF NOT EXISTS(SELECT 1 FROM public.panda_agent_research_turns WHERE thread_id=tid AND request_id=rid AND owner_subject=public.requesting_user_id() AND profile=v->>'profile') THEN
   PERFORM public.phase3_fail('conflict');
  END IF;
  RETURN public.panda_agent_lightweight_read(tid)||jsonb_build_object('admitted',result->'admitted');
 END IF;
 IF (op IN ('state','cancel') AND (v-ARRAY['op','thread','request'])<>'{}'::jsonb)
 OR (op='claim' AND (NOT v?&ARRAY['promptHash','runId'] OR (v-ARRAY['op','thread','request','promptHash','runId'])<>'{}'::jsonb
   OR coalesce(v->>'promptHash','') !~ '^[a-f0-9]{64}$' OR coalesce(v->>'runId','') !~ '^[a-f0-9]{64}$'))
 OR (op='receipt' AND (NOT v?&ARRAY['promptHash','runId','answer','usage'] OR (v-ARRAY['op','thread','request','promptHash','runId','answer','usage'])<>'{}'::jsonb))
 OR (op='finish' AND (NOT v?'answer' OR (v-ARRAY['op','thread','request','answer'])<>'{}'::jsonb))
 OR (op='fail' AND (NOT v?&ARRAY['reason','usage'] OR (v-ARRAY['op','thread','request','reason','usage'])<>'{}'::jsonb
   OR coalesce(v->>'reason','') NOT IN ('busy','attestation_expired','tool_not_ready','invalid','budget')))
 THEN PERFORM public.phase3_fail('invalid'); END IF;
 PERFORM 1 FROM public.panda_agent_chats WHERE id=tid AND owner_subject=public.requesting_user_id() AND archived_at IS NULL FOR UPDATE;
 IF NOT FOUND THEN PERFORM public.phase3_fail('not_found'); END IF;
 SELECT * INTO d FROM public.panda_agent_research_turns WHERE thread_id=tid AND request_id=rid AND owner_subject=public.requesting_user_id() FOR UPDATE;
 IF NOT FOUND THEN IF op='state' THEN RETURN 'null'::jsonb; END IF; PERFORM public.phase3_fail('not_found'); END IF;
 SELECT * INTO t FROM public.panda_agent_chat_turns WHERE thread_id=tid AND request_id=rid FOR UPDATE;
 IF NOT FOUND THEN PERFORM public.phase3_fail('not_found'); END IF;
 IF op='state' THEN
  RETURN jsonb_build_object('question',t.question,'status',t.status,'claimed',d.claimed,'cancelled',d.cancelled,'failed',d.failed,
   'unknown',public.panda_agent_research_unknown(d.claimed,d.terminal,d.claimed_at),'profile',d.profile);
 END IF;
 IF op='cancel' AND d.terminal THEN RETURN public.panda_agent_lightweight_read(tid); END IF;
 IF op='finish' AND d.terminal AND NOT d.cancelled AND NOT d.failed AND d.response_hash=encode(sha256(convert_to((v->'answer')::text,'UTF8')),'hex') THEN RETURN public.panda_agent_lightweight_read(tid); END IF;
 IF op='receipt' AND d.usage IS NOT NULL AND NOT d.failed THEN
  IF d.prompt_hash IS DISTINCT FROM v->>'promptHash' OR d.run_id IS DISTINCT FROM v->>'runId' OR d.usage IS DISTINCT FROM v->'usage' OR d.answer_hash IS DISTINCT FROM encode(sha256(convert_to((v->'answer')::text,'UTF8')),'hex') THEN PERFORM public.phase3_fail('conflict'); END IF;
  RETURN jsonb_build_object('recorded',false);
 END IF;
 IF d.terminal OR t.status<>'pending' OR (p_payload::jsonb->>'exp')::bigint<extract(epoch FROM clock_timestamp())
 -- A turn already receipted cannot also fail; a result arriving after the turn became unknown is never saved late.
 OR (op='fail' AND d.usage IS NOT NULL) OR (op IN ('receipt','finish') AND public.panda_agent_research_unknown(d.claimed,d.terminal,d.claimed_at))
 THEN PERFORM public.phase3_fail('conflict'); END IF;
 IF op='claim' THEN
  IF d.claimed THEN RETURN jsonb_build_object('execute',false); END IF;
  reservation:=public.panda_agent_research_reservation(d.profile);today:=(clock_timestamp() AT TIME ZONE 'UTC')::date;
  INSERT INTO public.panda_agent_research_daily(owner_subject,day) VALUES(d.owner_subject,today) ON CONFLICT DO NOTHING;
  UPDATE public.panda_agent_research_daily SET reserved_nano_usd=reserved_nano_usd+reservation
   WHERE owner_subject=d.owner_subject AND day=today AND reserved_nano_usd+charged_nano_usd+reservation<=1000000000;
  IF NOT FOUND THEN RETURN jsonb_build_object('execute',false,'reason','budget'); END IF;
  UPDATE public.panda_agent_research_turns SET claimed=true,claimed_at=clock_timestamp(),claim_day=today,prompt_hash=v->>'promptHash',run_id=v->>'runId',reserved_nano_usd=reservation
   WHERE thread_id=tid AND request_id=rid;
  RETURN jsonb_build_object('execute',true);
 ELSIF op='receipt' THEN
  u:=v->'usage';a:=v->'answer';
  IF NOT d.claimed OR d.prompt_hash IS DISTINCT FROM v->>'promptHash' OR d.run_id IS DISTINCT FROM v->>'runId' THEN PERFORM public.phase3_fail('conflict'); END IF;
  IF NOT public.panda_agent_research_answer_valid(a) OR NOT public.panda_agent_research_usage_valid(u,d.reserved_nano_usd,false) THEN PERFORM public.phase3_fail('invalid'); END IF;
  digest:=encode(sha256(convert_to(a::text,'UTF8')),'hex');charged:=least((u->>'costNanoUsd')::bigint,d.reserved_nano_usd);
  UPDATE public.panda_agent_research_daily SET reserved_nano_usd=reserved_nano_usd-d.reserved_nano_usd,charged_nano_usd=charged_nano_usd+charged
   WHERE owner_subject=d.owner_subject AND day=d.claim_day;
  UPDATE public.panda_agent_research_turns SET usage=u,answer_hash=digest WHERE thread_id=tid AND request_id=rid;
  RETURN jsonb_build_object('recorded',true);
 END IF;
 IF op='cancel' THEN
  a:=jsonb_build_object('outcome','insufficient','text',CASE WHEN d.claimed THEN 'Stopped waiting. The provider may still process the request. No late answer will be saved.' ELSE 'Stopped before a model request was sent.' END,'citations','[]'::jsonb);
 ELSIF op='fail' THEN
  u:=v->'usage';
  IF NOT public.panda_agent_research_usage_valid(u,coalesce(d.reserved_nano_usd,0),true) OR (NOT d.claimed AND u<>'{"calls":0,"inputTokens":0,"outputTokens":0,"costNanoUsd":0}'::jsonb) THEN PERFORM public.phase3_fail('invalid'); END IF;
  a:=jsonb_build_object('outcome','insufficient','text',CASE v->>'reason'
   WHEN 'busy' THEN 'The research agent is busy with another request. Please try again shortly.'
   WHEN 'attestation_expired' THEN 'The research agent is paused until its privacy review is renewed.'
   WHEN 'tool_not_ready' THEN 'The research agent could not start its search tool. Please try again.'
   WHEN 'budget' THEN 'Today''s research budget is used up. Please try again tomorrow.'
   ELSE 'The research agent returned an answer that could not be verified, so it was not saved.' END,'citations','[]'::jsonb);
  release:=d.claimed AND u='{"calls":0,"inputTokens":0,"outputTokens":0,"costNanoUsd":0}'::jsonb;
  -- Only a claimed failure with proven zero provider calls releases its reservation; otherwise it stays counted, like an unknown turn.
  IF release THEN
   UPDATE public.panda_agent_research_daily SET reserved_nano_usd=reserved_nano_usd-d.reserved_nano_usd WHERE owner_subject=d.owner_subject AND day=d.claim_day;
  END IF;
 ELSE
  a:=v->'answer';
  IF NOT d.claimed OR d.usage IS NULL OR d.answer_hash IS DISTINCT FROM encode(sha256(convert_to(a::text,'UTF8')),'hex') THEN PERFORM public.phase3_fail('conflict'); END IF;
 END IF;
 digest:=encode(sha256(convert_to(a::text,'UTF8')),'hex');
 UPDATE public.panda_agent_research_turns SET terminal=true,cancelled=(op='cancel'),failed=(op='fail'),response_hash=digest,
  usage=CASE WHEN op='fail' AND d.claimed THEN u ELSE usage END WHERE thread_id=tid AND request_id=rid;
 UPDATE public.panda_agent_lightweight_turns SET approved_response_hash=digest,cancelled_at=CASE WHEN op='cancel' THEN clock_timestamp() ELSE NULL END
  WHERE thread_id=tid AND request_id=rid AND owner_subject=d.owner_subject;
 UPDATE public.panda_agent_chat_turns SET response=a,status='complete',completed_at=clock_timestamp() WHERE thread_id=tid AND request_id=rid;
 UPDATE public.panda_agent_chats SET updated_at=clock_timestamp() WHERE id=tid;
 RETURN public.panda_agent_lightweight_read(tid);
END $$;
REVOKE ALL ON FUNCTION public.panda_agent_research_chat_v1(text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.panda_agent_research_chat_v1(text,text) TO authenticated;
