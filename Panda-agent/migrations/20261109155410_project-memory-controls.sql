-- Additive development controls for explicit owner/thread project intent.
-- A cleared row remains as a version fence against stale guide requests.
ALTER TABLE public.panda_agent_project_memory ADD COLUMN last_user_edit_id uuid;

CREATE FUNCTION public.panda_agent_memory_read(p_thread uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE m public.panda_agent_project_memory;
BEGIN
 IF public.requesting_user_id() IS NULL THEN PERFORM public.phase3_fail('unauthenticated'); END IF;
 PERFORM 1 FROM public.panda_agent_chats
 WHERE id=p_thread AND owner_subject=public.requesting_user_id() FOR SHARE;
 IF NOT FOUND THEN PERFORM public.phase3_fail('not_found'); END IF;
 SELECT * INTO m FROM public.panda_agent_project_memory
 WHERE thread_id=p_thread AND owner_subject=public.requesting_user_id();
 IF NOT FOUND THEN RETURN jsonb_build_object('memory',NULL,'lastRequestId',NULL); END IF;
 RETURN jsonb_build_object('memory',public.panda_agent_project_read(p_thread),'lastRequestId',m.last_user_edit_id);
END $$;
REVOKE ALL ON FUNCTION public.panda_agent_memory_read(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.panda_agent_memory_read(uuid) TO authenticated;

CREATE FUNCTION public.panda_agent_memory_change(p_thread uuid,p_request uuid,p_expected_version integer,p_intent jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE m public.panda_agent_project_memory; next_intent jsonb := nullif(p_intent,'null'::jsonb);
BEGIN
 IF public.requesting_user_id() IS NULL THEN PERFORM public.phase3_fail('unauthenticated'); END IF;
 IF p_request IS NULL OR p_expected_version IS NULL OR p_expected_version<0 OR p_expected_version>999999998
    OR (next_intent IS NOT NULL AND (
      jsonb_typeof(next_intent) IS DISTINCT FROM 'object'
      OR next_intent ? 'expectedVersion'
      OR public.panda_agent_guide_input_valid(next_intent || jsonb_build_object('expectedVersion',p_expected_version)) IS NOT TRUE
    )) THEN PERFORM public.phase3_fail('invalid'); END IF;
 IF next_intent IS NOT NULL THEN
   IF next_intent->>'goal' IS DISTINCT FROM btrim(next_intent->>'goal')
      OR next_intent->>'board' IS DISTINCT FROM btrim(next_intent->>'board')
      OR (next_intent ? 'revision' AND next_intent->>'revision' IS DISTINCT FROM btrim(next_intent->>'revision'))
      OR EXISTS(SELECT 1 FROM jsonb_array_elements_text(next_intent->'components') c WHERE c IS DISTINCT FROM btrim(c))
   THEN PERFORM public.phase3_fail('invalid'); END IF;
 END IF;
 -- This is the same first lock used by chat admission, archival and guide completion.
 PERFORM 1 FROM public.panda_agent_chats
 WHERE id=p_thread AND owner_subject=public.requesting_user_id() AND archived_at IS NULL FOR UPDATE;
 IF NOT FOUND THEN PERFORM public.phase3_fail('not_found'); END IF;
 SELECT * INTO m FROM public.panda_agent_project_memory
 WHERE thread_id=p_thread AND owner_subject=public.requesting_user_id() FOR UPDATE;
 IF FOUND AND m.last_user_edit_id=p_request AND m.version=p_expected_version+1
    AND m.intent IS NOT DISTINCT FROM next_intent THEN RETURN public.panda_agent_memory_read(p_thread); END IF;
 IF EXISTS(SELECT 1 FROM public.panda_agent_chat_turns WHERE thread_id=p_thread AND status='pending')
 THEN PERFORM public.phase3_fail('conflict'); END IF;
 INSERT INTO public.panda_agent_project_memory(thread_id,owner_subject)
 VALUES(p_thread,public.requesting_user_id()) ON CONFLICT DO NOTHING;
 SELECT * INTO m FROM public.panda_agent_project_memory
 WHERE thread_id=p_thread AND owner_subject=public.requesting_user_id() FOR UPDATE;
 IF NOT FOUND OR m.version<>p_expected_version OR m.last_user_edit_id=p_request
 THEN PERFORM public.phase3_fail('conflict'); END IF;
 UPDATE public.panda_agent_project_memory
 SET version=version+1,intent=next_intent,questions='[]'::jsonb,recent_goals='[]'::jsonb,last_user_edit_id=p_request
 WHERE thread_id=p_thread AND owner_subject=public.requesting_user_id();
 RETURN public.panda_agent_memory_read(p_thread);
END $$;
REVOKE ALL ON FUNCTION public.panda_agent_memory_change(uuid,uuid,integer,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.panda_agent_memory_change(uuid,uuid,integer,jsonb) TO authenticated;
