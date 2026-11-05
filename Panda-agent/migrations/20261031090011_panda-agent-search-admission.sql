-- Explicit search consent is part of turn idempotency; old callers retain false.
ALTER TABLE public.panda_agent_chat_turns ADD COLUMN web_search boolean NOT NULL DEFAULT false;
CREATE FUNCTION public.panda_agent_chat_begin_v2(p_thread uuid,p_request uuid,p_question text,p_web_search boolean) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE result jsonb; consent boolean;
BEGIN
 IF p_web_search IS NULL OR (p_web_search AND length(btrim(p_question))>400) THEN PERFORM public.phase3_fail('invalid'); END IF;
 -- Original admission locks and verifies the genuine subject's thread, status and question.
 result:=public.panda_agent_chat_begin(p_thread,p_request,p_question);
 IF (result->>'admitted')::boolean THEN
  UPDATE public.panda_agent_chat_turns SET web_search=p_web_search WHERE thread_id=p_thread AND request_id=p_request;
  consent:=p_web_search;
 ELSE
  SELECT web_search INTO consent FROM public.panda_agent_chat_turns WHERE thread_id=p_thread AND request_id=p_request;
  IF consent IS DISTINCT FROM p_web_search THEN PERFORM public.phase3_fail('conflict'); END IF;
 END IF;
 RETURN jsonb_set(result,'{turn,webSearch}',to_jsonb(consent));
END $$;
REVOKE ALL ON FUNCTION public.panda_agent_chat_begin_v2(uuid,uuid,text,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.panda_agent_chat_begin_v2(uuid,uuid,text,boolean) TO authenticated;
