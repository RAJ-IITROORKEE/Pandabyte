-- Local development only. No provider connection, actors, stock or settings seeded.
-- Forward rollback: disable config/local flags; preserve attempts, orders and provider history.
CREATE TABLE public.storefront_checkout_test_config (
 singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton), enabled boolean NOT NULL DEFAULT false,
 proof_hash text NOT NULL CHECK(proof_hash ~ '^[0-9a-f]{64}$'),
 allowed_key_id text NOT NULL CHECK(allowed_key_id ~ '^rzp_test_[A-Za-z0-9]{1,100}$')
);
ALTER TABLE public.storefront_checkout_test_config ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.storefront_checkout_test_config FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.storefront_test_policy(p_proof text,p_key text) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $fn$
 SELECT CASE WHEN p_proof IS NOT NULL AND char_length(p_proof) BETWEEN 32 AND 256
 AND EXISTS(SELECT 1 FROM public.storefront_checkout_test_config WHERE singleton AND enabled
 AND allowed_key_id=p_key AND proof_hash=encode(sha256(convert_to(p_proof,'UTF8')),'hex'))
 THEN jsonb_build_object('policyVersion','local-test-v1','taxRateBasisPoints',1800,'shippingFlatPaise',10000,
 'freeShippingOverPaise',200000,'chargesAreFictional',true) ELSE NULL END
$fn$;
-- Owner-approved TEST rules: 18% on goods only; no real tax/HSN/dispatch-state inference.
CREATE FUNCTION public.storefront_test_totals(p_subtotal bigint) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,public,pg_temp AS $fn$
DECLARE shipping bigint; tax bigint;
BEGIN
 IF p_subtotal IS NULL OR p_subtotal NOT BETWEEN 100 AND 50000000 THEN PERFORM public.phase3_fail('invalid_input'); END IF;
 shipping:=CASE WHEN p_subtotal>200000 THEN 0 ELSE 10000 END;
 tax:=round(p_subtotal::numeric*1800/10000)::bigint;
 RETURN jsonb_build_object('testMode',true,'subtotalPaise',p_subtotal,'shippingPaise',shipping,'taxPaise',tax,
 'totalPaise',p_subtotal+shipping+tax,'taxRateBasisPoints',1800,'chargesAreFictional',true,'policyVersion','local-test-v1');
END $fn$;
CREATE FUNCTION public.storefront_test_quote(p_items jsonb,p_proof text,p_key text) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $fn$
DECLARE q jsonb; line jsonb;
BEGIN
 IF public.storefront_test_policy(p_proof,p_key) IS NULL THEN PERFORM public.phase3_fail('forbidden'); END IF;
 PERFORM public.phase5_validate_cart_items(p_items);
 IF jsonb_array_length(p_items)=0 THEN PERFORM public.phase3_fail('invalid_input'); END IF;
 q:=public.published_quote_cart(p_items);
 FOR line IN SELECT value FROM jsonb_array_elements(q->'lines') LOOP
  IF line->>'lineTotalPaise' IS NULL OR (line->>'issue' IS NOT NULL AND line->>'issue'<>'quantity_unavailable')
  OR line->'variant' IS NULL OR line->'variant'='null'::jsonb
  OR (line->'variant' ? 'cartEligible' AND line->'variant'->>'cartEligible'<>'true')
  THEN PERFORM public.phase3_fail('item_unavailable'); END IF;
 END LOOP;
 RETURN public.storefront_test_totals((q->>'subtotalPaise')::bigint);
END $fn$;
CREATE FUNCTION public.razorpay_storefront_test_prepare(p_request jsonb,p_proof text,p_key text) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $fn$
DECLARE a text:=public.requesting_user_id(); base jsonb; amounts jsonb; result jsonb; line jsonb;
 k uuid; previous_shipping bigint; previous_tax bigint;
 old_attempt public.razorpay_checkout_test_attempts; old_order public.admin_order_records;
BEGIN
 IF a IS NULL OR char_length(a)>256 THEN PERFORM public.phase3_fail('unauthenticated'); END IF;
 PERFORM 1 FROM public.storefront_checkout_test_config WHERE singleton AND enabled AND allowed_key_id=p_key
 AND proof_hash=encode(sha256(convert_to(p_proof,'UTF8')),'hex') FOR SHARE;
 IF NOT FOUND OR public.storefront_test_policy(p_proof,p_key) IS NULL THEN PERFORM public.phase3_fail('forbidden'); END IF;
 IF jsonb_typeof(p_request) IS DISTINCT FROM 'object'
 OR jsonb_typeof(p_request->'expectedTestTotalPaise') IS DISTINCT FROM 'number'
 OR (p_request->>'expectedTestTotalPaise') !~ '^[1-9][0-9]{0,8}$'
 OR jsonb_typeof(p_request->'testPolicyVersion') IS DISTINCT FROM 'string'
 OR p_request->>'testPolicyVersion'<>'local-test-v1' THEN PERFORM public.phase3_fail('invalid_input'); END IF;
 base:=p_request-'expectedTestTotalPaise'-'testPolicyVersion';
 PERFORM public.razorpay_test_validate_request(base);
 k:=(base->>'idempotencyKey')::uuid;
 -- Preserve the existing lifecycle's lock order.
 PERFORM pg_advisory_xact_lock(hashtextextended('razorpay_test_owner:'||a,0));
 PERFORM pg_advisory_xact_lock(hashtextextended('razorpay_test_order:'||a||':'||k::text,0));
 SELECT * INTO old_attempt FROM public.razorpay_checkout_test_attempts WHERE subject=a AND request_key=k FOR UPDATE;
 IF FOUND THEN
  SELECT * INTO old_order FROM public.admin_order_records WHERE id=old_attempt.order_id;
  IF old_order.snapshot->'testPolicy'->>'policyVersion' IS DISTINCT FROM p_request->>'testPolicyVersion'
  OR old_order.total_paise::text IS DISTINCT FROM p_request->>'expectedTestTotalPaise'
  THEN PERFORM public.phase3_fail('idempotency_conflict'); END IF;
  RETURN public.razorpay_test_prepare(base,p_proof,p_key);
 END IF;
 amounts:=public.storefront_test_quote(base->'items',p_proof,p_key);
 IF amounts->>'subtotalPaise' IS DISTINCT FROM base->>'expectedSubtotalPaise'
 OR amounts->>'totalPaise' IS DISTINCT FROM p_request->>'expectedTestTotalPaise'
 THEN PERFORM public.phase3_fail('price_changed'); END IF;
 INSERT INTO public.razorpay_checkout_test_actors(subject,proof_hash,allowed_key_id,fictional_shipping_paise,fictional_tax_paise)
 VALUES(a,encode(sha256(convert_to(p_proof,'UTF8')),'hex'),p_key,0,0)
 ON CONFLICT(subject) DO NOTHING;
 IF NOT EXISTS(SELECT 1 FROM public.razorpay_checkout_test_actors WHERE subject=a AND allowed_key_id=p_key
 AND proof_hash=encode(sha256(convert_to(p_proof,'UTF8')),'hex')) THEN PERFORM public.phase3_fail('connection_changed'); END IF;
 SELECT fictional_shipping_paise,fictional_tax_paise INTO previous_shipping,previous_tax
 FROM public.razorpay_checkout_test_actors WHERE subject=a FOR UPDATE;
 UPDATE public.razorpay_checkout_test_actors SET fictional_shipping_paise=(amounts->>'shippingPaise')::bigint,
 fictional_tax_paise=(amounts->>'taxPaise')::bigint WHERE subject=a;
 -- Separate fictional inventory, never operational stock. Do not reset previously consumed units.
 FOR line IN SELECT value FROM jsonb_array_elements(base->'items') ORDER BY value->>'variantId' LOOP
  INSERT INTO public.razorpay_checkout_test_stock(subject,variant_id,quantity)
  VALUES(a,(line->>'variantId')::uuid,99) ON CONFLICT(subject,variant_id) DO NOTHING;
 END LOOP;
 -- The existing lifecycle rechecks the current quote under catalog locks and rolls back if stale.
 result:=public.razorpay_test_prepare(base,p_proof,p_key);
 UPDATE public.admin_order_records SET snapshot=snapshot||jsonb_build_object('testPolicy',amounts)
 WHERE customer_subject=a AND request_key=k AND environment='razorpay_test';
 -- Preserve old fixture-mode capability amounts; the prepared order already owns its snapshot.
 UPDATE public.razorpay_checkout_test_actors SET fictional_shipping_paise=previous_shipping,
 fictional_tax_paise=previous_tax WHERE subject=a;
 RETURN result;
END $fn$;
REVOKE ALL ON FUNCTION public.storefront_test_policy(text,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.storefront_test_totals(bigint) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.storefront_test_quote(jsonb,text,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.razorpay_storefront_test_prepare(jsonb,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.storefront_test_policy(text,text),public.storefront_test_quote(jsonb,text,text) TO anon,authenticated;
GRANT EXECUTE ON FUNCTION public.razorpay_storefront_test_prepare(jsonb,text,text) TO authenticated;
