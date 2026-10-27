-- Keep the managed payments schema private; expose only this caller's authorized proof result.
CREATE FUNCTION public.razorpay_test_probe_result(p_receipt text) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $fn$
DECLARE a text:=public.requesting_user_id(); result jsonb;
BEGIN
 IF a IS NULL OR char_length(a)>256 THEN PERFORM public.phase3_fail('unauthenticated'); END IF;
 IF p_receipt IS NULL OR p_receipt !~ '^PBTEST[a-f0-9]{32}$' THEN PERFORM public.phase3_fail('invalid_input'); END IF;
 IF NOT EXISTS(SELECT 1 FROM public.razorpay_test_probes WHERE subject=a AND receipt=p_receipt)
 THEN PERFORM public.phase3_fail('forbidden'); END IF;
 SELECT jsonb_build_object('items',COALESCE(jsonb_agg(q.data),'[]'::jsonb)) INTO result
 FROM(SELECT jsonb_build_object('environment',o.environment,'status',o.status,'subject_type',o.subject_type,
 'subject_id',o.subject_id,'receipt',o.receipt,'amount',o.amount,'currency',o.currency,'notes',o.notes,'order_id',o.order_id) AS data
 FROM payments.razorpay_orders o JOIN public.razorpay_test_probes p ON p.subject=o.subject_id AND p.receipt=o.receipt
 WHERE p.subject=a AND p.receipt=p_receipt AND o.environment='test' LIMIT 2) q;
 RETURN result;
END $fn$;
REVOKE ALL ON FUNCTION public.razorpay_test_probe_result(text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.razorpay_test_probe_result(text) TO authenticated;
