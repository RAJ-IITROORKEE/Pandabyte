-- Forward-only lightweight admission. Preserve old histories, receipts and runtime authority.
-- The isolated BFF key is provisioned privately after migration; missing key fails closed.
CREATE TABLE public.panda_agent_lightweight_key (
 singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
 key_bytes bytea NOT NULL CHECK(octet_length(key_bytes)=32)
);
ALTER TABLE public.panda_agent_lightweight_key ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.panda_agent_lightweight_key FROM PUBLIC,anon,authenticated;
CREATE TABLE public.panda_agent_lightweight_turns (
 thread_id uuid NOT NULL,
 request_id uuid NOT NULL,
 owner_subject text NOT NULL,
 product_id uuid,
 sku text,
 scope_hash text CHECK(scope_hash ~ '^[a-f0-9]{64}$'),
 request_hash text CHECK(request_hash ~ '^[a-f0-9]{64}$'),
 approved_response_hash text CHECK(approved_response_hash ~ '^[a-f0-9]{64}$'),
 PRIMARY KEY(thread_id,request_id),
 UNIQUE(owner_subject,request_id),
 FOREIGN KEY(thread_id,request_id) REFERENCES public.panda_agent_chat_turns(thread_id,request_id) ON DELETE CASCADE
);
ALTER TABLE public.panda_agent_lightweight_turns ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.panda_agent_lightweight_turns FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.panda_agent_lightweight_verify(p_payload text,p_mac text,p_action text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE v jsonb; expected text; a text:=public.requesting_user_id(); fields text[];
BEGIN
 IF a IS NULL THEN PERFORM public.phase3_fail('unauthenticated'); END IF;
 IF p_payload IS NULL OR octet_length(p_payload)>32768 OR p_mac IS NULL OR p_mac !~ '^[a-f0-9]{64}$' THEN PERFORM public.phase3_fail('invalid'); END IF;
 SELECT encode(public.hmac(convert_to('panda-lightweight-db-v1'||chr(10)||p_payload,'UTF8'),key_bytes,'sha256'),'hex') INTO expected FROM public.panda_agent_lightweight_key WHERE singleton;
 IF expected IS NULL OR sha256(decode(expected,'hex'))<>sha256(decode(p_mac,'hex')) THEN PERFORM public.phase3_fail('unauthenticated'); END IF;
 v:=p_payload::jsonb;
 fields:=CASE p_action WHEN 'begin' THEN ARRAY['v','action','subject','exp','thread','request','question'] WHEN 'prepare' THEN ARRAY['v','action','subject','exp','thread','request','question','product','sku','scopeHash','digest'] WHEN 'complete' THEN ARRAY['v','action','subject','exp','thread','request','answer'] END;
 IF fields IS NULL OR jsonb_typeof(v) IS DISTINCT FROM 'object' THEN PERFORM public.phase3_fail('invalid'); END IF;
 IF NOT v ?& fields OR (SELECT count(*) FROM jsonb_object_keys(v))<>cardinality(fields)
 OR v->'v' IS DISTINCT FROM '1'::jsonb OR v->>'action' IS DISTINCT FROM p_action OR v->>'subject' IS DISTINCT FROM a
 OR jsonb_typeof(v->'exp') IS DISTINCT FROM 'number' OR coalesce(v->>'exp','') !~ '^[0-9]{1,11}$' THEN PERFORM public.phase3_fail('invalid'); END IF;
 IF (v->>'exp')::bigint<extract(epoch FROM clock_timestamp())
 OR (v->>'exp')::bigint>extract(epoch FROM clock_timestamp())+65 THEN PERFORM public.phase3_fail('unauthenticated'); END IF;
 RETURN v;
END $$;
REVOKE ALL ON FUNCTION public.panda_agent_lightweight_verify(text,text,text) FROM PUBLIC,anon,authenticated;

-- Shares withdrawal's lifecycle lock and locks the current publication pointer.
CREATE FUNCTION public.panda_agent_lightweight_scope(p_product uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE scope jsonb;
BEGIN
 IF public.requesting_user_id() IS NULL THEN PERFORM public.phase3_fail('unauthenticated'); END IF;
 PERFORM pg_advisory_xact_lock(hashtext('panda_agent_lifecycle'));
 PERFORM 1 FROM public.cms_records c JOIN public.cms_revisions r ON r.id=c.published_revision_id AND r.record_id=c.id WHERE c.id=p_product AND c.archived_at IS NULL FOR SHARE OF c,r;
 IF NOT FOUND THEN PERFORM public.phase3_fail('not_found'); END IF;
 scope:=public.panda_agent_runtime_scope(p_product);
 RETURN jsonb_build_object('productId',p_product,'sku',scope->'product'->>'sku','scopeHash',encode(sha256(convert_to(scope::text,'UTF8')),'hex'));
END $$;
REVOKE ALL ON FUNCTION public.panda_agent_lightweight_scope(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.panda_agent_lightweight_scope(uuid) TO authenticated;

CREATE FUNCTION public.panda_agent_lightweight_citations_current(p_response jsonb,p_product uuid) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE cite jsonb; scope jsonb;
BEGIN
 IF jsonb_typeof(p_response->'citations') IS DISTINCT FROM 'array' OR jsonb_array_length(p_response->'citations')>4 THEN RETURN false; END IF;
 IF jsonb_array_length(p_response->'citations')=0 THEN RETURN coalesce(p_response->>'outcome' IN ('clarification','insufficient','conflict'),false); END IF;
 IF p_product IS NULL OR p_response->>'outcome'<>'evidence' THEN RETURN false; END IF;
 PERFORM public.panda_agent_lightweight_scope(p_product);
 scope:=public.panda_agent_runtime_scope(p_product);
 FOR cite IN SELECT value FROM jsonb_array_elements(p_response->'citations') LOOP
  IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(scope->'chunks') e WHERE
    scope->'product'->>'sourceUrl'=cite->>'sourceUrl' AND scope->'product'->>'title'=cite->>'title'
    AND e->>'capturedAt'=cite->>'capturedAt' AND e->'sectionPath'=cite->'sectionPath'
    AND length(cite->>'quote') BETWEEN 1 AND 600 AND position(cite->>'quote' IN e->>'text')>0
    AND e->>'logicalChunkId' NOT IN ('21638b9445898f6a03aa24d24a7e60cc344c6bbb2bccd33959537178c2bd4fb4','3ea5b9267d4102142b48cf8e5393e1f9a42fe0c3ff283c13cff04b5bdf3864ac')) THEN RETURN false; END IF;
 END LOOP;
 RETURN true;
EXCEPTION WHEN OTHERS THEN RETURN false;
END $$;
REVOKE ALL ON FUNCTION public.panda_agent_lightweight_citations_current(jsonb,uuid) FROM PUBLIC,anon,authenticated;

ALTER FUNCTION public.panda_agent_chat_read(uuid) RENAME TO panda_agent_chat_read_before_lightweight;
REVOKE ALL ON FUNCTION public.panda_agent_chat_read_before_lightweight(uuid) FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.panda_agent_lightweight_read(p_thread uuid) RETURNS jsonb
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
   IF allowed AND m.scope_hash IS NOT NULL THEN
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
REVOKE ALL ON FUNCTION public.panda_agent_lightweight_read(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.panda_agent_lightweight_read(uuid) TO authenticated;

CREATE FUNCTION public.panda_agent_chat_read(p_thread uuid) RETURNS jsonb
LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$ SELECT public.panda_agent_lightweight_read(p_thread) $$;
REVOKE ALL ON FUNCTION public.panda_agent_chat_read(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.panda_agent_chat_read(uuid) TO authenticated;

ALTER FUNCTION public.panda_agent_chat_begin(uuid,uuid,text) RENAME TO panda_agent_chat_begin_before_lightweight;
REVOKE ALL ON FUNCTION public.panda_agent_chat_begin_before_lightweight(uuid,uuid,text) FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.panda_agent_chat_begin(p_thread uuid,p_request uuid,p_question text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE result jsonb; safe_turn jsonb;
BEGIN
 result:=public.panda_agent_chat_begin_before_lightweight(p_thread,p_request,p_question);
 SELECT x INTO safe_turn FROM jsonb_array_elements(result->'turns') x WHERE x->>'requestId'=p_request::text;
 RETURN jsonb_set(result,'{turn,response}',coalesce(safe_turn->'response','null'::jsonb));
END $$;
REVOKE ALL ON FUNCTION public.panda_agent_chat_begin(uuid,uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.panda_agent_chat_begin(uuid,uuid,text) TO authenticated;

-- Preserve optional hosted callers' signatures, but never their raw stored-text bypass.
-- A clean lightweight install needs none of the optional native schema/functions.
DO $block$
DECLARE name text; private_name text; predicate text;
BEGIN
 FOREACH name IN ARRAY ARRAY['panda_agent_hosted_history_read','panda_agent_hosted_history_safe_read'] LOOP
  IF to_regprocedure('public.'||name||'(uuid,uuid)') IS NULL THEN CONTINUE; END IF;
  private_name:=name||'_before_lightweight';
  EXECUTE format('ALTER FUNCTION public.%I(uuid,uuid) RENAME TO %I',name,private_name);
  EXECUTE format('REVOKE ALL ON FUNCTION public.%I(uuid,uuid) FROM PUBLIC,anon,authenticated',private_name);
  predicate:=CASE WHEN name='panda_agent_hosted_history_safe_read' THEN 'AND x->''response''->>''outcome''<>''evidence'' AND x->''response''->''citations''=''[]''::jsonb' ELSE '' END;
  EXECUTE format($definition$
   CREATE FUNCTION public.%I(p_thread uuid,p_request uuid) RETURNS jsonb
   LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $body$
   DECLARE original jsonb; safe jsonb; history jsonb;
   BEGIN
    original:=public.%I(p_thread,p_request); -- Existing owner/latest-pending/archive guards.
    safe:=public.panda_agent_lightweight_read(p_thread);
    WITH recent AS (SELECT x FROM jsonb_array_elements(safe->'turns') x WHERE x->>'status'='complete' %s ORDER BY x->>'createdAt' DESC,x->>'requestId' DESC LIMIT 5),
    messages AS (SELECT x->>'createdAt' AS at,x->>'requestId' AS rid,0 AS pos,'user'::text AS role,left(x->>'question',1800) AS text FROM recent
      UNION ALL SELECT x->>'createdAt',x->>'requestId',1,'assistant',left(x->'response'->>'text',1800) FROM recent)
    SELECT coalesce(jsonb_agg(jsonb_build_object('role',role,'text',text) ORDER BY at,rid,pos),'[]'::jsonb) INTO history FROM messages;
    WHILE octet_length(history::text)>24000 AND jsonb_array_length(history)>2 LOOP history:=(history-0)-0; END LOOP;
    IF octet_length(history::text)>24000 THEN PERFORM public.phase3_fail('conflict'); END IF;
    RETURN original||jsonb_build_object('history',history);
   END $body$
  $definition$,name,private_name,predicate);
  EXECUTE format('REVOKE ALL ON FUNCTION public.%I(uuid,uuid) FROM PUBLIC,anon',name);
  EXECUTE format('GRANT EXECUTE ON FUNCTION public.%I(uuid,uuid) TO authenticated',name);
 END LOOP;
END $block$;

CREATE FUNCTION public.panda_agent_lightweight_begin(p_payload text,p_mac text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE v jsonb; result jsonb; tid uuid; rid uuid;
BEGIN
 v:=public.panda_agent_lightweight_verify(p_payload,p_mac,'begin'); tid:=(v->>'thread')::uuid; rid:=(v->>'request')::uuid;
 result:=public.panda_agent_chat_begin_v2(tid,rid,v->>'question',false);
 IF (v->>'exp')::bigint<extract(epoch FROM clock_timestamp()) THEN PERFORM public.phase3_fail('unauthenticated'); END IF;
 IF (result->>'admitted')::boolean THEN
  INSERT INTO public.panda_agent_lightweight_turns(thread_id,request_id,owner_subject) VALUES(tid,rid,public.requesting_user_id());
 ELSIF NOT EXISTS(SELECT 1 FROM public.panda_agent_lightweight_turns WHERE thread_id=tid AND request_id=rid AND owner_subject=public.requesting_user_id()) THEN PERFORM public.phase3_fail('conflict'); END IF;
 RETURN (public.panda_agent_lightweight_read(tid))||jsonb_build_object('admitted',result->'admitted');
END $$;
REVOKE ALL ON FUNCTION public.panda_agent_lightweight_begin(text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.panda_agent_lightweight_begin(text,text) TO authenticated;

CREATE FUNCTION public.panda_agent_lightweight_prepare(p_payload text,p_mac text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE v jsonb; m public.panda_agent_lightweight_turns; scope jsonb;
BEGIN
 v:=public.panda_agent_lightweight_verify(p_payload,p_mac,'prepare');
 PERFORM 1 FROM public.panda_agent_chats WHERE id=(v->>'thread')::uuid AND owner_subject=public.requesting_user_id() AND archived_at IS NULL FOR UPDATE;
 IF NOT FOUND THEN PERFORM public.phase3_fail('not_found'); END IF;
 PERFORM 1 FROM public.panda_agent_chat_turns WHERE thread_id=(v->>'thread')::uuid AND request_id=(v->>'request')::uuid AND question=v->>'question' AND status='pending' FOR UPDATE;
 IF NOT FOUND THEN PERFORM public.phase3_fail('conflict'); END IF;
 SELECT * INTO m FROM public.panda_agent_lightweight_turns WHERE thread_id=(v->>'thread')::uuid AND request_id=(v->>'request')::uuid AND owner_subject=public.requesting_user_id() FOR UPDATE;
 IF NOT FOUND THEN PERFORM public.phase3_fail('not_found'); END IF;
 IF jsonb_typeof(v->'digest') IS DISTINCT FROM 'string' OR coalesce(v->>'digest','') !~ '^[a-f0-9]{64}$'
 OR jsonb_typeof(v->'sku') IS DISTINCT FROM 'string' OR length(btrim(v->>'sku')) NOT BETWEEN 1 AND 128
 OR coalesce(v->>'scopeHash','') !~ '^[a-f0-9]{64}$' THEN PERFORM public.phase3_fail('invalid'); END IF;
 scope:=public.panda_agent_lightweight_scope((v->>'product')::uuid);
 IF (v->>'exp')::bigint<extract(epoch FROM clock_timestamp()) THEN PERFORM public.phase3_fail('unauthenticated'); END IF;
 IF scope->>'scopeHash' IS DISTINCT FROM v->>'scopeHash' OR scope->>'sku' IS DISTINCT FROM v->>'sku' THEN PERFORM public.phase3_fail('conflict'); END IF;
 IF m.request_hash IS NOT NULL THEN
  IF (m.request_hash,m.sku,m.product_id,m.scope_hash) IS DISTINCT FROM (v->>'digest',v->>'sku',(v->>'product')::uuid,v->>'scopeHash') THEN PERFORM public.phase3_fail('conflict'); END IF;
  RETURN jsonb_build_object('execute',false);
 END IF;
 UPDATE public.panda_agent_lightweight_turns SET request_hash=v->>'digest',sku=v->>'sku',product_id=(v->>'product')::uuid,scope_hash=v->>'scopeHash' WHERE thread_id=m.thread_id AND request_id=m.request_id;
 RETURN jsonb_build_object('execute',true);
END $$;
REVOKE ALL ON FUNCTION public.panda_agent_lightweight_prepare(text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.panda_agent_lightweight_prepare(text,text) TO authenticated;

CREATE FUNCTION public.panda_agent_lightweight_execution(p_thread uuid,p_request uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE m public.panda_agent_lightweight_turns;
BEGIN
 IF public.requesting_user_id() IS NULL THEN PERFORM public.phase3_fail('unauthenticated'); END IF;
 PERFORM 1 FROM public.panda_agent_chats WHERE id=p_thread AND owner_subject=public.requesting_user_id() FOR SHARE;
 IF NOT FOUND THEN PERFORM public.phase3_fail('not_found'); END IF;
 PERFORM 1 FROM public.panda_agent_chat_turns WHERE thread_id=p_thread AND request_id=p_request;
 IF NOT FOUND THEN PERFORM public.phase3_fail('not_found'); END IF;
 SELECT * INTO m FROM public.panda_agent_lightweight_turns WHERE thread_id=p_thread AND request_id=p_request AND owner_subject=public.requesting_user_id();
 IF NOT FOUND THEN RETURN jsonb_build_object('prepared',false,'digest',NULL,'sku',NULL,'scopeHash',NULL,'productId',NULL); END IF;
 RETURN jsonb_build_object('prepared',m.request_hash IS NOT NULL,'digest',m.request_hash,'sku',m.sku,'scopeHash',m.scope_hash,'productId',m.product_id);
END $$;
REVOKE ALL ON FUNCTION public.panda_agent_lightweight_execution(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.panda_agent_lightweight_execution(uuid,uuid) TO authenticated;

CREATE FUNCTION public.panda_agent_lightweight_write_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM public.panda_agent_lightweight_turns m WHERE m.thread_id=NEW.thread_id AND m.request_id=NEW.request_id
 AND (m.approved_response_hash IS NULL OR m.approved_response_hash IS DISTINCT FROM encode(sha256(convert_to(NEW.response::text,'UTF8')),'hex'))) THEN PERFORM public.phase3_fail('conflict'); END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.panda_agent_lightweight_write_guard() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER panda_agent_lightweight_write_guard BEFORE UPDATE OF response,status ON public.panda_agent_chat_turns FOR EACH ROW EXECUTE FUNCTION public.panda_agent_lightweight_write_guard();

CREATE FUNCTION public.panda_agent_lightweight_complete(p_payload text,p_mac text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE v jsonb; m public.panda_agent_lightweight_turns; t public.panda_agent_chat_turns; answer jsonb; digest text;
BEGIN
 v:=public.panda_agent_lightweight_verify(p_payload,p_mac,'complete'); answer:=v->'answer';
 IF jsonb_typeof(answer) IS DISTINCT FROM 'object' THEN PERFORM public.phase3_fail('invalid'); END IF;
 IF NOT answer ?& ARRAY['outcome','text','citations'] OR (SELECT count(*) FROM jsonb_object_keys(answer))<>3 OR coalesce(answer->>'outcome','') NOT IN ('evidence','clarification','insufficient','conflict') OR jsonb_typeof(answer->'text') IS DISTINCT FROM 'string' OR length(btrim(answer->>'text')) NOT BETWEEN 1 AND 8000 OR octet_length(answer::text)>24000 THEN PERFORM public.phase3_fail('invalid'); END IF;
 PERFORM 1 FROM public.panda_agent_chats WHERE id=(v->>'thread')::uuid AND owner_subject=public.requesting_user_id() AND archived_at IS NULL FOR UPDATE;
 IF NOT FOUND THEN PERFORM public.phase3_fail('not_found'); END IF;
 SELECT * INTO t FROM public.panda_agent_chat_turns WHERE thread_id=(v->>'thread')::uuid AND request_id=(v->>'request')::uuid FOR UPDATE;
 SELECT * INTO m FROM public.panda_agent_lightweight_turns WHERE thread_id=t.thread_id AND request_id=t.request_id AND owner_subject=public.requesting_user_id() FOR UPDATE;
 IF NOT FOUND THEN PERFORM public.phase3_fail('not_found'); END IF;
 digest:=encode(sha256(convert_to(answer::text,'UTF8')),'hex');
 IF (v->>'exp')::bigint<extract(epoch FROM clock_timestamp()) THEN PERFORM public.phase3_fail('unauthenticated'); END IF;
 IF m.approved_response_hash IS NOT NULL THEN
  IF m.approved_response_hash<>digest OR t.status<>'complete' THEN PERFORM public.phase3_fail('conflict'); END IF;
 ELSE
  IF m.scope_hash IS NOT NULL AND (public.panda_agent_lightweight_scope(m.product_id)->>'scopeHash') IS DISTINCT FROM m.scope_hash THEN PERFORM public.phase3_fail('conflict'); END IF;
  IF public.panda_agent_lightweight_citations_current(answer,m.product_id) IS NOT TRUE THEN PERFORM public.phase3_fail('conflict'); END IF;
  IF (v->>'exp')::bigint<extract(epoch FROM clock_timestamp()) THEN PERFORM public.phase3_fail('unauthenticated'); END IF;
  UPDATE public.panda_agent_lightweight_turns SET approved_response_hash=digest WHERE thread_id=t.thread_id AND request_id=t.request_id;
  UPDATE public.panda_agent_chat_turns SET response=answer,status='complete',completed_at=clock_timestamp() WHERE thread_id=t.thread_id AND request_id=t.request_id;
  UPDATE public.panda_agent_chats SET updated_at=clock_timestamp() WHERE id=t.thread_id;
 END IF;
 RETURN public.panda_agent_lightweight_read(t.thread_id);
END $$;
REVOKE ALL ON FUNCTION public.panda_agent_lightweight_complete(text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.panda_agent_lightweight_complete(text,text) TO authenticated;
