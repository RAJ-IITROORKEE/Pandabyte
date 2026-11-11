-- Delete all of the signed-in user's chats (active and archived) in one transaction (owner request, 12 Nov 2026).
-- Same rule as panda_agent_chat_delete: chats with a pending turn are kept and counted as skipped.
-- Rows are locked first so a turn begun concurrently is seen by the delete's fresh snapshot.
-- Rollback: DROP FUNCTION public.panda_agent_chats_delete_all();
CREATE FUNCTION public.panda_agent_chats_delete_all() RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE a text:=public.requesting_user_id(); deleted integer; skipped integer;
BEGIN
 IF a IS NULL THEN PERFORM public.phase3_fail('unauthenticated'); END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('panda-agent-chat:'||a,0));
 PERFORM 1 FROM public.panda_agent_chats WHERE owner_subject=a FOR UPDATE;
 WITH gone AS (
  DELETE FROM public.panda_agent_chats c WHERE c.owner_subject=a
   AND NOT EXISTS(SELECT 1 FROM public.panda_agent_chat_turns t WHERE t.thread_id=c.id AND t.status='pending')
  RETURNING 1)
 SELECT count(*) INTO deleted FROM gone;
 SELECT count(*) INTO skipped FROM public.panda_agent_chats WHERE owner_subject=a;
 RETURN jsonb_build_object('deleted',deleted,'skipped',skipped);
END $$;
REVOKE ALL ON FUNCTION public.panda_agent_chats_delete_all() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.panda_agent_chats_delete_all() TO authenticated;
