-- Development-only rehearsal. Run with the official InsForge CLI after confirming
-- the Phase 4 storefront migration is applied. Expected CLI exit 1 is success only
-- when stderr contains P4_QUERY_PLAN_REHEARSAL_OK; all fixture DML rolls back.
-- One DO statement, app-owned public tables only; no DDL or transaction controls.
-- Refresh planner statistics afterward as ANALYZE statistics can outlive rollback.
DO $p4$
DECLARE
  v_count constant integer := 1000;
  run_hex text;
  actor text;
  fixtures jsonb;
  projection_count bigint;
  exact_count bigint;
  text_count bigint;
  expected_total bigint;
  rpc_total bigint;
  rpc_items integer;
  published_at timestamptz := clock_timestamp();
  exact_sku text;
  shared_query text;
  exact_plan jsonb;
  text_plan jsonb;
  rpc_result jsonb;
  started_at timestamptz;
  elapsed_ms numeric;
  report jsonb;
  plan_template constant text := $plan$
EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
WITH p AS (SELECT %1$L::text q,regexp_replace(lower(%1$L),'[^a-z0-9]','','g') i,public.catalog_prefix_tsquery(%1$L) t)
SELECT s.product_id,s.revision_id,s.title,s.slug,s.summary,s.identifiers,
         s.search_text,rev.document,
         CASE WHEN p.i<>'' AND s.identifiers @> ARRAY[p.i] THEN 1 ELSE 0 END exact_match,
         COALESCE(ts_rank_cd(s.search_text,p.t),0) relevance
FROM public.catalog_search_documents s CROSS JOIN p
JOIN public.cms_records r ON r.id=s.product_id AND r.kind='product'
  AND r.archived_at IS NULL AND r.published_revision_id=s.revision_id
JOIN public.cms_live_routes route ON route.record_id=s.product_id
  AND route.revision_id=s.revision_id AND route.kind='product'
JOIN public.cms_revisions rev ON rev.id=s.revision_id AND rev.record_id=s.product_id
WHERE (p.q='' OR s.identifiers @> ARRAY[p.i] OR s.search_text @@ p.t)
$plan$;
BEGIN
  run_hex := replace(gen_random_uuid()::text,'-','');
  actor := 'phase4-query-plan:' || run_hex;
  shared_query := 'p4qprobe' || run_hex;

  -- A single local JSONB map carries generated IDs into set-based inserts.
  WITH g AS (
    SELECT idx,gen_random_uuid() pid,gen_random_uuid() rid,gen_random_uuid() vid,
      format('P4Q-%s-%s',upper(run_hex),lpad(idx::text,5,'0')) sku,
      format('p4q-%s-%s',run_hex,lpad(idx::text,5,'0')) slug,
      format('P4QProbe %s',lpad(idx::text,5,'0')) title,
      CASE WHEN idx%2=0 THEN 160000 ELSE 290000 END::bigint price,
      CASE WHEN idx%3=0 THEN 1 ELSE 0 END qty
    FROM generate_series(1,v_count) x(idx)
  )
  SELECT jsonb_agg(jsonb_build_object(
    'pid',pid,'rid',rid,'vid',vid,'sku',sku,'slug',slug,'title',title,
    'price',price,'qty',qty,'doc',jsonb_build_object(
      'title',title,'slug',slug,'summary',shared_query || ' rollback-only search fixture',
      'blocks','[]'::jsonb,'seoTitle',title,'seoDescription','Synthetic query-plan fixture.',
      'categoryIds','[]'::jsonb,'modelNumbers','[]'::jsonb,
      'variants',jsonb_build_array(jsonb_build_object('id',vid,'sku',sku,'label','Rehearsal variant')),
      'specifications','[]'::jsonb,'compatibility','[]'::jsonb,'kitContents','[]'::jsonb,
      'resources','[]'::jsonb,'mediaIds','[]'::jsonb
    )
  ) ORDER BY idx) INTO fixtures FROM g;

  INSERT INTO public.cms_records(id,kind,title,slug,draft,created_by,updated_by)
  SELECT (j->>'pid')::uuid,'product',j->>'title',j->>'slug',j->'doc',actor,actor
  FROM jsonb_array_elements(fixtures) f(j);
  INSERT INTO public.catalog_variants(id,product_id,sku,regular_paise)
  SELECT (j->>'vid')::uuid,(j->>'pid')::uuid,j->>'sku',(j->>'price')::bigint
  FROM jsonb_array_elements(fixtures) f(j);
  INSERT INTO public.inventory_balances(variant_id,available_quantity)
  SELECT (j->>'vid')::uuid,(j->>'qty')::integer
  FROM jsonb_array_elements(fixtures) f(j);
  INSERT INTO public.cms_revisions(id,record_id,revision_number,source_version,
    title,slug,document,published_by)
  SELECT (j->>'rid')::uuid,(j->>'pid')::uuid,1,1,j->>'title',j->>'slug',j->'doc',actor
  FROM jsonb_array_elements(fixtures) f(j);
  INSERT INTO public.cms_live_routes(record_id,kind,slug,path,revision_id,published_at)
  SELECT (j->>'pid')::uuid,'product',j->>'slug','/products/'||(j->>'slug'),(j->>'rid')::uuid,published_at
  FROM jsonb_array_elements(fixtures) f(j);

  -- One bulk pointer update exercises the real projection trigger per product.
  UPDATE public.cms_records r SET published_revision_id=(j->>'rid')::uuid
  FROM jsonb_array_elements(fixtures) f(j)
  WHERE r.id=(j->>'pid')::uuid AND r.created_by=actor;

  SELECT count(*) INTO projection_count
  FROM public.catalog_search_documents s JOIN public.cms_records r
    ON r.id=s.product_id AND r.kind='product' AND r.published_revision_id=s.revision_id
  WHERE r.created_by=actor;
  IF projection_count IS DISTINCT FROM v_count THEN
    RAISE EXCEPTION 'catalog projection count %, expected %',projection_count,v_count;
  END IF;

  exact_sku := format('P4Q-%s-00001',upper(run_hex));
  SELECT count(*) INTO exact_count
  FROM public.catalog_search_documents s JOIN public.cms_records r
    ON r.id=s.product_id AND r.published_revision_id=s.revision_id
  WHERE r.created_by=actor AND s.identifiers @> ARRAY[regexp_replace(lower(exact_sku),'[^a-z0-9]','','g')]::text[];
  IF exact_count IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'exact normalized SKU count %, expected 1',exact_count;
  END IF;

  SELECT count(*) INTO text_count
  FROM public.catalog_search_documents s JOIN public.cms_records r
    ON r.id=s.product_id AND r.published_revision_id=s.revision_id
  WHERE r.created_by=actor AND s.search_text @@ public.catalog_prefix_tsquery(shared_query);
  IF text_count IS DISTINCT FROM v_count THEN
    RAISE EXCEPTION 'shared full-text count %, expected %',text_count,v_count;
  END IF;

  ANALYZE public.cms_records,public.cms_revisions,public.cms_live_routes,public.catalog_search_documents;

  EXECUTE format(plan_template,exact_sku) INTO exact_plan;
  EXECUTE format(plan_template,shared_query) INTO text_plan;
  IF exact_plan IS NULL OR text_plan IS NULL THEN
    RAISE EXCEPTION 'catalog candidate EXPLAIN plan was not captured';
  END IF;

  SELECT count(*) INTO expected_total FROM generate_series(1,v_count) x(i)
  WHERE i%2=0 AND i%3=0;
  started_at := clock_timestamp();
  rpc_result := public.published_list_products(
    shared_query,ARRAY[]::uuid[],150000,200000,'available','newest',12,0);
  elapsed_ms := extract(epoch FROM clock_timestamp()-started_at)*1000;
  rpc_total := (rpc_result->>'total')::bigint;
  rpc_items := jsonb_array_length(rpc_result->'items');
  IF rpc_total IS DISTINCT FROM expected_total OR rpc_items IS DISTINCT FROM 12 THEN
    RAISE EXCEPTION 'filtered RPC returned total %, page size %; expected %, 12',
      rpc_total,rpc_items,expected_total;
  END IF;

  report := jsonb_build_object(
    'fixtureCount',v_count,
    'catalogSearchProjectionRows',projection_count,
    'exactNormalizedSkuCandidateCount',exact_count,
    'sharedFullTextCandidateCount',text_count,
    'exactIdentifierCandidatePlan',exact_plan,
    'sharedTextCandidatePlan',text_plan,
    'combinedFilteredRpc',jsonb_build_object(
      'query',shared_query,'minimumPricePaise',150000,'maximumPricePaise',200000,
      'availability','available','sort','newest','expectedTotal',expected_total,
      'actualTotal',rpc_total,'pageItems',rpc_items,
      'elapsedMilliseconds',round(elapsed_ms,3)
    )
  );
  -- Last action: rollback the entire DO statement. This prefix is emitted only
  -- after every fixture, projection, candidate, and RPC assertion has passed.
  RAISE EXCEPTION 'P4_QUERY_PLAN_REHEARSAL_OK:%',report;
END
$p4$;
