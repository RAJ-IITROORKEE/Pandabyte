-- Forward-only cancellation fence; preserve sources, histories and prior execution metadata.
ALTER TABLE public.panda_agent_lightweight_turns ADD COLUMN cancelled_at timestamptz;

CREATE TABLE public.panda_agent_lightweight_cancelled_requests (
 owner_subject text NOT NULL CHECK(length(owner_subject) BETWEEN 1 AND 512),
 request_id uuid NOT NULL,
 thread_id uuid NOT NULL REFERENCES public.panda_agent_chats(id) ON DELETE CASCADE,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(owner_subject,request_id)
);
ALTER TABLE public.panda_agent_lightweight_cancelled_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.panda_agent_lightweight_cancelled_requests FROM PUBLIC,anon,authenticated;
CREATE INDEX panda_agent_cancelled_requests_thread ON public.panda_agent_lightweight_cancelled_requests(thread_id);

CREATE FUNCTION public.panda_agent_lightweight_admission_guard(p_thread uuid,p_request uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
BEGIN
 IF public.requesting_user_id() IS NULL THEN PERFORM public.phase3_fail('unauthenticated'); END IF;
 PERFORM 1 FROM public.panda_agent_chats WHERE id=p_thread AND owner_subject=public.requesting_user_id() AND archived_at IS NULL FOR UPDATE;
 IF NOT FOUND THEN PERFORM public.phase3_fail('not_found'); END IF;
 IF EXISTS(SELECT 1 FROM public.panda_agent_lightweight_cancelled_requests WHERE owner_subject=public.requesting_user_id() AND request_id=p_request) THEN PERFORM public.phase3_fail('conflict'); END IF;
 IF NOT EXISTS(SELECT 1 FROM public.panda_agent_chat_turns WHERE thread_id=p_thread AND request_id=p_request)
 AND (SELECT count(*) FROM (SELECT request_id FROM public.panda_agent_chat_turns WHERE thread_id=p_thread UNION SELECT request_id FROM public.panda_agent_lightweight_cancelled_requests WHERE thread_id=p_thread) q)>=100 THEN PERFORM public.phase3_fail('quota'); END IF;
END $$;
REVOKE ALL ON FUNCTION public.panda_agent_lightweight_admission_guard(uuid,uuid) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.panda_agent_chat_begin(p_thread uuid,p_request uuid,p_question text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE result jsonb; safe_turn jsonb;
BEGIN
 PERFORM public.panda_agent_lightweight_admission_guard(p_thread,p_request);
 result:=public.panda_agent_chat_begin_before_lightweight(p_thread,p_request,p_question);
 SELECT x INTO safe_turn FROM jsonb_array_elements(result->'turns') x WHERE x->>'requestId'=p_request::text;
 RETURN jsonb_set(result,'{turn,response}',coalesce(safe_turn->'response','null'::jsonb));
END $$;


CREATE OR REPLACE FUNCTION public.panda_agent_lightweight_verify(p_payload text,p_mac text,p_action text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE v jsonb; expected text; a text:=public.requesting_user_id(); fields text[];
BEGIN
 IF a IS NULL THEN PERFORM public.phase3_fail('unauthenticated'); END IF;
 IF p_payload IS NULL OR octet_length(p_payload)>32768 OR p_mac IS NULL OR p_mac !~ '^[a-f0-9]{64}$' THEN PERFORM public.phase3_fail('invalid'); END IF;
 SELECT encode(public.hmac(convert_to('panda-lightweight-db-v1'||chr(10)||p_payload,'UTF8'),key_bytes,'sha256'),'hex') INTO expected FROM public.panda_agent_lightweight_key WHERE singleton;
 IF expected IS NULL OR sha256(decode(expected,'hex'))<>sha256(decode(p_mac,'hex')) THEN PERFORM public.phase3_fail('unauthenticated'); END IF;
 v:=p_payload::jsonb;
 fields:=CASE p_action WHEN 'begin' THEN ARRAY['v','action','subject','exp','thread','request','question'] WHEN 'prepare' THEN ARRAY['v','action','subject','exp','thread','request','question','product','sku','scopeHash','digest'] WHEN 'complete' THEN ARRAY['v','action','subject','exp','thread','request','answer'] WHEN 'cancel' THEN ARRAY['v','action','subject','exp','thread','request','digest'] END;
 IF fields IS NULL OR jsonb_typeof(v) IS DISTINCT FROM 'object' THEN PERFORM public.phase3_fail('invalid'); END IF;
 IF NOT v ?& fields OR (SELECT count(*) FROM jsonb_object_keys(v))<>cardinality(fields)
 OR v->'v' IS DISTINCT FROM '1'::jsonb OR v->>'action' IS DISTINCT FROM p_action OR v->>'subject' IS DISTINCT FROM a
 OR jsonb_typeof(v->'exp') IS DISTINCT FROM 'number' OR coalesce(v->>'exp','') !~ '^[0-9]{1,11}$' THEN PERFORM public.phase3_fail('invalid'); END IF;
 IF (v->>'exp')::bigint<extract(epoch FROM clock_timestamp())
 OR (v->>'exp')::bigint>extract(epoch FROM clock_timestamp())+65 THEN PERFORM public.phase3_fail('unauthenticated'); END IF;
 RETURN v;
END $$;

CREATE OR REPLACE FUNCTION public.panda_agent_lightweight_read(p_thread uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE result jsonb; t public.panda_agent_chat_turns; m public.panda_agent_lightweight_turns; product uuid; allowed boolean; replacement jsonb; ms jsonb; ts jsonb;
BEGIN
 PERFORM 1 FROM public.panda_agent_chats WHERE id=p_thread AND owner_subject=public.requesting_user_id() FOR SHARE;
 IF NOT FOUND THEN PERFORM public.phase3_fail('not_found'); END IF;
 result:=public.panda_agent_chat_read_before_lightweight(p_thread); -- Private owner-checked raw projection.
 ms:=result->'messages'; ts:=result->'turns';
 FOR t IN SELECT * FROM public.panda_agent_chat_turns WHERE thread_id=p_thread AND status='complete' ORDER BY created_at,request_id LOOP
  allowed:=true; product:=NULL;
  SELECT * INTO m FROM public.panda_agent_lightweight_turns WHERE thread_id=p_thread AND request_id=t.request_id;
  IF FOUND THEN
   allowed:=m.owner_subject=public.requesting_user_id() AND m.approved_response_hash=encode(sha256(convert_to(t.response::text,'UTF8')),'hex');
   product:=m.product_id;
   IF allowed AND m.scope_hash IS NOT NULL AND m.cancelled_at IS NULL THEN
    BEGIN allowed:=(public.panda_agent_lightweight_scope(product)->>'scopeHash')=m.scope_hash; EXCEPTION WHEN OTHERS THEN allowed:=false; END;
   END IF;
  ELSIF t.response->>'outcome'='evidence' THEN
   -- Existing histories stay intact; infer only their current canonical product for display.
   SELECT s.product_id INTO product FROM public.panda_agent_sources s WHERE s.canonical_url=t.response->'citations'->0->>'sourceUrl' LIMIT 1;
  END IF;
  IF allowed THEN allowed:=public.panda_agent_lightweight_citations_current(t.response,product); END IF;
  IF allowed IS NOT TRUE THEN
   replacement:=jsonb_build_object('outcome','insufficient','text','This saved answer is unavailable because its source or verification is no longer current.','citations','[]'::jsonb);
   SELECT jsonb_agg(CASE WHEN x->>'id'=t.assistant_message_id::text THEN x||jsonb_build_object('text',replacement->>'text','citations','[]'::jsonb) ELSE x END ORDER BY ord) INTO ms FROM jsonb_array_elements(ms) WITH ORDINALITY z(x,ord);
   SELECT jsonb_agg(CASE WHEN x->>'requestId'=t.request_id::text THEN x||jsonb_build_object('response',replacement) ELSE x END ORDER BY ord) INTO ts FROM jsonb_array_elements(ts) WITH ORDINALITY z(x,ord);
  END IF;
 END LOOP;
 RETURN result||jsonb_build_object('messages',ms,'turns',ts);
END $$;

-- The BFF signs a prepared cancellation only after verifying the worker's
-- matching no-dispatch receipt. Null digest is an atomic unprepared-only CAS.
CREATE FUNCTION public.panda_agent_lightweight_cancel(p_payload text,p_mac text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE v jsonb; m public.panda_agent_lightweight_turns; t public.panda_agent_chat_turns; answer jsonb;
BEGIN
 v:=public.panda_agent_lightweight_verify(p_payload,p_mac,'cancel');
 IF (v->'digest' IS DISTINCT FROM 'null'::jsonb) AND (jsonb_typeof(v->'digest') IS DISTINCT FROM 'string' OR coalesce(v->>'digest','') !~ '^[a-f0-9]{64}$') THEN PERFORM public.phase3_fail('invalid'); END IF;
 PERFORM 1 FROM public.panda_agent_chats WHERE id=(v->>'thread')::uuid AND owner_subject=public.requesting_user_id() AND archived_at IS NULL FOR UPDATE;
 IF NOT FOUND THEN PERFORM public.phase3_fail('not_found'); END IF;
 SELECT * INTO t FROM public.panda_agent_chat_turns WHERE thread_id=(v->>'thread')::uuid AND request_id=(v->>'request')::uuid FOR UPDATE;
 IF NOT FOUND THEN
  IF v->'digest' IS DISTINCT FROM 'null'::jsonb THEN PERFORM public.phase3_fail('conflict'); END IF;
  IF (v->>'exp')::bigint<extract(epoch FROM clock_timestamp()) THEN PERFORM public.phase3_fail('unauthenticated'); END IF;
  IF EXISTS(SELECT 1 FROM public.panda_agent_lightweight_cancelled_requests WHERE owner_subject=public.requesting_user_id() AND request_id=(v->>'request')::uuid AND thread_id=(v->>'thread')::uuid) THEN RETURN public.panda_agent_lightweight_read((v->>'thread')::uuid); END IF;
  PERFORM public.panda_agent_lightweight_admission_guard((v->>'thread')::uuid,(v->>'request')::uuid);
  INSERT INTO public.panda_agent_lightweight_cancelled_requests(owner_subject,thread_id,request_id) VALUES(public.requesting_user_id(),(v->>'thread')::uuid,(v->>'request')::uuid);
  RETURN public.panda_agent_lightweight_read((v->>'thread')::uuid);
 END IF;
 SELECT * INTO m FROM public.panda_agent_lightweight_turns WHERE thread_id=t.thread_id AND request_id=t.request_id AND owner_subject=public.requesting_user_id() FOR UPDATE;
 IF NOT FOUND THEN PERFORM public.phase3_fail('not_found'); END IF;
 IF (v->>'exp')::bigint<extract(epoch FROM clock_timestamp()) THEN PERFORM public.phase3_fail('unauthenticated'); END IF;
 IF t.status='complete' THEN RETURN public.panda_agent_lightweight_read(t.thread_id); END IF;
 IF t.status<>'pending' OR m.approved_response_hash IS NOT NULL OR m.request_hash IS DISTINCT FROM v->>'digest' THEN PERFORM public.phase3_fail('conflict'); END IF;
 answer:=jsonb_build_object('outcome','insufficient','text','This request was cancelled before evidence selection. You can send a new question.','citations','[]'::jsonb);
 UPDATE public.panda_agent_lightweight_turns SET approved_response_hash=encode(sha256(convert_to(answer::text,'UTF8')),'hex'),cancelled_at=clock_timestamp() WHERE thread_id=t.thread_id AND request_id=t.request_id;
 UPDATE public.panda_agent_chat_turns SET response=answer,status='complete',completed_at=clock_timestamp() WHERE thread_id=t.thread_id AND request_id=t.request_id;
 UPDATE public.panda_agent_chats SET updated_at=clock_timestamp() WHERE id=t.thread_id;
 RETURN public.panda_agent_lightweight_read(t.thread_id);
END $$;
REVOKE ALL ON FUNCTION public.panda_agent_lightweight_cancel(text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.panda_agent_lightweight_cancel(text,text) TO authenticated;
