-- Additive access catalog. Built-in grants and protected owner membership are preserved.
-- Rollback: revoke custom assignments through reviewed forward changes; retain audits.
CREATE FUNCTION public.staff_valid_permissions(p_permissions text[]) RETURNS boolean
LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $f$
 SELECT p_permissions IS NOT NULL AND cardinality(p_permissions)<=65
 AND cardinality(p_permissions)=(SELECT count(DISTINCT p) FROM unnest(p_permissions) p)
 AND NOT EXISTS(SELECT 1 FROM unnest(p_permissions) p WHERE p IS NULL OR NOT (
   p ~ '^(products|categories|pages|blog|faqs|team|contact|navigation|solutions|learn|videos)[.](read|create|update|publish|delete)$'
   OR p ~ '^(inventory|orders)[.](read|update)$' OR p ~ '^inquiries[.](read|update|delete)$'
   OR p ~ '^media[.](read|create|update)$')
   OR (split_part(p,'.',2)<>'read' AND NOT (split_part(p,'.',1)||'.read'=ANY(p_permissions)))
   OR (split_part(p,'.',2) IN ('publish','delete') AND NOT (split_part(p,'.',1)||'.update'=ANY(p_permissions))))
$f$;
REVOKE ALL ON FUNCTION public.staff_valid_permissions(text[]) FROM PUBLIC,anon,authenticated;

CREATE TABLE public.staff_role_definitions (
 key text PRIMARY KEY CHECK(key IN ('ADMIN','EDITOR','CATALOG','SUPPORT','CUSTOMER') OR key ~ '^custom_[a-z0-9-]{3,48}$'),
 name text NOT NULL CHECK(char_length(btrim(name)) BETWEEN 1 AND 100 AND name=btrim(name) AND name !~ '[[:cntrl:]]'),
 description text NOT NULL CHECK(char_length(description)<=500 AND description=btrim(description) AND description !~ '[[:cntrl:]]'),
 permissions text[] NOT NULL CHECK(public.staff_valid_permissions(permissions)),
 built_in boolean NOT NULL CHECK(built_in=(key NOT LIKE 'custom_%')),
 version bigint NOT NULL DEFAULT 1 CHECK(version BETWEEN 1 AND 9007199254740991),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.staff_role_definitions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.staff_role_definitions FROM PUBLIC,anon,authenticated;
CREATE UNIQUE INDEX staff_role_definition_name_idx ON public.staff_role_definitions(lower(name));

-- Reference definitions are part of the schema, not changes to user assignments.
INSERT INTO public.staff_role_definitions(key,name,description,permissions,built_in)
SELECT role,initcap(role),CASE role
 WHEN 'ADMIN' THEN 'Full workspace access and protected access administration.'
 WHEN 'EDITOR' THEN 'Create, edit and publish site content; manage media.'
 WHEN 'CATALOG' THEN 'Edit products and categories, manage media and inventory.'
 WHEN 'SUPPORT' THEN 'Read and manage customer inquiries.' ELSE 'Storefront and personal account access.' END,
 ARRAY(SELECT resource||'.'||action FROM
 unnest(ARRAY['products','categories','pages','blog','faqs','team','contact','navigation','solutions','learn','videos','inventory','orders','inquiries','media']) resource
 CROSS JOIN unnest(ARRAY['read','create','update','publish','delete']) action
 WHERE ((resource IN ('products','categories','pages','blog','faqs','team','contact','navigation','solutions','learn','videos'))
 OR (resource IN ('inventory','orders') AND action IN ('read','update'))
 OR (resource='inquiries' AND action IN ('read','update','delete')) OR (resource='media' AND action IN ('read','create','update')))
 AND (role='ADMIN' OR (role='EDITOR' AND resource IN ('pages','blog','faqs','team','contact','navigation','solutions','learn','videos','media'))
 OR (role='CATALOG' AND ((resource IN ('products','categories') AND action IN ('read','create','update')) OR resource IN ('inventory','media')))
 OR (role='SUPPORT' AND resource='inquiries')) ORDER BY resource,action),true
FROM unnest(ARRAY['ADMIN','EDITOR','CATALOG','SUPPORT','CUSTOMER']) role;

ALTER TABLE public.staff_role_memberships DROP CONSTRAINT staff_role_memberships_role_check;
ALTER TABLE public.staff_role_memberships ADD CONSTRAINT staff_role_memberships_definition_fk
 FOREIGN KEY(role) REFERENCES public.staff_role_definitions(key) ON DELETE RESTRICT;
CREATE INDEX staff_role_memberships_role_idx ON public.staff_role_memberships(role);
CREATE TABLE public.staff_role_definition_events (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, role_key text NOT NULL REFERENCES public.staff_role_definitions(key),
 actor text NOT NULL, reason text NOT NULL CHECK(char_length(btrim(reason)) BETWEEN 1 AND 500),
 previous_permissions text[], permissions text[] NOT NULL, occurred_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.staff_role_definition_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.staff_role_definition_events FROM PUBLIC,anon,authenticated;
REVOKE ALL ON SEQUENCE public.staff_role_definition_events_id_seq FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.staff_can_manage_roles() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path=pg_catalog,public,pg_temp AS $f$
 SELECT public.requesting_user_id() IS NOT NULL AND public.has_capability('staff.manage')
 AND EXISTS(SELECT 1 FROM public.staff_role_memberships WHERE user_id=public.requesting_user_id() AND role='ADMIN')
$f$;
REVOKE ALL ON FUNCTION public.staff_can_manage_roles() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.staff_can_manage_roles() TO authenticated;
ALTER POLICY staff_roles_select ON public.staff_role_memberships USING
 (user_id=(SELECT public.requesting_user_id()) OR (SELECT public.staff_can_manage_roles()));

CREATE FUNCTION public.staff_permission_snapshot() RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER
SET search_path=pg_catalog,public,pg_temp AS $f$
 SELECT jsonb_build_object('custom',COALESCE((SELECT role LIKE 'custom_%' FROM public.staff_role_memberships WHERE user_id=public.requesting_user_id()),false),
 'permissions',COALESCE((SELECT to_jsonb(d.permissions) FROM public.staff_role_memberships m JOIN public.staff_role_definitions d ON d.key=m.role WHERE m.user_id=public.requesting_user_id()),'[]'::jsonb))
$f$;
REVOKE ALL ON FUNCTION public.staff_permission_snapshot() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.staff_permission_snapshot() TO authenticated;

CREATE FUNCTION public.staff_assert_permission(p_resource text,p_action text) RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path=pg_catalog,public,pg_temp AS $f$
BEGIN
 IF public.requesting_user_id() IS NULL THEN PERFORM public.phase3_fail('unauthenticated'); END IF;
 IF EXISTS(SELECT 1 FROM public.staff_role_memberships WHERE user_id=public.requesting_user_id() AND role LIKE 'custom_%')
 AND NOT EXISTS(SELECT 1 FROM public.staff_role_memberships m JOIN public.staff_role_definitions d ON d.key=m.role
 WHERE m.user_id=public.requesting_user_id() AND p_resource||'.'||p_action=ANY(d.permissions))
 THEN PERFORM public.phase3_fail('forbidden'); END IF;
END $f$;
REVOKE ALL ON FUNCTION public.staff_assert_permission(text,text) FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.staff_assert_role_manager() RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path=pg_catalog,public,pg_temp AS $f$
BEGIN
 IF public.requesting_user_id() IS NULL THEN PERFORM public.phase3_fail('unauthenticated'); END IF;
 IF NOT public.staff_can_manage_roles() THEN PERFORM public.phase3_fail('forbidden'); END IF;
END $f$;
REVOKE ALL ON FUNCTION public.staff_assert_role_manager() FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.staff_role_definition_json(p_key text) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER
SET search_path=pg_catalog,public,pg_temp AS $f$
 SELECT jsonb_build_object('key',d.key,'name',d.name,'description',d.description,'permissions',d.permissions,'version',d.version,'builtIn',d.built_in,
 'memberCount',(SELECT count(*) FROM public.staff_role_memberships m WHERE m.role=d.key)) FROM public.staff_role_definitions d WHERE d.key=p_key
$f$;
REVOKE ALL ON FUNCTION public.staff_role_definition_json(text) FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.staff_role_catalog() RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path=pg_catalog,public,pg_temp AS $f$
BEGIN
 PERFORM public.staff_assert_role_manager();
 RETURN jsonb_build_object('items',(SELECT jsonb_agg(public.staff_role_definition_json(key) ORDER BY built_in DESC,created_at,key) FROM public.staff_role_definitions));
END $f$;
REVOKE ALL ON FUNCTION public.staff_role_catalog() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.staff_role_catalog() TO authenticated;

CREATE FUNCTION public.staff_custom_capabilities(p_permissions text[]) RETURNS text[] LANGUAGE sql IMMUTABLE
SET search_path=pg_catalog AS $f$
 SELECT ARRAY(SELECT DISTINCT cap FROM unnest(p_permissions) p CROSS JOIN LATERAL (SELECT CASE
 WHEN split_part(p,'.',1) IN ('products','categories') THEN 'catalog.edit'
 WHEN split_part(p,'.',1) IN ('pages','blog','faqs','team','contact','navigation','solutions','learn','videos') THEN 'content.edit'
 WHEN split_part(p,'.',1)='inventory' THEN 'orders.manage' WHEN split_part(p,'.',1)='orders' THEN 'staff.manage'
 WHEN split_part(p,'.',1)='inquiries' THEN 'inquiries.manage' WHEN split_part(p,'.',1)='media' THEN 'media.manage' END cap) c
 WHERE cap IS NOT NULL UNION SELECT 'content.publish' WHERE EXISTS(SELECT 1 FROM unnest(p_permissions) p WHERE p ~ '[.](publish|delete)$' OR p='media.update') ORDER BY 1)
$f$;
REVOKE ALL ON FUNCTION public.staff_custom_capabilities(text[]) FROM PUBLIC,anon,authenticated;

-- Extend the existing serialized/audited grant replacement instead of a second assignment path.
DO $extend$
DECLARE definition text;
BEGIN
 SELECT pg_get_functiondef('public.staff_apply_role(text,text,boolean,text,text)'::regprocedure) INTO definition;
 IF strpos(definition,'p_role NOT IN (''ADMIN'',''EDITOR'',''CATALOG'',''SUPPORT'',''CUSTOMER'')')=0
 OR strpos(definition,'ELSE ''{}''::text[] END')=0 THEN RAISE EXCEPTION 'Unexpected staff role grant implementation'; END IF;
 definition:=replace(definition,'p_role NOT IN (''ADMIN'',''EDITOR'',''CATALOG'',''SUPPORT'',''CUSTOMER'')',
 'NOT EXISTS(SELECT 1 FROM public.staff_role_definitions WHERE key=p_role)');
 definition:=replace(definition,'ELSE ''{}''::text[] END',
 'ELSE public.staff_custom_capabilities((SELECT permissions FROM public.staff_role_definitions WHERE key=p_role)) END');
 EXECUTE definition;
END $extend$;

CREATE FUNCTION public.staff_save_role_definition(p_key text,p_name text,p_description text,p_permissions text[],p_expected_version bigint,p_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $f$
DECLARE old_row public.staff_role_definitions; role_key text; actor text; target record;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('staff-role-memberships',0));
 PERFORM public.staff_assert_role_manager(); actor:=public.requesting_user_id();
 IF p_name IS NULL OR char_length(btrim(p_name)) NOT BETWEEN 1 AND 100 OR p_name<>btrim(p_name) OR p_name ~ '[[:cntrl:]]'
 OR p_description IS NULL OR char_length(p_description)>500 OR p_description<>btrim(p_description) OR p_description ~ '[[:cntrl:]]'
 OR NOT public.staff_valid_permissions(p_permissions) OR p_expected_version IS NULL OR p_expected_version NOT BETWEEN 0 AND 9007199254740990
 OR p_reason IS NULL OR char_length(btrim(p_reason)) NOT BETWEEN 1 AND 500 OR p_reason ~ '[[:cntrl:]]'
 THEN PERFORM public.phase3_fail('invalid_input'); END IF;
 IF p_key IS NULL THEN
   IF p_expected_version<>0 THEN PERFORM public.phase3_fail('version_conflict'); END IF;
   IF (SELECT count(*) FROM public.staff_role_definitions WHERE NOT built_in)>=50 THEN PERFORM public.phase3_fail('invalid_input'); END IF;
   role_key:='custom_'||gen_random_uuid()::text;
 ELSE
   IF p_key !~ '^custom_[a-z0-9-]{3,48}$' THEN PERFORM public.phase3_fail('invalid_input'); END IF;
   SELECT * INTO old_row FROM public.staff_role_definitions WHERE key=p_key FOR UPDATE;
   IF old_row.key IS NULL OR old_row.version<>p_expected_version THEN PERFORM public.phase3_fail('version_conflict'); END IF;
   role_key:=p_key;
 END IF;
 IF EXISTS(SELECT 1 FROM public.staff_role_definitions WHERE lower(name)=lower(p_name) AND key<>role_key)
 THEN PERFORM public.phase3_fail('request_conflict'); END IF;
 INSERT INTO public.staff_role_definitions(key,name,description,permissions,built_in)
 VALUES(role_key,p_name,p_description,p_permissions,false)
 ON CONFLICT(key) DO UPDATE SET name=excluded.name,description=excluded.description,permissions=excluded.permissions,
 version=staff_role_definitions.version+1,updated_at=now();
 INSERT INTO public.staff_role_definition_events(role_key,actor,reason,previous_permissions,permissions)
 VALUES(role_key,actor,btrim(p_reason),old_row.permissions,p_permissions);
 -- Refresh grants in the same transaction; old sessions never retain revoked permissions.
 FOR target IN SELECT user_id,protected FROM public.staff_role_memberships WHERE role=role_key ORDER BY user_id LOOP
   PERFORM public.staff_apply_role(target.user_id,role_key,target.protected,'Role definition updated: '||left(btrim(p_reason),470),actor);
 END LOOP;
 RETURN public.staff_role_definition_json(role_key);
END $f$;
REVOKE ALL ON FUNCTION public.staff_save_role_definition(text,text,text,text[],bigint,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.staff_save_role_definition(text,text,text,text[],bigint,text) TO authenticated;

CREATE FUNCTION public.staff_user_summaries(p_user_ids text[]) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path=pg_catalog,public,pg_temp AS $f$
BEGIN
 PERFORM public.staff_assert_role_manager();
 IF p_user_ids IS NULL OR cardinality(p_user_ids)>50 OR cardinality(p_user_ids)<>(SELECT count(DISTINCT id) FROM unnest(p_user_ids) id)
 OR EXISTS(SELECT 1 FROM unnest(p_user_ids) id WHERE id IS NULL OR char_length(id) NOT BETWEEN 1 AND 256 OR id<>btrim(id) OR id ~ '[[:cntrl:]]')
 THEN PERFORM public.phase3_fail('invalid_input'); END IF;
 RETURN jsonb_build_object('items',COALESCE((SELECT jsonb_agg(jsonb_build_object('userId',id,'role',COALESCE(m.role,'CUSTOMER'),
 'version',COALESCE(m.version,0),'protected',COALESCE(m.protected,false),'updatedAt',m.updated_at,
 'orderCount',(SELECT count(*) FROM public.admin_order_records o WHERE o.customer_subject=id)))
 FROM unnest(p_user_ids) id LEFT JOIN public.staff_role_memberships m ON m.user_id=id),'[]'::jsonb),
 'counts',jsonb_build_object('assigned',(SELECT count(*) FROM public.staff_role_memberships),
 'staff',(SELECT count(*) FROM public.staff_role_memberships WHERE role<>'CUSTOMER'),
 'byRole',COALESCE((SELECT jsonb_agg(jsonb_build_object('role',role,'count',n)) FROM (SELECT role,count(*) n FROM public.staff_role_memberships GROUP BY role) c),'[]'::jsonb)));
END $f$;
REVOKE ALL ON FUNCTION public.staff_user_summaries(text[]) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.staff_user_summaries(text[]) TO authenticated;

CREATE FUNCTION public.staff_resource_for_kind(p_kind text) RETURNS text LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $f$
 SELECT CASE p_kind WHEN 'product' THEN 'products' WHEN 'category' THEN 'categories' WHEN 'page' THEN 'pages' WHEN 'faq' THEN 'faqs'
 WHEN 'solution' THEN 'solutions' WHEN 'resource' THEN 'learn' WHEN 'video' THEN 'videos' ELSE p_kind END
$f$;
REVOKE ALL ON FUNCTION public.staff_resource_for_kind(text) FROM PUBLIC,anon,authenticated;

-- Initial product pricing belongs to the guarded atomic create/save operation.
-- Keep independent price editing guarded separately; internal helpers are never RPCs.
DO $pricing$
DECLARE f record; definition text;
BEGIN
 FOR f IN SELECT p.oid FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public' AND p.proname='admin_set_variant_price' LOOP
  SELECT replace(pg_get_functiondef(f.oid),'public.admin_set_variant_price','public.staff_internal_set_variant_price') INTO definition;
  EXECUTE definition;
 END LOOP;
 FOR f IN SELECT p.oid,pg_get_function_identity_arguments(p.oid) arguments FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public' AND p.proname='staff_internal_set_variant_price' LOOP
  EXECUTE format('REVOKE ALL ON FUNCTION public.staff_internal_set_variant_price(%s) FROM PUBLIC,anon,authenticated',f.arguments);
 END LOOP;
 SELECT replace(pg_get_functiondef('public.admin_save_product_with_prices(uuid,bigint,jsonb,jsonb)'::regprocedure),
 'public.admin_set_variant_price','public.staff_internal_set_variant_price') INTO definition;
 EXECUTE definition;
END $pricing$;

-- Install guards into the current implementation, retaining OIDs, defaults, ACLs and validation.
-- Strict allowlist fails closed if a new privileged RPC has not been reviewed.
DO $guard$
DECLARE f record; guard_sql text; source_sql text; matched integer:=0;
BEGIN
 FOR f IN SELECT p.oid,p.proname,p.prosrc,pg_get_functiondef(p.oid) definition FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public' AND has_function_privilege('authenticated',p.oid,'EXECUTE')
 AND (p.proname LIKE 'admin_%' OR p.proname IN ('editor_get_media','staff_list_roles','staff_set_role','begin_inquiry_notification','finish_inquiry_notification')) LOOP
  guard_sql:=CASE
   WHEN f.proname IN ('staff_list_roles','staff_set_role') THEN 'PERFORM public.staff_assert_role_manager();'
   WHEN f.proname IN ('admin_get_record','admin_transition_record') THEN
    'PERFORM public.staff_assert_permission(public.staff_resource_for_kind((SELECT kind FROM public.cms_records WHERE id=p_id)),'||
    CASE WHEN f.proname='admin_get_record' THEN '''read''' ELSE 'CASE WHEN p_action IN (''publish'',''unpublish'') THEN ''publish'' WHEN p_action=''archive'' THEN ''delete'' ELSE ''update'' END' END||');'
   WHEN f.proname='admin_list_records' THEN 'PERFORM public.staff_assert_permission(public.staff_resource_for_kind(p_kind),''read'');'
   WHEN f.proname='admin_save_record' THEN 'PERFORM public.staff_assert_permission(public.staff_resource_for_kind(p_kind),CASE WHEN p_id IS NULL THEN ''create'' ELSE ''update'' END);'
   WHEN f.proname='admin_save_product_with_prices' THEN 'PERFORM public.staff_assert_permission(''products'',CASE WHEN p_id IS NULL THEN ''create'' ELSE ''update'' END);'
   WHEN f.proname='admin_replace_published_product_images' THEN 'PERFORM public.staff_assert_permission(''products'',''update''); PERFORM public.staff_assert_permission(''products'',''publish'');'
   WHEN f.proname='admin_set_variant_price' THEN 'PERFORM public.staff_assert_permission(''products'',''update'');'
   WHEN f.proname IN ('admin_list_products','admin_list_product_prices','admin_product_price_stats','admin_list_variants') THEN 'PERFORM public.staff_assert_permission(''products'',''read'');'
   WHEN f.proname LIKE 'admin_list_categories%' THEN 'PERFORM public.staff_assert_permission(''categories'',''read'');'
   WHEN f.proname IN ('admin_list_pages_table','admin_list_blog_table','admin_list_faq_table','admin_list_team_table','admin_list_solutions_table','admin_list_learn_table','admin_list_videos_table') THEN
     format('PERFORM public.staff_assert_permission(%L,''read'');',CASE f.proname WHEN 'admin_list_faq_table' THEN 'faqs' ELSE split_part(f.proname,'_',3) END)
   WHEN f.proname IN ('admin_list_inventory','admin_query_inventory','admin_inventory_workspace','admin_inventory_stats','admin_inventory_history') THEN 'PERFORM public.staff_assert_permission(''inventory'',''read'');'
   WHEN f.proname IN ('admin_initialize_inventory','admin_adjust_inventory') THEN 'PERFORM public.staff_assert_permission(''inventory'',''update'');'
   WHEN f.proname IN ('admin_list_orders','admin_search_orders','admin_get_checkout_order','admin_get_order_activity','admin_order_customer_identities') THEN 'PERFORM public.staff_assert_permission(''orders'',''read'');'
   WHEN f.proname='admin_update_checkout_order' THEN 'PERFORM public.staff_assert_permission(''orders'',''update'');'
   WHEN f.proname IN ('admin_list_inquiries','admin_query_inquiries','admin_get_inquiry','admin_inquiry_attachments','admin_inquiry_attachment') THEN 'PERFORM public.staff_assert_permission(''inquiries'',''read'');'
   WHEN f.proname IN ('admin_update_inquiry','admin_claim_inquiry_notification','begin_inquiry_notification','finish_inquiry_notification') THEN 'PERFORM public.staff_assert_permission(''inquiries'',''update'');'
   WHEN f.proname='admin_delete_inquiry' THEN 'PERFORM public.staff_assert_permission(''inquiries'',''delete'');'
   WHEN f.proname IN ('admin_register_media','admin_register_model_media','admin_register_document_media') THEN 'PERFORM public.staff_assert_permission(''media'',''create'');'
   WHEN f.proname IN ('admin_update_media','admin_update_model_media') THEN 'PERFORM public.staff_assert_permission(''media'',''update'');'
   WHEN f.proname IN ('admin_list_media','editor_get_media') THEN 'PERFORM public.staff_assert_permission(''media'',''read'');'
   ELSE NULL END;
  IF guard_sql IS NULL OR f.prosrc !~* '\mBEGIN\M' THEN RAISE EXCEPTION 'Unmapped privileged access RPC: %',f.proname; END IF;
  source_sql:=regexp_replace(f.definition,'\mBEGIN\M',E'BEGIN\n  '||guard_sql,'i');
  EXECUTE source_sql; matched:=matched+1;
 END LOOP;
 IF matched<45 THEN RAISE EXCEPTION 'Incomplete privileged access guard inventory'; END IF;
END $guard$;

-- Private storage retains the public published-media path; custom roles need media grants.
CREATE OR REPLACE FUNCTION public.media_storage_allowed(p_key text,p_operation text)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $f$
DECLARE staff_read boolean:=false; staff_write boolean:=false; custom_role boolean:=false;
BEGIN
 IF p_key IS NULL OR p_key !~ '^assets/[0-9a-f-]{36}[.](webp|pdf|glb|docx)$' THEN RETURN false; END IF;
 IF public.requesting_user_id() IS NOT NULL THEN
  SELECT EXISTS(SELECT 1 FROM public.staff_role_memberships WHERE user_id=public.requesting_user_id() AND role LIKE 'custom_%') INTO custom_role;
  IF custom_role THEN
   SELECT COALESCE(bool_or('media.read'=ANY(d.permissions)),false),COALESCE(bool_or('media.create'=ANY(d.permissions)),false)
   INTO staff_read,staff_write FROM public.staff_role_memberships m JOIN public.staff_role_definitions d ON d.key=m.role WHERE m.user_id=public.requesting_user_id();
  ELSE
   staff_write:=public.has_capability('media.manage'); staff_read:=staff_write OR public.has_capability('catalog.edit') OR public.has_capability('content.edit');
  END IF;
 END IF;
 IF p_operation='read' THEN RETURN staff_read OR EXISTS(SELECT 1 FROM public.cms_media WHERE object_key=p_key AND published AND NOT archived AND (mime_type<>'model/gltf-binary' OR model_public_allowed)); END IF;
 IF p_operation IN ('write','delete') THEN RETURN staff_write AND NOT EXISTS(SELECT 1 FROM public.cms_media WHERE object_key=p_key); END IF;
 RETURN false;
END $f$;
