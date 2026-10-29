-- Read-only movement projection; forward rollback removes the caller and revokes this RPC.
CREATE FUNCTION public.admin_inventory_history(p_variant_id uuid, p_offset integer) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $fn$
DECLARE result jsonb;
BEGIN
  PERFORM public.admin_assert_capability('orders.manage');
  IF p_variant_id IS NULL OR p_offset IS NULL OR p_offset NOT BETWEEN 0 AND 10000 OR p_offset % 20 <> 0 THEN
    PERFORM public.phase3_fail('invalid_input');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.catalog_variants WHERE id=p_variant_id) THEN
    PERFORM public.phase3_fail('not_found');
  END IF;
  WITH page AS (
    SELECT m.operation,m.delta,m.balance_after,m.reason,m.occurred_at,m.id,m.stock_version
    FROM public.inventory_movements m WHERE m.variant_id=p_variant_id
    ORDER BY m.stock_version DESC,m.id DESC LIMIT 21 OFFSET p_offset
  ), shown AS (
    SELECT * FROM page ORDER BY stock_version DESC,id DESC LIMIT 20
  )
  SELECT jsonb_build_object('offset',p_offset,'hasMore',(SELECT count(*) > 20 FROM page),
    'items',COALESCE((SELECT jsonb_agg(jsonb_build_object('operation',operation,'delta',delta,
      'balanceAfter',balance_after,'reason',reason,'occurredAt',occurred_at)
      ORDER BY stock_version DESC,id DESC) FROM shown),'[]'::jsonb)) INTO result;
  RETURN result;
END $fn$;
REVOKE ALL ON FUNCTION public.admin_inventory_history(uuid,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.admin_inventory_history(uuid,integer) TO authenticated;
