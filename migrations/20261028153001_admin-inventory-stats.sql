-- Read-only, global inventory counts; follow the workspace's managed quantity rules.
CREATE FUNCTION public.admin_inventory_stats()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $f$
DECLARE
  v_stats jsonb;
BEGIN
  PERFORM public.admin_assert_capability('orders.manage');
  WITH quantities AS (
    SELECT CASE
      WHEN COALESCE(r.draft ? 'sourceObservation', false)
        OR COALESCE(rev.document ? 'sourceObservation', false)
        OR ib.version IS NULL OR ib.version = 0 THEN NULL
      ELSE ib.available_quantity
    END AS managed_quantity
    FROM public.catalog_variants cv
    JOIN public.cms_records r ON r.id = cv.product_id AND r.kind = 'product'
    LEFT JOIN public.cms_revisions rev ON rev.id = r.published_revision_id
    LEFT JOIN public.inventory_balances ib ON ib.variant_id = cv.id
    WHERE r.archived_at IS NULL AND cv.archived_at IS NULL
  )
  SELECT jsonb_build_object(
    'total', count(*),
    'aboveZero', count(*) FILTER (WHERE managed_quantity > 0),
    'zero', count(*) FILTER (WHERE managed_quantity = 0),
    'unverified', count(*) FILTER (WHERE managed_quantity IS NULL)
  ) INTO v_stats FROM quantities;
  RETURN v_stats;
END
$f$;

REVOKE ALL ON FUNCTION public.admin_inventory_stats() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_inventory_stats() TO authenticated;
