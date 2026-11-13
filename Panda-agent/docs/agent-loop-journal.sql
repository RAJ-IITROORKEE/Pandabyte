-- DRAFT FOR OWNER REVIEW. NOT APPLIED. Do not copy into migrations/ or run until reviewed.
-- Agent-loop journal (13 Nov 2026): one turn = up to 6 model calls (one claim before the first call, one summed
-- receipt), an answer whose citations may span up to 3 PandaByte products, plus uncited general guidance.
-- Why a new journal: panda_agent_direct_chat accepts only outcome 'conversation' with zero citations and per-call
-- usage (<= 8024 input tokens); panda_agent_basic_rag_complete accepts citations from the single product prepared
-- for the turn. Neither can hold a multi-step, multi-product answer without lying about usage or provenance.
-- Scope: Admin (unmetered) turns only, like PANDA_AGENT_MAIN_CHAT_UNCAPPED. Metered users need a budget reservation
-- sized for six calls before this is opened to them.
-- Rollback, step 1: set PANDA_AGENT_LOOP_ENABLED off. Code stops starting loop turns; saved loop turns still read
-- through the wrapper below. Existing direct, RAG and research journals are unchanged.
-- Rollback, step 2 (full removal, one transaction; saved loop answers then read as unavailable, other turns unchanged):
--   BEGIN;
--   DROP TRIGGER panda_agent_loop_write_guard ON public.panda_agent_chat_turns;
--   DROP FUNCTION public.panda_agent_loop_write_guard();
--   DROP FUNCTION public.panda_agent_loop_chat_v1(text,text);
--   DROP FUNCTION public.panda_agent_lightweight_read(uuid);
--   ALTER FUNCTION public.panda_agent_lightweight_read_before_loop(uuid) RENAME TO panda_agent_lightweight_read;
--   REVOKE ALL ON FUNCTION public.panda_agent_lightweight_read(uuid) FROM PUBLIC,anon;
--   GRANT EXECUTE ON FUNCTION public.panda_agent_lightweight_read(uuid) TO authenticated;
--   DROP FUNCTION public.panda_agent_loop_citations_current(jsonb);
--   DROP TABLE public.panda_agent_loop_turns;
--   COMMIT;

CREATE TABLE public.panda_agent_loop_turns (
 thread_id uuid NOT NULL, request_id uuid NOT NULL, owner_subject text NOT NULL,
 claimed boolean NOT NULL DEFAULT false, terminal boolean NOT NULL DEFAULT false, cancelled boolean NOT NULL DEFAULT false,
 body_hash text CHECK(body_hash ~ '^[a-f0-9]{64}$'), answer_hash text CHECK(answer_hash ~ '^[a-f0-9]{64}$'),
 usage jsonb, response_hash text CHECK(response_hash ~ '^[a-f0-9]{64}$'),
 PRIMARY KEY(thread_id,request_id), UNIQUE(owner_subject,request_id),
 FOREIGN KEY(thread_id,request_id) REFERENCES public.panda_agent_lightweight_turns(thread_id,request_id) ON DELETE CASCADE,
 CHECK(claimed=(body_hash IS NOT NULL)), CHECK((usage IS NULL)=(answer_hash IS NULL)), CHECK(usage IS NULL OR claimed),
 CHECK(terminal=(response_hash IS NOT NULL)), CHECK(NOT cancelled OR terminal)
);
ALTER TABLE public.panda_agent_loop_turns ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.panda_agent_loop_turns FROM PUBLIC,anon,authenticated;

-- Every citation must be an exact quote of a current eligible chunk of the catalog product it names (title and page),
-- checked one citation at a time by the existing single-product proof. At most 4 citations from at most 3 products.
CREATE FUNCTION public.panda_agent_loop_citations_current(p_answer jsonb) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE c jsonb; product uuid; products uuid[]:='{}';
BEGIN
 IF jsonb_typeof(p_answer->'citations') IS DISTINCT FROM 'array' OR jsonb_array_length(p_answer->'citations')>4 THEN RETURN false; END IF;
 IF jsonb_array_length(p_answer->'citations')=0 THEN RETURN coalesce(p_answer->>'outcome' IN ('conversation','clarification','insufficient'),false); END IF;
 IF p_answer->>'outcome' IS DISTINCT FROM 'evidence' THEN RETURN false; END IF;
 IF (SELECT count(DISTINCT x->>'id') FROM jsonb_array_elements(p_answer->'citations') x)<>jsonb_array_length(p_answer->'citations') THEN RETURN false; END IF;
 FOR c IN SELECT value FROM jsonb_array_elements(p_answer->'citations') LOOP
  -- The exact shape the loop emits (src/agent-loop/tools.ts): S1..S4, string quote, no extra keys.
  IF jsonb_typeof(c) IS DISTINCT FROM 'object' OR NOT c ?& ARRAY['id','title','sourceUrl','quote','sectionPath','capturedAt']
  OR (SELECT count(*) FROM jsonb_object_keys(c))<>6 OR jsonb_typeof(c->'id') IS DISTINCT FROM 'string' OR coalesce(c->>'id','') !~ '^S[1-4]$'
  OR jsonb_typeof(c->'title') IS DISTINCT FROM 'string' OR jsonb_typeof(c->'sourceUrl') IS DISTINCT FROM 'string'
  OR jsonb_typeof(c->'sectionPath') IS DISTINCT FROM 'array' OR jsonb_typeof(c->'capturedAt') IS DISTINCT FROM 'string'
  OR jsonb_typeof(c->'quote') IS DISTINCT FROM 'string' OR length(btrim(c->>'quote')) NOT BETWEEN 1 AND 600 THEN RETURN false; END IF;
  SELECT (p->>'id')::uuid INTO product FROM jsonb_array_elements(public.panda_agent_runtime_products()->'items') p
   WHERE p->>'sourceUrl'=c->>'sourceUrl' AND p->>'title'=c->>'title';
  IF product IS NULL OR public.panda_agent_lightweight_citations_current(jsonb_build_object('outcome','evidence','text','x','citations',jsonb_build_array(c)),product) IS NOT TRUE THEN RETURN false; END IF;
  IF NOT product=ANY(products) THEN products:=products||product; END IF;
  product:=NULL;
 END LOOP;
 RETURN cardinality(products)<=3;
EXCEPTION WHEN OTHERS THEN RETURN false;
END $$;
REVOKE ALL ON FUNCTION public.panda_agent_loop_citations_current(jsonb) FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.panda_agent_loop_write_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE d public.panda_agent_loop_turns;
BEGIN
 SELECT * INTO d FROM public.panda_agent_loop_turns WHERE thread_id=NEW.thread_id AND request_id=NEW.request_id;
 IF FOUND AND (NOT d.terminal OR NEW.status<>'complete' OR d.response_hash IS DISTINCT FROM encode(sha256(convert_to(NEW.response::text,'UTF8')),'hex')) THEN PERFORM public.phase3_fail('conflict'); END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.panda_agent_loop_write_guard() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER panda_agent_loop_write_guard BEFORE UPDATE OF response,status ON public.panda_agent_chat_turns FOR EACH ROW EXECUTE FUNCTION public.panda_agent_loop_write_guard();

-- Ops: begin, state, claim_unmetered, receipt_unmetered, finish, cancel. Signed with the same HMAC as direct chat (action 'loop_chat').
CREATE FUNCTION public.panda_agent_loop_chat_v1(p_payload text,p_mac text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE v jsonb; op text; tid uuid; rid uuid; d public.panda_agent_loop_turns; t public.panda_agent_chat_turns; u jsonb; a jsonb; digest text; result jsonb;
BEGIN
 v:=public.panda_agent_llm_verify(p_payload,p_mac,'loop_chat');op:=v->>'op';
 IF op IS NULL OR op NOT IN ('begin','state','claim_unmetered','receipt_unmetered','finish','cancel') OR NOT v?&ARRAY['op','thread','request']
  OR jsonb_typeof(v->'thread') IS DISTINCT FROM 'string' OR jsonb_typeof(v->'request') IS DISTINCT FROM 'string' THEN PERFORM public.phase3_fail('invalid'); END IF;
 tid:=(v->>'thread')::uuid;rid:=(v->>'request')::uuid;
 IF op='begin' THEN
  IF (v-ARRAY['op','thread','request','question'])<>'{}'::jsonb OR jsonb_typeof(v->'question') IS DISTINCT FROM 'string' THEN PERFORM public.phase3_fail('invalid'); END IF;
  PERFORM public.panda_agent_control_room_admin();
  result:=public.panda_agent_chat_begin_v2(tid,rid,v->>'question',false);
  IF (result->>'admitted')::boolean THEN
   INSERT INTO public.panda_agent_lightweight_turns(thread_id,request_id,owner_subject) VALUES(tid,rid,public.requesting_user_id());
   INSERT INTO public.panda_agent_loop_turns(thread_id,request_id,owner_subject) VALUES(tid,rid,public.requesting_user_id());
  ELSIF NOT EXISTS(SELECT 1 FROM public.panda_agent_loop_turns WHERE thread_id=tid AND request_id=rid AND owner_subject=public.requesting_user_id()) THEN PERFORM public.phase3_fail('conflict'); END IF;
  RETURN public.panda_agent_lightweight_read(tid)||jsonb_build_object('admitted',result->'admitted');
 END IF;
 IF (op IN ('state','cancel') AND (v-ARRAY['op','thread','request'])<>'{}'::jsonb)
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
 IF op IN ('claim_unmetered','receipt_unmetered','finish') THEN PERFORM public.panda_agent_control_room_admin(); END IF;
 IF op='claim_unmetered' THEN
  IF d.claimed THEN RETURN jsonb_build_object('execute',false); END IF;
  UPDATE public.panda_agent_loop_turns SET claimed=true,body_hash=v->>'bodyHash' WHERE thread_id=tid AND request_id=rid;
  RETURN jsonb_build_object('execute',true);
 END IF;
 IF op='receipt_unmetered' THEN
  u:=v->'usage';a:=v->'answer';
  -- Six calls of at most 24,000 input and 3,000 output tokens; cost is the worst reviewed model (Qwen 3.8 27B) for six calls, rounded up.
  IF NOT d.claimed OR d.body_hash IS DISTINCT FROM v->>'bodyHash'
   OR jsonb_typeof(a) IS DISTINCT FROM 'object' OR NOT a?&ARRAY['outcome','text','citations'] OR (a-ARRAY['outcome','text','citations'])<>'{}'::jsonb
   OR coalesce(a->>'outcome','') NOT IN ('evidence','conversation','clarification','insufficient')
   OR jsonb_typeof(a->'text') IS DISTINCT FROM 'string' OR length(btrim(a->>'text')) NOT BETWEEN 1 AND 8000 OR octet_length(a::text)>24000
   OR jsonb_typeof(u) IS DISTINCT FROM 'object' OR NOT u?&ARRAY['inputTokens','outputTokens','costNanoUsd','steps'] OR (u-ARRAY['inputTokens','outputTokens','costNanoUsd','steps'])<>'{}'::jsonb
   OR EXISTS(SELECT 1 FROM jsonb_each(u) x WHERE jsonb_typeof(x.value) IS DISTINCT FROM 'number' OR x.value::text !~ '^[0-9]{1,9}$')
   OR (u->>'inputTokens')::bigint>144000 OR (u->>'outputTokens')::bigint>18000 OR (u->>'costNanoUsd')::bigint>56000000
   OR (u->>'steps')::int NOT BETWEEN 1 AND 6
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

-- Read: earlier wrappers mask loop turns (no single prepared product). Re-derive them from the raw turn, the approved
-- hashes and a fresh per-citation source check; a citation whose source changed shows the standard unavailable text.
ALTER FUNCTION public.panda_agent_lightweight_read(uuid) RENAME TO panda_agent_lightweight_read_before_loop;
REVOKE ALL ON FUNCTION public.panda_agent_lightweight_read_before_loop(uuid) FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.panda_agent_lightweight_read(p_thread uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE r jsonb; x record; ms jsonb; ts jsonb; valid boolean; answer jsonb;
BEGIN
 r:=public.panda_agent_lightweight_read_before_loop(p_thread);ms:=r->'messages';ts:=r->'turns';
 IF r IS NULL OR jsonb_typeof(ms) IS DISTINCT FROM 'array' OR jsonb_typeof(ts) IS DISTINCT FROM 'array' THEN RETURN r; END IF;
 FOR x IN SELECT t.*,d.owner_subject,d.terminal,d.cancelled,d.answer_hash,d.usage,d.response_hash,m.approved_response_hash
 FROM public.panda_agent_loop_turns d JOIN public.panda_agent_chat_turns t USING(thread_id,request_id)
 JOIN public.panda_agent_lightweight_turns m USING(thread_id,request_id)
 WHERE d.thread_id=p_thread AND t.status='complete' LOOP
  valid:=x.owner_subject=public.requesting_user_id() AND x.terminal AND x.response_hash=x.approved_response_hash
   AND x.response_hash=encode(sha256(convert_to(x.response::text,'UTF8')),'hex')
   AND (x.cancelled OR (x.usage IS NOT NULL AND x.answer_hash=x.response_hash AND public.panda_agent_loop_citations_current(x.response) IS TRUE));
  answer:=CASE WHEN valid THEN x.response ELSE jsonb_build_object('outcome','insufficient','text','This saved answer is unavailable because its source or verification is no longer current.','citations','[]'::jsonb) END;
  SELECT jsonb_agg(CASE WHEN z.item->>'id'=x.assistant_message_id::text THEN z.item||jsonb_build_object('text',answer->>'text','citations',answer->'citations') ELSE z.item END ORDER BY z.ord) INTO ms FROM jsonb_array_elements(ms) WITH ORDINALITY z(item,ord);
  SELECT jsonb_agg(CASE WHEN z.item->>'requestId'=x.request_id::text THEN z.item||jsonb_build_object('response',answer) ELSE z.item END ORDER BY z.ord) INTO ts FROM jsonb_array_elements(ts) WITH ORDINALITY z(item,ord);
 END LOOP;
 RETURN r||jsonb_build_object('messages',coalesce(ms,'[]'::jsonb),'turns',coalesce(ts,'[]'::jsonb));
END $$;
REVOKE ALL ON FUNCTION public.panda_agent_lightweight_read(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.panda_agent_lightweight_read(uuid) TO authenticated;
