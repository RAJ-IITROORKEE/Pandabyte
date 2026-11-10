-- Forward-only lifecycle fence: retain admission while native context may still exist.
-- Rollback is a separate reviewed migration; existing contexts default to unretired.
ALTER TABLE public.panda_agent_llm_turns ADD COLUMN context_retired boolean NOT NULL DEFAULT false;

CREATE FUNCTION public.panda_agent_llm_retire(p_payload text,p_mac text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE v jsonb; g public.panda_agent_llm_turns;
BEGIN
 v:=public.panda_agent_llm_verify(p_payload,p_mac,'retire');
 IF NOT v?&ARRAY['thread','request','admission'] OR (v-ARRAY['thread','request','admission'])<>'{}'::jsonb THEN PERFORM public.phase3_fail('invalid'); END IF;
 PERFORM 1 FROM public.panda_agent_chats WHERE id=(v->>'thread')::uuid AND owner_subject=public.requesting_user_id() FOR UPDATE;
 IF NOT FOUND THEN PERFORM public.phase3_fail('not_found'); END IF;
 SELECT * INTO g FROM public.panda_agent_llm_turns WHERE thread_id=(v->>'thread')::uuid AND request_id=(v->>'request')::uuid AND owner_subject=public.requesting_user_id() FOR UPDATE;
 IF NOT FOUND OR NOT g.terminal OR g.native_admission IS NULL OR g.native_admission IS DISTINCT FROM v->'admission'
 OR NOT EXISTS(SELECT 1 FROM public.panda_agent_chat_turns t WHERE t.thread_id=g.thread_id AND t.request_id=g.request_id AND t.status='complete')
 OR (p_payload::jsonb->>'exp')::bigint<extract(epoch FROM clock_timestamp()) THEN PERFORM public.phase3_fail('conflict'); END IF;
 IF g.context_retired THEN RETURN jsonb_build_object('retired',false); END IF;
 UPDATE public.panda_agent_llm_turns SET context_retired=true WHERE thread_id=g.thread_id AND request_id=g.request_id;
 RETURN jsonb_build_object('retired',true);
END $$;
REVOKE ALL ON FUNCTION public.panda_agent_llm_retire(text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.panda_agent_llm_retire(text,text) TO authenticated;

CREATE FUNCTION public.panda_agent_llm_retirement_delete_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
BEGIN
 IF OLD.native_admission IS NOT NULL AND NOT OLD.context_retired THEN PERFORM public.phase3_fail('conflict'); END IF;
 RETURN OLD;
END $$;
REVOKE ALL ON FUNCTION public.panda_agent_llm_retirement_delete_guard() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER panda_agent_llm_retirement_delete_guard BEFORE DELETE ON public.panda_agent_llm_turns
FOR EACH ROW EXECUTE FUNCTION public.panda_agent_llm_retirement_delete_guard();
