-- Forward-only grant fences for diagnostic context, protected save and history replay.
CREATE FUNCTION public.panda_agent_diagnostic_grants_current(p_qa_epoch integer,p_tool_epoch integer,p_tool_dispatched boolean,p_tool_result jsonb) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE s public.panda_agent_skills;t public.panda_agent_tools;BEGIN
 SELECT * INTO s FROM public.panda_agent_skills WHERE id='product-evidence-qa' FOR SHARE NOWAIT;
 IF NOT FOUND OR s.enabled IS DISTINCT FROM true OR s.version IS DISTINCT FROM p_qa_epoch THEN RETURN false;END IF;
 IF p_tool_dispatched IS NOT TRUE THEN RETURN p_tool_dispatched IS FALSE AND p_tool_epoch IS NULL AND p_tool_result IS NULL;END IF;
 SELECT * INTO t FROM public.panda_agent_tools WHERE id='search_vendor_docs' FOR SHARE NOWAIT;
 RETURN FOUND AND t.enabled IS TRUE AND t.version IS NOT DISTINCT FROM p_tool_epoch AND p_tool_result IS NOT NULL;
END $$;
REVOKE ALL ON FUNCTION public.panda_agent_diagnostic_grants_current(integer,integer,boolean,jsonb) FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION public.panda_agent_lightweight_read(p_thread uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE r jsonb;g public.panda_agent_diagnostic_turns;t public.panda_agent_chat_turns;m public.panda_agent_lightweight_turns;a jsonb;ms jsonb;ts jsonb;grants jsonb:='{}'::jsonb;BEGIN
 PERFORM 1 FROM public.panda_agent_chats WHERE id=p_thread AND owner_subject=public.requesting_user_id() FOR SHARE;IF NOT FOUND THEN PERFORM public.phase3_fail('not_found');END IF;
 IF EXISTS(SELECT 1 FROM public.panda_agent_diagnostic_turns WHERE thread_id=p_thread) THEN
  -- Legacy callers can hold lifecycle; fail fast on contended row locks here.
  PERFORM 1 FROM public.panda_agent_skills WHERE id IN ('product-evidence-qa','embedded-project-guide') ORDER BY id FOR SHARE NOWAIT;
  FOR g IN SELECT * FROM public.panda_agent_diagnostic_turns WHERE thread_id=p_thread AND owner_subject=public.requesting_user_id() ORDER BY request_id FOR SHARE NOWAIT LOOP
   grants:=grants||jsonb_build_object(g.request_id::text,public.panda_agent_diagnostic_grants_current(g.qa_skill_epoch,g.tool_epoch,g.tool_dispatched,g.tool_result));
  END LOOP;
  PERFORM pg_advisory_xact_lock(hashtext('panda_agent_lifecycle'));
 END IF;
 r:=public.panda_agent_lightweight_read_before_diagnostics(p_thread);ms:=r->'messages';ts:=r->'turns';
 FOR g IN SELECT * FROM public.panda_agent_diagnostic_turns WHERE thread_id=p_thread AND owner_subject=public.requesting_user_id() LOOP
  SELECT * INTO t FROM public.panda_agent_chat_turns WHERE thread_id=p_thread AND request_id=g.request_id AND status='complete';IF NOT FOUND THEN CONTINUE;END IF;
  SELECT * INTO m FROM public.panda_agent_lightweight_turns WHERE thread_id=p_thread AND request_id=g.request_id AND owner_subject=public.requesting_user_id();
  IF FOUND AND m.approved_response_hash=encode(sha256(convert_to(t.response::text,'UTF8')),'hex') AND coalesce((grants->>g.request_id::text)::boolean,false) AND public.panda_agent_diagnostic_answer_current(t.response,g.input,g.scope_hash,g.bindings) THEN a:=t.response;
  ELSE a:=jsonb_build_object('outcome','insufficient','text','This saved diagnostic answer is unavailable because its reviewed source or verification is no longer current.','citations','[]'::jsonb);END IF;
  SELECT coalesce(jsonb_agg(CASE WHEN x->>'id'=t.assistant_message_id::text THEN x||jsonb_build_object('text',a->>'text','citations',a->'citations') ELSE x END ORDER BY ord),'[]') INTO ms FROM jsonb_array_elements(ms) WITH ORDINALITY z(x,ord);
  SELECT coalesce(jsonb_agg(CASE WHEN x->>'requestId'=t.request_id::text THEN x||jsonb_build_object('response',a) ELSE x END ORDER BY ord),'[]') INTO ts FROM jsonb_array_elements(ts) WITH ORDINALITY z(x,ord);
 END LOOP;
 RETURN r||jsonb_build_object('messages',ms,'turns',ts);
END $$;
CREATE OR REPLACE FUNCTION public.panda_agent_diagnostic_complete(p_payload text,p_mac text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE v jsonb;g public.panda_agent_diagnostic_turns;t public.panda_agent_chat_turns;m public.panda_agent_lightweight_turns;s public.panda_agent_skills;a jsonb;digest text;valid boolean;grants_ok boolean;BEGIN
 v:=public.panda_agent_diagnostic_verify(p_payload,p_mac,'complete');a:=v->'answer';
 PERFORM 1 FROM public.panda_agent_chats WHERE id=(v->>'thread')::uuid AND owner_subject=public.requesting_user_id() AND archived_at IS NULL FOR UPDATE;IF NOT FOUND THEN PERFORM public.phase3_fail('not_found');END IF;
 SELECT * INTO t FROM public.panda_agent_chat_turns WHERE thread_id=(v->>'thread')::uuid AND request_id=(v->>'request')::uuid FOR UPDATE;
 SELECT * INTO g FROM public.panda_agent_diagnostic_turns WHERE thread_id=t.thread_id AND request_id=t.request_id AND owner_subject=public.requesting_user_id() FOR UPDATE;IF NOT FOUND THEN PERFORM public.phase3_fail('not_found');END IF;
 SELECT * INTO m FROM public.panda_agent_lightweight_turns WHERE thread_id=t.thread_id AND request_id=t.request_id AND owner_subject=public.requesting_user_id() FOR UPDATE;IF NOT FOUND THEN PERFORM public.phase3_fail('not_found');END IF;
 IF (v->>'exp')::bigint<extract(epoch FROM clock_timestamp()) THEN PERFORM public.phase3_fail('unauthenticated');END IF;
 IF t.status='complete' THEN RETURN public.panda_agent_lightweight_read(t.thread_id);END IF;
 IF t.status<>'pending' OR m.approved_response_hash IS NOT NULL OR m.request_hash IS NOT NULL THEN PERFORM public.phase3_fail('conflict');END IF;
 PERFORM 1 FROM public.panda_agent_skills WHERE id IN ('product-evidence-qa','embedded-project-guide') ORDER BY id FOR SHARE;
 SELECT * INTO s FROM public.panda_agent_skills WHERE id='product-evidence-qa' FOR SHARE;
 grants_ok:=public.panda_agent_diagnostic_grants_current(g.qa_skill_epoch,g.tool_epoch,g.tool_dispatched,g.tool_result);
 PERFORM pg_advisory_xact_lock(hashtext('panda_agent_lifecycle'));
 valid:=s.enabled IS TRUE AND s.version=g.qa_skill_epoch AND public.panda_agent_diagnostic_answer_current(a,g.input,v->>'scopeHash',v->'bindings');
 IF grants_ok IS NOT TRUE THEN valid:=false;END IF;
 IF valid IS NOT TRUE THEN a:=jsonb_build_object('outcome','insufficient','text','This diagnostic request ended because its skill, reviewed evidence or optional tool changed. Start a new request.','citations','[]'::jsonb);END IF;
 IF (v->>'exp')::bigint<extract(epoch FROM clock_timestamp()) THEN PERFORM public.phase3_fail('unauthenticated');END IF;
 digest:=encode(sha256(convert_to(a::text,'UTF8')),'hex');
 UPDATE public.panda_agent_diagnostic_turns SET scope_hash=CASE WHEN valid THEN v->>'scopeHash' ELSE NULL END,bindings=CASE WHEN valid THEN v->'bindings' ELSE '[]'::jsonb END WHERE thread_id=t.thread_id AND request_id=t.request_id;
 UPDATE public.panda_agent_lightweight_turns SET approved_response_hash=digest WHERE thread_id=t.thread_id AND request_id=t.request_id;
 UPDATE public.panda_agent_chat_turns SET response=a,status='complete',completed_at=clock_timestamp() WHERE thread_id=t.thread_id AND request_id=t.request_id;
 UPDATE public.panda_agent_chats SET updated_at=clock_timestamp() WHERE id=t.thread_id;
 RETURN public.panda_agent_lightweight_read(t.thread_id);
END $$;
CREATE OR REPLACE FUNCTION public.panda_agent_diagnostic_toolclaim(p_payload text,p_mac text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE v jsonb;g public.panda_agent_diagnostic_turns;t public.panda_agent_tools;BEGIN
 v:=public.panda_agent_diagnostic_verify(p_payload,p_mac,'toolclaim');
 PERFORM 1 FROM public.panda_agent_chats WHERE id=(v->>'thread')::uuid AND owner_subject=public.requesting_user_id() AND archived_at IS NULL FOR UPDATE;IF NOT FOUND THEN PERFORM public.phase3_fail('not_found');END IF;
 PERFORM 1 FROM public.panda_agent_chat_turns WHERE thread_id=(v->>'thread')::uuid AND request_id=(v->>'request')::uuid AND status='pending' FOR UPDATE;IF NOT FOUND THEN PERFORM public.phase3_fail('conflict');END IF;
 SELECT * INTO g FROM public.panda_agent_diagnostic_turns WHERE thread_id=(v->>'thread')::uuid AND request_id=(v->>'request')::uuid AND owner_subject=public.requesting_user_id() FOR UPDATE;IF NOT FOUND THEN PERFORM public.phase3_fail('not_found');END IF;
 IF g.input->>'chip'<>'esp32' OR g.input->>'frameworkVersion'<>'5.5.1' THEN PERFORM public.phase3_fail('conflict');END IF;
 IF public.panda_agent_diagnostic_grants_current(g.qa_skill_epoch,NULL,false,NULL) IS NOT TRUE THEN PERFORM public.phase3_fail('conflict');END IF;
 SELECT * INTO t FROM public.panda_agent_tools WHERE id='search_vendor_docs' FOR SHARE;
 IF t.enabled IS DISTINCT FROM true OR jsonb_typeof(v->'toolVersion') IS DISTINCT FROM 'number' OR t.version::text IS DISTINCT FROM v->>'toolVersion' THEN PERFORM public.phase3_fail('conflict');END IF;
 IF (v->>'exp')::bigint<extract(epoch FROM clock_timestamp()) THEN PERFORM public.phase3_fail('unauthenticated');END IF;
 IF g.tool_dispatched THEN RETURN jsonb_build_object('execute',false);END IF;
 UPDATE public.panda_agent_diagnostic_turns SET tool_epoch=t.version,tool_dispatched=true WHERE thread_id=g.thread_id AND request_id=g.request_id;
 RETURN jsonb_build_object('execute',true);
END $$;
REVOKE ALL ON FUNCTION public.panda_agent_lightweight_read(uuid),public.panda_agent_diagnostic_complete(text,text),public.panda_agent_diagnostic_toolclaim(text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.panda_agent_lightweight_read(uuid),public.panda_agent_diagnostic_complete(text,text),public.panda_agent_diagnostic_toolclaim(text,text) TO authenticated;
