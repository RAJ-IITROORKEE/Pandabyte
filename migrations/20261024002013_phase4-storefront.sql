-- Additive development storefront/search migration. Restore by compensating
-- forward migration; never erase publication history or replay applied files.
ALTER FUNCTION public.phase3_validate_document(text,jsonb) RENAME TO phase3_validate_document_base;
CREATE FUNCTION public.phase3_validate_document(p_kind text,p_document jsonb)
RETURNS void LANGUAGE plpgsql STABLE SET search_path = pg_catalog,public,pg_temp AS $fn$
DECLARE v_base jsonb := p_document;
BEGIN
  IF p_kind = 'product' THEN
    IF p_document ? 'modelNumbers' AND (
      jsonb_typeof(p_document->'modelNumbers') IS DISTINCT FROM 'array'
      OR public.phase3_jsonb_array_length(p_document->'modelNumbers') > 20
      OR EXISTS(SELECT 1 FROM public.phase3_jsonb_array_elements(p_document->'modelNumbers') a(value)
        WHERE jsonb_typeof(value) IS DISTINCT FROM 'string'
          OR char_length(btrim(value #>> '{}')) NOT BETWEEN 1 AND 80
          OR (value #>> '{}') ~ '[[:cntrl:]]' OR (value #>> '{}') !~* '[a-z0-9]')
      OR (SELECT count(*) <> count(DISTINCT lower(btrim(value #>> '{}')))
        FROM public.phase3_jsonb_array_elements(p_document->'modelNumbers') a(value))
    ) THEN PERFORM public.phase3_fail('invalid_input'); END IF;
    v_base := v_base - 'modelNumbers';
  ELSIF p_kind = 'resource' THEN
    IF p_document ? 'collection' AND (jsonb_typeof(p_document->'collection') IS DISTINCT FROM 'string'
      OR p_document->>'collection' NOT IN ('product-specs','embedded-systems','kit-guides')) THEN
      PERFORM public.phase3_fail('invalid_input');
    END IF;
    v_base := v_base - 'collection';
  END IF;
  PERFORM public.phase3_validate_document_base(p_kind,v_base);
END $fn$;
REVOKE ALL ON FUNCTION public.phase3_validate_document(text,jsonb), public.phase3_validate_document_base(text,jsonb) FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.catalog_normalize_identifier(p_value text)
RETURNS text LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE SET search_path = pg_catalog AS $fn$
  SELECT regexp_replace(lower(p_value),'[^a-z0-9]','','g')
$fn$;

CREATE TABLE public.catalog_search_documents (
  product_id uuid PRIMARY KEY REFERENCES public.cms_records(id) ON DELETE CASCADE,
  revision_id uuid NOT NULL REFERENCES public.cms_revisions(id) ON DELETE RESTRICT,
  title text NOT NULL, slug text NOT NULL, summary text NOT NULL,
  category_ids uuid[] NOT NULL, identifiers text[] NOT NULL, search_text tsvector NOT NULL,
  published_at timestamptz NOT NULL
);
ALTER TABLE public.catalog_search_documents ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.catalog_search_documents FROM PUBLIC,anon,authenticated;
CREATE INDEX catalog_search_identifiers_idx ON public.catalog_search_documents USING gin(identifiers);
CREATE INDEX catalog_search_text_idx ON public.catalog_search_documents USING gin(search_text);
CREATE INDEX catalog_search_categories_idx ON public.catalog_search_documents USING gin(category_ids);
CREATE INDEX catalog_search_newest_idx ON public.catalog_search_documents(published_at DESC,product_id);

CREATE FUNCTION public.phase4_refresh_product(p_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog,public,pg_temp AS $fn$
BEGIN
  DELETE FROM public.catalog_search_documents WHERE product_id=p_id;
  INSERT INTO public.catalog_search_documents(product_id,revision_id,title,slug,summary,category_ids,identifiers,search_text,published_at)
  SELECT r.id,rev.id,rev.title,rev.slug,COALESCE(rev.document->>'summary',''),
    ARRAY(SELECT (value #>> '{}')::uuid FROM public.phase3_jsonb_array_elements(rev.document->'categoryIds') c(value)),
    ids.identifiers,
    to_tsvector('simple'::regconfig,rev.title || ' ' || rev.slug || ' ' || COALESCE(rev.document->>'summary','') || ' ' || ids.words),
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
CREATE FUNCTION public.phase4_product_publication_changed()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog,public,pg_temp AS $fn$
BEGIN PERFORM public.phase4_refresh_product(NEW.id); RETURN NEW; END $fn$;
CREATE TRIGGER catalog_search_publication_changed AFTER UPDATE OF published_revision_id,archived_at ON public.cms_records
  FOR EACH ROW WHEN (OLD.published_revision_id IS DISTINCT FROM NEW.published_revision_id OR OLD.archived_at IS DISTINCT FROM NEW.archived_at)
  EXECUTE FUNCTION public.phase4_product_publication_changed();
DO $fn$ DECLARE v_id uuid; BEGIN
  FOR v_id IN SELECT id FROM public.cms_records WHERE kind='product' AND published_revision_id IS NOT NULL AND archived_at IS NULL
  LOOP PERFORM public.phase4_refresh_product(v_id); END LOOP;
END $fn$;
REVOKE ALL ON FUNCTION public.catalog_normalize_identifier(text),public.phase4_refresh_product(uuid),public.phase4_product_publication_changed() FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.published_list_products(
  p_query text,p_category_ids uuid[],p_min_price_paise bigint,p_max_price_paise bigint,
  p_availability text,p_sort text,p_limit integer,p_offset integer
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog,public,pg_temp AS $fn$
DECLARE
  v_query text := btrim(COALESCE(p_query,''));
  v_identifier text := public.catalog_normalize_identifier(v_query);
  v_terms text; v_tsquery tsquery; v_items jsonb; v_total bigint;
BEGIN
  IF char_length(v_query)>120 OR v_query ~ '[[:cntrl:]]' OR p_category_ids IS NULL OR cardinality(p_category_ids)>20
    OR array_position(p_category_ids,NULL) IS NOT NULL
    OR (p_min_price_paise IS NOT NULL AND p_min_price_paise NOT BETWEEN 0 AND 10000000000)
    OR (p_max_price_paise IS NOT NULL AND p_max_price_paise NOT BETWEEN 0 AND 10000000000)
    OR p_min_price_paise>p_max_price_paise OR p_availability IS NULL OR p_availability NOT IN ('all','available','unavailable')
    OR p_sort IS NULL OR p_sort NOT IN ('relevance','newest','price_asc','price_desc','title_asc')
    OR p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 48 OR p_offset IS NULL OR p_offset NOT BETWEEN 0 AND 10000
  THEN PERFORM public.phase3_fail('invalid_input'); END IF;
  SELECT string_agg(quote_literal(token)||':*',' & ') INTO v_terms
    FROM regexp_split_to_table(lower(v_query),'[^a-z0-9]+') token WHERE token<>'';
  v_tsquery := CASE WHEN v_terms IS NULL THEN NULL ELSE to_tsquery('simple',v_terms) END;
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
REVOKE ALL ON FUNCTION public.published_list_products(text,uuid[],bigint,bigint,text,text,integer,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.published_list_products(text,uuid[],bigint,bigint,text,text,integer,integer) TO anon,authenticated;

CREATE FUNCTION public.published_list_content(
  p_kind text,p_query text,p_placement text,p_collection text,p_product_id uuid,p_limit integer,p_offset integer
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog,public,pg_temp AS $fn$
DECLARE v_query text:=btrim(COALESCE(p_query,'')); v_items jsonb;v_total bigint;v_doc jsonb;
BEGIN
  IF p_kind IS NULL OR p_kind NOT IN ('product','category','blog','page','faq','team','navigation','contact','solution','resource','video')
    OR char_length(v_query)>120 OR v_query ~ '[[:cntrl:]]' OR p_placement IS NULL OR char_length(p_placement)>120 OR p_placement ~ '[[:cntrl:]]'
    OR p_collection IS NULL OR p_collection NOT IN ('','product-specs','embedded-systems','kit-guides')
    OR (p_placement<>'' AND p_kind<>'faq') OR (p_collection<>'' AND p_kind<>'resource')
    OR (p_product_id IS NOT NULL AND p_kind NOT IN ('resource','video'))
    OR p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 100 OR p_offset IS NULL OR p_offset NOT BETWEEN 0 AND 10000
  THEN PERFORM public.phase3_fail('invalid_input'); END IF;
  WITH matching AS (
    SELECT r.id,r.kind,rev.id revision_id,rev.title,rev.slug,rev.document,rev.published_at,
      CASE WHEN p_kind IN ('category','faq','team','resource','video') THEN COALESCE((rev.document->>'position')::integer,0) ELSE 0 END position
    FROM public.cms_live_routes route
    JOIN public.cms_records r ON r.id=route.record_id AND r.kind=route.kind AND r.published_revision_id=route.revision_id AND r.archived_at IS NULL
    JOIN public.cms_revisions rev ON rev.id=route.revision_id AND rev.record_id=r.id
    WHERE route.kind=p_kind
      AND (v_query='' OR position(lower(v_query) in lower(rev.title||' '||COALESCE(rev.document->>'summary','')||' '||COALESCE(rev.document->>'answer','')||' '||COALESCE(rev.document->>'topic','')))>0)
      AND (p_placement='' OR rev.document->'placements' ? p_placement)
      AND (p_collection='' OR COALESCE(rev.document->>'collection','embedded-systems')=p_collection)
      AND (p_product_id IS NULL OR rev.document->'productIds' ? p_product_id::text)
  ), page_rows AS (
    SELECT *,row_number() OVER(ORDER BY position ASC,
      CASE WHEN p_kind NOT IN ('category','faq','team','resource','video') THEN published_at END DESC,
      lower(title),id) row_order FROM matching
    ORDER BY row_order LIMIT p_limit OFFSET p_offset
  )
  SELECT (SELECT count(*) FROM matching),COALESCE((SELECT jsonb_agg(jsonb_build_object(
    'id',id,'kind',kind,'title',title,'slug',slug,'summary',document->>'summary',
    'document',public.phase3_public_document(kind,document)-'blocks','revisionId',revision_id,'publishedAt',published_at
  ) || CASE WHEN kind='product' THEN jsonb_build_object('variants',(
    SELECT COALESCE(jsonb_agg(public.phase3_public_variant_json(v.variant,page_rows.document) ORDER BY v.ordinality),'[]'::jsonb)
    FROM public.phase3_jsonb_array_elements(page_rows.document->'variants') WITH ORDINALITY v(variant,ordinality)
  )) ELSE '{}'::jsonb END ORDER BY row_order) FROM page_rows),'[]'::jsonb) INTO v_total,v_items;
  FOR v_doc IN SELECT item->'document' FROM public.phase3_jsonb_array_elements(v_items) a(item)
  LOOP PERFORM public.phase3_validate_media_refs(v_doc,true); END LOOP;
  RETURN jsonb_build_object('items',v_items,'total',v_total);
END $fn$;
REVOKE ALL ON FUNCTION public.published_list_content(text,text,text,text,uuid,integer,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.published_list_content(text,text,text,text,uuid,integer,integer) TO anon,authenticated;
