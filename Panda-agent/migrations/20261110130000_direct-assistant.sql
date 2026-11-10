-- Direct general-assistant journal. Shared ledger remains authoritative; no provider activation.
CREATE TABLE public.panda_agent_direct_turns (
 thread_id uuid NOT NULL, request_id uuid NOT NULL, owner_subject text NOT NULL,
 claimed boolean NOT NULL DEFAULT false, terminal boolean NOT NULL DEFAULT false, cancelled boolean NOT NULL DEFAULT false,
 budget_id uuid, body_hash text CHECK(body_hash ~ '^[a-f0-9]{64}$'), answer_hash text CHECK(answer_hash ~ '^[a-f0-9]{64}$'),
 usage jsonb, response_hash text CHECK(response_hash ~ '^[a-f0-9]{64}$'),
 PRIMARY KEY(thread_id,request_id), UNIQUE(owner_subject,request_id),
 FOREIGN KEY(thread_id,request_id) REFERENCES public.panda_agent_lightweight_turns(thread_id,request_id) ON DELETE CASCADE,
 CHECK(claimed=(budget_id IS NOT NULL AND body_hash IS NOT NULL)),
 CHECK((usage IS NULL)=(answer_hash IS NULL)), CHECK(usage IS NULL OR claimed),
 CHECK(terminal=(response_hash IS NOT NULL)), CHECK(NOT cancelled OR terminal)
);
ALTER TABLE public.panda_agent_direct_turns ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.panda_agent_direct_turns FROM PUBLIC,anon,authenticated;

ALTER FUNCTION public.panda_agent_lightweight_read(uuid) RENAME TO panda_agent_lightweight_read_before_direct;
REVOKE ALL ON FUNCTION public.panda_agent_lightweight_read_before_direct(uuid) FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.panda_agent_lightweight_read(p_thread uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE r jsonb; x record; ms jsonb; ts jsonb; valid boolean; answer jsonb;
BEGIN
 r:=public.panda_agent_lightweight_read_before_direct(p_thread);ms:=r->'messages';ts:=r->'turns';
 FOR x IN SELECT t.*,d.owner_subject,d.terminal,d.cancelled,d.answer_hash,d.usage,d.response_hash,m.approved_response_hash
 FROM public.panda_agent_direct_turns d JOIN public.panda_agent_chat_turns t USING(thread_id,request_id)
 JOIN public.panda_agent_lightweight_turns m USING(thread_id,request_id)
 WHERE d.thread_id=p_thread AND t.status='complete' LOOP
  valid:=x.owner_subject=public.requesting_user_id() AND x.terminal AND x.response_hash=x.approved_response_hash
   AND x.response_hash=encode(sha256(convert_to(x.response::text,'UTF8')),'hex')
   AND (x.cancelled OR (x.usage IS NOT NULL AND x.answer_hash=x.response_hash AND x.response->>'outcome'='conversation' AND x.response->'citations'='[]'::jsonb));
  answer:=CASE WHEN valid THEN x.response ELSE jsonb_build_object('outcome','insufficient','text','This saved answer is unavailable because its source or verification is no longer current.','citations','[]'::jsonb) END;
  SELECT jsonb_agg(CASE WHEN z.item->>'id'=x.assistant_message_id::text THEN z.item||jsonb_build_object('text',answer->>'text','citations',answer->'citations') ELSE z.item END ORDER BY z.ord) INTO ms FROM jsonb_array_elements(ms) WITH ORDINALITY z(item,ord);
  SELECT jsonb_agg(CASE WHEN z.item->>'requestId'=x.request_id::text THEN z.item||jsonb_build_object('response',answer) ELSE z.item END ORDER BY z.ord) INTO ts FROM jsonb_array_elements(ts) WITH ORDINALITY z(item,ord);
 END LOOP;
 RETURN r||jsonb_build_object('messages',ms,'turns',ts);
END $$;
REVOKE ALL ON FUNCTION public.panda_agent_lightweight_read(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.panda_agent_lightweight_read(uuid) TO authenticated;

CREATE FUNCTION public.panda_agent_direct_write_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE d public.panda_agent_direct_turns;
BEGIN
 SELECT * INTO d FROM public.panda_agent_direct_turns WHERE thread_id=NEW.thread_id AND request_id=NEW.request_id;
 IF FOUND AND (NOT d.terminal OR NEW.status<>'complete' OR d.response_hash IS DISTINCT FROM encode(sha256(convert_to(NEW.response::text,'UTF8')),'hex')) THEN PERFORM public.phase3_fail('conflict'); END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.panda_agent_direct_write_guard() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER panda_agent_direct_write_guard BEFORE UPDATE OF response,status ON public.panda_agent_chat_turns FOR EACH ROW EXECUTE FUNCTION public.panda_agent_direct_write_guard();

CREATE FUNCTION public.panda_agent_direct_chat(p_payload text,p_mac text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE v jsonb; op text; tid uuid; rid uuid; d public.panda_agent_direct_turns; t public.panda_agent_chat_turns; b public.panda_agent_rag_budgets; u jsonb; a jsonb; digest text; result jsonb; payload text; mac text;
BEGIN
 v:=public.panda_agent_llm_verify(p_payload,p_mac,'direct_chat');op:=v->>'op';
 IF op IS NULL OR op NOT IN ('begin','state','claim','receipt','finish','cancel') OR NOT v?&ARRAY['op','thread','request'] THEN PERFORM public.phase3_fail('invalid'); END IF;
 tid:=(v->>'thread')::uuid;rid:=(v->>'request')::uuid;
 IF op='begin' THEN
  IF (v-ARRAY['op','thread','request','question'])<>'{}'::jsonb OR jsonb_typeof(v->'question') IS DISTINCT FROM 'string' THEN PERFORM public.phase3_fail('invalid'); END IF;
  result:=public.panda_agent_chat_begin_v2(tid,rid,v->>'question',false);
  IF (result->>'admitted')::boolean THEN
   INSERT INTO public.panda_agent_lightweight_turns(thread_id,request_id,owner_subject) VALUES(tid,rid,public.requesting_user_id());
   INSERT INTO public.panda_agent_direct_turns(thread_id,request_id,owner_subject) VALUES(tid,rid,public.requesting_user_id());
  ELSIF NOT EXISTS(SELECT 1 FROM public.panda_agent_direct_turns WHERE thread_id=tid AND request_id=rid AND owner_subject=public.requesting_user_id()) THEN PERFORM public.phase3_fail('conflict'); END IF;
  RETURN public.panda_agent_lightweight_read(tid)||jsonb_build_object('admitted',result->'admitted');
 END IF;
 IF (op IN ('state','cancel') AND (v-ARRAY['op','thread','request'])<>'{}'::jsonb)
 OR (op='claim' AND (NOT v?&ARRAY['budget','keySha256','workspaceSha256','bodyHash'] OR (v-ARRAY['op','thread','request','budget','keySha256','workspaceSha256','bodyHash'])<>'{}'::jsonb OR EXISTS(SELECT 1 FROM unnest(ARRAY['keySha256','workspaceSha256','bodyHash']) z WHERE coalesce(v->>z,'') !~ '^[a-f0-9]{64}$')))
 OR (op='receipt' AND (NOT v?&ARRAY['bodyHash','answer','usage'] OR (v-ARRAY['op','thread','request','bodyHash','answer','usage'])<>'{}'::jsonb))
 OR (op='finish' AND (NOT v?'answer' OR (v-ARRAY['op','thread','request','answer'])<>'{}'::jsonb)) THEN PERFORM public.phase3_fail('invalid'); END IF;
 PERFORM 1 FROM public.panda_agent_chats WHERE id=tid AND owner_subject=public.requesting_user_id() AND archived_at IS NULL FOR UPDATE;
 IF NOT FOUND THEN PERFORM public.phase3_fail('not_found'); END IF;
 SELECT * INTO d FROM public.panda_agent_direct_turns WHERE thread_id=tid AND request_id=rid AND owner_subject=public.requesting_user_id() FOR UPDATE;
 IF NOT FOUND THEN IF op='state' THEN RETURN 'null'::jsonb; END IF; PERFORM public.phase3_fail('not_found'); END IF;
 SELECT * INTO t FROM public.panda_agent_chat_turns WHERE thread_id=tid AND request_id=rid FOR UPDATE;
 IF NOT FOUND THEN PERFORM public.phase3_fail('not_found'); END IF;
 IF op='state' THEN RETURN jsonb_build_object('question',t.question,'status',t.status,'claimed',d.claimed,'cancelled',d.cancelled); END IF;
 IF op='cancel' AND d.terminal THEN RETURN public.panda_agent_lightweight_read(tid); END IF;
 IF op='finish' AND d.terminal AND NOT d.cancelled AND d.response_hash=encode(sha256(convert_to((v->'answer')::text,'UTF8')),'hex') THEN RETURN public.panda_agent_lightweight_read(tid); END IF;
 IF d.terminal OR t.status<>'pending' OR (p_payload::jsonb->>'exp')::bigint<extract(epoch FROM clock_timestamp()) THEN PERFORM public.phase3_fail('conflict'); END IF;
 IF op='claim' THEN
  IF d.claimed THEN RETURN jsonb_build_object('execute',false); END IF;
  SELECT * INTO b FROM public.panda_agent_rag_budgets WHERE id=(v->>'budget')::uuid FOR UPDATE;
  IF NOT FOUND OR b.owner_subject IS DISTINCT FROM d.owner_subject OR b.key_sha256 IS DISTINCT FROM v->>'keySha256' OR b.workspace_sha256 IS DISTINCT FROM v->>'workspaceSha256' OR b.model<>'openai/gpt-6-luna' OR b.provider<>'azure/us' THEN PERFORM public.phase3_fail('conflict'); END IF;
  payload:=jsonb_build_object('v',1,'action','reserve','subject',d.owner_subject,'exp',floor(extract(epoch FROM clock_timestamp()))::bigint+60,'budget',b.id,'keySha256',b.key_sha256,'workspaceSha256',b.workspace_sha256,'request',rid,'surface','chat','fingerprint',v->>'bodyHash')::text;
  SELECT encode(public.hmac(convert_to('panda-rag-budget-db-v1'||chr(10)||payload,'UTF8'),key_bytes,'sha256'),'hex') INTO mac FROM public.panda_agent_lightweight_key WHERE singleton;
  result:=public.panda_agent_rag_budget_reserve(payload,mac);
  IF result->'execute' IS DISTINCT FROM 'true'::jsonb THEN RETURN jsonb_build_object('execute',false); END IF;
  UPDATE public.panda_agent_direct_turns SET claimed=true,budget_id=b.id,body_hash=v->>'bodyHash' WHERE thread_id=tid AND request_id=rid;
  RETURN jsonb_build_object('execute',true);
 ELSIF op='receipt' THEN
  u:=v->'usage';a:=v->'answer';
  IF NOT d.claimed OR d.body_hash IS DISTINCT FROM v->>'bodyHash'
   OR jsonb_typeof(a) IS DISTINCT FROM 'object' OR NOT a?&ARRAY['outcome','text','citations'] OR (a-ARRAY['outcome','text','citations'])<>'{}'::jsonb OR a->>'outcome' IS DISTINCT FROM 'conversation' OR a->'citations' IS DISTINCT FROM '[]'::jsonb OR jsonb_typeof(a->'text') IS DISTINCT FROM 'string' OR length(btrim(a->>'text')) NOT BETWEEN 1 AND 8000 OR octet_length(a::text)>24000
   OR jsonb_typeof(u) IS DISTINCT FROM 'object' OR NOT u?&ARRAY['inputTokens','outputTokens','costNanoUsd'] OR (u-ARRAY['inputTokens','outputTokens','costNanoUsd'])<>'{}'::jsonb
   OR EXISTS(SELECT 1 FROM jsonb_each(u) x WHERE jsonb_typeof(x.value) IS DISTINCT FROM 'number' OR x.value::text !~ '^[0-9]{1,7}$')
   OR (u->>'inputTokens')::bigint>8024 OR (u->>'outputTokens')::bigint>700 OR (u->>'costNanoUsd')::bigint>1492312
   OR NOT EXISTS(SELECT 1 FROM public.panda_agent_rag_budget_reservations r JOIN public.panda_agent_rag_budgets b ON b.id=r.budget_id WHERE r.budget_id=d.budget_id AND b.owner_subject=d.owner_subject AND b.enabled AND r.surface='chat' AND r.request_id=rid AND r.fingerprint=d.body_hash AND r.reserved_nano_usd=1597640) THEN PERFORM public.phase3_fail('conflict'); END IF;
  digest:=encode(sha256(convert_to(a::text,'UTF8')),'hex');
  IF d.usage IS NOT NULL THEN IF d.usage IS DISTINCT FROM u OR d.answer_hash IS DISTINCT FROM digest THEN PERFORM public.phase3_fail('conflict'); END IF; RETURN jsonb_build_object('recorded',false); END IF;
  UPDATE public.panda_agent_direct_turns SET usage=u,answer_hash=digest WHERE thread_id=tid AND request_id=rid;
  RETURN jsonb_build_object('recorded',true);
 END IF;
 IF op='cancel' THEN
  a:=jsonb_build_object('outcome','insufficient','text',CASE WHEN d.claimed THEN 'Stopped waiting. The provider may still process the request. No late answer will be saved.' ELSE 'Stopped before a model request was sent.' END,'citations','[]'::jsonb);
 ELSE
  a:=v->'answer';
  IF NOT d.claimed OR d.usage IS NULL OR jsonb_typeof(a) IS DISTINCT FROM 'object' OR NOT a?&ARRAY['outcome','text','citations'] OR (a-ARRAY['outcome','text','citations'])<>'{}'::jsonb OR a->>'outcome' IS DISTINCT FROM 'conversation' OR a->'citations' IS DISTINCT FROM '[]'::jsonb OR jsonb_typeof(a->'text') IS DISTINCT FROM 'string' OR length(btrim(a->>'text')) NOT BETWEEN 1 AND 8000 OR octet_length(a::text)>24000 THEN PERFORM public.phase3_fail('invalid'); END IF;
 END IF;
 digest:=encode(sha256(convert_to(a::text,'UTF8')),'hex');
 IF op='finish' AND d.answer_hash IS DISTINCT FROM digest THEN PERFORM public.phase3_fail('conflict'); END IF;
 UPDATE public.panda_agent_direct_turns SET terminal=true,cancelled=(op='cancel'),response_hash=digest WHERE thread_id=tid AND request_id=rid;
 UPDATE public.panda_agent_lightweight_turns SET approved_response_hash=digest,cancelled_at=CASE WHEN op='cancel' THEN clock_timestamp() ELSE NULL END WHERE thread_id=tid AND request_id=rid AND owner_subject=d.owner_subject;
 UPDATE public.panda_agent_chat_turns SET response=a,status='complete',completed_at=clock_timestamp() WHERE thread_id=tid AND request_id=rid;
 UPDATE public.panda_agent_chats SET updated_at=clock_timestamp() WHERE id=tid;
 RETURN public.panda_agent_lightweight_read(tid);
END $$;
REVOKE ALL ON FUNCTION public.panda_agent_direct_chat(text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.panda_agent_direct_chat(text,text) TO authenticated;

CREATE FUNCTION public.panda_agent_direct_ready() RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
BEGIN
 IF public.requesting_user_id() IS NULL THEN PERFORM public.phase3_fail('unauthenticated'); END IF;
 RETURN jsonb_build_object('ready',true,'version',1);
END $$;
REVOKE ALL ON FUNCTION public.panda_agent_direct_ready() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.panda_agent_direct_ready() TO authenticated;
