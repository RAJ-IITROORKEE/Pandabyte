-- Normalize separators consistently so partial hyphenated models match.
CREATE OR REPLACE FUNCTION public.catalog_prefix_tsquery(p_query text)
RETURNS tsquery LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE SET search_path=pg_catalog AS $fn$
  SELECT to_tsquery('simple',string_agg(quote_literal(lexeme)||':*',' & '))
  FROM unnest(tsvector_to_array(to_tsvector('simple',regexp_replace(p_query,'[^[:alnum:]]+',' ','g')))) lexeme
$fn$;
CREATE OR REPLACE FUNCTION public.phase4_refresh_product(p_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog,public,pg_temp AS $fn$
BEGIN
  DELETE FROM public.catalog_search_documents WHERE product_id=p_id;
  INSERT INTO public.catalog_search_documents(product_id,revision_id,title,slug,summary,category_ids,identifiers,search_text,published_at)
  SELECT r.id,rev.id,rev.title,rev.slug,COALESCE(rev.document->>'summary',''),
    ARRAY(SELECT (value #>> '{}')::uuid FROM public.phase3_jsonb_array_elements(rev.document->'categoryIds') c(value)),
    ids.identifiers,
    to_tsvector('simple'::regconfig,regexp_replace(rev.title || ' ' || rev.slug || ' ' || COALESCE(rev.document->>'summary','') || ' ' || ids.words,'[^[:alnum:]]+',' ','g')),
    rev.published_at
  FROM public.cms_records r
  JOIN public.cms_live_routes route ON route.record_id=r.id AND route.revision_id=r.published_revision_id AND route.kind='product'
  JOIN public.cms_revisions rev ON rev.id=r.published_revision_id AND rev.record_id=r.id
  CROSS JOIN LATERAL (
    SELECT COALESCE(array_agg(DISTINCT public.catalog_normalize_identifier(value)) FILTER(WHERE public.catalog_normalize_identifier(value)<>''),'{}'::text[]) identifiers,
      COALESCE(string_agg(value,' '),'') words
    FROM (
      SELECT v.value->>'sku' value FROM public.phase3_jsonb_array_elements(rev.document->'variants') v(value)
      UNION ALL SELECT m.value #>> '{}' FROM public.phase3_jsonb_array_elements(COALESCE(rev.document->'modelNumbers','[]')) m(value)
    ) all_ids
  ) ids
  WHERE r.id=p_id AND r.kind='product' AND r.archived_at IS NULL AND r.published_revision_id IS NOT NULL;
END $fn$;

SELECT public.phase4_refresh_product(id) FROM public.cms_records WHERE kind='product' AND archived_at IS NULL AND published_revision_id IS NOT NULL;
