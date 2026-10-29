-- Read-only admin order management. Existing writers, provider history, stock and permissions stay unchanged.
-- Forward rollback: restore the old list caller and revoke this RPC; preserve orders and audit history.
CREATE FUNCTION public.admin_search_orders(
  p_query text DEFAULT '', p_status text DEFAULT 'all', p_sort text DEFAULT 'created_desc',
  p_limit integer DEFAULT 20, p_offset integer DEFAULT 0, p_group text DEFAULT 'all',
  p_payment text DEFAULT 'all', p_environment text DEFAULT 'razorpay_test',
  p_from date DEFAULT NULL, p_to date DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp AS $fn$
DECLARE result jsonb;
BEGIN
  PERFORM public.admin_assert_capability('staff.manage');
  IF p_query IS NULL OR char_length(p_query)>120 OR p_query ~ '[[:cntrl:]]'
    OR p_status IS NULL OR p_status NOT IN ('all','pending','processing','fulfilled','cancelled')
    OR p_sort IS NULL OR p_sort NOT IN ('created_desc','created_asc','total_desc','total_asc')
    OR p_limit IS NULL OR p_limit NOT IN (10,20,50) OR p_offset IS NULL OR p_offset NOT BETWEEN 0 AND 10000
    OR p_group IS NULL OR p_group NOT IN ('all','pending','active','delivered','cancelled')
    OR p_payment IS NULL OR p_payment NOT IN ('all','unconfigured','simulated','pending','verified','paid','failed','cancelled','review')
    OR p_environment IS NULL OR p_environment NOT IN ('razorpay_test','simulation','legacy')
    OR (p_from IS NOT NULL AND p_from NOT BETWEEN DATE '2000-01-01' AND DATE '2099-12-31')
    OR (p_to IS NOT NULL AND p_to NOT BETWEEN DATE '2000-01-01' AND DATE '2099-12-31')
    OR (p_from IS NOT NULL AND p_to IS NOT NULL AND p_from>p_to) THEN
    PERFORM public.phase3_fail('invalid_input');
  END IF;
  WITH scoped AS MATERIALIZED (
    SELECT o.*,
      CASE WHEN o.status='cancelled' THEN 'cancelled'
        WHEN o.payment_state IN ('failed','cancelled') THEN 'exceptional'
        WHEN o.payment_state IN ('unconfigured','pending','verified','review') OR o.status='pending' THEN 'pending'
        WHEN o.status IN ('processing','fulfilled') THEN 'active'
        ELSE 'exceptional' END AS status_group
    FROM public.admin_order_records o
    WHERE o.environment=p_environment
      AND (p_from IS NULL OR o.created_at >= (p_from::timestamp AT TIME ZONE 'Asia/Kolkata'))
      AND (p_to IS NULL OR o.created_at < ((p_to+1)::timestamp AT TIME ZONE 'Asia/Kolkata'))
  ), matching AS (
    SELECT * FROM scoped o
    WHERE (p_status='all' OR o.status=p_status)
      AND (p_group='all' OR o.status_group=p_group)
      AND (p_payment='all' OR o.payment_state=p_payment)
      AND (btrim(p_query)='' OR strpos(lower(o.reference),lower(btrim(p_query)))>0
        OR strpos(lower(concat_ws(' ',o.snapshot#>>'{contact,firstName}',o.snapshot#>>'{contact,lastName}')),lower(btrim(p_query)))>0
        OR strpos(lower(COALESCE(o.snapshot#>>'{contact,email}','')),lower(btrim(p_query)))>0)
  ), numbered AS (
    SELECT o.*,row_number() OVER (ORDER BY
      CASE WHEN p_sort='created_desc' THEN o.created_at END DESC,
      CASE WHEN p_sort='created_asc' THEN o.created_at END ASC,
      CASE WHEN p_sort='total_desc' THEN o.total_paise END DESC,
      CASE WHEN p_sort='total_asc' THEN o.total_paise END ASC,o.id ASC) AS row_order
    FROM matching o
  ), page AS (
    SELECT * FROM numbered ORDER BY row_order LIMIT p_limit OFFSET p_offset
  ), projected AS (
    SELECT o.*,CASE WHEN jsonb_typeof(o.snapshot#>'{quote,lines}')='array'
      AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(CASE WHEN jsonb_typeof(o.snapshot#>'{quote,lines}')='array'
        THEN o.snapshot#>'{quote,lines}' ELSE '[]'::jsonb END) line
        WHERE jsonb_typeof(line->'quantity') IS DISTINCT FROM 'number' OR COALESCE(line->>'quantity','') !~ '^[1-9][0-9]?$')
      THEN o.snapshot#>'{quote,lines}' ELSE NULL END AS valid_lines
    FROM page o
  )
  SELECT jsonb_build_object('total',(SELECT count(*) FROM matching),'limit',p_limit,'offset',p_offset,
    'scope',jsonb_build_object('environment',p_environment,'from',COALESCE(to_char(p_from,'YYYY-MM-DD'),''),'to',COALESCE(to_char(p_to,'YYYY-MM-DD'),'')),
    -- No confirmed delivery event exists: fulfilled is active, never inferred delivered.
    'stats',(SELECT jsonb_build_object('total',count(*),'pending',count(*) FILTER (WHERE status_group='pending'),
      'active',count(*) FILTER (WHERE status_group='active'),'delivered',0,
      'cancelled',count(*) FILTER (WHERE status_group='cancelled'),'exceptional',count(*) FILTER (WHERE status_group='exceptional')) FROM scoped),
    'items',COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'reference',o.reference,'status',o.status,'totalPaise',o.total_paise,'currency',o.currency,
      'createdAt',o.created_at,'updatedAt',o.updated_at,'paymentState',o.payment_state,'environment',o.environment,
      'customer',CASE WHEN jsonb_typeof(o.snapshot->'contact')='object' THEN jsonb_build_object(
        'name',btrim(concat_ws(' ',o.snapshot#>>'{contact,firstName}',o.snapshot#>>'{contact,lastName}')),
        'email',COALESCE(o.snapshot#>>'{contact,email}',''),'phone',COALESCE(o.snapshot#>>'{contact,phone}','')) ELSE NULL END,
      'lineCount',CASE WHEN o.valid_lines IS NOT NULL THEN jsonb_array_length(o.valid_lines) ELSE NULL END,
      'unitCount',CASE WHEN o.valid_lines IS NOT NULL THEN
        (SELECT COALESCE(sum((line->>'quantity')::integer),0) FROM jsonb_array_elements(o.valid_lines) line) ELSE NULL END
    ) ORDER BY o.row_order) FROM projected o),'[]'::jsonb)) INTO result;
  RETURN result;
END $fn$;
REVOKE ALL ON FUNCTION public.admin_search_orders(text,text,text,integer,integer,text,text,text,date,date) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.admin_search_orders(text,text,text,integer,integer,text,text,text,date,date) TO authenticated;
