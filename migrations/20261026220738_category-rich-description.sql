-- Permit the existing bounded rich-content schema in category drafts and revisions.
-- Forward rollback: restore callers first; keep existing category content and media references.
ALTER FUNCTION public.phase3_validate_document(text,jsonb) RENAME TO category_rich_validate_document_before;
CREATE FUNCTION public.phase3_validate_document(p_kind text,p_document jsonb)
RETURNS void LANGUAGE plpgsql STABLE SET search_path=pg_catalog,public,pg_temp AS $f$
DECLARE node_count bigint; text_count bigint; image_count bigint;
BEGIN
 IF p_kind='category' AND p_document ? 'richContent' THEN
  IF jsonb_typeof(p_document) IS DISTINCT FROM 'object' OR octet_length(p_document::text)>262144 OR NOT public.product_rich_node_valid(p_document->'richContent','root',0,0) THEN PERFORM public.phase3_fail('invalid_input'); END IF;
  WITH RECURSIVE nodes(n) AS (SELECT p_document->'richContent' UNION ALL SELECT child FROM nodes CROSS JOIN LATERAL jsonb_array_elements(COALESCE(n->'content','[]'::jsonb)) child)
  SELECT count(*),COALESCE(sum(char_length(n->>'text')),0),count(*) FILTER(WHERE n->>'type'='image') INTO node_count,text_count,image_count FROM nodes;
  IF node_count>2000 OR text_count>100000 OR image_count>30 THEN PERFORM public.phase3_fail('invalid_input'); END IF;
  PERFORM public.category_rich_validate_document_before(p_kind,p_document-'richContent');
 ELSE PERFORM public.category_rich_validate_document_before(p_kind,p_document); END IF;
END $f$;
REVOKE ALL ON FUNCTION public.phase3_validate_document(text,jsonb),public.category_rich_validate_document_before(text,jsonb) FROM PUBLIC,anon,authenticated;
