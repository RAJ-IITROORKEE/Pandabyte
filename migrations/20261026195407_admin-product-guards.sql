-- Correct search/price semantics; retain legacy non-product media compatibility. No records change.
CREATE OR REPLACE FUNCTION public.admin_list_products(p_query text DEFAULT '',p_status text DEFAULT 'all',p_category_id uuid DEFAULT NULL,p_sort text DEFAULT 'updated_desc',p_limit integer DEFAULT 20,p_offset integer DEFAULT 0)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $f$
DECLARE result jsonb;
BEGIN
 PERFORM public.admin_assert_capability('catalog.edit');
 IF p_query IS NULL OR char_length(p_query)>120 OR p_query ~ '[[:cntrl:]]' OR p_status IS NULL OR p_status NOT IN ('all','draft','published','archived') OR p_sort IS NULL OR p_sort NOT IN ('updated_desc','updated_asc','title_asc','title_desc','price_asc','price_desc') OR p_limit IS NULL OR p_limit NOT IN (10,20,50) OR p_offset IS NULL OR p_offset NOT BETWEEN 0 AND 10000 THEN PERFORM public.phase3_fail('invalid_input'); END IF;
 WITH base AS (
  SELECT r.*, (r.draft ? 'sourceObservation' OR COALESCE(rev.document ? 'sourceObservation',false)) AS source_only,
   CASE WHEN r.archived_at IS NOT NULL THEN 'archived' WHEN r.published_revision_id IS NOT NULL THEN 'published' ELSE 'draft' END AS status
  FROM public.cms_records r LEFT JOIN public.cms_revisions rev ON rev.id=r.published_revision_id WHERE r.kind='product'
 ), matching AS (
  SELECT r.*, price.summary AS price,price.effective AS sort_price FROM base r
  LEFT JOIN LATERAL (
   WITH amounts AS (
    SELECT cv.id,cv.sku,cv.regular_paise,(cv.sale_paise IS NOT NULL AND cv.sale_from<=now() AND now()<cv.sale_until) AS active_sale,CASE WHEN cv.sale_paise IS NOT NULL AND cv.sale_from<=now() AND now()<cv.sale_until THEN cv.sale_paise ELSE cv.regular_paise END AS effective
    FROM public.catalog_variants cv WHERE cv.product_id=r.id AND cv.archived_at IS NULL AND cv.regular_paise IS NOT NULL AND NOT r.source_only
   ) SELECT a.effective,jsonb_build_object('regularPricePaise',a.regular_paise,'effectivePricePaise',a.effective,'isOnSale',a.active_sale,'from',(SELECT count(DISTINCT effective)>1 FROM amounts)) AS summary FROM amounts a ORDER BY a.effective,a.sku,a.id LIMIT 1
  ) price ON true
  WHERE (p_status='all' OR r.status=p_status)
   AND (p_category_id IS NULL OR r.draft->'categoryIds' @> jsonb_build_array(p_category_id::text))
   AND (btrim(p_query)='' OR position(lower(btrim(p_query)) in lower(r.title||' '||r.slug))>0 OR EXISTS(SELECT 1 FROM jsonb_array_elements_text(COALESCE(r.draft->'modelNumbers','[]'::jsonb)) model WHERE position(lower(btrim(p_query)) in lower(model))>0) OR EXISTS(SELECT 1 FROM jsonb_array_elements(COALESCE(r.draft->'variants','[]'::jsonb)) v WHERE lower(v->>'sku')=lower(btrim(p_query))))
 ), page AS (
  SELECT * FROM matching ORDER BY
   CASE WHEN p_sort='updated_desc' THEN updated_at END DESC,CASE WHEN p_sort='updated_asc' THEN updated_at END ASC,
   CASE WHEN p_sort='title_asc' THEN lower(title) END ASC,CASE WHEN p_sort='title_desc' THEN lower(title) END DESC,
   CASE WHEN p_sort='price_asc' THEN sort_price END ASC NULLS LAST,CASE WHEN p_sort='price_desc' THEN sort_price END DESC NULLS LAST,id DESC LIMIT p_limit OFFSET p_offset
 ) SELECT jsonb_build_object('total',(SELECT count(*) FROM matching),'items',COALESCE((SELECT jsonb_agg(jsonb_build_object(
  'id',r.id,'title',r.title,'slug',r.slug,'version',r.version,'status',r.status,'updatedAt',r.updated_at,'sourceObservation',r.source_only,'price',r.price,
  'image',(SELECT jsonb_build_object('mediaId',m.id,'alt',m.alt_text) FROM jsonb_array_elements_text(COALESCE(r.draft->'mediaIds','[]'::jsonb)) WITH ORDINALITY g(id,position) JOIN public.cms_media m ON m.id=g.id::uuid AND NOT m.archived AND m.mime_type='image/webp' ORDER BY g.position LIMIT 1),
  'categories',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',c.id,'title',c.title) ORDER BY c.title,c.id) FROM public.cms_records c WHERE c.kind='category' AND c.archived_at IS NULL AND r.draft->'categoryIds' @> jsonb_build_array(c.id::text)),'[]'::jsonb)
 )) FROM page r),'[]'::jsonb),'categoryOptions',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',c.id,'title',c.title) ORDER BY c.title,c.id) FROM (SELECT id,title FROM public.cms_records WHERE kind='category' AND archived_at IS NULL ORDER BY title,id LIMIT 100) c),'[]'::jsonb)) INTO result;
 RETURN result;
END $f$;

CREATE OR REPLACE FUNCTION public.admin_list_product_prices(p_product_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $f$
DECLARE actor text; r public.cms_records; source_only boolean;
BEGIN
 actor:=public.admin_assert_capability('catalog.edit');
 SELECT * INTO r FROM public.cms_records WHERE id=p_product_id AND kind='product' AND archived_at IS NULL;
 IF NOT FOUND THEN PERFORM public.phase3_fail('not_found'); END IF;
 source_only:=r.draft ? 'sourceObservation' OR EXISTS(SELECT 1 FROM public.cms_revisions WHERE id=r.published_revision_id AND document ? 'sourceObservation');
 RETURN jsonb_build_object('sourceObservation',source_only,'items',COALESCE((SELECT jsonb_agg(public.phase3_admin_variant_json(v.id,actor) ORDER BY v.sku,v.id) FROM (SELECT id,sku FROM public.catalog_variants WHERE product_id=p_product_id AND archived_at IS NULL ORDER BY sku,id LIMIT 100) v),'[]'::jsonb));
END $f$;

CREATE OR REPLACE FUNCTION public.phase3_validate_media_refs(p_document jsonb,p_require_public boolean)
RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $f$
BEGIN
 PERFORM public.product_editor_validate_media_refs_before(p_document,p_require_public);
 IF p_document ? 'documentMediaId' AND NOT EXISTS(SELECT 1 FROM public.cms_media WHERE id=(p_document->>'documentMediaId')::uuid AND mime_type='application/vnd.openxmlformats-officedocument.wordprocessingml.document' AND NOT archived) THEN PERFORM public.phase3_fail('invalid_input'); END IF;
 IF EXISTS(WITH RECURSIVE nodes(n) AS (SELECT p_document->'richContent' WHERE p_document ? 'richContent' UNION ALL SELECT child FROM nodes CROSS JOIN LATERAL jsonb_array_elements(COALESCE(n->'content','[]'::jsonb)) child) SELECT 1 FROM nodes JOIN public.cms_media m ON m.id=(n->'attrs'->>'mediaId')::uuid WHERE n->>'type'='image' AND m.mime_type<>'image/webp') THEN PERFORM public.phase3_fail('invalid_input'); END IF;
 IF p_document ? 'variants' AND EXISTS(SELECT 1 FROM jsonb_array_elements_text(COALESCE(p_document->'mediaIds','[]'::jsonb)) r(id) JOIN public.cms_media m ON m.id=r.id::uuid WHERE m.mime_type<>'image/webp') THEN PERFORM public.phase3_fail('invalid_input'); END IF;
END $f$;
