-- Forward-only security fix; preserve the existing signature, locks, writers and history.
-- Rollback: keep this guard; resolve reviewed histories only through separately authorized reconciliation.
CREATE OR REPLACE FUNCTION public.admin_update_checkout_order(p_reference text,p_expected_version bigint,p_status text,p_shipping jsonb) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $fn$
DECLARE actor text:=public.admin_assert_capability('staff.manage'); o public.admin_order_records; t public.razorpay_checkout_test_attempts; k text; v text;
BEGIN
 IF p_reference IS NULL OR char_length(p_reference) NOT BETWEEN 1 AND 80 THEN PERFORM public.phase3_fail('invalid_input'); END IF;
 IF EXISTS(SELECT 1 FROM public.admin_order_records WHERE reference=p_reference AND environment='simulation') THEN RETURN public.admin_update_simulation_checkout_order(p_reference,p_expected_version,p_status,p_shipping); END IF;
 IF p_expected_version IS NULL OR p_expected_version NOT BETWEEN 1 AND 9007199254740990 OR p_status IS NULL OR p_status NOT IN ('pending','processing','fulfilled','cancelled') OR jsonb_typeof(p_shipping) IS DISTINCT FROM 'object' OR octet_length(p_shipping::text)>4096 THEN PERFORM public.phase3_fail('invalid_input'); END IF;
 IF (SELECT count(*) FROM jsonb_object_keys(p_shipping))<>3 OR NOT p_shipping ?& ARRAY['carrier','trackingNumber','trackingUrl'] THEN PERFORM public.phase3_fail('invalid_input'); END IF;
 FOR k,v IN SELECT key,value #>> '{}' FROM jsonb_each(p_shipping) LOOP
   IF k NOT IN ('carrier','trackingNumber','trackingUrl') OR jsonb_typeof(p_shipping->k) IS DISTINCT FROM 'string' OR char_length(v)>(CASE k WHEN 'carrier' THEN 100 WHEN 'trackingNumber' THEN 120 ELSE 500 END) OR v ~ '[[:cntrl:]]' OR (k='trackingUrl' AND v<>'' AND NOT public.phase3_is_safe_url(v,false)) THEN PERFORM public.phase3_fail('invalid_input'); END IF;
 END LOOP;
 -- All lifecycle writers lock attempt before order, then fixture stock/cart.
 SELECT a.* INTO t FROM public.razorpay_checkout_test_attempts a JOIN public.admin_order_records r ON r.id=a.order_id WHERE r.reference=p_reference AND r.environment='razorpay_test' FOR UPDATE OF a;
 IF NOT FOUND THEN PERFORM public.phase3_fail('not_found'); END IF;
 SELECT * INTO o FROM public.admin_order_records WHERE id=t.order_id FOR UPDATE;
 IF o.version<>p_expected_version THEN PERFORM public.phase3_fail('version_conflict'); END IF;
 -- Reviewed provider history is frozen, including same-status shipment edits.
 IF o.payment_state='review' OR t.state='review' OR o.snapshot#>>'{paymentReview,reason}'='test_connection_changed' THEN PERFORM public.phase3_fail('invalid_transition'); END IF;
 IF p_status<>o.status THEN
   IF p_status='cancelled' AND o.payment_state IN ('pending','verified','failed','cancelled') THEN
     PERFORM public.razorpay_test_release(t);
     UPDATE public.razorpay_checkout_test_attempts SET state='cancelled',updated_at=now() WHERE subject=t.subject AND request_key=t.request_key;
     UPDATE public.admin_order_records SET payment_state='cancelled' WHERE id=o.id;
   ELSIF o.payment_state='paid' AND ((o.status='pending' AND p_status='processing') OR (o.status='processing' AND p_status='fulfilled')) THEN NULL;
   ELSE PERFORM public.phase3_fail('invalid_transition'); END IF;
 END IF;
 UPDATE public.admin_order_records SET status=p_status,snapshot=jsonb_set(snapshot,'{shipment}',p_shipping,true),version=version+1,updated_at=now() WHERE id=o.id RETURNING * INTO o;
 PERFORM public.admin_write_audit(actor,'order.update','order',o.id,jsonb_build_object('status',p_status,'version',o.version,'environment','razorpay_test'),NULL);
 RETURN public.simulation_order_json(o);
END $fn$;
REVOKE ALL ON FUNCTION public.admin_update_checkout_order(text,bigint,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.admin_update_checkout_order(text,bigint,text,jsonb) TO authenticated;
