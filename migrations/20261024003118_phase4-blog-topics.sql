CREATE FUNCTION public.published_list_blog(p_query text,p_tag text,p_limit integer,p_offset integer)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $fn$
DECLARE v_query text:=btrim(COALESCE(p_query,'')); v_items jsonb;v_total bigint;v_doc jsonb;
BEGIN
  IF char_length(v_query)>120 OR v_query ~ '[[:cntrl:]]' OR p_tag IS NULL OR char_length(p_tag)>60 OR p_tag ~ '[[:cntrl:]]'
    OR p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 100 OR p_offset IS NULL OR p_offset NOT BETWEEN 0 AND 10000
  THEN PERFORM public.phase3_fail('invalid_input'); END IF;
  WITH matching AS (
    SELECT r.id,rev.id revision_id,rev.title,rev.slug,rev.document,rev.published_at
    FROM public.cms_live_routes route
    JOIN public.cms_records r ON r.id=route.record_id AND r.kind='blog' AND r.published_revision_id=route.revision_id AND r.archived_at IS NULL
    JOIN public.cms_revisions rev ON rev.id=route.revision_id AND rev.record_id=r.id
    WHERE route.kind='blog' AND (p_tag='' OR rev.document->'tags' ? p_tag)
      AND (v_query='' OR position(lower(v_query) in lower(rev.title||' '||COALESCE(rev.document->>'summary','')||' '||COALESCE(rev.document->>'author','')||' '||COALESCE(rev.document->>'tags','')))>0)
  ), page_rows AS (SELECT * FROM matching ORDER BY published_at DESC,id ASC LIMIT p_limit OFFSET p_offset)
  SELECT (SELECT count(*) FROM matching),COALESCE((SELECT jsonb_agg(jsonb_build_object(
    'id',id,'kind','blog','title',title,'slug',slug,'summary',document->>'summary','document',document-'blocks',
    'revisionId',revision_id,'publishedAt',published_at) ORDER BY published_at DESC,id ASC) FROM page_rows),'[]'::jsonb)
    INTO v_total,v_items;
  FOR v_doc IN SELECT item->'document' FROM public.phase3_jsonb_array_elements(v_items) a(item)
  LOOP PERFORM public.phase3_validate_media_refs(v_doc,true); END LOOP;
  RETURN jsonb_build_object('items',v_items,'total',v_total);
END $fn$;

CREATE FUNCTION public.published_blog_tags()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $fn$
  SELECT COALESCE(jsonb_agg(tag ORDER BY lower(tag),tag),'[]'::jsonb) FROM (
    SELECT DISTINCT t.tag,lower(t.tag) tag_order
    FROM public.cms_live_routes route
    JOIN public.cms_records r ON r.id=route.record_id AND r.kind='blog' AND r.published_revision_id=route.revision_id AND r.archived_at IS NULL
    JOIN public.cms_revisions rev ON rev.id=route.revision_id AND rev.record_id=r.id
    CROSS JOIN LATERAL jsonb_array_elements_text(COALESCE(rev.document->'tags','[]')) t(tag)
    WHERE route.kind='blog' ORDER BY tag_order,t.tag LIMIT 100
  ) tags
$fn$;
REVOKE ALL ON FUNCTION public.published_list_blog(text,text,integer,integer),public.published_blog_tags() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.published_list_blog(text,text,integer,integer),public.published_blog_tags() TO anon,authenticated;
