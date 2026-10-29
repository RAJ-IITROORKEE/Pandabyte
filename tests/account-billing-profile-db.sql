-- Run against the linked development database after the billing-profile migration.
-- Transaction-scoped fictional subjects only; no identity, provider or order mutations.
BEGIN;
DO $test$
DECLARE actor text:='billing-test:'||gen_random_uuid()::text; result jsonb; detail text; rejected boolean:=false;
BEGIN
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',actor)::text,true);
  result:=public.customer_get_billing_profile();
  IF result IS DISTINCT FROM '{"version":0,"businessName":"","contactEmail":"","gstin":""}'::jsonb THEN RAISE EXCEPTION 'billing empty projection failed'; END IF;
  result:=public.customer_save_billing_profile(0,' Example Workshop ',' billing@example.com ','27abcde1234f1z5');
  IF result IS DISTINCT FROM '{"version":1,"businessName":"Example Workshop","contactEmail":"billing@example.com","gstin":"27ABCDE1234F1Z5"}'::jsonb THEN RAISE EXCEPTION 'billing create normalization failed'; END IF;
  BEGIN
    PERFORM public.customer_save_billing_profile(0,'stale','','');
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    GET STACKED DIAGNOSTICS detail=PG_EXCEPTION_DETAIL;
    IF detail IS DISTINCT FROM 'version_conflict' THEN RAISE; END IF;
    rejected:=true;
  END;
  IF NOT rejected THEN RAISE EXCEPTION 'billing stale write accepted'; END IF;
  rejected:=false;
  BEGIN
    PERFORM public.customer_save_billing_profile(1,'Example',E'bad\n@example.com','');
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    GET STACKED DIAGNOSTICS detail=PG_EXCEPTION_DETAIL;
    IF detail IS DISTINCT FROM 'invalid_input' THEN RAISE; END IF;
    rejected:=true;
  END;
  IF NOT rejected THEN RAISE EXCEPTION 'billing unsafe input accepted'; END IF;
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',actor||':other')::text,true);
  IF public.customer_get_billing_profile()->>'version'<>'0' THEN RAISE EXCEPTION 'billing cross-customer read leaked'; END IF;
  PERFORM public.customer_save_billing_profile(0,'Other customer','','');
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',actor)::text,true);
  IF public.customer_get_billing_profile()->>'businessName'<>'Example Workshop' THEN RAISE EXCEPTION 'billing cross-customer write changed owner'; END IF;
  result:=public.customer_save_billing_profile(1,'','','');
  IF result IS DISTINCT FROM '{"version":2,"businessName":"","contactEmail":"","gstin":""}'::jsonb THEN RAISE EXCEPTION 'billing clear/version failed'; END IF;
  PERFORM set_config('request.jwt.claims','{}',true);
  rejected:=false;
  BEGIN
    PERFORM public.customer_get_billing_profile();
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    GET STACKED DIAGNOSTICS detail=PG_EXCEPTION_DETAIL;
    IF detail IS DISTINCT FROM 'unauthenticated' THEN RAISE; END IF;
    rejected:=true;
  END;
  IF NOT rejected THEN RAISE EXCEPTION 'billing missing subject accepted'; END IF;
  IF has_function_privilege('anon','public.customer_get_billing_profile()','EXECUTE')
    OR has_function_privilege('anon','public.customer_save_billing_profile(bigint,text,text,text)','EXECUTE')
    OR NOT has_function_privilege('authenticated','public.customer_save_billing_profile(bigint,text,text,text)','EXECUTE')
    OR has_table_privilege('authenticated','public.customer_billing_profiles','INSERT,UPDATE,DELETE')
    OR NOT (SELECT relrowsecurity FROM pg_class WHERE oid='public.customer_billing_profiles'::regclass)
  THEN RAISE EXCEPTION 'billing grants or RLS widened'; END IF;
END $test$;
ROLLBACK;
