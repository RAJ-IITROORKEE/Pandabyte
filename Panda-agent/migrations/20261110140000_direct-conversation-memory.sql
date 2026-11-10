-- Additive direct-chat context; the existing live RPC remains unchanged.
CREATE FUNCTION public.panda_agent_direct_context(p_thread uuid,p_request uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE actor text:=public.requesting_user_id(); current_turn public.panda_agent_chat_turns; entries jsonb; ids jsonb;
BEGIN
 IF actor IS NULL OR NOT EXISTS(SELECT 1 FROM public.panda_agent_chats WHERE id=p_thread AND owner_subject=actor AND archived_at IS NULL) THEN PERFORM public.phase3_fail('not_found'); END IF;
 SELECT * INTO current_turn FROM public.panda_agent_chat_turns WHERE thread_id=p_thread AND request_id=p_request;
 IF NOT FOUND OR NOT EXISTS(SELECT 1 FROM public.panda_agent_direct_turns WHERE thread_id=p_thread AND request_id=p_request AND owner_subject=actor) THEN PERFORM public.phase3_fail('not_found'); END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',request_id,'questionHash',question_hash,'responseHash',response_hash) ORDER BY created_at,request_id),'[]'::jsonb),
        coalesce(jsonb_agg(to_jsonb(request_id) ORDER BY created_at,request_id),'[]'::jsonb) INTO entries,ids
 FROM (
  SELECT t.request_id,t.created_at,encode(sha256(convert_to(t.question,'UTF8')),'hex') question_hash,d.response_hash
  FROM public.panda_agent_direct_turns d JOIN public.panda_agent_chat_turns t USING(thread_id,request_id)
  JOIN public.panda_agent_lightweight_turns m USING(thread_id,request_id)
  WHERE d.thread_id=p_thread AND d.owner_subject=actor AND m.owner_subject=actor
    AND (t.created_at,t.request_id)<(current_turn.created_at,current_turn.request_id)
    AND t.status='complete' AND d.terminal AND NOT d.cancelled AND d.claimed AND d.usage IS NOT NULL
    AND d.response_hash=m.approved_response_hash AND d.answer_hash=d.response_hash
    AND d.response_hash=encode(sha256(convert_to(t.response::text,'UTF8')),'hex')
    AND t.response->>'outcome'='conversation' AND t.response->'citations'='[]'::jsonb
  ORDER BY t.created_at DESC,t.request_id DESC LIMIT 6
 ) eligible;
 RETURN jsonb_build_object('contextRequestIds',ids,'contextHash',encode(sha256(convert_to(entries::text,'UTF8')),'hex'));
END $$;
REVOKE ALL ON FUNCTION public.panda_agent_direct_context(uuid,uuid) FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.panda_agent_direct_chat_v2(p_payload text,p_mac text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE result jsonb; v jsonb; context jsonb;
BEGIN
 result:=public.panda_agent_direct_chat(p_payload,p_mac);
 v:=(p_payload::jsonb)->'input';
 IF result IS NULL OR result='null'::jsonb THEN RETURN result; END IF;
 IF v->>'op'='begin' AND result->'admitted'='true'::jsonb THEN
  context:=public.panda_agent_direct_context((v->>'thread')::uuid,(v->>'request')::uuid);
  RETURN result||context;
 ELSIF v->>'op'='state' THEN
  context:=public.panda_agent_direct_context((v->>'thread')::uuid,(v->>'request')::uuid);
  RETURN result||jsonb_build_object('contextHash',context->'contextHash');
 END IF;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.panda_agent_direct_chat_v2(text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.panda_agent_direct_chat_v2(text,text) TO authenticated;

CREATE FUNCTION public.panda_agent_direct_ready_v2() RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
BEGIN
 IF public.requesting_user_id() IS NULL THEN PERFORM public.phase3_fail('unauthenticated'); END IF;
 RETURN jsonb_build_object('ready',true,'version',2);
END $$;
REVOKE ALL ON FUNCTION public.panda_agent_direct_ready_v2() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.panda_agent_direct_ready_v2() TO authenticated;
