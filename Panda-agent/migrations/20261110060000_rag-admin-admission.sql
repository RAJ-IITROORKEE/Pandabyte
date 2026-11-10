-- One actor-scoped round trip replaces separate subject and Admin-role reads.
-- Rollback revokes this RPC; existing identity APIs remain available.
CREATE FUNCTION public.panda_agent_control_room_admission() RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE actor text:=public.requesting_user_id();
BEGIN
 IF actor IS NULL THEN PERFORM public.phase3_fail('unauthenticated'); END IF;
 RETURN jsonb_build_object('subject',actor,'admin',EXISTS(
  SELECT 1 FROM public.staff_role_memberships WHERE user_id=actor AND role='ADMIN'));
END $$;
REVOKE ALL ON FUNCTION public.panda_agent_control_room_admission() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.panda_agent_control_room_admission() TO authenticated;
