-- Additive read-only search. Roll back by reverting the route to the original list RPC;
-- retain historical orders and remove this function only in a reviewed forward migration.
CREATE FUNCTION public.customer_search_checkout_orders(p_limit integer DEFAULT 20,p_offset integer DEFAULT 0,p_query text DEFAULT '',p_status text DEFAULT 'all')
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $fn$
DECLARE a text:=public.requesting_user_id(); result jsonb;
BEGIN
 IF a IS NULL OR char_length(a)>256 THEN PERFORM public.phase3_fail('unauthenticated'); END IF;
 IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 50 OR p_offset IS NULL OR p_offset NOT BETWEEN 0 AND 10000
 OR p_query IS NULL OR p_query !~ '^[a-zA-Z0-9-]{0,80}$' OR p_status IS NULL OR p_status NOT IN ('all','active','delivered','cancelled','fulfilled') THEN PERFORM public.phase3_fail('invalid_input'); END IF;
 WITH matching AS MATERIALIZED (
 SELECT o.* FROM public.admin_order_records o
 WHERE o.customer_subject=a AND o.environment IN ('simulation','razorpay_test')
 AND (p_query='' OR strpos(lower(o.reference),lower(p_query))>0)
 AND (p_status='all' OR (p_status='active' AND o.status IN ('pending','processing')) OR (p_status IN ('cancelled','fulfilled') AND o.status=p_status))
 ), page AS (SELECT * FROM matching ORDER BY created_at DESC,id DESC LIMIT p_limit OFFSET p_offset)
 SELECT jsonb_build_object('total',(SELECT count(*) FROM matching),'limit',p_limit,'offset',p_offset,
 'items',COALESCE((SELECT jsonb_agg(public.simulation_order_json(o) ORDER BY o.created_at DESC,o.id DESC) FROM public.admin_order_records o JOIN page ON page.id=o.id),'[]'::jsonb)) INTO result;
 RETURN result;
END $fn$;
REVOKE ALL ON FUNCTION public.customer_search_checkout_orders(integer,integer,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.customer_search_checkout_orders(integer,integer,text,text) TO authenticated;
