-- Root-integrated development-only payment lifecycle; no production checkout enabled.
-- Development Razorpay test mode; all quantities/shipping/tax below are fixture-only.
-- Forward rollback: disable new entry points and preserve order/payment/audit history.
-- No actor, fixture, provider connection, webhook, timer, refund or email is seeded here.

ALTER TABLE public.admin_order_records DROP CONSTRAINT admin_order_records_environment_check;
ALTER TABLE public.admin_order_records ADD CONSTRAINT admin_order_records_environment_check CHECK(environment IN ('legacy','simulation','razorpay_test'));
ALTER TABLE public.admin_order_records DROP CONSTRAINT admin_order_records_payment_state_check;
ALTER TABLE public.admin_order_records ADD CONSTRAINT admin_order_records_payment_state_check CHECK(payment_state IN ('unconfigured','simulated','pending','verified','paid','failed','cancelled','review'));
ALTER TABLE public.admin_order_records DROP CONSTRAINT order_simulation_fields;
ALTER TABLE public.admin_order_records ADD CONSTRAINT order_simulation_fields CHECK(
 (environment='legacy' AND payment_state='unconfigured' AND request_key IS NULL AND request_hash IS NULL)
 OR (environment='simulation' AND payment_state='simulated' AND customer_subject IS NOT NULL AND request_key IS NOT NULL AND request_hash IS NOT NULL AND request_hash ~ '^[0-9a-f]{64}$')
 OR (environment='razorpay_test' AND payment_state IN ('pending','verified','paid','failed','cancelled','review') AND customer_subject IS NOT NULL AND request_key IS NOT NULL AND request_hash IS NOT NULL AND request_hash ~ '^[0-9a-f]{64}$'));

CREATE TABLE public.razorpay_checkout_test_actors(
 subject text PRIMARY KEY CHECK(char_length(subject) BETWEEN 1 AND 256),
 proof_hash text NOT NULL CHECK(proof_hash ~ '^[0-9a-f]{64}$'),
 fictional_shipping_paise bigint NOT NULL CHECK(fictional_shipping_paise BETWEEN 0 AND 100000000),
 fictional_tax_paise bigint NOT NULL CHECK(fictional_tax_paise BETWEEN 0 AND 100000000)
);
CREATE TABLE public.razorpay_checkout_test_stock(
 subject text NOT NULL REFERENCES public.razorpay_checkout_test_actors(subject) ON DELETE CASCADE,
 variant_id uuid NOT NULL REFERENCES public.catalog_variants(id),
 quantity integer NOT NULL CHECK(quantity BETWEEN 0 AND 100000), PRIMARY KEY(subject,variant_id)
);
CREATE TABLE public.razorpay_checkout_test_attempts(
 subject text NOT NULL CHECK(char_length(subject) BETWEEN 1 AND 256), request_key uuid NOT NULL,
 order_id uuid NOT NULL UNIQUE REFERENCES public.admin_order_records(id),
 receipt text NOT NULL UNIQUE CHECK(receipt ~ '^PBRZ[0-9a-f]{32}$'), nonce uuid NOT NULL,
 state text NOT NULL CHECK(state IN ('creating','ready','verified','paid','failed','cancelled','unknown','review')),
 reservation text NOT NULL CHECK(reservation IN ('held','consumed','released')),
 provider_order_id text UNIQUE CHECK(provider_order_id ~ '^order_[A-Za-z0-9]+$'),
 provider_payment_id text UNIQUE CHECK(provider_payment_id ~ '^pay_[A-Za-z0-9]+$'),
 checkout_key text CHECK(checkout_key ~ '^rzp_test_[A-Za-z0-9]+$'),
 expected_cart_version bigint CHECK(expected_cart_version BETWEEN 0 AND 9007199254740990),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(subject,request_key)
);
CREATE TABLE public.razorpay_checkout_test_closed_requests(
 subject text NOT NULL CHECK(char_length(subject) BETWEEN 1 AND 256),request_key uuid NOT NULL,PRIMARY KEY(subject,request_key)
);
CREATE TABLE public.razorpay_checkout_test_settlements(
 provider_payment_id text PRIMARY KEY CHECK(provider_payment_id ~ '^pay_[A-Za-z0-9]+$'),
 order_id uuid NOT NULL UNIQUE REFERENCES public.admin_order_records(id),
 event_id uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.razorpay_checkout_test_actors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.razorpay_checkout_test_stock ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.razorpay_checkout_test_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.razorpay_checkout_test_closed_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.razorpay_checkout_test_settlements ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.razorpay_checkout_test_actors,public.razorpay_checkout_test_stock,public.razorpay_checkout_test_attempts,public.razorpay_checkout_test_closed_requests,public.razorpay_checkout_test_settlements FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.razorpay_test_capabilities(p_proof text) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $fn$
DECLARE a text:=public.requesting_user_id(); c public.razorpay_checkout_test_actors;
BEGIN
 IF a IS NULL OR char_length(a)>256 THEN PERFORM public.phase3_fail('unauthenticated'); END IF;
 IF p_proof IS NULL OR char_length(p_proof) NOT BETWEEN 32 AND 256 THEN RETURN jsonb_build_object('razorpayTestAvailable',false); END IF;
 SELECT * INTO c FROM public.razorpay_checkout_test_actors WHERE subject=a;
 IF NOT FOUND OR c.proof_hash<>encode(sha256(convert_to(p_proof,'UTF8')),'hex') THEN RETURN jsonb_build_object('razorpayTestAvailable',false); END IF;
 RETURN jsonb_build_object('razorpayTestAvailable',true,'fictionalShippingPaise',c.fictional_shipping_paise,'fictionalTaxPaise',c.fictional_tax_paise);
END $fn$;

-- Identical validation to the existing simulation boundary; no simulation execution or mutation.
CREATE FUNCTION public.razorpay_test_validate_request(p_request jsonb) RETURNS void LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,public,pg_temp AS $fn$
DECLARE key uuid; mode text; part jsonb; field text; val text;
BEGIN
 IF jsonb_typeof(p_request) IS DISTINCT FROM 'object' OR octet_length(p_request::text)>20000
 OR (SELECT count(*) FROM jsonb_object_keys(p_request))<>10
 OR NOT (p_request ?& ARRAY['idempotencyKey','mode','expectedCartVersion','expectedSubtotalPaise','items','contact','shipping','billing','business','gstin']) THEN PERFORM public.phase3_fail('invalid_input'); END IF;
 IF jsonb_typeof(p_request->'idempotencyKey') IS DISTINCT FROM 'string'
 OR (p_request->>'idempotencyKey') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
 OR jsonb_typeof(p_request->'mode') IS DISTINCT FROM 'string' OR p_request->>'mode' NOT IN ('cart','buy-now')
 OR jsonb_typeof(p_request->'business') IS DISTINCT FROM 'string' OR char_length(p_request->>'business')>160
 OR jsonb_typeof(p_request->'gstin') IS DISTINCT FROM 'string' OR char_length(p_request->>'gstin')>15
 OR (p_request->>'gstin'<>'' AND p_request->>'gstin' !~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][A-Z0-9]Z[A-Z0-9]$')
 OR (p_request->>'business') ~ '[[:cntrl:]]' OR (p_request->>'gstin') ~ '[[:cntrl:]]' THEN PERFORM public.phase3_fail('invalid_input'); END IF;
 IF jsonb_typeof(p_request->'expectedSubtotalPaise') IS DISTINCT FROM 'number' OR (p_request->>'expectedSubtotalPaise') !~ '^(0|[1-9][0-9]{0,15})$' OR (p_request->>'expectedSubtotalPaise')::numeric>9007199254740991 THEN PERFORM public.phase3_fail('invalid_input'); END IF;
 mode:=p_request->>'mode'; key:=(p_request->>'idempotencyKey')::uuid;
 IF mode='cart' THEN
   IF jsonb_typeof(p_request->'expectedCartVersion') IS DISTINCT FROM 'number' OR (p_request->>'expectedCartVersion') !~ '^(0|[1-9][0-9]{0,15})$'
   OR (p_request->>'expectedCartVersion')::numeric>9007199254740990 THEN PERFORM public.phase3_fail('invalid_input'); END IF;
 ELSE
   IF p_request->'expectedCartVersion' IS DISTINCT FROM 'null'::jsonb THEN PERFORM public.phase3_fail('invalid_input'); END IF;
 END IF;
 PERFORM public.phase5_validate_cart_items(p_request->'items');
 IF jsonb_array_length(p_request->'items')=0 THEN PERFORM public.phase3_fail('invalid_input'); END IF;
 IF mode='buy-now' AND jsonb_array_length(p_request->'items')<>1 THEN PERFORM public.phase3_fail('invalid_input'); END IF;
 FOREACH field IN ARRAY ARRAY['contact','shipping','billing'] LOOP
   part:=p_request->field;
   IF jsonb_typeof(part) IS DISTINCT FROM 'object' THEN PERFORM public.phase3_fail('invalid_input'); END IF;
   IF field='contact' THEN
     IF (SELECT count(*) FROM jsonb_object_keys(part))<>4 OR NOT part ?& ARRAY['email','firstName','lastName','phone'] THEN PERFORM public.phase3_fail('invalid_input'); END IF;
   ELSE
     IF (SELECT count(*) FROM jsonb_object_keys(part))<>8 OR NOT part ?& ARRAY['recipientName','phone','line1','line2','city','state','postalCode','country'] THEN PERFORM public.phase3_fail('invalid_input'); END IF;
   END IF;
   FOR val IN SELECT value #>> '{}' FROM jsonb_each(part) LOOP
     IF val IS NULL OR char_length(val)>254 OR val ~ '[[:cntrl:]]' THEN PERFORM public.phase3_fail('invalid_input'); END IF;
   END LOOP;
   IF EXISTS (SELECT 1 FROM jsonb_each(part) AS e(k,v) WHERE jsonb_typeof(e.v) IS DISTINCT FROM 'string' OR (e.k<>'line2' AND btrim(e.v #>> '{}')='')) THEN PERFORM public.phase3_fail('invalid_input'); END IF;
   IF char_length(part->>'phone')>30 OR btrim(part->>'phone') !~ '^[+0-9 ()-]+$'
      OR regexp_replace(part->>'phone','[^0-9]','','g') !~ '^[0-9]{7,15}$' THEN PERFORM public.phase3_fail('invalid_input'); END IF;
   IF field='contact' THEN
     IF btrim(part->>'email') !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
       OR char_length(part->>'firstName')>120 OR char_length(part->>'lastName')>120 THEN PERFORM public.phase3_fail('invalid_input'); END IF;
   ELSE
     IF char_length(part->>'recipientName')>120 OR char_length(part->>'line1')>200 OR char_length(part->>'line2')>200
       OR char_length(part->>'city')>100 OR char_length(part->>'state')>100 OR char_length(part->>'postalCode')>6
       OR btrim(part->>'postalCode') !~ '^[0-9]{6}$' OR btrim(part->>'country')<>'India'
       OR char_length(part->>'country')>5 THEN PERFORM public.phase3_fail('invalid_input'); END IF;
   END IF;
 END LOOP;
END $fn$;

CREATE FUNCTION public.razorpay_test_attempt_json(t public.razorpay_checkout_test_attempts) RETURNS jsonb LANGUAGE sql STABLE SET search_path=pg_catalog,public,pg_temp AS $fn$
 SELECT jsonb_build_object('state',t.state,'reference',o.reference,'totalPaise',o.total_paise,'mode',o.snapshot->>'mode','items',o.snapshot->'requestItems')
 || CASE WHEN t.provider_order_id IS NOT NULL THEN jsonb_build_object('providerOrderId',t.provider_order_id) ELSE '{}'::jsonb END
 || CASE WHEN t.state='ready' AND t.checkout_key IS NOT NULL THEN jsonb_build_object('key',t.checkout_key) ELSE '{}'::jsonb END
 FROM public.admin_order_records o WHERE o.id=t.order_id
$fn$;

CREATE FUNCTION public.razorpay_test_prepare(p_request jsonb,p_proof text) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $fn$
DECLARE a text:=public.requesting_user_id(); actor public.razorpay_checkout_test_actors; t public.razorpay_checkout_test_attempts;
 k uuid; h text; mode text; q jsonb; line jsonb; stock integer; total numeric; cart_version bigint; oid uuid:=gen_random_uuid();
BEGIN
 IF a IS NULL OR char_length(a)>256 THEN PERFORM public.phase3_fail('unauthenticated'); END IF;
 PERFORM public.razorpay_test_validate_request(p_request);
 k:=(p_request->>'idempotencyKey')::uuid; mode:=p_request->>'mode'; h:=encode(sha256(convert_to(p_request::text,'UTF8')),'hex');
 PERFORM pg_advisory_xact_lock(hashtextextended('razorpay_test_owner:'||a,0));
 PERFORM pg_advisory_xact_lock(hashtextextended('razorpay_test_order:'||a||':'||k::text,0));
 SELECT * INTO t FROM public.razorpay_checkout_test_attempts WHERE subject=a AND request_key=k FOR UPDATE;
 IF FOUND THEN
   IF NOT EXISTS(SELECT 1 FROM public.admin_order_records WHERE id=t.order_id AND request_hash=h) THEN PERFORM public.phase3_fail('idempotency_conflict'); END IF;
   RETURN public.razorpay_test_attempt_json(t)||jsonb_build_object('createProvider',false);
 END IF;
 IF EXISTS(SELECT 1 FROM public.razorpay_checkout_test_closed_requests WHERE subject=a AND request_key=k) THEN PERFORM public.phase3_fail('attempt_closed'); END IF;
 IF EXISTS(SELECT 1 FROM public.admin_order_records WHERE customer_subject=a AND request_key=k) THEN PERFORM public.phase3_fail('idempotency_conflict'); END IF;
 IF EXISTS(SELECT 1 FROM public.razorpay_checkout_test_attempts x WHERE x.subject=a AND (x.state IN ('creating','unknown','ready','verified','review') OR (x.state IN ('cancelled','failed') AND (x.provider_order_id IS NOT NULL OR EXISTS(SELECT 1 FROM payments.razorpay_orders m WHERE m.environment='test' AND m.receipt=x.receipt))))) THEN PERFORM public.phase3_fail('attempt_pending'); END IF;
 IF p_proof IS NULL OR char_length(p_proof) NOT BETWEEN 32 AND 256 THEN PERFORM public.phase3_fail('forbidden'); END IF;
 SELECT * INTO actor FROM public.razorpay_checkout_test_actors WHERE subject=a FOR SHARE;
 IF NOT FOUND OR actor.proof_hash<>encode(sha256(convert_to(p_proof,'UTF8')),'hex') THEN PERFORM public.phase3_fail('forbidden'); END IF;
 FOR line IN SELECT value FROM jsonb_array_elements(p_request->'items') ORDER BY (value->>'variantId')::uuid LOOP
   SELECT quantity INTO stock FROM public.razorpay_checkout_test_stock WHERE subject=a AND variant_id=(line->>'variantId')::uuid FOR UPDATE;
   IF NOT FOUND OR stock<(line->>'quantity')::integer THEN PERFORM public.phase3_fail('item_unavailable'); END IF;
 END LOOP;
 IF mode='cart' THEN
   PERFORM pg_advisory_xact_lock(hashtextextended('customer_cart:'||a,0));
   SELECT version INTO cart_version FROM public.customer_carts WHERE user_id=a FOR UPDATE;
   IF COALESCE(cart_version,0)<>(p_request->>'expectedCartVersion')::bigint THEN PERFORM public.phase3_fail('version_conflict'); END IF;
   IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_request->'items') i LEFT JOIN public.customer_cart_items c ON c.user_id=a AND c.variant_id=(i->>'variantId')::uuid WHERE c.quantity IS NULL OR c.quantity<(i->>'quantity')::integer) THEN PERFORM public.phase3_fail('item_unavailable'); END IF;
 END IF;
 PERFORM r.id FROM public.cms_records r WHERE r.id IN (SELECT cv.product_id FROM public.catalog_variants cv JOIN jsonb_array_elements(p_request->'items') i ON cv.id=(i->>'variantId')::uuid) ORDER BY r.id FOR SHARE;
 PERFORM cv.id FROM public.catalog_variants cv JOIN jsonb_array_elements(p_request->'items') i ON cv.id=(i->>'variantId')::uuid ORDER BY cv.id FOR SHARE OF cv;
 q:=public.published_quote_cart(p_request->'items');
 FOR line IN SELECT value FROM jsonb_array_elements(q->'lines') LOOP
   IF line->>'issue' IS NOT NULL AND line->>'issue'<>'quantity_unavailable' THEN PERFORM public.phase3_fail('item_unavailable'); END IF;
   IF line->'variant' IS NULL OR line->'variant'='null'::jsonb OR line->>'lineTotalPaise' IS NULL OR (line->'variant' ? 'cartEligible' AND line->'variant'->>'cartEligible'<>'true') THEN PERFORM public.phase3_fail('item_unavailable'); END IF;
 END LOOP;
 IF (q->>'subtotalPaise')::numeric IS DISTINCT FROM (p_request->>'expectedSubtotalPaise')::numeric THEN PERFORM public.phase3_fail('price_changed'); END IF;
 total:=(q->>'subtotalPaise')::numeric+actor.fictional_shipping_paise+actor.fictional_tax_paise;
 IF total IS NULL OR total NOT BETWEEN 100 AND 9007199254740991 THEN PERFORM public.phase3_fail('invalid_input'); END IF;
 UPDATE public.razorpay_checkout_test_stock s SET quantity=s.quantity-(i.value->>'quantity')::integer FROM jsonb_array_elements(p_request->'items') i WHERE s.subject=a AND s.variant_id=(i.value->>'variantId')::uuid;
 INSERT INTO public.admin_order_records(id,reference,status,total_paise,customer_subject,environment,payment_state,snapshot,request_key,request_hash)
 VALUES(oid,'TST-'||oid::text,'pending',total::bigint,a,'razorpay_test','pending',jsonb_build_object('mode',mode,'requestItems',p_request->'items','contact',p_request->'contact','shipping',p_request->'shipping','billing',p_request->'billing','business',p_request->'business','gstin',p_request->'gstin','quote',q,'fictionalShippingPaise',actor.fictional_shipping_paise,'fictionalTaxPaise',actor.fictional_tax_paise,'chargesAreFictional',true,'shipment','{}'::jsonb),k,h);
 INSERT INTO public.razorpay_checkout_test_attempts(subject,request_key,order_id,receipt,nonce,state,reservation,expected_cart_version) VALUES(a,k,oid,'PBRZ'||replace(oid::text,'-',''),gen_random_uuid(),'creating','held',CASE WHEN mode='cart' THEN (p_request->>'expectedCartVersion')::bigint ELSE NULL END) RETURNING * INTO t;
 PERFORM public.admin_write_audit(a,'order.razorpay_test_prepare','order',oid,jsonb_build_object('environment','razorpay_test'),NULL);
 RETURN public.razorpay_test_attempt_json(t)||jsonb_build_object('createProvider',true,'receipt',t.receipt,'nonce',t.nonce,'attemptId',t.order_id,'requestKey',k);
END $fn$;

-- Policy sees the real initial INSERT, before InsForge appends insforge_order_id.
-- Serialize with other provider-creation INSERTs; the committed managed row consumes the one creation slot.
CREATE FUNCTION public.razorpay_test_allow_insert(p_environment text,p_status text,p_subject_type text,p_subject_id text,p_amount bigint,p_currency text,p_receipt text,p_notes jsonb,p_order_id text,p_raw jsonb,p_verified_payment_id text) RETURNS boolean LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $fn$
DECLARE a text:=public.requesting_user_id(); t public.razorpay_checkout_test_attempts;
BEGIN
 IF a IS NULL OR p_subject_id IS DISTINCT FROM a OR p_environment IS DISTINCT FROM 'test' OR p_status IS DISTINCT FROM 'initialized' OR p_subject_type IS DISTINCT FROM 'user' OR p_currency IS DISTINCT FROM 'inr' OR p_order_id IS NOT NULL OR p_verified_payment_id IS NOT NULL OR p_raw IS DISTINCT FROM '{}'::jsonb OR jsonb_typeof(p_notes) IS DISTINCT FROM 'object' THEN RETURN false; END IF;
 SELECT * INTO t FROM public.razorpay_checkout_test_attempts WHERE subject=a AND receipt=p_receipt FOR UPDATE;
 IF NOT FOUND OR t.state<>'creating' OR t.reservation<>'held' OR t.provider_order_id IS NOT NULL THEN RETURN false; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.razorpay_checkout_test_actors WHERE subject=a) THEN RETURN false; END IF;
 IF p_notes->>'pandabyte_attempt' IS DISTINCT FROM t.order_id::text OR p_notes->>'pandabyte_nonce' IS DISTINCT FROM t.nonce::text OR p_notes->>'insforge_subject_type' IS DISTINCT FROM 'user' OR p_notes->>'insforge_subject_id' IS DISTINCT FROM a THEN RETURN false; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.admin_order_records WHERE id=t.order_id AND environment='razorpay_test' AND payment_state='pending' AND total_paise=p_amount) THEN RETURN false; END IF;
 RETURN NOT EXISTS(SELECT 1 FROM payments.razorpay_orders WHERE environment='test' AND receipt=t.receipt);
END $fn$;
ALTER TABLE payments.razorpay_orders ENABLE ROW LEVEL SECURITY;
GRANT INSERT(id,environment,status,subject_type,subject_id,customer_name,customer_email,customer_contact,receipt,amount,currency,description,callback_url,notes) ON payments.razorpay_orders TO authenticated;
DROP POLICY IF EXISTS pandabyte_razorpay_test_probe_insert ON payments.razorpay_orders;
CREATE POLICY pandabyte_razorpay_test_create ON payments.razorpay_orders FOR INSERT TO authenticated WITH CHECK(public.razorpay_test_allow_insert(environment,status,subject_type,subject_id,amount,currency,receipt,notes,order_id,raw,verified_payment_id));

CREATE FUNCTION public.razorpay_test_bind(p_request_key uuid,p_provider_order_id text,p_key text) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $fn$
DECLARE a text:=public.requesting_user_id(); t public.razorpay_checkout_test_attempts;
BEGIN
 IF a IS NULL OR char_length(a)>256 THEN PERFORM public.phase3_fail('unauthenticated'); END IF;
 IF p_request_key IS NULL OR p_provider_order_id IS NULL OR p_provider_order_id !~ '^order_[A-Za-z0-9]{1,100}$' OR p_key IS NULL OR p_key !~ '^rzp_test_[A-Za-z0-9]{1,100}$' THEN PERFORM public.phase3_fail('invalid_input'); END IF;
 SELECT * INTO t FROM public.razorpay_checkout_test_attempts WHERE subject=a AND request_key=p_request_key FOR UPDATE;
 IF NOT FOUND THEN PERFORM public.phase3_fail('not_found'); END IF;
 IF t.provider_order_id IS NOT NULL AND t.provider_order_id<>p_provider_order_id THEN PERFORM public.phase3_fail('idempotency_conflict'); END IF;
 IF NOT EXISTS(SELECT 1 FROM payments.razorpay_orders m JOIN public.admin_order_records o ON o.id=t.order_id WHERE m.environment='test' AND m.order_id=p_provider_order_id AND m.subject_type='user' AND m.subject_id=a AND m.receipt=t.receipt AND m.notes->>'pandabyte_attempt'=t.order_id::text AND m.notes->>'pandabyte_nonce'=t.nonce::text AND m.amount=o.total_paise AND m.currency='inr') THEN PERFORM public.phase3_fail('forbidden'); END IF;
 UPDATE public.razorpay_checkout_test_attempts SET provider_order_id=p_provider_order_id,checkout_key=p_key,state=CASE WHEN state IN ('creating','unknown') THEN 'ready' ELSE state END,updated_at=now() WHERE subject=a AND request_key=p_request_key RETURNING * INTO t;
 RETURN public.razorpay_test_attempt_json(t);
END $fn$;

CREATE FUNCTION public.razorpay_test_recover(p_request_key uuid,p_proof text,p_key text) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $fn$
DECLARE a text:=public.requesting_user_id(); t public.razorpay_checkout_test_attempts; provider_id text;
BEGIN
 IF a IS NULL OR char_length(a)>256 THEN PERFORM public.phase3_fail('unauthenticated'); END IF;
 IF p_request_key IS NULL THEN PERFORM public.phase3_fail('invalid_input'); END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('razorpay_test_recovery:'||a,0));
 PERFORM pg_advisory_xact_lock(hashtextextended('razorpay_test_order:'||a||':'||p_request_key::text,0));
 SELECT * INTO t FROM public.razorpay_checkout_test_attempts WHERE subject=a AND request_key=p_request_key FOR UPDATE;
 IF FOUND THEN
   IF t.provider_order_id IS NULL THEN
     SELECT m.order_id INTO provider_id FROM payments.razorpay_orders m JOIN public.admin_order_records o ON o.id=t.order_id WHERE m.environment='test' AND m.subject_type='user' AND m.subject_id=a AND m.receipt=t.receipt AND m.notes->>'pandabyte_attempt'=t.order_id::text AND m.notes->>'pandabyte_nonce'=t.nonce::text AND m.amount=o.total_paise AND m.currency='inr' AND m.order_id IS NOT NULL;
     IF provider_id IS NOT NULL THEN RETURN public.razorpay_test_bind(p_request_key,provider_id,p_key); END IF;
     -- Keep the creation slot open for the original delayed SDK call; recovery never creates again.
     NULL;
   ELSIF t.state='ready' AND t.checkout_key IS NULL THEN RETURN public.razorpay_test_bind(p_request_key,t.provider_order_id,p_key);
   END IF;
   RETURN public.razorpay_test_attempt_json(t);
 END IF;
 IF EXISTS(SELECT 1 FROM public.razorpay_checkout_test_closed_requests WHERE subject=a AND request_key=p_request_key) THEN RETURN jsonb_build_object('state','not_created'); END IF;
 IF p_proof IS NULL OR char_length(p_proof) NOT BETWEEN 32 AND 256 OR NOT EXISTS(SELECT 1 FROM public.razorpay_checkout_test_actors WHERE subject=a AND proof_hash=encode(sha256(convert_to(p_proof,'UTF8')),'hex')) THEN PERFORM public.phase3_fail('forbidden'); END IF;
 IF (SELECT count(*) FROM public.razorpay_checkout_test_closed_requests WHERE subject=a)>=100 THEN PERFORM public.phase3_fail('recovery_limit'); END IF;
 INSERT INTO public.razorpay_checkout_test_closed_requests(subject,request_key) VALUES(a,p_request_key);
 RETURN jsonb_build_object('state','not_created');
END $fn$;

CREATE FUNCTION public.razorpay_test_resolve(p_provider_order_id text) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $fn$
DECLARE a text:=public.requesting_user_id(); t public.razorpay_checkout_test_attempts;
BEGIN
 IF a IS NULL OR char_length(a)>256 THEN PERFORM public.phase3_fail('unauthenticated'); END IF;
 IF p_provider_order_id IS NULL OR p_provider_order_id !~ '^order_[A-Za-z0-9]{1,100}$' THEN PERFORM public.phase3_fail('invalid_input'); END IF;
 SELECT * INTO t FROM public.razorpay_checkout_test_attempts WHERE subject=a AND provider_order_id=p_provider_order_id;
 IF NOT FOUND THEN PERFORM public.phase3_fail('not_found'); END IF;
 RETURN public.razorpay_test_attempt_json(t)||jsonb_build_object('requestKey',t.request_key);
END $fn$;

CREATE FUNCTION public.razorpay_test_mark_verified(p_request_key uuid,p_payment_id text) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $fn$
DECLARE a text:=public.requesting_user_id(); t public.razorpay_checkout_test_attempts;
BEGIN
 IF a IS NULL OR char_length(a)>256 THEN PERFORM public.phase3_fail('unauthenticated'); END IF;
 IF p_request_key IS NULL OR p_payment_id IS NULL OR p_payment_id !~ '^pay_[A-Za-z0-9]{1,100}$' THEN PERFORM public.phase3_fail('invalid_input'); END IF;
 SELECT * INTO t FROM public.razorpay_checkout_test_attempts WHERE subject=a AND request_key=p_request_key FOR UPDATE;
 IF NOT FOUND THEN PERFORM public.phase3_fail('not_found'); END IF;
 IF NOT EXISTS(SELECT 1 FROM payments.razorpay_orders m WHERE m.environment='test' AND m.order_id=t.provider_order_id AND m.subject_id=a AND m.subject_type='user' AND m.verified_payment_id=p_payment_id AND m.verified_at IS NOT NULL) THEN PERFORM public.phase3_fail('forbidden'); END IF;
 IF t.state IN ('ready','creating','unknown') THEN
   UPDATE public.razorpay_checkout_test_attempts SET state='verified',updated_at=now() WHERE subject=a AND request_key=p_request_key RETURNING * INTO t;
   UPDATE public.admin_order_records SET payment_state='verified',version=version+1,updated_at=now() WHERE id=t.order_id AND payment_state='pending';
 END IF;
 RETURN public.razorpay_test_attempt_json(t);
END $fn$;

CREATE FUNCTION public.razorpay_test_release(t public.razorpay_checkout_test_attempts) RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $fn$
DECLARE line jsonb;
BEGIN
 IF t.reservation<>'held' THEN RETURN; END IF;
 FOR line IN SELECT value FROM public.admin_order_records o,jsonb_array_elements(o.snapshot->'requestItems') WHERE o.id=t.order_id ORDER BY (value->>'variantId')::uuid LOOP
   UPDATE public.razorpay_checkout_test_stock SET quantity=quantity+(line->>'quantity')::integer WHERE subject=t.subject AND variant_id=(line->>'variantId')::uuid;
 END LOOP;
 UPDATE public.razorpay_checkout_test_attempts SET reservation='released',updated_at=now() WHERE subject=t.subject AND request_key=t.request_key;
END $fn$;

CREATE FUNCTION public.razorpay_test_cancel(p_request_key uuid) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $fn$
DECLARE a text:=public.requesting_user_id(); t public.razorpay_checkout_test_attempts;
BEGIN
 IF a IS NULL OR char_length(a)>256 THEN PERFORM public.phase3_fail('unauthenticated'); END IF;
 IF p_request_key IS NULL THEN PERFORM public.phase3_fail('invalid_input'); END IF;
 SELECT * INTO t FROM public.razorpay_checkout_test_attempts WHERE subject=a AND request_key=p_request_key FOR UPDATE;
 IF NOT FOUND THEN PERFORM public.phase3_fail('not_found'); END IF;
 IF t.state IN ('paid','review') THEN PERFORM public.phase3_fail('invalid_transition'); END IF;
 IF t.state<>'cancelled' THEN
   PERFORM public.razorpay_test_release(t);
   UPDATE public.razorpay_checkout_test_attempts SET state='cancelled',updated_at=now() WHERE subject=a AND request_key=p_request_key RETURNING * INTO t;
   UPDATE public.admin_order_records SET status='cancelled',payment_state='cancelled',version=version+1,updated_at=now() WHERE id=t.order_id;
 END IF;
 RETURN public.razorpay_test_attempt_json(t);
END $fn$;

-- Only trusted, processed managed events can execute this private settlement transition.
CREATE FUNCTION public.razorpay_test_settle(p_event_id uuid) RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $fn$
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
CREATE FUNCTION public.razorpay_test_webhook_transition() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $fn$
BEGIN
 PERFORM public.razorpay_test_settle(NEW.id); RETURN NEW;
END $fn$;
CREATE TRIGGER pandabyte_razorpay_test_settlement AFTER INSERT OR UPDATE ON payments.webhook_events FOR EACH ROW EXECUTE FUNCTION public.razorpay_test_webhook_transition();

CREATE OR REPLACE FUNCTION public.customer_list_checkout_orders(p_limit integer DEFAULT 20,p_offset integer DEFAULT 0)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $fn$
DECLARE a text:=public.requesting_user_id(); result jsonb;
BEGIN
 IF a IS NULL OR char_length(a)>256 THEN PERFORM public.phase3_fail('unauthenticated'); END IF;
 IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 50 OR p_offset IS NULL OR p_offset NOT BETWEEN 0 AND 10000 THEN PERFORM public.phase3_fail('invalid_input'); END IF;
 SELECT jsonb_build_object('total',(SELECT count(*) FROM public.admin_order_records WHERE customer_subject=a AND environment IN ('simulation','razorpay_test')),
 'limit',p_limit,'offset',p_offset,'items',COALESCE(jsonb_agg(q.data ORDER BY q.created_at DESC,q.id DESC),'[]'::jsonb)) INTO result
 FROM (SELECT public.simulation_order_json(o) AS data,o.created_at,o.id FROM public.admin_order_records o
 WHERE o.customer_subject=a AND o.environment IN ('simulation','razorpay_test') ORDER BY o.created_at DESC,o.id DESC LIMIT p_limit OFFSET p_offset) q;
 RETURN result;
END $fn$;
CREATE OR REPLACE FUNCTION public.customer_get_checkout_order(p_reference text) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $fn$
DECLARE a text:=public.requesting_user_id(); result jsonb;
BEGIN
 IF a IS NULL OR char_length(a)>256 THEN PERFORM public.phase3_fail('unauthenticated'); END IF;
 IF p_reference IS NULL OR char_length(p_reference) NOT BETWEEN 1 AND 80 THEN PERFORM public.phase3_fail('invalid_input'); END IF;
 SELECT public.simulation_order_json(o) INTO result FROM public.admin_order_records o WHERE o.customer_subject=a AND o.reference=p_reference AND o.environment IN ('simulation','razorpay_test');
 IF result IS NULL THEN PERFORM public.phase3_fail('not_found'); END IF;
 RETURN result;
END $fn$;
CREATE OR REPLACE FUNCTION public.admin_get_checkout_order(p_reference text) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $fn$
DECLARE result jsonb;
BEGIN
 PERFORM public.admin_assert_capability('staff.manage');
 IF p_reference IS NULL OR char_length(p_reference) NOT BETWEEN 1 AND 80 THEN PERFORM public.phase3_fail('invalid_input'); END IF;
 SELECT public.simulation_order_json(o) INTO result FROM public.admin_order_records o WHERE o.reference=p_reference AND o.environment IN ('simulation','razorpay_test');
 IF result IS NULL THEN PERFORM public.phase3_fail('not_found'); END IF;
 RETURN result;
END $fn$;


-- Preserve the existing simulation writer; only add guarded provider-test fulfillment.
ALTER FUNCTION public.admin_update_checkout_order(text,bigint,text,jsonb) RENAME TO admin_update_simulation_checkout_order;
REVOKE ALL ON FUNCTION public.admin_update_simulation_checkout_order(text,bigint,text,jsonb) FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.admin_update_checkout_order(p_reference text,p_expected_version bigint,p_status text,p_shipping jsonb) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $fn$
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

-- Explicitly revoke every new function before granting only owner-safe entry points.
REVOKE ALL ON FUNCTION public.razorpay_test_capabilities(text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.razorpay_test_validate_request(jsonb) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.razorpay_test_attempt_json(public.razorpay_checkout_test_attempts) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.razorpay_test_prepare(jsonb,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.razorpay_test_allow_insert(text,text,text,text,bigint,text,text,jsonb,text,jsonb,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.razorpay_test_bind(uuid,text,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.razorpay_test_recover(uuid,text,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.razorpay_test_resolve(text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.razorpay_test_mark_verified(uuid,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.razorpay_test_release(public.razorpay_checkout_test_attempts) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.razorpay_test_cancel(uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.razorpay_test_settle(uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.razorpay_test_webhook_transition() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.customer_list_checkout_orders(integer,integer) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.customer_get_checkout_order(text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.admin_get_checkout_order(text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.admin_update_checkout_order(text,bigint,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.razorpay_test_capabilities(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.razorpay_test_prepare(jsonb,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.razorpay_test_allow_insert(text,text,text,text,bigint,text,text,jsonb,text,jsonb,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.razorpay_test_bind(uuid,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.razorpay_test_recover(uuid,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.razorpay_test_resolve(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.razorpay_test_mark_verified(uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.razorpay_test_cancel(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.customer_list_checkout_orders(integer,integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.customer_get_checkout_order(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_checkout_order(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_update_checkout_order(text,bigint,text,jsonb) TO authenticated;
