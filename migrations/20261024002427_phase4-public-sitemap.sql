-- Only canonical implemented content families enter the sitemap. Category
-- paths are legacy redirects; FAQ/team are sections, navigation is internal.
CREATE FUNCTION public.published_sitemap(p_limit integer,p_offset integer)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $fn$
DECLARE v_items jsonb;v_total bigint;
BEGIN
  IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 1000 OR p_offset IS NULL OR p_offset NOT BETWEEN 0 AND 1000000
  THEN PERFORM public.phase3_fail('invalid_input'); END IF;
  WITH matching AS (
    SELECT route.path,route.kind,route.published_at
    FROM public.cms_live_routes route
    JOIN public.cms_records r ON r.id=route.record_id AND r.published_revision_id=route.revision_id AND r.kind=route.kind AND r.archived_at IS NULL
    WHERE route.kind IN ('product','blog','page','contact','solution','resource','video')
      AND route.path !~ '^/(api|admin|staff|account|sign-in|sign-up|checkout|cart|agent|_content)(/|$)'
      AND (route.kind<>'page' OR route.path ~ '^/([a-z0-9]+(-[a-z0-9]+)*)?$')
  ), page_rows AS (SELECT * FROM matching ORDER BY path LIMIT p_limit OFFSET p_offset)
  SELECT (SELECT count(*) FROM matching),COALESCE((SELECT jsonb_agg(jsonb_build_object(
    'path',path,'kind',kind,'publishedAt',published_at) ORDER BY path) FROM page_rows),'[]'::jsonb) INTO v_total,v_items;
  RETURN jsonb_build_object('items',v_items,'total',v_total);
END $fn$;
REVOKE ALL ON FUNCTION public.published_sitemap(integer,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.published_sitemap(integer,integer) TO anon,authenticated;
