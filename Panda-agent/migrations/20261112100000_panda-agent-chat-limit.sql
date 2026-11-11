-- Raise the per-user saved-chat cap from 100 to 1000 (owner request, 12 Nov 2026). Body otherwise identical to the live definition.
-- Rollback: re-run this with 1000 replaced by 100.
CREATE OR REPLACE FUNCTION public.panda_agent_chat_create(p_title text DEFAULT 'New chat'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
DECLARE a text:=public.requesting_user_id(); c public.panda_agent_chats;
BEGIN
 IF a IS NULL THEN PERFORM public.phase3_fail('unauthenticated'); END IF;
 IF p_title IS NULL OR length(btrim(p_title)) NOT BETWEEN 1 AND 100 THEN PERFORM public.phase3_fail('invalid'); END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('panda-agent-chat:'||a,0));
 IF (SELECT count(*) FROM public.panda_agent_chats WHERE owner_subject=a)>=1000 THEN PERFORM public.phase3_fail('quota'); END IF;
 INSERT INTO public.panda_agent_chats(owner_subject,title) VALUES(a,btrim(p_title)) RETURNING * INTO c;
 RETURN jsonb_build_object('thread',jsonb_build_object('id',c.id,'title',c.title,'updatedAt',c.updated_at,'status','idle'));
END $function$;
