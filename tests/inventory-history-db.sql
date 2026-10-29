-- Run against the linked development database after this migration. All fixtures roll back.
BEGIN;
DO $test$
DECLARE actor text := 'inventory-history-test:' || gen_random_uuid()::text;
  pid uuid := gen_random_uuid(); vid uuid := gen_random_uuid(); result jsonb; detail text; rejected boolean := false;
BEGIN
  INSERT INTO public.staff_capabilities(user_id,capability,granted_by) VALUES(actor,'orders.manage',actor);
  INSERT INTO public.cms_records(id,kind,title,slug,draft,created_by,updated_by)
    VALUES(pid,'product','Fixture',pid::text,'{}',actor,actor);
  INSERT INTO public.catalog_variants(id,product_id,sku) VALUES(vid,pid,vid::text);
  INSERT INTO public.inventory_movements(variant_id,request_id,delta,balance_after,stock_version,reason,actor,operation,occurred_at)
    SELECT vid,gen_random_uuid(),CASE WHEN n=1 THEN 0 ELSE 1 END,n-1,n,'count ' || n,actor,
      CASE WHEN n=1 THEN 'initialize' ELSE 'adjust' END,TIMESTAMPTZ '2026-10-28T00:00:00Z'-n*INTERVAL '1 minute'
    FROM generate_series(1,21) n;
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',actor)::text,true);
  result := public.admin_inventory_history(vid,0);
  IF jsonb_array_length(result->'items')<>20 OR result->>'hasMore'<>'true'
    OR result->'items'->0->>'reason'<>'count 21' OR result::text LIKE '%' || actor || '%'
    OR result::text LIKE '%' || vid::text || '%'
    OR EXISTS(SELECT 1 FROM jsonb_array_elements(result->'items') item WHERE (SELECT count(*) FROM jsonb_object_keys(item))<>5)
  THEN RAISE EXCEPTION 'history first page/privacy assertion failed'; END IF;
  result := public.admin_inventory_history(vid,20);
  IF jsonb_array_length(result->'items')<>1 OR result->>'hasMore'<>'false'
    OR result->'items'->0->>'operation'<>'initialize' OR result->'items'->0->>'delta'<>'0'
  THEN RAISE EXCEPTION 'history initialization assertion failed'; END IF;
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',actor || ':denied')::text,true);
  BEGIN
    PERFORM public.admin_inventory_history(vid,0);
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    GET STACKED DIAGNOSTICS detail=PG_EXCEPTION_DETAIL;
    IF detail IS DISTINCT FROM 'forbidden' THEN RAISE; END IF;
    rejected := true;
  END;
  IF NOT rejected OR has_function_privilege('anon','public.admin_inventory_history(uuid,integer)','EXECUTE')
    OR NOT has_function_privilege('authenticated','public.admin_inventory_history(uuid,integer)','EXECUTE')
    OR has_table_privilege('authenticated','public.inventory_movements','SELECT')
  THEN RAISE EXCEPTION 'history privileges widened'; END IF;
END $test$;
ROLLBACK;
