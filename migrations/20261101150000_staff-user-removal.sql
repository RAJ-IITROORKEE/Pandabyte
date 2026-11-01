-- Identity removal is coordinated with Clerk by the server. Retain orders and histories.
-- A pending receipt revokes staff grants before the external deletion and supports reconciliation.
CREATE TABLE public.staff_user_removals (
 user_id text PRIMARY KEY CHECK(char_length(user_id) BETWEEN 1 AND 256 AND user_id=btrim(user_id) AND user_id !~ '[[:cntrl:]]'),
 requested_by text NOT NULL, reason text NOT NULL CHECK(char_length(btrim(reason)) BETWEEN 1 AND 500 AND reason !~ '[[:cntrl:]]'),
 requested_version bigint NOT NULL CHECK(requested_version>=0),
 state text NOT NULL CHECK(state IN ('pending','deleted')),
 requested_at timestamptz NOT NULL DEFAULT now(), completed_at timestamptz,
 CHECK((state='deleted')=(completed_at IS NOT NULL))
);
ALTER TABLE public.staff_user_removals ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.staff_user_removals FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.staff_user_removal_state(p_user_id text) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path=pg_catalog,public,pg_temp AS $f$
BEGIN
 PERFORM public.staff_assert_role_manager();
 IF p_user_id IS NULL OR char_length(p_user_id) NOT BETWEEN 1 AND 256 OR p_user_id<>btrim(p_user_id) OR p_user_id ~ '[[:cntrl:]]'
 THEN PERFORM public.phase3_fail('invalid_input'); END IF;
 RETURN jsonb_build_object('state',(SELECT state FROM public.staff_user_removals WHERE user_id=p_user_id));
END $f$;
REVOKE ALL ON FUNCTION public.staff_user_removal_state(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.staff_user_removal_state(text) TO authenticated;

CREATE FUNCTION public.staff_prepare_user_removal(p_user_id text,p_expected_version bigint,p_reason text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $f$
DECLARE actor text; member public.staff_role_memberships; receipt public.staff_user_removals;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('staff-role-memberships',0));
 PERFORM public.staff_assert_role_manager(); actor:=public.requesting_user_id();
 IF p_user_id IS NULL OR char_length(p_user_id) NOT BETWEEN 1 AND 256 OR p_user_id<>btrim(p_user_id) OR p_user_id ~ '[[:cntrl:]]'
 OR p_expected_version IS NULL OR p_expected_version NOT BETWEEN 0 AND 9007199254740990
 OR p_reason IS NULL OR char_length(btrim(p_reason)) NOT BETWEEN 1 AND 500 OR p_reason ~ '[[:cntrl:]]'
 THEN PERFORM public.phase3_fail('invalid_input'); END IF;
 IF p_user_id=actor THEN PERFORM public.phase3_fail('self_change'); END IF;
 SELECT * INTO member FROM public.staff_role_memberships WHERE user_id=p_user_id FOR UPDATE;
 IF member.protected THEN PERFORM public.phase3_fail('protected_admin'); END IF;
 SELECT * INTO receipt FROM public.staff_user_removals WHERE user_id=p_user_id FOR UPDATE;
 IF receipt.user_id IS NOT NULL THEN
  IF p_expected_version<>receipt.requested_version AND p_expected_version<>COALESCE(member.version,0)
  THEN PERFORM public.phase3_fail('version_conflict'); END IF;
  RETURN jsonb_build_object('state',receipt.state);
 END IF;
 IF COALESCE(member.version,0)<>p_expected_version THEN PERFORM public.phase3_fail('version_conflict'); END IF;
 IF member.role='ADMIN' AND (SELECT count(*) FROM public.staff_role_memberships WHERE role='ADMIN')<=1
 THEN PERFORM public.phase3_fail('last_admin'); END IF;
 PERFORM public.staff_apply_role(p_user_id,'CUSTOMER',false,'Account removal requested: '||left(btrim(p_reason),470),actor);
 INSERT INTO public.staff_user_removals(user_id,requested_by,reason,requested_version,state)
 VALUES(p_user_id,actor,btrim(p_reason),p_expected_version,'pending');
 RETURN jsonb_build_object('state','pending');
END $f$;
REVOKE ALL ON FUNCTION public.staff_prepare_user_removal(text,bigint,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.staff_prepare_user_removal(text,bigint,text) TO authenticated;

CREATE FUNCTION public.staff_finish_user_removal(p_user_id text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,public,pg_temp AS $f$
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('staff-role-memberships',0));
 PERFORM public.staff_assert_role_manager();
 UPDATE public.staff_user_removals SET state='deleted',completed_at=COALESCE(completed_at,now()) WHERE user_id=p_user_id;
 IF NOT FOUND THEN PERFORM public.phase3_fail('not_found'); END IF;
 RETURN jsonb_build_object('state','deleted');
END $f$;
REVOKE ALL ON FUNCTION public.staff_finish_user_removal(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.staff_finish_user_removal(text) TO authenticated;

-- A pending external deletion can never regain staff grants via another assignment.
DO $freeze$
DECLARE definition text;
BEGIN
 SELECT pg_get_functiondef('public.staff_set_role(text,text,bigint,text)'::regprocedure) INTO definition;
 IF strpos(definition,'PERFORM public.staff_assert_role_manager();')=0 THEN RAISE EXCEPTION 'Missing access-manager guard'; END IF;
 definition:=replace(definition,'PERFORM public.staff_assert_role_manager();',
 'PERFORM public.staff_assert_role_manager(); IF EXISTS(SELECT 1 FROM public.staff_user_removals WHERE user_id=p_user_id) THEN PERFORM public.phase3_fail(''request_conflict''); END IF;');
 EXECUTE definition;
END $freeze$;

CREATE OR REPLACE FUNCTION public.staff_user_summaries(p_user_ids text[]) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path=pg_catalog,public,pg_temp AS $f$
BEGIN
 PERFORM public.staff_assert_role_manager();
 IF p_user_ids IS NULL OR cardinality(p_user_ids)>50 OR cardinality(p_user_ids)<>(SELECT count(DISTINCT id) FROM unnest(p_user_ids) id)
 OR EXISTS(SELECT 1 FROM unnest(p_user_ids) id WHERE id IS NULL OR char_length(id) NOT BETWEEN 1 AND 256 OR id<>btrim(id) OR id ~ '[[:cntrl:]]')
 THEN PERFORM public.phase3_fail('invalid_input'); END IF;
 RETURN jsonb_build_object('items',COALESCE((SELECT jsonb_agg(jsonb_build_object('userId',u.user_id,'role',COALESCE(m.role,'CUSTOMER'),
 'version',COALESCE(m.version,0),'protected',COALESCE(m.protected,false),'updatedAt',m.updated_at,
 'removalPending',EXISTS(SELECT 1 FROM public.staff_user_removals WHERE user_id=u.user_id AND state='pending'),
 'orderCount',(SELECT count(*) FROM public.admin_order_records o WHERE o.customer_subject=u.user_id)))
 FROM unnest(p_user_ids) AS u(user_id) LEFT JOIN public.staff_role_memberships m ON m.user_id=u.user_id),'[]'::jsonb),
 'counts',jsonb_build_object('assigned',(SELECT count(*) FROM public.staff_role_memberships),
 'staff',(SELECT count(*) FROM public.staff_role_memberships WHERE role<>'CUSTOMER'),
 'staffUsers',COALESCE((SELECT jsonb_agg(jsonb_build_object('userId',user_id,'role',role)) FROM public.staff_role_memberships WHERE role<>'CUSTOMER'),'[]'::jsonb),
 'byRole',COALESCE((SELECT jsonb_agg(jsonb_build_object('role',role,'count',n)) FROM (SELECT role,count(*) n FROM public.staff_role_memberships GROUP BY role) c),'[]'::jsonb)));
END $f$;
