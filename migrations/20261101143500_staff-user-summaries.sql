-- Qualify the requested subject inside order aggregation; return bounded assignment subjects
-- so the server can reconcile retained membership rows against active Clerk accounts.
CREATE OR REPLACE FUNCTION public.staff_user_summaries(p_user_ids text[]) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path=pg_catalog,public,pg_temp AS $f$
BEGIN
 PERFORM public.staff_assert_role_manager();
 IF p_user_ids IS NULL OR cardinality(p_user_ids)>50 OR cardinality(p_user_ids)<>(SELECT count(DISTINCT id) FROM unnest(p_user_ids) id)
 OR EXISTS(SELECT 1 FROM unnest(p_user_ids) id WHERE id IS NULL OR char_length(id) NOT BETWEEN 1 AND 256 OR id<>btrim(id) OR id ~ '[[:cntrl:]]')
 THEN PERFORM public.phase3_fail('invalid_input'); END IF;
 RETURN jsonb_build_object('items',COALESCE((SELECT jsonb_agg(jsonb_build_object('userId',u.user_id,'role',COALESCE(m.role,'CUSTOMER'),
 'version',COALESCE(m.version,0),'protected',COALESCE(m.protected,false),'updatedAt',m.updated_at,
 'orderCount',(SELECT count(*) FROM public.admin_order_records o WHERE o.customer_subject=u.user_id)))
 FROM unnest(p_user_ids) AS u(user_id) LEFT JOIN public.staff_role_memberships m ON m.user_id=u.user_id),'[]'::jsonb),
 'counts',jsonb_build_object('assigned',(SELECT count(*) FROM public.staff_role_memberships),
 'staff',(SELECT count(*) FROM public.staff_role_memberships WHERE role<>'CUSTOMER'),
 'staffUsers',COALESCE((SELECT jsonb_agg(jsonb_build_object('userId',user_id,'role',role)) FROM public.staff_role_memberships WHERE role<>'CUSTOMER'),'[]'::jsonb),
 'byRole',COALESCE((SELECT jsonb_agg(jsonb_build_object('role',role,'count',n)) FROM (SELECT role,count(*) n FROM public.staff_role_memberships GROUP BY role) c),'[]'::jsonb)));
END $f$;
