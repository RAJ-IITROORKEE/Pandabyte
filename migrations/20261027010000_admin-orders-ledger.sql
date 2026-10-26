-- Empty, private order-list foundation. Checkout and order creation are separate work.
-- Rollback: remove callers and revoke the RPC; preserve any subsequently recorded orders.
CREATE TABLE public.admin_order_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reference text NOT NULL UNIQUE CHECK (char_length(btrim(reference)) BETWEEN 1 AND 80 AND reference = btrim(reference) AND reference !~ '[[:cntrl:]]'),
  status text NOT NULL CHECK (status IN ('pending','processing','fulfilled','cancelled')),
  total_paise bigint NOT NULL CHECK (total_paise BETWEEN 0 AND 9007199254740991),
  currency text NOT NULL DEFAULT 'INR' CHECK (currency = 'INR'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX admin_order_records_created_idx ON public.admin_order_records(created_at DESC, id);
ALTER TABLE public.admin_order_records ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.admin_order_records FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.admin_list_orders(
  p_query text DEFAULT '', p_status text DEFAULT 'all', p_sort text DEFAULT 'created_desc',
  p_limit integer DEFAULT 20, p_offset integer DEFAULT 0
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp AS $fn$
DECLARE result jsonb;
BEGIN
  -- orders.manage already grants catalog staff inventory access; staff.manage restricts this list to administrators.
  PERFORM public.admin_assert_capability('staff.manage');
  IF p_query IS NULL OR char_length(p_query) > 120 OR p_query ~ '[[:cntrl:]]'
    OR p_status IS NULL OR p_status NOT IN ('all','pending','processing','fulfilled','cancelled')
    OR p_sort IS NULL OR p_sort NOT IN ('created_desc','created_asc','total_desc','total_asc')
    OR p_limit IS NULL OR p_limit NOT IN (10,20,50)
    OR p_offset IS NULL OR p_offset NOT BETWEEN 0 AND 10000 THEN
    PERFORM public.phase3_fail('invalid_input');
  END IF;
  WITH matching AS (
    SELECT * FROM public.admin_order_records o
    WHERE (p_status = 'all' OR o.status = p_status)
      AND (btrim(p_query) = '' OR strpos(lower(o.reference), lower(btrim(p_query))) > 0)
  ), numbered AS (
    SELECT o.*, row_number() OVER (ORDER BY
      CASE WHEN p_sort = 'created_desc' THEN o.created_at END DESC,
      CASE WHEN p_sort = 'created_asc' THEN o.created_at END ASC,
      CASE WHEN p_sort = 'total_desc' THEN o.total_paise END DESC,
      CASE WHEN p_sort = 'total_asc' THEN o.total_paise END ASC,
      o.id ASC) AS row_order FROM matching o
  ), page AS (
    SELECT * FROM numbered ORDER BY row_order LIMIT p_limit OFFSET p_offset
  )
  SELECT jsonb_build_object('total',(SELECT count(*) FROM matching), 'limit',p_limit,'offset',p_offset,
    'items',COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'reference',o.reference,'status',o.status,'totalPaise',o.total_paise,'currency',o.currency,
      'createdAt',o.created_at,'updatedAt',o.updated_at) ORDER BY o.row_order) FROM page o),'[]'::jsonb))
    INTO result;
  RETURN result;
END $fn$;
REVOKE ALL ON FUNCTION public.admin_list_orders(text,text,text,integer,integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_orders(text,text,text,integer,integer) TO authenticated;
