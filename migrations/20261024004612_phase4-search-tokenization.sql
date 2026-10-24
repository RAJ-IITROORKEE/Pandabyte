-- Use the same parser for indexed documents and prefix queries, including
-- hyphenated numeric identifiers and Unicode text. Never concatenate raw query syntax.
CREATE FUNCTION public.catalog_prefix_tsquery(p_query text)
RETURNS tsquery LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE SET search_path=pg_catalog AS $fn$
  SELECT to_tsquery('simple',string_agg(quote_literal(lexeme)||':*',' & '))
  FROM unnest(tsvector_to_array(to_tsvector('simple',p_query))) lexeme
$fn$;
REVOKE ALL ON FUNCTION public.catalog_prefix_tsquery(text) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.published_list_products(
  p_query text,p_category_ids uuid[],p_min_price_paise bigint,p_max_price_paise bigint,
  p_availability text,p_sort text,p_limit integer,p_offset integer
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog,public,pg_temp AS $fn$
DECLARE
  v_query text := btrim(COALESCE(p_query,''));
  v_identifier text := public.catalog_normalize_identifier(v_query);
  v_tsquery tsquery; v_items jsonb; v_total bigint;
BEGIN
  IF char_length(v_query)>120 OR v_query ~ '[[:cntrl:]]' OR p_category_ids IS NULL OR cardinality(p_category_ids)>20
    OR array_position(p_category_ids,NULL) IS NOT NULL
    OR (p_min_price_paise IS NOT NULL AND p_min_price_paise NOT BETWEEN 0 AND 10000000000)
    OR (p_max_price_paise IS NOT NULL AND p_max_price_paise NOT BETWEEN 0 AND 10000000000)
    OR p_min_price_paise>p_max_price_paise OR p_availability IS NULL OR p_availability NOT IN ('all','available','unavailable')
    OR p_sort IS NULL OR p_sort NOT IN ('relevance','newest','price_asc','price_desc','title_asc')
    OR p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 48 OR p_offset IS NULL OR p_offset NOT BETWEEN 0 AND 10000
  THEN PERFORM public.phase3_fail('invalid_input'); END IF;
  v_tsquery := public.catalog_prefix_tsquery(v_query);
  WITH candidates AS (
    SELECT s.*,rev.document,
      CASE WHEN v_identifier<>'' AND s.identifiers @> ARRAY[v_identifier] THEN 1 ELSE 0 END exact_match,
      COALESCE(ts_rank_cd(s.search_text,v_tsquery),0) relevance
    FROM public.catalog_search_documents s
    JOIN public.cms_records r ON r.id=s.product_id AND r.kind='product' AND r.archived_at IS NULL AND r.published_revision_id=s.revision_id
    JOIN public.cms_live_routes route ON route.record_id=s.product_id AND route.revision_id=s.revision_id AND route.kind='product'
    JOIN public.cms_revisions rev ON rev.id=s.revision_id AND rev.record_id=s.product_id
    WHERE (v_query='' OR s.identifiers @> ARRAY[v_identifier] OR s.search_text @@ v_tsquery)
      AND (cardinality(p_category_ids)=0 OR s.category_ids && p_category_ids)
  ), matching AS (
    SELECT c.*,priced.variants,priced.min_price,priced.any_available
    FROM candidates c
    CROSS JOIN LATERAL (
      SELECT jsonb_agg(v.dto ORDER BY v.ordinality) FILTER(WHERE p_availability<>'available' OR v.is_available) variants,
        min(v.price) FILTER(WHERE p_availability<>'available' OR v.is_available) min_price,
        bool_or(v.is_available) any_available,count(*) variant_count
      FROM (
        SELECT public.phase3_public_variant_json(j.variant,c.document) dto,j.ordinality,
          CASE WHEN cv.sale_paise IS NOT NULL AND now()>=cv.sale_from AND now()<cv.sale_until THEN cv.sale_paise ELSE cv.regular_paise END price,
          COALESCE(ib.available_quantity,0)>0 is_available
        FROM public.phase3_jsonb_array_elements(c.document->'variants') WITH ORDINALITY j(variant,ordinality)
        JOIN public.catalog_variants cv ON cv.id=(j.variant->>'id')::uuid AND cv.product_id=c.product_id AND cv.archived_at IS NULL
        LEFT JOIN public.inventory_balances ib ON ib.variant_id=cv.id
      ) v
      WHERE v.price IS NOT NULL AND (p_min_price_paise IS NULL OR v.price>=p_min_price_paise)
        AND (p_max_price_paise IS NULL OR v.price<=p_max_price_paise)
    ) priced
    WHERE priced.variant_count>0 AND (p_availability='all' OR (p_availability='available' AND priced.any_available)
      OR (p_availability='unavailable' AND NOT priced.any_available))
  ), ordered AS (
    SELECT m.*,row_number() OVER(ORDER BY
      CASE WHEN p_sort='relevance' THEN exact_match END DESC,
      CASE WHEN p_sort='relevance' THEN relevance END DESC,
      CASE WHEN p_sort='price_asc' THEN min_price END ASC,
      CASE WHEN p_sort='price_desc' THEN min_price END DESC,
      CASE WHEN p_sort='title_asc' THEN lower(title) END ASC,
      CASE WHEN p_sort IN ('newest','relevance') THEN published_at END DESC,product_id ASC) row_order
    FROM matching m
  ), page_rows AS (SELECT * FROM ordered ORDER BY row_order LIMIT p_limit OFFSET p_offset)
  SELECT (SELECT count(*) FROM matching),COALESCE((SELECT jsonb_agg(jsonb_build_object(
    'id',product_id,'kind','product','title',title,'slug',slug,'summary',summary,
    'document',public.phase3_public_document('product',document)-'blocks','variants',variants,
    'revisionId',revision_id,'publishedAt',published_at) ORDER BY row_order) FROM page_rows),'[]'::jsonb)
  INTO v_total,v_items;
  RETURN jsonb_build_object('items',v_items,'total',v_total);
END $fn$;
