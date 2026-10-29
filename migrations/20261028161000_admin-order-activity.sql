-- Read-only capped audit projection. No new lifecycle events, writer changes, provider requests or actor identifiers.
-- Forward rollback: remove the activity caller and revoke this RPC; preserve orders/audits.
CREATE FUNCTION public.admin_get_order_activity(p_reference text) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $fn$
DECLARE o public.admin_order_records; result jsonb;
BEGIN
  PERFORM public.admin_assert_capability('staff.manage');
  IF p_reference IS NULL OR char_length(p_reference) NOT BETWEEN 1 AND 80 OR p_reference ~ '[[:cntrl:]]' THEN
    PERFORM public.phase3_fail('invalid_input');
  END IF;
  SELECT * INTO o FROM public.admin_order_records WHERE reference=p_reference AND environment IN ('simulation','razorpay_test');
  IF NOT FOUND THEN PERFORM public.phase3_fail('not_found'); END IF;
  WITH matching AS (
    SELECT e.* FROM public.cms_audit_events e WHERE e.entity_type='order' AND e.entity_id=o.id
      AND e.action IN ('order.simulate','order.razorpay_test_prepare','order.razorpay_test_capture','order.update')
  ), page AS (
    SELECT * FROM matching ORDER BY occurred_at DESC,id DESC LIMIT 50
  )
  SELECT jsonb_build_object('total',(SELECT count(*) FROM matching),'limit',50,
    'truncated',(SELECT count(*)>50 FROM matching),
    'items',COALESCE((SELECT jsonb_agg(jsonb_build_object('action',e.action,'occurredAt',e.occurred_at,
      'status',CASE WHEN e.details->>'status' IN ('pending','processing','fulfilled','cancelled') THEN e.details->>'status' ELSE NULL END,
      'actorLabel',CASE WHEN e.action='order.update' THEN 'Administrator' WHEN e.actor=o.customer_subject THEN 'Order customer' ELSE 'Recorded actor' END,
      'requiresReview',CASE WHEN jsonb_typeof(e.details->'requiresReview')='boolean' THEN e.details->'requiresReview' ELSE NULL END
    ) ORDER BY e.occurred_at DESC,e.id DESC) FROM page e),'[]'::jsonb)) INTO result;
  RETURN result;
END $fn$;
REVOKE ALL ON FUNCTION public.admin_get_order_activity(text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_order_activity(text) TO authenticated;
