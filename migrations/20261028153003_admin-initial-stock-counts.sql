-- Permit explicit initial physical counts, including zero, for every unconfigured variant.
-- Ordinary inventory can initialize only at version zero; source inventory retains its explicit marker guard.
-- No balances or published content change by application. Forward rollback: replace this function with
-- the previous source-only version, preserving all counts, movements and audit records.
CREATE OR REPLACE FUNCTION public.admin_initialize_inventory(
  p_variant_id uuid, p_expected_version bigint, p_quantity integer, p_reason text, p_request_id uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp AS $f$
DECLARE
  v_subject text;
  v_variant public.catalog_variants%ROWTYPE;
  v_balance public.inventory_balances%ROWTYPE;
  v_existing public.inventory_movements%ROWTYPE;
  v_new_version bigint;
  v_delta integer;
  v_is_source boolean;
BEGIN
  v_subject := public.admin_assert_capability('orders.manage');
  IF p_variant_id IS NULL OR p_expected_version IS NULL OR p_expected_version NOT BETWEEN 0 AND 9007199254740990
    OR p_quantity IS NULL OR p_quantity NOT BETWEEN 0 AND 1000000 OR p_reason IS NULL
    OR char_length(btrim(p_reason)) NOT BETWEEN 1 AND 500 OR p_reason ~ '[[:cntrl:]]' OR p_request_id IS NULL THEN
    PERFORM public.phase3_fail('invalid_input');
  END IF;
  PERFORM pg_advisory_xact_lock(832642, hashtext(p_request_id::text));
  SELECT m.* INTO v_existing FROM public.inventory_movements m WHERE m.request_id=p_request_id;
  IF FOUND THEN
    IF v_existing.operation <> 'initialize' OR v_existing.actor <> v_subject
      OR v_existing.variant_id <> p_variant_id OR v_existing.balance_after <> p_quantity
      OR v_existing.stock_version <> p_expected_version + 1 OR v_existing.reason <> btrim(p_reason) THEN
      PERFORM public.phase3_fail('request_conflict');
    END IF;
    RETURN jsonb_build_object('variant', public.phase3_admin_variant_json(p_variant_id,v_subject));
  END IF;
  -- Share the catalog lifecycle lock so source/archive state cannot change during verification.
  PERFORM pg_advisory_xact_lock(832641);
  SELECT cv.* INTO v_variant FROM public.catalog_variants cv WHERE cv.id=p_variant_id FOR UPDATE;
  IF NOT FOUND THEN PERFORM public.phase3_fail('not_found'); END IF;
  IF v_variant.archived_at IS NOT NULL OR NOT EXISTS (
    SELECT 1 FROM public.cms_records r
    WHERE r.id=v_variant.product_id AND r.kind='product' AND r.archived_at IS NULL
  ) THEN PERFORM public.phase3_fail('invalid_state'); END IF;
  SELECT (r.draft ? 'sourceObservation' OR COALESCE(rev.document ? 'sourceObservation',false))
    INTO v_is_source
    FROM public.cms_records r LEFT JOIN public.cms_revisions rev ON rev.id=r.published_revision_id
    WHERE r.id=v_variant.product_id;
  INSERT INTO public.inventory_balances(variant_id) VALUES(p_variant_id) ON CONFLICT(variant_id) DO NOTHING;
  SELECT ib.* INTO v_balance FROM public.inventory_balances ib WHERE ib.variant_id=p_variant_id FOR UPDATE;
  IF v_balance.version <> p_expected_version THEN PERFORM public.phase3_fail('version_conflict'); END IF;
  IF v_balance.source_verified_at IS NOT NULL OR (NOT v_is_source AND v_balance.version <> 0) THEN
    PERFORM public.phase3_fail('invalid_state');
  END IF;
  v_new_version := v_balance.version + 1;
  -- Reconcile against any unverified stored balance, preserving its complete prior movement history.
  v_delta := p_quantity - v_balance.available_quantity;
  UPDATE public.inventory_balances SET available_quantity=p_quantity, version=v_new_version,
    source_verified_at=CASE WHEN v_is_source THEN now() ELSE v_balance.source_verified_at END, updated_at=now() WHERE variant_id=p_variant_id;
  UPDATE public.catalog_variants SET updated_at=now() WHERE id=p_variant_id;
  INSERT INTO public.inventory_movements(variant_id,request_id,delta,balance_after,stock_version,reason,actor,operation)
    VALUES(p_variant_id,p_request_id,v_delta,p_quantity,v_new_version,btrim(p_reason),v_subject,'initialize');
  PERFORM public.admin_write_audit(v_subject,'variant.inventory.initialize','variant',p_variant_id,
    jsonb_build_object('version',v_new_version,'delta',v_delta,'previousQuantity',v_balance.available_quantity,
      'availableQuantity',p_quantity,'requestId',p_request_id),p_reason);
  RETURN jsonb_build_object('variant',public.phase3_admin_variant_json(p_variant_id,v_subject));
END $f$;
REVOKE ALL ON FUNCTION public.admin_initialize_inventory(uuid,bigint,integer,text,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.admin_initialize_inventory(uuid,bigint,integer,text,uuid) TO authenticated;
