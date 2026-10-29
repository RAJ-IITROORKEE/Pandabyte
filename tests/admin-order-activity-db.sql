-- Run only against the linked development/disposable database after the activity migration.
-- Own simulation/audit/capability fixtures are transaction-scoped; no provider or stock operations.
BEGIN;
DO $test$
DECLARE
  actor text := 'order-activity-test:' || gen_random_uuid()::text;
  oid uuid := gen_random_uuid(); ref text; result jsonb; detail text; rejected boolean := false;
BEGIN
  ref := 'SIM-' || oid::text;
  INSERT INTO public.staff_capabilities(user_id,capability,granted_by) VALUES(actor,'staff.manage',actor);
  INSERT INTO public.admin_order_records(id,reference,status,total_paise,customer_subject,environment,payment_state,request_key,request_hash)
    VALUES(oid,ref,'pending',100,actor || ':customer','simulation','simulated',gen_random_uuid(),repeat('a',64));
  INSERT INTO public.cms_audit_events(actor,action,entity_type,entity_id,details,reason,occurred_at)
    SELECT actor,'order.update','order',oid,jsonb_build_object('status',CASE WHEN n=52 THEN 'invented' ELSE 'processing' END,
      'requiresReview',CASE WHEN n=52 THEN '"bad"'::jsonb ELSE 'false'::jsonb END,'privateKey','DO_NOT_RETURN'),
      'DO_NOT_RETURN_REASON',TIMESTAMPTZ '2026-10-28T00:00:00Z'+n*INTERVAL '1 minute'
    FROM generate_series(1,52) n;
  INSERT INTO public.cms_audit_events(actor,action,entity_type,entity_id,details)
    VALUES(actor,'private.action','order',oid,'{"secret":"DO_NOT_RETURN"}'::jsonb);
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',actor)::text,true);
  result := public.admin_get_order_activity(ref);
  IF result->>'total'<>'52' OR result->>'limit'<>'50' OR result->>'truncated'<>'true'
    OR jsonb_array_length(result->'items')<>50
    OR result->'items'->0->'status' IS DISTINCT FROM 'null'::jsonb
    OR result->'items'->0->'requiresReview' IS DISTINCT FROM 'null'::jsonb
    OR result->'items'->0->>'actorLabel'<>'Administrator'
    OR (result->'items'->0->>'occurredAt')::timestamptz<>TIMESTAMPTZ '2026-10-28T00:52:00Z'
    OR result::text LIKE '%' || actor || '%' OR result::text LIKE '%' || oid::text || '%'
    OR result::text LIKE '%DO_NOT_RETURN%' OR result::text LIKE '%private.action%'
    OR EXISTS(SELECT 1 FROM jsonb_array_elements(result->'items') item
      WHERE (SELECT count(*) FROM jsonb_object_keys(item))<>5 OR item ?| ARRAY['actor','id','entityId','details','reason'])
  THEN RAISE EXCEPTION 'activity projection/cap/order/privacy assertion failed'; END IF;
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',actor || ':denied')::text,true);
  BEGIN
    PERFORM public.admin_get_order_activity(ref);
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    GET STACKED DIAGNOSTICS detail=PG_EXCEPTION_DETAIL;
    IF detail IS DISTINCT FROM 'forbidden' THEN RAISE; END IF;
    rejected := true;
  END;
  IF NOT rejected THEN RAISE EXCEPTION 'activity unauthorized access accepted'; END IF;
  IF has_function_privilege('anon','public.admin_get_order_activity(text)','EXECUTE')
    OR NOT has_function_privilege('authenticated','public.admin_get_order_activity(text)','EXECUTE')
    OR has_table_privilege('authenticated','public.cms_audit_events','SELECT')
  THEN RAISE EXCEPTION 'activity privileges widened'; END IF;
END $test$;
ROLLBACK;
