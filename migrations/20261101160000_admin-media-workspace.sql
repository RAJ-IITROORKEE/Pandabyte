-- Read-only media workspace. No publication, storage or existing-content mutation.
-- Rollback is a reviewed forward revocation of the two public RPC grants.
CREATE FUNCTION public.media_workspace_dto(p_media public.cms_media)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $f$
 SELECT public.media_admin_dto(p_media)||jsonb_build_object('createdAt',p_media.created_at,'updatedAt',p_media.updated_at)
$f$;
REVOKE ALL ON FUNCTION public.media_workspace_dto(public.cms_media) FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.admin_media_workspace(p_query text DEFAULT '',p_type text DEFAULT 'all',p_status text DEFAULT 'all',p_sort text DEFAULT 'newest',p_limit integer DEFAULT 20,p_offset integer DEFAULT 0)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $f$
DECLARE v_items jsonb; v_total bigint; v_stats jsonb;
BEGIN
 PERFORM public.staff_assert_permission('media','read');
 IF public.requesting_user_id() IS NULL THEN PERFORM public.phase3_fail('unauthenticated'); END IF;
 IF NOT(public.has_capability('media.manage') OR public.has_capability('catalog.edit') OR public.has_capability('content.edit')) THEN PERFORM public.phase3_fail('forbidden'); END IF;
 IF p_query IS NULL OR char_length(p_query)>100 OR p_type IS NULL OR p_type NOT IN ('all','image','document','model')
 OR p_status IS NULL OR p_status NOT IN ('all','private','published') OR p_sort IS NULL OR p_sort NOT IN ('newest','oldest','name')
 OR p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 50 OR p_offset IS NULL OR p_offset NOT BETWEEN 0 AND 1000000 THEN PERFORM public.phase3_fail('invalid_input'); END IF;
 SELECT jsonb_build_object('total',count(*),'images',count(*) FILTER(WHERE mime_type LIKE 'image/%'),
 'documents',count(*) FILTER(WHERE mime_type IN ('application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document')),
 'models',count(*) FILTER(WHERE mime_type='model/gltf-binary'),'published',count(*) FILTER(WHERE published),
 'private',count(*) FILTER(WHERE NOT published),'totalBytes',COALESCE(sum(byte_size),0)) INTO v_stats FROM public.cms_media WHERE NOT archived;
 WITH filtered AS MATERIALIZED (
  SELECT m.* FROM public.cms_media m WHERE NOT archived
  AND (filename ILIKE '%'||p_query||'%' OR alt_text ILIKE '%'||p_query||'%')
  AND (p_type='all' OR (p_type='image' AND mime_type LIKE 'image/%') OR (p_type='model' AND mime_type='model/gltf-binary')
   OR (p_type='document' AND mime_type IN ('application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document')))
  AND (p_status='all' OR (p_status='private' AND NOT published) OR (p_status='published' AND published))
 ), page AS (
 SELECT * FROM filtered ORDER BY CASE WHEN p_sort='name' THEN lower(filename) END ASC,
 CASE WHEN p_sort='oldest' THEN created_at END ASC,CASE WHEN p_sort='newest' THEN created_at END DESC,id
 LIMIT p_limit OFFSET p_offset)
 SELECT (SELECT count(*) FROM filtered),COALESCE((SELECT jsonb_agg(public.media_workspace_dto(p::public.cms_media)
 ORDER BY CASE WHEN p_sort='name' THEN lower(p.filename) END ASC,CASE WHEN p_sort='oldest' THEN p.created_at END ASC,
 CASE WHEN p_sort='newest' THEN p.created_at END DESC,p.id) FROM page p),'[]'::jsonb) INTO v_total,v_items;
 RETURN jsonb_build_object('items',v_items,'total',v_total,'stats',v_stats);
END $f$;
REVOKE ALL ON FUNCTION public.admin_media_workspace(text,text,text,text,integer,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_media_workspace(text,text,text,text,integer,integer) TO authenticated;

CREATE FUNCTION public.admin_media_details(p_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $f$
DECLARE m public.cms_media; v_usage jsonb; v_total bigint;
BEGIN
 PERFORM public.staff_assert_permission('media','read');
 IF public.requesting_user_id() IS NULL THEN PERFORM public.phase3_fail('unauthenticated'); END IF;
 IF NOT(public.has_capability('media.manage') OR public.has_capability('catalog.edit') OR public.has_capability('content.edit')) THEN PERFORM public.phase3_fail('forbidden'); END IF;
 IF p_id IS NULL THEN PERFORM public.phase3_fail('invalid_input'); END IF;
 SELECT * INTO m FROM public.cms_media WHERE id=p_id AND NOT archived;
 IF NOT FOUND THEN PERFORM public.phase3_fail('not_found'); END IF;
 -- Filter module permissions before exposing usage titles, counts or pagination.
 WITH visible AS MATERIALIZED (
 SELECT r.*,public.staff_resource_for_kind(r.kind) AS resource FROM public.cms_records r
 WHERE public.has_capability(CASE WHEN r.kind IN ('product','category') THEN 'catalog.edit' ELSE 'content.edit' END)
 AND (NOT EXISTS(SELECT 1 FROM public.staff_role_memberships WHERE user_id=public.requesting_user_id() AND role LIKE 'custom_%')
  OR EXISTS(SELECT 1 FROM public.staff_role_memberships s JOIN public.staff_role_definitions d ON d.key=s.role
   WHERE s.user_id=public.requesting_user_id() AND public.staff_resource_for_kind(r.kind)||'.read'=ANY(d.permissions)))
 ), usage AS MATERIALIZED (
 SELECT r.id,r.title,r.kind,r.slug,r.resource,r.updated_at,
 CASE WHEN r.archived_at IS NOT NULL THEN 'Archived record'
 WHEN public.phase3_document_uses_media(r.draft,p_id) AND EXISTS(SELECT 1 FROM public.cms_revisions v WHERE v.id=r.published_revision_id AND public.phase3_document_uses_media(v.document,p_id)) THEN 'Draft and published'
 WHEN public.phase3_document_uses_media(r.draft,p_id) THEN 'Draft'
 WHEN EXISTS(SELECT 1 FROM public.cms_revisions v WHERE v.id=r.published_revision_id AND public.phase3_document_uses_media(v.document,p_id)) THEN 'Published'
 ELSE 'Saved revision' END AS status
 FROM visible r WHERE public.phase3_document_uses_media(r.draft,p_id)
 OR EXISTS(SELECT 1 FROM public.cms_revisions v WHERE v.record_id=r.id AND public.phase3_document_uses_media(v.document,p_id))
 ), page AS (SELECT * FROM usage ORDER BY updated_at DESC,id LIMIT 50)
 SELECT (SELECT count(*) FROM usage),COALESCE((SELECT jsonb_agg(jsonb_build_object('title',title,'kind',kind,'slug',slug,'status',status,
 'url','/admin/'||resource||'/'||id::text) ORDER BY updated_at DESC,id) FROM page),'[]'::jsonb) INTO v_total,v_usage;
 RETURN jsonb_build_object('media',public.media_workspace_dto(m),'usage',jsonb_build_object('items',v_usage,'total',v_total,'limit',50,'truncated',v_total>50));
END $f$;
REVOKE ALL ON FUNCTION public.admin_media_details(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_media_details(uuid) TO authenticated;
