-- Permit bounded Blog rich content without rewriting legacy blocks or revisions.
-- Forward rollback restores the preceding validator and list projection after callers stop writing rich content.
ALTER FUNCTION public.phase3_validate_document(text,jsonb) RENAME TO blog_rich_validate_document_before;
CREATE FUNCTION public.phase3_validate_document(p_kind text,p_document jsonb)
RETURNS void LANGUAGE plpgsql STABLE SET search_path=pg_catalog,public,pg_temp AS $f$
DECLARE node_count bigint; text_count bigint; image_count bigint; invalid_image_alt_count bigint;
BEGIN
 IF p_kind='blog' AND p_document ? 'richContent' THEN
  IF jsonb_typeof(p_document) IS DISTINCT FROM 'object' OR octet_length(p_document::text)>262144
   OR jsonb_typeof(p_document->'richContent'->'content') IS DISTINCT FROM 'array'
   OR public.product_rich_node_valid(p_document->'richContent','root',0,0) IS NOT TRUE THEN PERFORM public.phase3_fail('invalid_input'); END IF;
  WITH RECURSIVE nodes(n) AS (SELECT p_document->'richContent' UNION ALL SELECT child FROM nodes CROSS JOIN LATERAL jsonb_array_elements(COALESCE(n->'content','[]'::jsonb)) child)
  SELECT count(*),COALESCE(sum(char_length(n->>'text')),0),count(*) FILTER(WHERE n->>'type'='image'),
   count(*) FILTER(WHERE n->>'type'='image' AND (
    char_length(n->'attrs'->>'alt')>300
    OR btrim(n->'attrs'->>'alt',U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF')=''
    OR n->'attrs'->>'alt' ~ '[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]'))
   INTO node_count,text_count,image_count,invalid_image_alt_count FROM nodes;
  IF node_count>2000 OR text_count>100000 OR image_count>30 OR invalid_image_alt_count>0 THEN PERFORM public.phase3_fail('invalid_input'); END IF;
  PERFORM public.blog_rich_validate_document_before(p_kind,p_document-'richContent');
 ELSE PERFORM public.blog_rich_validate_document_before(p_kind,p_document); END IF;
END $f$;
REVOKE ALL ON FUNCTION public.phase3_validate_document(text,jsonb),public.blog_rich_validate_document_before(text,jsonb) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.published_list_blog(p_query text,p_tag text,p_limit integer,p_offset integer)
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
    'id',id,'kind','blog','title',title,'slug',slug,'summary',document->>'summary','document',document-ARRAY['blocks','richContent'],
    'revisionId',revision_id,'publishedAt',published_at) ORDER BY published_at DESC,id ASC) FROM page_rows),'[]'::jsonb)
    INTO v_total,v_items;
  FOR v_doc IN SELECT item->'document' FROM public.phase3_jsonb_array_elements(v_items) a(item)
  LOOP PERFORM public.phase3_validate_media_refs(v_doc,true); END LOOP;
  RETURN jsonb_build_object('items',v_items,'total',v_total);
END $fn$;
