-- Custom order access must never grant the legacy staff-management capability used
-- by unrelated administrative services. Keep order authorization resource-specific.
CREATE OR REPLACE FUNCTION public.staff_custom_capabilities(p_permissions text[]) RETURNS text[] LANGUAGE sql IMMUTABLE
SET search_path=pg_catalog AS $f$
 SELECT ARRAY(SELECT DISTINCT cap FROM unnest(p_permissions) p CROSS JOIN LATERAL (SELECT CASE
 WHEN split_part(p,'.',1) IN ('products','categories') THEN 'catalog.edit'
 WHEN split_part(p,'.',1) IN ('pages','blog','faqs','team','contact','navigation','solutions','learn','videos') THEN 'content.edit'
 WHEN split_part(p,'.',1)='inventory' THEN 'orders.manage'
 WHEN split_part(p,'.',1)='inquiries' THEN 'inquiries.manage' WHEN split_part(p,'.',1)='media' THEN 'media.manage' END cap) c
 WHERE cap IS NOT NULL UNION SELECT 'content.publish' WHERE EXISTS(SELECT 1 FROM unnest(p_permissions) p WHERE p ~ '[.](publish|delete)$' OR p='media.update') ORDER BY 1)
$f$;

CREATE FUNCTION public.staff_order_access(p_action text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path=pg_catalog,public,pg_temp AS $f$
 SELECT public.requesting_user_id() IS NOT NULL AND p_action IN ('read','update') AND CASE
 WHEN EXISTS(SELECT 1 FROM public.staff_role_memberships WHERE user_id=public.requesting_user_id() AND role LIKE 'custom_%')
 THEN EXISTS(SELECT 1 FROM public.staff_role_memberships m JOIN public.staff_role_definitions d ON d.key=m.role
 WHERE m.user_id=public.requesting_user_id() AND 'orders.read'=ANY(d.permissions) AND 'orders.'||p_action=ANY(d.permissions))
 ELSE public.has_capability('staff.manage') END
$f$;
REVOKE ALL ON FUNCTION public.staff_order_access(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.staff_order_access(text) TO authenticated;

CREATE FUNCTION public.staff_assert_orders_access() RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path=pg_catalog,public,pg_temp AS $f$
BEGIN
 IF public.requesting_user_id() IS NULL THEN PERFORM public.phase3_fail('unauthenticated'); END IF;
 IF NOT public.staff_order_access('read') THEN PERFORM public.phase3_fail('forbidden'); END IF;
 RETURN public.requesting_user_id();
END $f$;
REVOKE ALL ON FUNCTION public.staff_assert_orders_access() FROM PUBLIC,anon,authenticated;

DO $order_guards$
DECLARE f record; source text; updated integer:=0; member record;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('staff-role-memberships',0));
 FOR f IN SELECT p.oid,p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public'
 AND p.proname IN ('admin_list_orders','admin_search_orders','admin_get_checkout_order','admin_get_order_activity',
 'admin_order_customer_identities','admin_update_checkout_order','admin_update_simulation_checkout_order') LOOP
  SELECT pg_get_functiondef(f.oid) INTO source;
  IF strpos(source,'public.admin_assert_capability(''staff.manage'')')=0 THEN RAISE EXCEPTION 'Unexpected legacy order guard: %',f.proname; END IF;
  source:=replace(source,'public.admin_assert_capability(''staff.manage'')','public.staff_assert_orders_access()');
  EXECUTE source; updated:=updated+1;
 END LOOP;
 IF updated<>7 THEN RAISE EXCEPTION 'Incomplete order authorization inventory'; END IF;
 FOR member IN SELECT user_id,role,protected FROM public.staff_role_memberships WHERE role LIKE 'custom_%' ORDER BY user_id LOOP
  PERFORM public.staff_apply_role(member.user_id,member.role,member.protected,'Isolate order access from staff administration','project_admin');
 END LOOP;
END $order_guards$;
