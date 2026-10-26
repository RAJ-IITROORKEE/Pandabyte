-- Bound complete optional content before delegation; mask source prices at the RPC boundary too.
CREATE OR REPLACE FUNCTION public.phase3_validate_document(p_kind text,p_document jsonb)
RETURNS void LANGUAGE plpgsql STABLE SET search_path=pg_catalog,public,pg_temp AS $f$
DECLARE node_count bigint; text_count bigint; image_count bigint;
BEGIN
 IF p_document IS NULL OR jsonb_typeof(p_document) IS DISTINCT FROM 'object' OR octet_length(p_document::text)>262144 THEN PERFORM public.phase3_fail('invalid_input'); END IF;
 IF p_kind<>'product' AND p_document ?| ARRAY['tags','richContent','documentMediaId'] AND p_document ?| ARRAY['richContent','documentMediaId'] THEN PERFORM public.phase3_fail('invalid_input'); END IF;
 IF p_kind='product' THEN
  IF p_document ? 'mediaIds' AND (jsonb_typeof(p_document->'mediaIds')<>'array' OR jsonb_array_length(p_document->'mediaIds')>5) THEN PERFORM public.phase3_fail('invalid_input'); END IF;
  IF p_document ? 'tags' THEN
   IF jsonb_typeof(p_document->'tags')<>'array' OR jsonb_array_length(p_document->'tags')>30 THEN PERFORM public.phase3_fail('invalid_input'); END IF;
   IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_document->'tags') t WHERE jsonb_typeof(t)<>'string' OR char_length(btrim(t#>>'{}')) NOT BETWEEN 1 AND 60 OR t#>>'{}' ~ '[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]') OR EXISTS(SELECT 1 FROM jsonb_array_elements_text(p_document->'tags') t GROUP BY lower(btrim(t)) HAVING count(*)>1) THEN PERFORM public.phase3_fail('invalid_input'); END IF;
  END IF;
  IF p_document ? 'documentMediaId' AND (jsonb_typeof(p_document->'documentMediaId') IS DISTINCT FROM 'string' OR p_document->>'documentMediaId' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$') THEN PERFORM public.phase3_fail('invalid_input'); END IF;
  IF p_document ? 'richContent' THEN
   IF NOT public.product_rich_node_valid(p_document->'richContent','root',0,0) THEN PERFORM public.phase3_fail('invalid_input'); END IF;
   WITH RECURSIVE nodes(n) AS (SELECT p_document->'richContent' UNION ALL SELECT child FROM nodes CROSS JOIN LATERAL jsonb_array_elements(COALESCE(n->'content','[]'::jsonb)) child)
   SELECT count(*),COALESCE(sum(char_length(n->>'text')),0),count(*) FILTER(WHERE n->>'type'='image') INTO node_count,text_count,image_count FROM nodes;
   IF node_count>2000 OR text_count>100000 OR image_count>30 THEN PERFORM public.phase3_fail('invalid_input'); END IF;
  END IF;
  PERFORM public.product_editor_validate_document_before(p_kind,p_document-ARRAY['tags','richContent','documentMediaId']);
 ELSE PERFORM public.product_editor_validate_document_before(p_kind,p_document); END IF;
END $f$;

CREATE OR REPLACE FUNCTION public.admin_list_product_prices(p_product_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $f$
DECLARE actor text; r public.cms_records; source_only boolean;
BEGIN
 actor:=public.admin_assert_capability('catalog.edit');
 SELECT * INTO r FROM public.cms_records WHERE id=p_product_id AND kind='product' AND archived_at IS NULL;
 IF NOT FOUND THEN PERFORM public.phase3_fail('not_found'); END IF;
 source_only:=r.draft ? 'sourceObservation' OR EXISTS(SELECT 1 FROM public.cms_revisions WHERE id=r.published_revision_id AND document ? 'sourceObservation');
 RETURN jsonb_build_object('sourceObservation',source_only,'items',COALESCE((SELECT jsonb_agg((public.phase3_admin_variant_json(v.id,actor)||jsonb_build_object('stock',NULL,'stockVersion',NULL)||CASE WHEN source_only THEN jsonb_build_object('regularPaise',NULL,'salePaise',NULL,'saleFrom',NULL,'saleUntil',NULL) ELSE '{}'::jsonb END) ORDER BY v.sku,v.id) FROM (SELECT id,sku FROM public.catalog_variants WHERE product_id=p_product_id AND archived_at IS NULL ORDER BY sku,id LIMIT 100) v),'[]'::jsonb));
END $f$;
