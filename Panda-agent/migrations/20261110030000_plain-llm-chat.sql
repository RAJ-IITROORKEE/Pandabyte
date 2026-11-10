-- Local plain-LLM turns, separate from RAG/native classification. No provider activation.
CREATE TABLE public.panda_agent_llm_turns (
 thread_id uuid NOT NULL, request_id uuid NOT NULL, owner_subject text NOT NULL,
 claimed boolean NOT NULL DEFAULT false, create_claimed boolean NOT NULL DEFAULT false, prompt_claimed boolean NOT NULL DEFAULT false, terminal boolean NOT NULL DEFAULT false,
 cancelled boolean NOT NULL DEFAULT false, response_hash text CHECK(response_hash ~ '^[a-f0-9]{64}$'),
 native_admission jsonb CHECK(native_admission IS NULL OR (jsonb_typeof(native_admission)='object' AND octet_length(native_admission::text)<=4096)),
 native_usage jsonb CHECK(native_usage IS NULL OR (jsonb_typeof(native_usage)='object' AND octet_length(native_usage::text)<=1024)),
 PRIMARY KEY(thread_id,request_id), UNIQUE(owner_subject,request_id),
 FOREIGN KEY(thread_id,request_id) REFERENCES public.panda_agent_lightweight_turns(thread_id,request_id) ON DELETE CASCADE,
 CHECK(terminal=(response_hash IS NOT NULL)), CHECK(NOT cancelled OR terminal), CHECK(NOT prompt_claimed OR create_claimed), CHECK(NOT claimed OR prompt_claimed)
);
ALTER TABLE public.panda_agent_llm_turns ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.panda_agent_llm_turns FROM PUBLIC,anon,authenticated;
CREATE UNIQUE INDEX panda_agent_llm_native_session_unique ON public.panda_agent_llm_turns((native_admission->'receipt'->>'sessionID'));

-- Restore only signed plain-LLM conversation answers; all existing source-fenced projections remain.
ALTER FUNCTION public.panda_agent_lightweight_read(uuid) RENAME TO panda_agent_lightweight_read_before_plain_llm;
REVOKE ALL ON FUNCTION public.panda_agent_lightweight_read_before_plain_llm(uuid) FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.panda_agent_lightweight_read(p_thread uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE r jsonb; turn_row record; ms jsonb; ts jsonb;
BEGIN
 r:=public.panda_agent_lightweight_read_before_plain_llm(p_thread);ms:=r->'messages';ts:=r->'turns';
 FOR turn_row IN SELECT t.* FROM public.panda_agent_llm_turns g
 JOIN public.panda_agent_chat_turns t USING(thread_id,request_id)
 JOIN public.panda_agent_lightweight_turns m USING(thread_id,request_id)
 WHERE g.thread_id=p_thread AND g.owner_subject=public.requesting_user_id() AND m.owner_subject=g.owner_subject
 AND g.terminal AND t.status='complete' AND g.response_hash=m.approved_response_hash
 AND g.response_hash=encode(sha256(convert_to(t.response::text,'UTF8')),'hex')
 AND t.response->>'outcome'='conversation' AND t.response->'citations'='[]'::jsonb LOOP
  SELECT jsonb_agg(CASE WHEN x->>'id'=turn_row.assistant_message_id::text THEN x||jsonb_build_object('text',turn_row.response->>'text','citations','[]'::jsonb) ELSE x END ORDER BY ord) INTO ms FROM jsonb_array_elements(ms) WITH ORDINALITY z(x,ord);
  SELECT jsonb_agg(CASE WHEN x->>'requestId'=turn_row.request_id::text THEN x||jsonb_build_object('response',turn_row.response) ELSE x END ORDER BY ord) INTO ts FROM jsonb_array_elements(ts) WITH ORDINALITY z(x,ord);
 END LOOP;
 RETURN r||jsonb_build_object('messages',ms,'turns',ts);
END $$;
REVOKE ALL ON FUNCTION public.panda_agent_lightweight_read(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.panda_agent_lightweight_read(uuid) TO authenticated;

CREATE FUNCTION public.panda_agent_llm_verify(p_payload text,p_mac text,p_action text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE v jsonb; expected text; actor text:=public.requesting_user_id();
BEGIN
 IF actor IS NULL THEN PERFORM public.phase3_fail('unauthenticated'); END IF;
 IF p_payload IS NULL OR octet_length(p_payload)>32768 OR p_mac IS NULL OR p_mac !~ '^[a-f0-9]{64}$' THEN PERFORM public.phase3_fail('invalid'); END IF;
 SELECT encode(public.hmac(convert_to('panda-llm-db-v1'||chr(10)||p_payload,'UTF8'),key_bytes,'sha256'),'hex') INTO expected FROM public.panda_agent_lightweight_key WHERE singleton;
 IF expected IS NULL OR sha256(decode(expected,'hex'))<>sha256(decode(p_mac,'hex')) THEN PERFORM public.phase3_fail('unauthenticated'); END IF;
 v:=p_payload::jsonb;
 IF jsonb_typeof(v) IS DISTINCT FROM 'object' OR NOT v?&ARRAY['v','action','subject','exp','input'] OR (v-ARRAY['v','action','subject','exp','input'])<>'{}'::jsonb
 OR v->'v' IS DISTINCT FROM '1'::jsonb OR v->>'action' IS DISTINCT FROM p_action OR v->>'subject' IS DISTINCT FROM actor
 OR jsonb_typeof(v->'input') IS DISTINCT FROM 'object' OR jsonb_typeof(v->'exp') IS DISTINCT FROM 'number' OR coalesce(v->>'exp','') !~ '^[0-9]{1,11}$'
 THEN PERFORM public.phase3_fail('invalid'); END IF;
 IF (v->>'exp')::bigint<extract(epoch FROM clock_timestamp()) OR (v->>'exp')::bigint>extract(epoch FROM clock_timestamp())+65 THEN PERFORM public.phase3_fail('unauthenticated'); END IF;
 RETURN v->'input';
END $$;
REVOKE ALL ON FUNCTION public.panda_agent_llm_verify(text,text,text) FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.panda_agent_llm_state(p_thread uuid,p_request uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE result jsonb;
BEGIN
 PERFORM 1 FROM public.panda_agent_chats WHERE id=p_thread AND owner_subject=public.requesting_user_id() FOR SHARE;
 IF NOT FOUND THEN PERFORM public.phase3_fail('not_found'); END IF;
 SELECT jsonb_build_object('question',t.question,'status',t.status,'claimed',(g.claimed OR g.create_claimed),'cancelled',g.cancelled) INTO result
 FROM public.panda_agent_llm_turns g JOIN public.panda_agent_chat_turns t USING(thread_id,request_id)
 WHERE g.thread_id=p_thread AND g.request_id=p_request AND g.owner_subject=public.requesting_user_id();
 RETURN result;
END $$;

CREATE FUNCTION public.panda_agent_llm_begin(p_payload text,p_mac text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE v jsonb; result jsonb; tid uuid; rid uuid;
BEGIN
 v:=public.panda_agent_llm_verify(p_payload,p_mac,'begin');
 IF NOT v?&ARRAY['thread','request','question'] OR (v-ARRAY['thread','request','question'])<>'{}'::jsonb THEN PERFORM public.phase3_fail('invalid'); END IF;
 tid:=(v->>'thread')::uuid;rid:=(v->>'request')::uuid;
 result:=public.panda_agent_chat_begin_v2(tid,rid,v->>'question',false);
 IF (result->>'admitted')::boolean THEN
  INSERT INTO public.panda_agent_lightweight_turns(thread_id,request_id,owner_subject) VALUES(tid,rid,public.requesting_user_id());
  INSERT INTO public.panda_agent_llm_turns(thread_id,request_id,owner_subject) VALUES(tid,rid,public.requesting_user_id());
 ELSIF NOT EXISTS(SELECT 1 FROM public.panda_agent_llm_turns WHERE thread_id=tid AND request_id=rid AND owner_subject=public.requesting_user_id()) THEN PERFORM public.phase3_fail('conflict'); END IF;
 RETURN public.panda_agent_lightweight_read(tid)||jsonb_build_object('admitted',result->'admitted');
END $$;

CREATE FUNCTION public.panda_agent_llm_claim(p_payload text,p_mac text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE v jsonb; g public.panda_agent_llm_turns;
BEGIN
 v:=public.panda_agent_llm_verify(p_payload,p_mac,'claim');
 IF NOT v?&ARRAY['thread','request'] OR (v-ARRAY['thread','request'])<>'{}'::jsonb THEN PERFORM public.phase3_fail('invalid'); END IF;
 PERFORM 1 FROM public.panda_agent_chats WHERE id=(v->>'thread')::uuid AND owner_subject=public.requesting_user_id() AND archived_at IS NULL FOR UPDATE;
 IF NOT FOUND THEN PERFORM public.phase3_fail('not_found'); END IF;
 SELECT * INTO g FROM public.panda_agent_llm_turns WHERE thread_id=(v->>'thread')::uuid AND request_id=(v->>'request')::uuid AND owner_subject=public.requesting_user_id() FOR UPDATE;
 IF NOT FOUND OR g.terminal OR g.native_admission IS NULL OR NOT g.prompt_claimed THEN PERFORM public.phase3_fail('conflict'); END IF;
 IF g.claimed THEN RETURN jsonb_build_object('execute',false); END IF;
 UPDATE public.panda_agent_llm_turns SET claimed=true WHERE thread_id=g.thread_id AND request_id=g.request_id;
 RETURN jsonb_build_object('execute',true);
END $$;

CREATE FUNCTION public.panda_agent_llm_attach(p_payload text,p_mac text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE v jsonb; g public.panda_agent_llm_turns; a jsonb; r jsonb;
BEGIN
 v:=public.panda_agent_llm_verify(p_payload,p_mac,'attach');a:=v->'admission';r:=a->'receipt';
 IF NOT v?&ARRAY['thread','request','admission'] OR (v-ARRAY['thread','request','admission'])<>'{}'::jsonb
 OR jsonb_typeof(a) IS DISTINCT FROM 'object' OR NOT a?&ARRAY['receipt','messageID','promptHash','generation'] OR (a-ARRAY['receipt','messageID','promptHash','generation'])<>'{}'::jsonb
 OR coalesce(a->>'messageID','') !~ '^msg_[a-f0-9]{12}[A-Za-z0-9]{14}$' OR coalesce(a->>'promptHash','') !~ '^[a-f0-9]{64}$' OR coalesce(a->>'generation','') !~ '^[a-f0-9]{64}$'
 OR jsonb_typeof(r) IS DISTINCT FROM 'object' OR NOT r?&ARRAY['sessionID','title','nonce','scope','binding'] OR (r-ARRAY['sessionID','title','nonce','scope','binding'])<>'{}'::jsonb
 OR EXISTS(SELECT 1 FROM jsonb_each(r) x WHERE jsonb_typeof(x.value) IS DISTINCT FROM 'string')
 OR r->>'scope' IS DISTINCT FROM 'customer' OR coalesce(r->>'sessionID','') !~ '^ses_[a-f0-9]{12}[A-Za-z0-9]{14}$'
 OR coalesce(r->>'nonce','') !~ '^[a-f0-9]{32}$' OR coalesce(r->>'binding','') !~ '^[a-f0-9]{64}$'
 OR r->>'title' IS DISTINCT FROM 'panda-agent-customer-'||(r->>'nonce') THEN PERFORM public.phase3_fail('invalid'); END IF;
 PERFORM 1 FROM public.panda_agent_chats WHERE id=(v->>'thread')::uuid AND owner_subject=public.requesting_user_id() AND archived_at IS NULL FOR UPDATE;
 IF NOT FOUND THEN PERFORM public.phase3_fail('not_found'); END IF;
 SELECT * INTO g FROM public.panda_agent_llm_turns WHERE thread_id=(v->>'thread')::uuid AND request_id=(v->>'request')::uuid AND owner_subject=public.requesting_user_id() FOR UPDATE;
 IF NOT FOUND OR g.terminal OR g.claimed OR g.create_claimed THEN PERFORM public.phase3_fail('conflict'); END IF;
 IF NOT EXISTS(SELECT 1 FROM public.panda_agent_chat_turns t WHERE t.thread_id=g.thread_id AND t.request_id=g.request_id AND t.status='pending' AND encode(sha256(convert_to(t.question,'UTF8')),'hex')=a->>'promptHash') THEN PERFORM public.phase3_fail('conflict'); END IF;
 IF g.native_admission IS NOT NULL THEN
  IF g.native_admission IS DISTINCT FROM a THEN PERFORM public.phase3_fail('conflict'); END IF;
  RETURN jsonb_build_object('attached',false);
 END IF;
 UPDATE public.panda_agent_llm_turns SET native_admission=a WHERE thread_id=g.thread_id AND request_id=g.request_id;
 RETURN jsonb_build_object('attached',true);
END $$;

CREATE FUNCTION public.panda_agent_llm_finish(p_payload text,p_mac text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE v jsonb; g public.panda_agent_llm_turns; t public.panda_agent_chat_turns; answer jsonb; digest text; cancel boolean;
BEGIN
 v:=public.panda_agent_llm_verify(p_payload,p_mac,'finish');
 IF NOT v?&ARRAY['thread','request','answer','cancel'] OR (v-ARRAY['thread','request','answer','cancel'])<>'{}'::jsonb OR jsonb_typeof(v->'cancel') IS DISTINCT FROM 'boolean' THEN PERFORM public.phase3_fail('invalid'); END IF;
 PERFORM 1 FROM public.panda_agent_chats WHERE id=(v->>'thread')::uuid AND owner_subject=public.requesting_user_id() AND archived_at IS NULL FOR UPDATE;
 IF NOT FOUND THEN PERFORM public.phase3_fail('not_found'); END IF;
 SELECT * INTO g FROM public.panda_agent_llm_turns WHERE thread_id=(v->>'thread')::uuid AND request_id=(v->>'request')::uuid AND owner_subject=public.requesting_user_id() FOR UPDATE;
 IF NOT FOUND THEN PERFORM public.phase3_fail('not_found'); END IF;
 SELECT * INTO t FROM public.panda_agent_chat_turns WHERE thread_id=g.thread_id AND request_id=g.request_id FOR UPDATE;
 cancel:=(v->>'cancel')::boolean;answer:=v->'answer';
 IF cancel THEN answer:=jsonb_build_object('outcome','insufficient','text',CASE WHEN g.claimed THEN 'Stopped waiting. The provider may still process the request. No late answer will be saved.' ELSE 'Stopped before a model request was sent.' END,'citations','[]'::jsonb); END IF;
 IF jsonb_typeof(answer) IS DISTINCT FROM 'object' OR NOT answer?&ARRAY['outcome','text','citations'] OR (answer-ARRAY['outcome','text','citations'])<>'{}'::jsonb
 OR coalesce(answer->>'outcome','') NOT IN ('conversation','insufficient') OR answer->'citations' IS DISTINCT FROM '[]'::jsonb
 OR jsonb_typeof(answer->'text') IS DISTINCT FROM 'string' OR length(btrim(answer->>'text')) NOT BETWEEN 1 AND 8000 OR octet_length(answer::text)>24000
 OR (answer->>'outcome'='conversation' AND (NOT g.claimed OR g.native_usage IS NULL)) THEN PERFORM public.phase3_fail('invalid'); END IF;
 digest:=encode(sha256(convert_to(answer::text,'UTF8')),'hex');
 IF g.terminal THEN
  IF cancel OR g.response_hash=digest THEN RETURN public.panda_agent_lightweight_read(g.thread_id); END IF;
  PERFORM public.phase3_fail('conflict');
 END IF;
 IF t.status<>'pending' OR (p_payload::jsonb->>'exp')::bigint<extract(epoch FROM clock_timestamp()) THEN PERFORM public.phase3_fail('conflict'); END IF;
 UPDATE public.panda_agent_llm_turns SET terminal=true,cancelled=cancel,response_hash=digest WHERE thread_id=g.thread_id AND request_id=g.request_id;
 UPDATE public.panda_agent_lightweight_turns SET approved_response_hash=digest,cancelled_at=CASE WHEN cancel THEN clock_timestamp() ELSE NULL END WHERE thread_id=g.thread_id AND request_id=g.request_id AND owner_subject=g.owner_subject;
 UPDATE public.panda_agent_chat_turns SET response=answer,status='complete',completed_at=clock_timestamp() WHERE thread_id=g.thread_id AND request_id=g.request_id;
 UPDATE public.panda_agent_chats SET updated_at=clock_timestamp() WHERE id=g.thread_id;
 RETURN public.panda_agent_lightweight_read(g.thread_id);
END $$;

CREATE FUNCTION public.panda_agent_llm_write_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE g public.panda_agent_llm_turns;
BEGIN
 SELECT * INTO g FROM public.panda_agent_llm_turns WHERE thread_id=NEW.thread_id AND request_id=NEW.request_id;
 IF FOUND AND (NOT g.terminal OR NEW.status<>'complete' OR g.response_hash IS DISTINCT FROM encode(sha256(convert_to(NEW.response::text,'UTF8')),'hex')) THEN PERFORM public.phase3_fail('conflict'); END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.panda_agent_llm_write_guard() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER panda_agent_llm_write_guard BEFORE UPDATE OF response,status ON public.panda_agent_chat_turns FOR EACH ROW EXECUTE FUNCTION public.panda_agent_llm_write_guard();
REVOKE ALL ON FUNCTION public.panda_agent_llm_state(uuid,uuid),public.panda_agent_llm_begin(text,text),public.panda_agent_llm_claim(text,text),public.panda_agent_llm_finish(text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.panda_agent_llm_state(uuid,uuid),public.panda_agent_llm_begin(text,text),public.panda_agent_llm_claim(text,text),public.panda_agent_llm_finish(text,text) TO authenticated;
REVOKE ALL ON FUNCTION public.panda_agent_llm_attach(text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.panda_agent_llm_attach(text,text) TO authenticated;

-- Each external native mutation receives one durable, admission-bound claim.
CREATE FUNCTION public.panda_agent_llm_native_claim(p_payload text,p_mac text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE v jsonb; g public.panda_agent_llm_turns; stage text;
BEGIN
 v:=public.panda_agent_llm_verify(p_payload,p_mac,'native_claim'); stage:=v->>'stage';
 IF NOT v?&ARRAY['thread','request','admission','stage'] OR (v-ARRAY['thread','request','admission','stage'])<>'{}'::jsonb OR stage NOT IN ('create','prompt') OR stage IS NULL THEN PERFORM public.phase3_fail('invalid'); END IF;
 PERFORM 1 FROM public.panda_agent_chats WHERE id=(v->>'thread')::uuid AND owner_subject=public.requesting_user_id() AND archived_at IS NULL FOR UPDATE;
 IF NOT FOUND THEN PERFORM public.phase3_fail('not_found'); END IF;
 SELECT * INTO g FROM public.panda_agent_llm_turns WHERE thread_id=(v->>'thread')::uuid AND request_id=(v->>'request')::uuid AND owner_subject=public.requesting_user_id() FOR UPDATE;
 IF NOT FOUND OR g.terminal OR g.cancelled OR g.native_admission IS NULL OR g.native_admission IS DISTINCT FROM v->'admission'
   OR NOT EXISTS(SELECT 1 FROM public.panda_agent_chat_turns t WHERE t.thread_id=g.thread_id AND t.request_id=g.request_id AND t.status='pending') THEN PERFORM public.phase3_fail('conflict'); END IF;
 IF stage='create' THEN
  IF g.create_claimed THEN RETURN jsonb_build_object('execute',false); END IF;
  UPDATE public.panda_agent_llm_turns SET create_claimed=true WHERE thread_id=g.thread_id AND request_id=g.request_id;
 ELSE
  IF NOT g.create_claimed THEN PERFORM public.phase3_fail('conflict'); END IF;
  IF g.prompt_claimed THEN RETURN jsonb_build_object('execute',false); END IF;
  UPDATE public.panda_agent_llm_turns SET prompt_claimed=true WHERE thread_id=g.thread_id AND request_id=g.request_id;
 END IF;
 RETURN jsonb_build_object('execute',true);
END $$;

CREATE FUNCTION public.panda_agent_llm_admission_current(p_payload text,p_mac text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE v jsonb; ok boolean;
BEGIN
 v:=public.panda_agent_llm_verify(p_payload,p_mac,'admission_current');
 IF NOT v?&ARRAY['thread','request','admission'] OR (v-ARRAY['thread','request','admission'])<>'{}'::jsonb THEN PERFORM public.phase3_fail('invalid'); END IF;
 SELECT EXISTS(SELECT 1 FROM public.panda_agent_llm_turns g
   JOIN public.panda_agent_chats c ON c.id=g.thread_id
   JOIN public.panda_agent_chat_turns t USING(thread_id,request_id)
   WHERE g.thread_id=(v->>'thread')::uuid AND g.request_id=(v->>'request')::uuid
   AND c.owner_subject=public.requesting_user_id() AND c.archived_at IS NULL AND g.owner_subject=public.requesting_user_id()
   AND NOT g.terminal AND NOT g.cancelled AND t.status='pending' AND g.native_admission IS NOT NULL AND g.native_admission=v->'admission') INTO ok;
 RETURN jsonb_build_object('current',ok);
END $$;
REVOKE ALL ON FUNCTION public.panda_agent_llm_native_claim(text,text),public.panda_agent_llm_admission_current(text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.panda_agent_llm_native_claim(text,text),public.panda_agent_llm_admission_current(text,text) TO authenticated;



-- Receipt becomes immutable before native output may be released for persistence.
CREATE FUNCTION public.panda_agent_llm_record_receipt(p_payload text,p_mac text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE v jsonb; g public.panda_agent_llm_turns; u jsonb; receipt jsonb;
BEGIN
 v:=public.panda_agent_llm_verify(p_payload,p_mac,'record_receipt'); u:=v->'usage';
 IF NOT v?&ARRAY['thread','request','admission','bodyHash','usage'] OR (v-ARRAY['thread','request','admission','bodyHash','usage'])<>'{}'::jsonb
 OR jsonb_typeof(v->'bodyHash') IS DISTINCT FROM 'string' OR coalesce(v->>'bodyHash','') !~ '^[a-f0-9]{64}$'
 OR jsonb_typeof(u) IS DISTINCT FROM 'object' OR NOT u?&ARRAY['inputTokens','outputTokens','costNanoUsd'] OR (u-ARRAY['inputTokens','outputTokens','costNanoUsd'])<>'{}'::jsonb
 OR jsonb_typeof(u->'inputTokens') IS DISTINCT FROM 'number' OR coalesce(u->>'inputTokens','') !~ '^[0-9]{1,5}$'
 OR jsonb_typeof(u->'outputTokens') IS DISTINCT FROM 'number' OR coalesce(u->>'outputTokens','') !~ '^[0-9]{1,3}$'
 OR jsonb_typeof(u->'costNanoUsd') IS DISTINCT FROM 'number' OR coalesce(u->>'costNanoUsd','') !~ '^[0-9]{1,7}$'
 THEN PERFORM public.phase3_fail('invalid'); END IF;
 IF (u->>'inputTokens')::bigint>11024 OR (u->>'outputTokens')::bigint>700 OR (u->>'costNanoUsd')::bigint>1597640 THEN PERFORM public.phase3_fail('invalid'); END IF;
 PERFORM 1 FROM public.panda_agent_chats WHERE id=(v->>'thread')::uuid AND owner_subject=public.requesting_user_id() AND archived_at IS NULL FOR UPDATE;
 IF NOT FOUND THEN PERFORM public.phase3_fail('not_found'); END IF;
 SELECT * INTO g FROM public.panda_agent_llm_turns WHERE thread_id=(v->>'thread')::uuid AND request_id=(v->>'request')::uuid AND owner_subject=public.requesting_user_id() FOR UPDATE;
 IF NOT FOUND OR g.terminal OR g.cancelled OR NOT g.claimed OR g.native_admission IS NULL OR g.native_admission IS DISTINCT FROM v->'admission'
 OR NOT EXISTS(SELECT 1 FROM public.panda_agent_chat_turns t WHERE t.thread_id=g.thread_id AND t.request_id=g.request_id AND t.status='pending')
 OR (p_payload::jsonb->>'exp')::bigint<extract(epoch FROM clock_timestamp()) THEN PERFORM public.phase3_fail('conflict'); END IF;
 IF (SELECT count(*) FROM public.panda_agent_rag_budget_reservations r
     JOIN public.panda_agent_rag_budgets b ON b.id=r.budget_id
     WHERE b.owner_subject=public.requesting_user_id() AND b.enabled AND b.model='openai/gpt-6-luna' AND b.provider='azure/us'
       AND r.surface='chat' AND r.request_id=g.request_id AND r.fingerprint=v->>'bodyHash' AND r.reserved_nano_usd=1597640)<>1 THEN PERFORM public.phase3_fail('conflict'); END IF;
 receipt:=jsonb_build_object('bodyHash',v->>'bodyHash','usage',u);
 IF g.native_usage IS NOT NULL THEN
  IF g.native_usage IS DISTINCT FROM receipt THEN PERFORM public.phase3_fail('conflict'); END IF;
  RETURN jsonb_build_object('recorded',false);
 END IF;
 UPDATE public.panda_agent_llm_turns SET native_usage=receipt WHERE thread_id=g.thread_id AND request_id=g.request_id;
 RETURN jsonb_build_object('recorded',true);
END $$;
REVOKE ALL ON FUNCTION public.panda_agent_llm_record_receipt(text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.panda_agent_llm_record_receipt(text,text) TO authenticated;
