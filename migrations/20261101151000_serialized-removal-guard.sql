-- Check pending removals and fine access authority after serialization, not before it.
-- A queued assignment must observe the committed removal receipt before changing grants.
DO $repair$
DECLARE definition text; lock_statement text:='PERFORM pg_advisory_xact_lock(hashtextextended(''staff-role-memberships'',0));';
BEGIN
 SELECT pg_get_functiondef('public.staff_set_role(text,text,bigint,text)'::regprocedure) INTO definition;
 IF strpos(definition,lock_statement)=0 THEN RAISE EXCEPTION 'Missing staff assignment serialization'; END IF;
 definition:=replace(definition,
 'PERFORM public.staff_assert_role_manager(); IF EXISTS(SELECT 1 FROM public.staff_user_removals WHERE user_id=p_user_id) THEN PERFORM public.phase3_fail(''request_conflict''); END IF;',
 'PERFORM public.staff_assert_role_manager();');
 definition:=replace(definition,lock_statement,lock_statement||
 ' PERFORM public.staff_assert_role_manager(); IF EXISTS(SELECT 1 FROM public.staff_user_removals WHERE user_id=p_user_id) THEN PERFORM public.phase3_fail(''request_conflict''); END IF;');
 EXECUTE definition;
END $repair$;
