-- Bounded, deterministic inquiry search/filter/sort/pagination for the private Admin inbox.
-- Rollback: restore the route to admin_list_inquiries and revoke this RPC; preserve inquiry records.
CREATE FUNCTION public.admin_query_inquiries(
  p_query text DEFAULT '', p_status text DEFAULT NULL, p_sort text DEFAULT 'created_desc',
  p_limit integer DEFAULT 25, p_offset integer DEFAULT 0
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp AS $fn$
DECLARE
  v_query text := btrim(COALESCE(p_query, ''));
  result jsonb;
BEGIN
  PERFORM public.admin_assert_capability('inquiries.manage');
  IF p_query IS NULL OR char_length(p_query) > 100 OR p_query ~ '[[:cntrl:]]'
    OR (p_status IS NOT NULL AND p_status NOT IN ('new','in_progress','resolved','spam'))
    OR p_sort IS NULL OR p_sort NOT IN ('created_desc','created_asc','name_asc','name_desc')
    OR p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 50
    OR p_offset IS NULL OR p_offset NOT BETWEEN 0 AND 1000000 THEN
    PERFORM public.phase3_fail('invalid_input');
  END IF;

  WITH matching AS (
    SELECT i.id, i.created_at, lower(i.name) AS name_sort
    FROM public.inquiries i
    WHERE (p_status IS NULL OR i.status = p_status)
      AND (v_query = '' OR position(lower(v_query) in lower(i.name)) > 0
        OR position(lower(v_query) in lower(i.email)) > 0
        OR position(lower(v_query) in lower(i.subject)) > 0)
  ), ranked AS (
    SELECT matching.id,
      row_number() OVER (ORDER BY
        CASE WHEN p_sort = 'created_desc' THEN matching.created_at END DESC,
        CASE WHEN p_sort = 'created_asc' THEN matching.created_at END ASC,
        CASE WHEN p_sort = 'name_asc' THEN matching.name_sort END ASC,
        CASE WHEN p_sort = 'name_desc' THEN matching.name_sort END DESC,
        matching.id ASC) AS row_order
    FROM matching
  ), page_rows AS (
    SELECT id, row_order FROM ranked WHERE row_order > p_offset AND row_order <= p_offset + p_limit
  )
  SELECT jsonb_build_object(
    'items', COALESCE((
      SELECT jsonb_agg(public.inquiry_dto(i) ORDER BY page_rows.row_order)
      FROM page_rows JOIN public.inquiries i USING (id)
    ), '[]'::jsonb),
    'total', (SELECT count(*) FROM matching)
  ) INTO result;

  RETURN result;
END
$fn$;

REVOKE ALL ON FUNCTION public.admin_query_inquiries(text,text,text,integer,integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_query_inquiries(text,text,text,integer,integer) TO authenticated;
