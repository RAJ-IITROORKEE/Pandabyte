-- Require an explicit first physical count before adjusting ordinary inventory.
-- Forward rollback: restore admin_adjust_inventory from 20261028153002; preserve all balances and history.
CREATE OR REPLACE FUNCTION public.admin_adjust_inventory(p_variant_id uuid, p_expected_version bigint, p_delta integer, p_reason text, p_request_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
DECLARE
  v_subject text;
  v_variant public.catalog_variants%ROWTYPE;
  v_balance public.inventory_balances%ROWTYPE;
  v_existing public.inventory_movements%ROWTYPE;
  v_quantity bigint;
  v_new_version bigint;
BEGIN
  v_subject := public.admin_assert_capability('orders.manage');
  IF p_variant_id IS NULL OR p_expected_version IS NULL OR p_expected_version < 0
    OR p_delta IS NULL OR p_delta NOT BETWEEN -1000000 AND 1000000 OR p_delta = 0 OR p_reason IS NULL
    OR char_length(btrim(p_reason)) NOT BETWEEN 1 AND 500 OR p_request_id IS NULL THEN
    PERFORM public.phase3_fail('invalid_input');
  END IF;
  PERFORM pg_advisory_xact_lock(832642, hashtext(p_request_id::text));
  SELECT movement.* INTO v_existing FROM public.inventory_movements movement
    WHERE movement.request_id = p_request_id;
  IF FOUND THEN
    IF v_existing.operation <> 'adjust' OR v_existing.stock_version <> p_expected_version + 1
      OR v_existing.actor <> v_subject OR v_existing.variant_id <> p_variant_id OR v_existing.delta <> p_delta
      OR v_existing.reason <> btrim(p_reason) THEN
      PERFORM public.phase3_fail('request_conflict');
    END IF;
    RETURN jsonb_build_object('variant', public.phase3_admin_variant_json(p_variant_id, v_subject));
  END IF;
  PERFORM pg_advisory_xact_lock(832641);
  SELECT cv.* INTO v_variant FROM public.catalog_variants cv
    WHERE cv.id = p_variant_id FOR UPDATE;
  IF NOT FOUND THEN PERFORM public.phase3_fail('not_found'); END IF;
  IF v_variant.archived_at IS NOT NULL OR EXISTS (
    SELECT 1 FROM public.cms_records r WHERE r.id = v_variant.product_id AND r.archived_at IS NOT NULL
  ) THEN PERFORM public.phase3_fail('invalid_state'); END IF;
  SELECT ib.* INTO v_balance FROM public.inventory_balances ib
    WHERE ib.variant_id = p_variant_id FOR UPDATE;
  IF NOT FOUND THEN
    INSERT INTO public.inventory_balances (variant_id) VALUES (p_variant_id)
      ON CONFLICT (variant_id) DO NOTHING;
    SELECT ib.* INTO v_balance FROM public.inventory_balances ib
      WHERE ib.variant_id = p_variant_id FOR UPDATE;
  END IF;
  IF v_balance.source_verified_at IS NULL AND EXISTS (
    SELECT 1 FROM public.cms_records r LEFT JOIN public.cms_revisions rev ON rev.id=r.published_revision_id
    WHERE r.id=v_variant.product_id AND (r.draft ? 'sourceObservation' OR COALESCE(rev.document ? 'sourceObservation',false))
  ) THEN PERFORM public.phase3_fail('invalid_state'); END IF;
  IF v_balance.version <> p_expected_version THEN PERFORM public.phase3_fail('version_conflict'); END IF;
  IF v_balance.version = 0 AND NOT EXISTS (
    SELECT 1 FROM public.cms_records r LEFT JOIN public.cms_revisions rev ON rev.id=r.published_revision_id
    WHERE r.id=v_variant.product_id AND (r.draft ? 'sourceObservation' OR COALESCE(rev.document ? 'sourceObservation',false))
  ) THEN PERFORM public.phase3_fail('invalid_state'); END IF;
  v_quantity := v_balance.available_quantity::bigint + p_delta::bigint;
  IF v_quantity NOT BETWEEN 0 AND 2147483647 THEN PERFORM public.phase3_fail('stock_conflict'); END IF;
  v_new_version := v_balance.version + 1;
  UPDATE public.inventory_balances
    SET available_quantity = v_quantity::integer, version = v_new_version, updated_at = now()
    WHERE variant_id = p_variant_id;
  INSERT INTO public.inventory_movements (
    variant_id, request_id, delta, balance_after, stock_version, reason, actor
  ) VALUES (
    p_variant_id, p_request_id, p_delta, v_quantity::integer,
    v_new_version, btrim(p_reason), v_subject
  );
  PERFORM public.admin_write_audit(v_subject, 'variant.inventory.adjust', 'variant', p_variant_id,
    jsonb_build_object('version', v_new_version, 'delta', p_delta,
      'availableQuantity', v_quantity, 'requestId', p_request_id), p_reason);
  RETURN jsonb_build_object('variant', public.phase3_admin_variant_json(p_variant_id, v_subject));
END
$function$;