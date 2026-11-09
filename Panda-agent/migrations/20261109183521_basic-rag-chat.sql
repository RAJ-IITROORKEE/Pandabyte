-- Additive development-only one-shot RAG classification. Existing turn/history tables remain authoritative.
CREATE TABLE public.panda_agent_basic_rag_turns (
 thread_id uuid NOT NULL, request_id uuid NOT NULL, owner_subject text NOT NULL,
 phase text NOT NULL DEFAULT 'admitted' CHECK (phase IN ('admitted','claimed','completing','terminal')),
 response_hash text CHECK (response_hash ~ '^[a-f0-9]{64}$'), cancelled boolean NOT NULL DEFAULT false,
 PRIMARY KEY(thread_id,request_id),
 FOREIGN KEY(thread_id,request_id) REFERENCES public.panda_agent_lightweight_turns(thread_id,request_id) ON DELETE CASCADE,
 CHECK ((phase IN ('completing','terminal'))=(response_hash IS NOT NULL)), CHECK (NOT cancelled OR phase='terminal')
);
ALTER TABLE public.panda_agent_basic_rag_turns ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.panda_agent_basic_rag_turns FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.panda_agent_basic_rag_state(p_thread uuid,p_request uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE result jsonb;
BEGIN
 IF public.requesting_user_id() IS NULL THEN PERFORM public.phase3_fail('unauthenticated'); END IF;
 PERFORM 1 FROM public.panda_agent_chats WHERE id=p_thread AND owner_subject=public.requesting_user_id() FOR SHARE;
 IF NOT FOUND THEN PERFORM public.phase3_fail('not_found'); END IF;
 SELECT jsonb_build_object('question',t.question,'status',t.status,'prepared',m.request_hash IS NOT NULL,'cancelled',g.cancelled)
 INTO result FROM public.panda_agent_basic_rag_turns g
 JOIN public.panda_agent_chat_turns t USING(thread_id,request_id)
 JOIN public.panda_agent_lightweight_turns m USING(thread_id,request_id)
 WHERE g.thread_id=p_thread AND g.request_id=p_request AND g.owner_subject=public.requesting_user_id() AND m.owner_subject=g.owner_subject;
 RETURN result;
END $$;

CREATE FUNCTION public.panda_agent_basic_rag_begin(p_payload text,p_mac text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE v jsonb; r jsonb;
BEGIN
 v:=public.panda_agent_lightweight_verify(p_payload,p_mac,'begin');
 r:=public.panda_agent_lightweight_begin_before_basic_rag(p_payload,p_mac);
 IF (r->>'admitted')::boolean THEN
  INSERT INTO public.panda_agent_basic_rag_turns(thread_id,request_id,owner_subject)
  VALUES((v->>'thread')::uuid,(v->>'request')::uuid,public.requesting_user_id());
 ELSIF NOT EXISTS(SELECT 1 FROM public.panda_agent_basic_rag_turns WHERE thread_id=(v->>'thread')::uuid AND request_id=(v->>'request')::uuid AND owner_subject=public.requesting_user_id())
 THEN PERFORM public.phase3_fail('conflict'); END IF;
 RETURN r;
END $$;

CREATE FUNCTION public.panda_agent_basic_rag_prepare(p_payload text,p_mac text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE v jsonb; g public.panda_agent_basic_rag_turns; r jsonb;
BEGIN
 v:=public.panda_agent_lightweight_verify(p_payload,p_mac,'prepare');
 PERFORM 1 FROM public.panda_agent_chats WHERE id=(v->>'thread')::uuid AND owner_subject=public.requesting_user_id() AND archived_at IS NULL FOR UPDATE;
 IF NOT FOUND THEN PERFORM public.phase3_fail('not_found'); END IF;
 SELECT * INTO g FROM public.panda_agent_basic_rag_turns WHERE thread_id=(v->>'thread')::uuid AND request_id=(v->>'request')::uuid AND owner_subject=public.requesting_user_id() FOR UPDATE;
 IF NOT FOUND OR g.phase='terminal' THEN PERFORM public.phase3_fail('conflict'); END IF;
 r:=public.panda_agent_lightweight_prepare_before_basic_rag(p_payload,p_mac);
 IF (r->>'execute')::boolean THEN
  IF g.phase<>'admitted' THEN PERFORM public.phase3_fail('conflict'); END IF;
  UPDATE public.panda_agent_basic_rag_turns SET phase='claimed' WHERE thread_id=g.thread_id AND request_id=g.request_id;
 ELSIF g.phase<>'claimed' THEN PERFORM public.phase3_fail('conflict'); END IF;
 RETURN r;
END $$;

CREATE FUNCTION public.panda_agent_basic_rag_complete(p_payload text,p_mac text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE v jsonb; g public.panda_agent_basic_rag_turns; digest text; result jsonb; actual_hash text;
BEGIN
 v:=public.panda_agent_lightweight_verify(p_payload,p_mac,'complete');
 PERFORM 1 FROM public.panda_agent_chats WHERE id=(v->>'thread')::uuid AND owner_subject=public.requesting_user_id() AND archived_at IS NULL FOR UPDATE;
 IF NOT FOUND THEN PERFORM public.phase3_fail('not_found'); END IF;
 SELECT * INTO g FROM public.panda_agent_basic_rag_turns WHERE thread_id=(v->>'thread')::uuid AND request_id=(v->>'request')::uuid AND owner_subject=public.requesting_user_id() FOR UPDATE;
 IF NOT FOUND OR g.cancelled THEN PERFORM public.phase3_fail('conflict'); END IF;
 IF g.phase='admitted' AND v->'answer'->>'outcome'='evidence' THEN PERFORM public.phase3_fail('conflict'); END IF;
 digest:=encode(sha256(convert_to((v->'answer')::text,'UTF8')),'hex');
 IF g.phase='terminal' AND g.response_hash IS DISTINCT FROM digest THEN PERFORM public.phase3_fail('conflict'); END IF;
 UPDATE public.panda_agent_basic_rag_turns SET phase='completing',response_hash=digest WHERE thread_id=g.thread_id AND request_id=g.request_id;
 result:=public.panda_agent_lightweight_complete_before_basic_rag(p_payload,p_mac);
 -- The existing skill guard may deliberately finalize its fixed unavailable response.
 SELECT encode(sha256(convert_to(t.response::text,'UTF8')),'hex') INTO actual_hash
 FROM public.panda_agent_chat_turns t JOIN public.panda_agent_lightweight_turns m USING(thread_id,request_id)
 WHERE t.thread_id=g.thread_id AND t.request_id=g.request_id AND t.status='complete'
 AND m.owner_subject=g.owner_subject AND m.approved_response_hash=encode(sha256(convert_to(t.response::text,'UTF8')),'hex');
 IF actual_hash IS NULL THEN PERFORM public.phase3_fail('conflict'); END IF;
 UPDATE public.panda_agent_basic_rag_turns SET phase='terminal',response_hash=actual_hash WHERE thread_id=g.thread_id AND request_id=g.request_id;
 RETURN result;
END $$;

-- Logical cancellation fences publication. It does not claim a remote provider interrupt.
CREATE FUNCTION public.panda_agent_basic_rag_cancel(p_payload text,p_mac text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE v jsonb; g public.panda_agent_basic_rag_turns; t public.panda_agent_chat_turns; answer jsonb; digest text;
BEGIN
 v:=public.panda_agent_lightweight_verify(p_payload,p_mac,'cancel');
 PERFORM 1 FROM public.panda_agent_chats WHERE id=(v->>'thread')::uuid AND owner_subject=public.requesting_user_id() AND archived_at IS NULL FOR UPDATE;
 IF NOT FOUND THEN PERFORM public.phase3_fail('not_found'); END IF;
 SELECT * INTO t FROM public.panda_agent_chat_turns WHERE thread_id=(v->>'thread')::uuid AND request_id=(v->>'request')::uuid FOR UPDATE;
 IF NOT FOUND THEN PERFORM public.phase3_fail('not_found'); END IF;
 SELECT * INTO g FROM public.panda_agent_basic_rag_turns WHERE thread_id=t.thread_id AND request_id=t.request_id AND owner_subject=public.requesting_user_id() FOR UPDATE;
 IF NOT FOUND THEN PERFORM public.phase3_fail('not_found'); END IF;
 IF (v->>'exp')::bigint<extract(epoch FROM clock_timestamp()) THEN PERFORM public.phase3_fail('unauthenticated'); END IF;
 IF g.phase='terminal' THEN RETURN public.panda_agent_lightweight_read(t.thread_id); END IF;
 IF t.status<>'pending' THEN PERFORM public.phase3_fail('conflict'); END IF;
 answer:=jsonb_build_object('outcome','insufficient','text',CASE WHEN g.phase='admitted' THEN 'Stopped before a model request was sent. You can send a new question.' ELSE 'Stopped waiting for this answer. The provider may still process the request. No late answer will be saved.' END,'citations','[]'::jsonb);
 digest:=encode(sha256(convert_to(answer::text,'UTF8')),'hex');
 UPDATE public.panda_agent_basic_rag_turns SET phase='terminal',response_hash=digest,cancelled=true WHERE thread_id=t.thread_id AND request_id=t.request_id;
 UPDATE public.panda_agent_lightweight_turns SET approved_response_hash=digest,cancelled_at=clock_timestamp() WHERE thread_id=t.thread_id AND request_id=t.request_id AND owner_subject=public.requesting_user_id();
 UPDATE public.panda_agent_chat_turns SET response=answer,status='complete',completed_at=clock_timestamp() WHERE thread_id=t.thread_id AND request_id=t.request_id;
 UPDATE public.panda_agent_chats SET updated_at=clock_timestamp() WHERE id=t.thread_id;
 RETURN public.panda_agent_lightweight_read(t.thread_id);
END $$;

CREATE FUNCTION public.panda_agent_basic_rag_write_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE g public.panda_agent_basic_rag_turns; digest text;
BEGIN
 SELECT * INTO g FROM public.panda_agent_basic_rag_turns WHERE thread_id=NEW.thread_id AND request_id=NEW.request_id;
 IF FOUND THEN
  digest:=encode(sha256(convert_to(NEW.response::text,'UTF8')),'hex');
  IF NEW.status<>'complete' OR g.phase NOT IN ('completing','terminal') THEN PERFORM public.phase3_fail('conflict'); END IF;
  IF g.phase='terminal' AND g.response_hash IS DISTINCT FROM digest THEN PERFORM public.phase3_fail('conflict'); END IF;
  IF g.phase='completing' AND NOT EXISTS(SELECT 1 FROM public.panda_agent_lightweight_turns m WHERE m.thread_id=NEW.thread_id AND m.request_id=NEW.request_id AND m.owner_subject=g.owner_subject AND m.approved_response_hash=digest) THEN PERFORM public.phase3_fail('conflict'); END IF;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.panda_agent_basic_rag_write_guard() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER panda_agent_basic_rag_write_guard BEFORE UPDATE OF response,status ON public.panda_agent_chat_turns FOR EACH ROW EXECUTE FUNCTION public.panda_agent_basic_rag_write_guard();

-- Old signed workflows cannot take over a one-shot RAG turn. All prior guards remain in the private chain.
DO $block$
DECLARE action text; name text; prior text;
BEGIN
 FOREACH action IN ARRAY ARRAY['begin','prepare','complete','cancel'] LOOP
  name:='panda_agent_lightweight_'||action; prior:=name||'_before_basic_rag';
  EXECUTE format('ALTER FUNCTION public.%I(text,text) RENAME TO %I',name,prior);
  EXECUTE format('REVOKE ALL ON FUNCTION public.%I(text,text) FROM PUBLIC,anon,authenticated',prior);
  EXECUTE format($definition$
   CREATE FUNCTION public.%I(p_payload text,p_mac text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $body$
   DECLARE v jsonb; BEGIN
    v:=public.panda_agent_lightweight_verify(p_payload,p_mac,%L);
    PERFORM 1 FROM public.panda_agent_chats WHERE id=(v->>'thread')::uuid AND owner_subject=public.requesting_user_id() AND archived_at IS NULL FOR UPDATE;
    IF NOT FOUND THEN PERFORM public.phase3_fail('not_found'); END IF;
    IF EXISTS(SELECT 1 FROM public.panda_agent_basic_rag_turns WHERE thread_id=(v->>'thread')::uuid AND request_id=(v->>'request')::uuid) THEN PERFORM public.phase3_fail('conflict'); END IF;
    RETURN public.%I(p_payload,p_mac);
   END $body$
  $definition$,name,action,prior);
  EXECUTE format('REVOKE ALL ON FUNCTION public.%I(text,text) FROM PUBLIC,anon',name);
  EXECUTE format('GRANT EXECUTE ON FUNCTION public.%I(text,text) TO authenticated',name);
 END LOOP;
END $block$;
REVOKE ALL ON FUNCTION public.panda_agent_basic_rag_state(uuid,uuid),public.panda_agent_basic_rag_begin(text,text),public.panda_agent_basic_rag_prepare(text,text),public.panda_agent_basic_rag_complete(text,text),public.panda_agent_basic_rag_cancel(text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.panda_agent_basic_rag_state(uuid,uuid),public.panda_agent_basic_rag_begin(text,text),public.panda_agent_basic_rag_prepare(text,text),public.panda_agent_basic_rag_complete(text,text),public.panda_agent_basic_rag_cancel(text,text) TO authenticated;
