-- Read-only bounded identity mapping for the authorized Admin order table.
-- Rollback: remove enrichment, then revoke/drop this function in a forward migration.
CREATE FUNCTION public.admin_order_customer_identities(p_references text[])
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp AS $fn$
BEGIN
  PERFORM public.admin_assert_capability('staff.manage');
  IF p_references IS NULL OR cardinality(p_references) NOT BETWEEN 1 AND 50
    OR EXISTS (SELECT 1 FROM unnest(p_references) r WHERE r IS NULL OR char_length(r) NOT BETWEEN 1 AND 80 OR r ~ '[[:cntrl:]]') THEN
    PERFORM public.phase3_fail('invalid_input');
  END IF;
  RETURN (SELECT COALESCE(jsonb_agg(jsonb_build_object('reference',o.reference,'subject',o.customer_subject)), '[]'::jsonb)
    FROM public.admin_order_records o WHERE o.reference = ANY(p_references) AND o.customer_subject IS NOT NULL);
END $fn$;
REVOKE ALL ON FUNCTION public.admin_order_customer_identities(text[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_order_customer_identities(text[]) TO authenticated;
