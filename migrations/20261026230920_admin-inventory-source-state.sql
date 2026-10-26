-- Private inventory list distinguishes source observations from operational stock.
-- Rollback: move callers back to admin_list_variants, then revoke this RPC in a forward migration.
CREATE FUNCTION public.admin_list_inventory(p_query text,p_limit integer,p_offset integer)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $f$
DECLARE result jsonb; items jsonb;
BEGIN
  PERFORM public.admin_assert_capability('orders.manage');
  result := public.admin_list_variants(p_query,p_limit,p_offset);
  SELECT COALESCE(jsonb_agg(
    CASE WHEN source_only THEN row.value || jsonb_build_object('sourceOnly',true,'stock',NULL,'stockVersion',NULL)
      ELSE row.value || jsonb_build_object('sourceOnly',false) END ORDER BY row.ordinality
  ),'[]'::jsonb) INTO items
  FROM jsonb_array_elements(result->'items') WITH ORDINALITY AS row(value,ordinality)
  CROSS JOIN LATERAL (
    SELECT (r.draft ? 'sourceObservation' OR COALESCE(rev.document ? 'sourceObservation',false)) AS source_only
    FROM public.cms_records r LEFT JOIN public.cms_revisions rev ON rev.id=r.published_revision_id
    WHERE r.id::text=row.value->>'productId' AND r.kind='product'
  ) AS source;
  RETURN jsonb_set(result,'{items}',items);
END $f$;
REVOKE ALL ON FUNCTION public.admin_list_inventory(text,integer,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_inventory(text,integer,integer) TO authenticated;
