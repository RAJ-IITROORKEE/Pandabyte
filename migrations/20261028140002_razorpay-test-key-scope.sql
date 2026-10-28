-- Scope disposable test attempts to their explicitly enrolled public key.
-- No provider secret or fixture is seeded. Root owns the separately authorized key change.
ALTER TABLE public.razorpay_checkout_test_actors ADD COLUMN allowed_key_id text CHECK(allowed_key_id ~ '^rzp_test_[A-Za-z0-9]{1,100}$');
UPDATE public.razorpay_checkout_test_actors a SET allowed_key_id=q.key FROM (SELECT subject,min(checkout_key) AS key FROM public.razorpay_checkout_test_attempts GROUP BY subject HAVING count(DISTINCT checkout_key)=1) q WHERE q.subject=a.subject;

ALTER FUNCTION public.razorpay_test_capabilities(text) RENAME TO razorpay_test_capabilities_unscoped;
REVOKE ALL ON FUNCTION public.razorpay_test_capabilities_unscoped(text) FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.razorpay_test_capabilities(p_proof text,p_key text) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $fn$
DECLARE a text:=public.requesting_user_id();
BEGIN
 IF a IS NULL THEN PERFORM public.phase3_fail('unauthenticated'); END IF;
 IF p_key IS NULL OR p_key !~ '^rzp_test_[A-Za-z0-9]{1,100}$' OR NOT EXISTS(SELECT 1 FROM public.razorpay_checkout_test_actors WHERE subject=a AND allowed_key_id=p_key) THEN RETURN jsonb_build_object('razorpayTestAvailable',false); END IF;
 RETURN public.razorpay_test_capabilities_unscoped(p_proof);
END $fn$;

ALTER FUNCTION public.razorpay_test_prepare(jsonb,text) RENAME TO razorpay_test_prepare_unscoped;
REVOKE ALL ON FUNCTION public.razorpay_test_prepare_unscoped(jsonb,text) FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.razorpay_test_prepare(p_request jsonb,p_proof text,p_key text) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $fn$
DECLARE a text:=public.requesting_user_id(); result jsonb; t public.razorpay_checkout_test_attempts;
BEGIN
 IF a IS NULL THEN PERFORM public.phase3_fail('unauthenticated'); END IF;
 IF p_key IS NULL OR p_key !~ '^rzp_test_[A-Za-z0-9]{1,100}$' THEN PERFORM public.phase3_fail('invalid_input'); END IF;
 IF NOT EXISTS(SELECT 1 FROM public.razorpay_checkout_test_actors WHERE subject=a AND allowed_key_id=p_key) THEN PERFORM public.phase3_fail('connection_changed'); END IF;
 IF p_proof IS NULL OR char_length(p_proof) NOT BETWEEN 32 AND 256 OR NOT EXISTS(SELECT 1 FROM public.razorpay_checkout_test_actors WHERE subject=a AND proof_hash=encode(sha256(convert_to(p_proof,'UTF8')),'hex')) THEN PERFORM public.phase3_fail('forbidden'); END IF;
 result:=public.razorpay_test_prepare_unscoped(p_request,p_proof);
 SELECT * INTO t FROM public.razorpay_checkout_test_attempts WHERE subject=a AND request_key=(p_request->>'idempotencyKey')::uuid FOR UPDATE;
 IF NOT FOUND THEN PERFORM public.phase3_fail('not_found'); END IF;
 IF t.checkout_key IS NOT NULL AND t.checkout_key<>p_key THEN PERFORM public.phase3_fail('connection_changed'); END IF;
 IF t.checkout_key IS NULL THEN UPDATE public.razorpay_checkout_test_attempts SET checkout_key=p_key WHERE subject=a AND request_key=t.request_key; END IF;
 RETURN result||jsonb_build_object('connectionKey',p_key);
END $fn$;

ALTER FUNCTION public.razorpay_test_bind(uuid,text,text) RENAME TO razorpay_test_bind_unscoped;
REVOKE ALL ON FUNCTION public.razorpay_test_bind_unscoped(uuid,text,text) FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.razorpay_test_bind(p_request_key uuid,p_provider_order_id text,p_key text) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $fn$
DECLARE a text:=public.requesting_user_id(); t public.razorpay_checkout_test_attempts;
BEGIN
 IF a IS NULL THEN PERFORM public.phase3_fail('unauthenticated'); END IF;
 IF p_request_key IS NULL OR p_key IS NULL OR p_key !~ '^rzp_test_[A-Za-z0-9]{1,100}$' THEN PERFORM public.phase3_fail('invalid_input'); END IF;
 SELECT * INTO t FROM public.razorpay_checkout_test_attempts WHERE subject=a AND request_key=p_request_key FOR UPDATE;
 IF NOT FOUND THEN PERFORM public.phase3_fail('not_found'); END IF;
 IF t.checkout_key IS DISTINCT FROM p_key OR NOT EXISTS(SELECT 1 FROM public.razorpay_checkout_test_actors WHERE subject=a AND allowed_key_id=p_key) THEN PERFORM public.phase3_fail('connection_changed'); END IF;
 RETURN public.razorpay_test_bind_unscoped(p_request_key,p_provider_order_id,p_key);
END $fn$;

CREATE FUNCTION public.razorpay_test_connection_error(p_request_key uuid) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $fn$
DECLARE a text:=public.requesting_user_id(); t public.razorpay_checkout_test_attempts;
BEGIN
 IF a IS NULL THEN PERFORM public.phase3_fail('unauthenticated'); END IF;
 IF p_request_key IS NULL THEN PERFORM public.phase3_fail('invalid_input'); END IF;
 SELECT * INTO t FROM public.razorpay_checkout_test_attempts WHERE subject=a AND request_key=p_request_key FOR UPDATE;
 IF NOT FOUND THEN PERFORM public.phase3_fail('not_found'); END IF;
 IF t.state IN ('creating','unknown','ready') THEN
   UPDATE public.razorpay_checkout_test_attempts SET state='review',updated_at=now() WHERE subject=a AND request_key=p_request_key RETURNING * INTO t;
   UPDATE public.admin_order_records SET payment_state='review',snapshot=jsonb_set(snapshot,'{paymentReview}',jsonb_build_object('reason','test_connection_changed'),true),version=version+1,updated_at=now() WHERE id=t.order_id;
 END IF;
 RETURN public.razorpay_test_attempt_json(t);
END $fn$;

CREATE OR REPLACE FUNCTION public.razorpay_test_attempt_json(t public.razorpay_checkout_test_attempts) RETURNS jsonb LANGUAGE sql STABLE SET search_path=pg_catalog,public,pg_temp AS $fn$
 SELECT jsonb_build_object('connectionKey',t.checkout_key,'state',t.state,'reference',o.reference,'totalPaise',o.total_paise,'mode',o.snapshot->>'mode','items',o.snapshot->'requestItems')
 || CASE WHEN t.provider_order_id IS NOT NULL THEN jsonb_build_object('providerOrderId',t.provider_order_id) ELSE '{}'::jsonb END
 || CASE WHEN t.state='ready' AND t.checkout_key IS NOT NULL THEN jsonb_build_object('key',t.checkout_key) ELSE '{}'::jsonb END
 FROM public.admin_order_records o WHERE o.id=t.order_id
$fn$;

CREATE OR REPLACE FUNCTION public.razorpay_test_allow_insert(p_environment text,p_status text,p_subject_type text,p_subject_id text,p_amount bigint,p_currency text,p_receipt text,p_notes jsonb,p_order_id text,p_raw jsonb,p_verified_payment_id text) RETURNS boolean LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $fn$
DECLARE a text:=public.requesting_user_id(); t public.razorpay_checkout_test_attempts;
BEGIN
 IF a IS NULL OR p_subject_id IS DISTINCT FROM a OR p_environment IS DISTINCT FROM 'test' OR p_status IS DISTINCT FROM 'initialized' OR p_subject_type IS DISTINCT FROM 'user' OR p_currency IS DISTINCT FROM 'inr' OR p_order_id IS NOT NULL OR p_verified_payment_id IS NOT NULL OR p_raw IS DISTINCT FROM '{}'::jsonb OR jsonb_typeof(p_notes) IS DISTINCT FROM 'object' THEN RETURN false; END IF;
 SELECT * INTO t FROM public.razorpay_checkout_test_attempts WHERE subject=a AND receipt=p_receipt FOR UPDATE;
 IF NOT FOUND OR t.state<>'creating' OR t.reservation<>'held' OR t.provider_order_id IS NOT NULL THEN RETURN false; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.razorpay_checkout_test_actors WHERE subject=a) THEN RETURN false; END IF;
 IF p_notes->>'pandabyte_attempt' IS DISTINCT FROM t.order_id::text OR p_notes->>'pandabyte_nonce' IS DISTINCT FROM t.nonce::text OR p_notes->>'insforge_subject_type' IS DISTINCT FROM 'user' OR p_notes->>'insforge_subject_id' IS DISTINCT FROM a THEN RETURN false; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.admin_order_records WHERE id=t.order_id AND environment='razorpay_test' AND payment_state='pending' AND total_paise=p_amount) THEN RETURN false; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.razorpay_checkout_test_actors WHERE subject=a AND allowed_key_id=t.checkout_key) OR p_notes->>'pandabyte_key_id' IS DISTINCT FROM t.checkout_key THEN RETURN false; END IF;
 RETURN NOT EXISTS(SELECT 1 FROM payments.razorpay_orders WHERE environment='test' AND receipt=t.receipt);
END $fn$;

CREATE OR REPLACE FUNCTION public.razorpay_test_recover(p_request_key uuid,p_proof text,p_key text) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $fn$
DECLARE a text:=public.requesting_user_id(); t public.razorpay_checkout_test_attempts; provider_id text;
BEGIN
 IF a IS NULL OR char_length(a)>256 THEN PERFORM public.phase3_fail('unauthenticated'); END IF;
 IF p_request_key IS NULL THEN PERFORM public.phase3_fail('invalid_input'); END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('razorpay_test_recovery:'||a,0));
 PERFORM pg_advisory_xact_lock(hashtextextended('razorpay_test_order:'||a||':'||p_request_key::text,0));
 SELECT * INTO t FROM public.razorpay_checkout_test_attempts WHERE subject=a AND request_key=p_request_key FOR UPDATE;
 IF FOUND THEN
   IF t.state='review' THEN RETURN public.razorpay_test_attempt_json(t); END IF;
   IF t.checkout_key IS DISTINCT FROM p_key OR NOT EXISTS(SELECT 1 FROM public.razorpay_checkout_test_actors WHERE subject=a AND allowed_key_id=p_key) THEN PERFORM public.phase3_fail('connection_changed'); END IF;
   IF t.provider_order_id IS NULL THEN
     SELECT m.order_id INTO provider_id FROM payments.razorpay_orders m JOIN public.admin_order_records o ON o.id=t.order_id WHERE m.environment='test' AND m.subject_type='user' AND m.subject_id=a AND m.receipt=t.receipt AND m.notes->>'pandabyte_attempt'=t.order_id::text AND m.notes->>'pandabyte_nonce'=t.nonce::text AND m.amount=o.total_paise AND m.currency='inr' AND m.order_id IS NOT NULL;
     IF provider_id IS NOT NULL THEN RETURN public.razorpay_test_bind(p_request_key,provider_id,p_key); END IF;
     -- Keep the creation slot open for the original delayed SDK call; recovery never creates again.
     NULL;
   ELSIF t.state='ready' AND t.checkout_key IS NULL THEN RETURN public.razorpay_test_bind(p_request_key,t.provider_order_id,p_key);
   END IF;
   RETURN public.razorpay_test_attempt_json(t);
 END IF;
 IF NOT EXISTS(SELECT 1 FROM public.razorpay_checkout_test_actors WHERE subject=a AND allowed_key_id=p_key) THEN PERFORM public.phase3_fail('connection_changed'); END IF;
 IF EXISTS(SELECT 1 FROM public.razorpay_checkout_test_closed_requests WHERE subject=a AND request_key=p_request_key) THEN RETURN jsonb_build_object('state','not_created'); END IF;
 IF p_proof IS NULL OR char_length(p_proof) NOT BETWEEN 32 AND 256 OR NOT EXISTS(SELECT 1 FROM public.razorpay_checkout_test_actors WHERE subject=a AND proof_hash=encode(sha256(convert_to(p_proof,'UTF8')),'hex')) THEN PERFORM public.phase3_fail('forbidden'); END IF;
 IF (SELECT count(*) FROM public.razorpay_checkout_test_closed_requests WHERE subject=a)>=100 THEN PERFORM public.phase3_fail('recovery_limit'); END IF;
 INSERT INTO public.razorpay_checkout_test_closed_requests(subject,request_key) VALUES(a,p_request_key);
 RETURN jsonb_build_object('state','not_created');
END $fn$;

CREATE OR REPLACE FUNCTION public.razorpay_test_settle(p_event_id uuid) RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $fn$
DECLARE e payments.webhook_events; pay jsonb; t public.razorpay_checkout_test_attempts; o public.admin_order_records;
 line jsonb; available integer; reacquire boolean:=true; cv bigint;
BEGIN
 SELECT * INTO e FROM payments.webhook_events WHERE id=p_event_id;
 IF NOT FOUND OR e.provider<>'razorpay' OR e.environment<>'test' OR e.livemode OR e.processing_status<>'processed' OR e.event_type NOT IN ('payment.captured','order.paid','payment.failed') THEN RETURN; END IF;
 pay:=e.payload->'payload'->'payment'->'entity';
 IF jsonb_typeof(pay) IS DISTINCT FROM 'object' OR pay->>'id' IS NULL OR pay->>'id' !~ '^pay_[A-Za-z0-9]{1,100}$' OR pay->>'order_id' IS NULL OR pay->>'currency' IS DISTINCT FROM 'INR' OR jsonb_typeof(pay->'amount') IS DISTINCT FROM 'number' OR pay->>'amount' !~ '^[1-9][0-9]{0,15}$' THEN RETURN; END IF;
 -- Resolve both normal binding and a capture racing the server's bind acknowledgement.
 SELECT a.* INTO t FROM public.razorpay_checkout_test_attempts a JOIN payments.razorpay_orders m ON m.environment='test' AND m.receipt=a.receipt AND m.subject_type='user' AND m.subject_id=a.subject AND m.notes->>'pandabyte_attempt'=a.order_id::text AND m.notes->>'pandabyte_nonce'=a.nonce::text AND m.order_id=pay->>'order_id' WHERE a.provider_order_id IS NULL OR a.provider_order_id=m.order_id FOR UPDATE OF a;
 IF NOT FOUND THEN RETURN; END IF;
 IF t.state='review' THEN RETURN; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.razorpay_checkout_test_actors WHERE subject=t.subject AND allowed_key_id=t.checkout_key) OR NOT EXISTS(SELECT 1 FROM payments.razorpay_orders m WHERE m.environment='test' AND m.order_id=pay->>'order_id' AND m.notes->>'pandabyte_key_id'=t.checkout_key) THEN RETURN; END IF;
 SELECT * INTO o FROM public.admin_order_records WHERE id=t.order_id FOR UPDATE;
 IF o.environment<>'razorpay_test' OR o.total_paise<>(pay->>'amount')::numeric OR o.currency<>'INR' THEN RETURN; END IF;
 IF NOT EXISTS(SELECT 1 FROM payments.razorpay_orders m WHERE m.environment='test' AND m.order_id=pay->>'order_id' AND m.amount=o.total_paise AND m.currency='inr') THEN RETURN; END IF;
 IF e.event_type='payment.failed' THEN
   IF pay->>'status' IS DISTINCT FROM 'failed' OR t.state IN ('paid','review','cancelled') THEN RETURN; END IF;
   IF t.state<>'failed' THEN
     PERFORM public.razorpay_test_release(t);
     UPDATE public.razorpay_checkout_test_attempts SET provider_order_id=pay->>'order_id',state='failed',updated_at=now() WHERE subject=t.subject AND request_key=t.request_key;
     UPDATE public.admin_order_records SET payment_state='failed',version=version+1,updated_at=now() WHERE id=o.id;
   END IF;
   RETURN;
 END IF;
 IF pay->>'status' IS DISTINCT FROM 'captured' OR pay->'captured' IS DISTINCT FROM 'true'::jsonb THEN RETURN; END IF;
 IF EXISTS(SELECT 1 FROM public.razorpay_checkout_test_settlements WHERE provider_payment_id=pay->>'id' OR order_id=o.id) THEN RETURN; END IF;
 IF t.reservation='released' THEN
   FOR line IN SELECT value FROM jsonb_array_elements(o.snapshot->'requestItems') ORDER BY (value->>'variantId')::uuid LOOP
     SELECT quantity INTO available FROM public.razorpay_checkout_test_stock WHERE subject=t.subject AND variant_id=(line->>'variantId')::uuid FOR UPDATE;
     IF NOT FOUND OR available<(line->>'quantity')::integer THEN reacquire:=false; END IF;
   END LOOP;
   IF reacquire THEN UPDATE public.razorpay_checkout_test_stock s SET quantity=s.quantity-(i.value->>'quantity')::integer FROM jsonb_array_elements(o.snapshot->'requestItems') i WHERE s.subject=t.subject AND s.variant_id=(i.value->>'variantId')::uuid; END IF;
 END IF;
 INSERT INTO public.razorpay_checkout_test_settlements(provider_payment_id,order_id,event_id) VALUES(pay->>'id',o.id,e.id);
 UPDATE public.razorpay_checkout_test_attempts SET provider_order_id=pay->>'order_id',provider_payment_id=pay->>'id',state=CASE WHEN reacquire THEN 'paid' ELSE 'review' END,reservation=CASE WHEN reacquire THEN 'consumed' ELSE 'released' END,updated_at=now() WHERE subject=t.subject AND request_key=t.request_key;
 UPDATE public.admin_order_records SET status=CASE WHEN reacquire THEN 'processing' ELSE 'pending' END,payment_state=CASE WHEN reacquire THEN 'paid' ELSE 'review' END,version=version+1,updated_at=now() WHERE id=o.id;
 IF reacquire AND o.snapshot->>'mode'='cart' THEN
   PERFORM pg_advisory_xact_lock(hashtextextended('customer_cart:'||t.subject,0));
   SELECT version INTO cv FROM public.customer_carts WHERE user_id=t.subject FOR UPDATE;
   IF cv=t.expected_cart_version THEN
     DELETE FROM public.customer_cart_items c USING jsonb_array_elements(o.snapshot->'requestItems') i WHERE c.user_id=t.subject AND c.variant_id=(i.value->>'variantId')::uuid AND c.quantity=(i.value->>'quantity')::integer;
     UPDATE public.customer_cart_items c SET quantity=c.quantity-(i.value->>'quantity')::integer FROM jsonb_array_elements(o.snapshot->'requestItems') i WHERE c.user_id=t.subject AND c.variant_id=(i.value->>'variantId')::uuid AND c.quantity>(i.value->>'quantity')::integer;
     UPDATE public.customer_carts SET version=version+1,updated_at=now() WHERE user_id=t.subject;
   END IF;
 END IF;
 PERFORM public.admin_write_audit(t.subject,'order.razorpay_test_capture','order',o.id,jsonb_build_object('environment','razorpay_test','requiresReview',NOT reacquire),NULL);
END $fn$;

REVOKE ALL ON FUNCTION public.razorpay_test_capabilities(text,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.razorpay_test_prepare(jsonb,text,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.razorpay_test_bind(uuid,text,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.razorpay_test_connection_error(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.razorpay_test_capabilities(text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.razorpay_test_prepare(jsonb,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.razorpay_test_bind(uuid,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.razorpay_test_connection_error(uuid) TO authenticated;
