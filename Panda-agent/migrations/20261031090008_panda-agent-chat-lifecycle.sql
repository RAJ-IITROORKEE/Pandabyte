-- Draft: forward-only chat lifecycle. Apply only after review to the intended development project.
-- Withdrawal: revoke lifecycle RPCs and restore previous read/list/admission behavior in a new migration.
-- Hard deletion is irreversible and deliberately restricted to idle owned chats.
ALTER TABLE public.panda_agent_chats ADD COLUMN archived_at timestamptz;
ALTER TABLE public.panda_agent_chat_turns DROP CONSTRAINT panda_agent_chat_turns_thread_id_fkey;
ALTER TABLE public.panda_agent_chat_turns ADD CONSTRAINT panda_agent_chat_turns_thread_id_fkey
 FOREIGN KEY(thread_id) REFERENCES public.panda_agent_chats(id) ON DELETE CASCADE;

CREATE FUNCTION public.panda_agent_chats_list_v2(p_archived boolean) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE a text:=public.requesting_user_id(); items jsonb;
BEGIN
 IF a IS NULL THEN PERFORM public.phase3_fail('unauthenticated'); END IF;
 IF p_archived IS NULL THEN PERFORM public.phase3_fail('invalid'); END IF;
 SELECT coalesce(jsonb_agg(v ORDER BY updated_at DESC,id),'[]'::jsonb) INTO items FROM (
 SELECT c.id,c.updated_at,jsonb_build_object('id',c.id,'title',c.title,'updatedAt',c.updated_at,'archivedAt',c.archived_at,'status',
 CASE WHEN EXISTS(SELECT 1 FROM public.panda_agent_chat_turns t WHERE t.thread_id=c.id AND t.status='pending' AND t.created_at<now()-interval '5 minutes') THEN 'blocked'
 WHEN EXISTS(SELECT 1 FROM public.panda_agent_chat_turns t WHERE t.thread_id=c.id AND t.status='pending') THEN 'pending' ELSE 'idle' END) v
 FROM public.panda_agent_chats c WHERE c.owner_subject=a AND (c.archived_at IS NOT NULL)=p_archived ORDER BY c.updated_at DESC,c.id LIMIT 100) q;
 RETURN jsonb_build_object('threads',items);
END $$;

-- Preserve the original RPC for older callers, while hiding archived chats.
CREATE OR REPLACE FUNCTION public.panda_agent_chats_list() RETURNS jsonb
LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
 SELECT public.panda_agent_chats_list_v2(false)
$$;

CREATE FUNCTION public.panda_agent_chat_archive(p_thread uuid,p_archived boolean) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE a text:=public.requesting_user_id(); c public.panda_agent_chats;
BEGIN
 IF a IS NULL THEN PERFORM public.phase3_fail('unauthenticated'); END IF;
 IF p_thread IS NULL OR p_archived IS NULL THEN PERFORM public.phase3_fail('invalid'); END IF;
 SELECT * INTO c FROM public.panda_agent_chats WHERE id=p_thread AND owner_subject=a FOR UPDATE;
 IF NOT FOUND THEN PERFORM public.phase3_fail('not_found'); END IF;
 IF EXISTS(SELECT 1 FROM public.panda_agent_chat_turns WHERE thread_id=c.id AND status='pending') THEN PERFORM public.phase3_fail('conflict'); END IF;
 UPDATE public.panda_agent_chats SET archived_at=CASE WHEN p_archived THEN coalesce(archived_at,clock_timestamp()) ELSE NULL END WHERE id=c.id;
 RETURN jsonb_build_object('ok',true);
END $$;

CREATE FUNCTION public.panda_agent_chat_delete(p_thread uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE a text:=public.requesting_user_id(); c public.panda_agent_chats;
BEGIN
 IF a IS NULL THEN PERFORM public.phase3_fail('unauthenticated'); END IF;
 IF p_thread IS NULL THEN PERFORM public.phase3_fail('invalid'); END IF;
 SELECT * INTO c FROM public.panda_agent_chats WHERE id=p_thread AND owner_subject=a FOR UPDATE;
 IF NOT FOUND THEN PERFORM public.phase3_fail('not_found'); END IF;
 IF EXISTS(SELECT 1 FROM public.panda_agent_chat_turns WHERE thread_id=c.id AND status='pending') THEN PERFORM public.phase3_fail('conflict'); END IF;
 DELETE FROM public.panda_agent_chats WHERE id=c.id;
 RETURN jsonb_build_object('ok',true);
END $$;

CREATE OR REPLACE FUNCTION public.panda_agent_chat_begin(p_thread uuid,p_request uuid,p_question text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE a text:=public.requesting_user_id(); c public.panda_agent_chats; t public.panda_agent_chat_turns; result jsonb; token text;
BEGIN
 IF a IS NULL THEN PERFORM public.phase3_fail('unauthenticated'); END IF;
 IF p_request IS NULL OR p_question IS NULL OR length(btrim(p_question)) NOT BETWEEN 1 AND 2000 THEN PERFORM public.phase3_fail('invalid'); END IF;
 SELECT * INTO c FROM public.panda_agent_chats WHERE id=p_thread AND owner_subject=a FOR UPDATE;
 IF NOT FOUND THEN PERFORM public.phase3_fail('not_found'); END IF;
 IF c.archived_at IS NOT NULL THEN PERFORM public.phase3_fail('conflict'); END IF;
 SELECT * INTO t FROM public.panda_agent_chat_turns WHERE thread_id=c.id AND request_id=p_request;
 IF FOUND THEN
  IF t.question<>btrim(p_question) THEN PERFORM public.phase3_fail('conflict'); END IF;
  result:=public.panda_agent_chat_read(c.id);
  RETURN result||jsonb_build_object('admitted',false,'turn',jsonb_build_object('requestId',t.request_id,'question',t.question,'response',t.response,'status',t.status));
 END IF;
 IF EXISTS(SELECT 1 FROM public.panda_agent_chat_turns WHERE thread_id=c.id AND status='pending') THEN PERFORM public.phase3_fail('conflict'); END IF;
 IF (SELECT count(*) FROM public.panda_agent_chat_turns WHERE thread_id=c.id)>=100 THEN PERFORM public.phase3_fail('quota'); END IF;
 -- Only the admitting server receives this capability; replay and history never reveal it.
 token:=replace(gen_random_uuid()::text||gen_random_uuid()::text,'-','');
 INSERT INTO public.panda_agent_chat_turns(thread_id,request_id,question,finish_secret_hash)
 VALUES(c.id,p_request,btrim(p_question),encode(sha256(convert_to(token,'UTF8')),'hex')) RETURNING * INTO t;
 UPDATE public.panda_agent_chats SET title=CASE WHEN title='New chat' THEN left(btrim(p_question),100) ELSE title END,updated_at=clock_timestamp() WHERE id=c.id;
 result:=public.panda_agent_chat_read(c.id);
 RETURN result||jsonb_build_object('admitted',true,'finishToken',token,'turn',jsonb_build_object('requestId',t.request_id,'question',t.question,'response',t.response,'status',t.status));
END $$;

REVOKE ALL ON FUNCTION public.panda_agent_chats_list_v2(boolean),public.panda_agent_chat_archive(uuid,boolean),public.panda_agent_chat_delete(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.panda_agent_chats_list_v2(boolean),public.panda_agent_chat_archive(uuid,boolean),public.panda_agent_chat_delete(uuid) TO authenticated;
