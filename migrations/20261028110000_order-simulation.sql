-- Development simulation infrastructure: no actor/stock grants are seeded; no real payment or operational stock.
-- Rollback requires a reviewed forward migration; preserve any recorded orders and audits.
ALTER TABLE public.admin_order_records
  ADD COLUMN customer_subject text CHECK (customer_subject IS NULL OR char_length(customer_subject) BETWEEN 1 AND 256),
  ADD COLUMN environment text NOT NULL DEFAULT 'legacy' CHECK (environment IN ('legacy','simulation')),
  ADD COLUMN payment_state text NOT NULL DEFAULT 'unconfigured' CHECK (payment_state IN ('unconfigured','simulated')),
  ADD COLUMN snapshot jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(snapshot)='object'),
  ADD COLUMN version bigint NOT NULL DEFAULT 1 CHECK (version BETWEEN 1 AND 9007199254740991),
  ADD COLUMN request_key uuid,
  ADD COLUMN request_hash text,
  ADD CONSTRAINT order_simulation_fields CHECK (
    (environment='legacy' AND payment_state='unconfigured' AND request_key IS NULL AND request_hash IS NULL)
    OR (environment='simulation' AND payment_state='simulated' AND customer_subject IS NOT NULL AND request_key IS NOT NULL AND request_hash IS NOT NULL AND request_hash ~ '^[0-9a-f]{64}$'));
CREATE UNIQUE INDEX admin_order_customer_request_idx ON public.admin_order_records(customer_subject,request_key) WHERE request_key IS NOT NULL;
CREATE INDEX admin_order_customer_created_idx ON public.admin_order_records(customer_subject,created_at DESC,id);
CREATE TABLE public.commerce_simulation_actors (
  subject text PRIMARY KEY CHECK (char_length(subject) BETWEEN 1 AND 256),
  proof_hash text NOT NULL CHECK (proof_hash ~ '^[0-9a-f]{64}$'),
  fictional_shipping_paise bigint NOT NULL CHECK (fictional_shipping_paise BETWEEN 0 AND 100000000),
  fictional_tax_paise bigint NOT NULL CHECK (fictional_tax_paise BETWEEN 0 AND 100000000)
);
CREATE TABLE public.commerce_simulation_stock (
  subject text NOT NULL REFERENCES public.commerce_simulation_actors(subject) ON DELETE CASCADE,
  variant_id uuid NOT NULL REFERENCES public.catalog_variants(id),
  quantity integer NOT NULL CHECK (quantity BETWEEN 0 AND 100000),
  PRIMARY KEY(subject,variant_id)
);
ALTER TABLE public.commerce_simulation_actors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commerce_simulation_stock ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.commerce_simulation_actors,public.commerce_simulation_stock FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.simulation_order_json(o public.admin_order_records) RETURNS jsonb
LANGUAGE sql STABLE SET search_path=pg_catalog,public,pg_temp AS $fn$
 SELECT jsonb_build_object('reference',o.reference,'status',o.status,'totalPaise',o.total_paise,
 'currency',o.currency,'createdAt',o.created_at,'updatedAt',o.updated_at,'version',o.version,
 'paymentState',o.payment_state,'environment',o.environment,'snapshot',o.snapshot)
$fn$;
REVOKE ALL ON FUNCTION public.simulation_order_json(public.admin_order_records) FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.customer_list_checkout_orders(p_limit integer DEFAULT 20,p_offset integer DEFAULT 0)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $fn$
DECLARE a text:=public.requesting_user_id(); result jsonb;
BEGIN
 IF a IS NULL OR char_length(a)>256 THEN PERFORM public.phase3_fail('unauthenticated'); END IF;
 IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 50 OR p_offset IS NULL OR p_offset NOT BETWEEN 0 AND 10000 THEN PERFORM public.phase3_fail('invalid_input'); END IF;
 SELECT jsonb_build_object('total',(SELECT count(*) FROM public.admin_order_records WHERE customer_subject=a AND environment='simulation'),
 'limit',p_limit,'offset',p_offset,'items',COALESCE(jsonb_agg(q.data ORDER BY q.created_at DESC,q.id DESC),'[]'::jsonb)) INTO result
 FROM (SELECT public.simulation_order_json(o) AS data,o.created_at,o.id FROM public.admin_order_records o
 WHERE o.customer_subject=a AND o.environment='simulation' ORDER BY o.created_at DESC,o.id DESC LIMIT p_limit OFFSET p_offset) q;
 RETURN result;
END $fn$;
CREATE FUNCTION public.customer_get_checkout_order(p_reference text) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $fn$
DECLARE a text:=public.requesting_user_id(); result jsonb;
BEGIN
 IF a IS NULL OR char_length(a)>256 THEN PERFORM public.phase3_fail('unauthenticated'); END IF;
 IF p_reference IS NULL OR char_length(p_reference) NOT BETWEEN 1 AND 80 THEN PERFORM public.phase3_fail('invalid_input'); END IF;
 SELECT public.simulation_order_json(o) INTO result FROM public.admin_order_records o WHERE o.customer_subject=a AND o.reference=p_reference AND o.environment='simulation';
 IF result IS NULL THEN PERFORM public.phase3_fail('not_found'); END IF;
 RETURN result;
END $fn$;
CREATE FUNCTION public.admin_get_checkout_order(p_reference text) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $fn$
DECLARE result jsonb;
BEGIN
 PERFORM public.admin_assert_capability('staff.manage');
 IF p_reference IS NULL OR char_length(p_reference) NOT BETWEEN 1 AND 80 THEN PERFORM public.phase3_fail('invalid_input'); END IF;
 SELECT public.simulation_order_json(o) INTO result FROM public.admin_order_records o WHERE o.reference=p_reference AND o.environment='simulation';
 IF result IS NULL THEN PERFORM public.phase3_fail('not_found'); END IF;
 RETURN result;
END $fn$;
CREATE FUNCTION public.admin_update_checkout_order(p_reference text,p_expected_version bigint,p_status text,p_shipping jsonb) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $fn$
DECLARE a text:=public.admin_assert_capability('staff.manage'); o public.admin_order_records; k text; v text; line jsonb; stock_released boolean:=false;
BEGIN
 IF p_reference IS NULL OR char_length(p_reference) NOT BETWEEN 1 AND 80 OR p_expected_version IS NULL OR p_expected_version NOT BETWEEN 1 AND 9007199254740990
 OR p_status IS NULL OR p_status NOT IN ('pending','processing','fulfilled','cancelled') OR jsonb_typeof(p_shipping) IS DISTINCT FROM 'object'
 OR octet_length(p_shipping::text)>4096 THEN PERFORM public.phase3_fail('invalid_input'); END IF;
 IF (SELECT count(*) FROM jsonb_object_keys(p_shipping))<>3 OR NOT p_shipping ?& ARRAY['carrier','trackingNumber','trackingUrl'] THEN PERFORM public.phase3_fail('invalid_input'); END IF;
 FOR k,v IN SELECT key,value #>> '{}' FROM jsonb_each(p_shipping) LOOP
   IF k NOT IN ('carrier','trackingNumber','trackingUrl') OR jsonb_typeof(p_shipping->k) IS DISTINCT FROM 'string'
      OR char_length(v)>(CASE k WHEN 'carrier' THEN 100 WHEN 'trackingNumber' THEN 120 ELSE 500 END)
      OR v ~ '[[:cntrl:]]' OR (k='trackingUrl' AND v<>'' AND NOT public.phase3_is_safe_url(v,false)) THEN PERFORM public.phase3_fail('invalid_input'); END IF;
 END LOOP;
 SELECT * INTO o FROM public.admin_order_records
 WHERE reference=p_reference AND environment='simulation' AND payment_state='simulated' FOR UPDATE;
 IF NOT FOUND THEN PERFORM public.phase3_fail('not_found'); END IF;
 IF o.version<>p_expected_version THEN PERFORM public.phase3_fail('version_conflict'); END IF;
 IF NOT (p_status=o.status OR (o.status='pending' AND p_status IN ('processing','cancelled')) OR (o.status='processing' AND p_status IN ('fulfilled','cancelled'))) THEN PERFORM public.phase3_fail('invalid_transition'); END IF;
 IF p_status='cancelled' AND o.status<>'cancelled' THEN
   stock_released:=true;
   FOR line IN SELECT value FROM jsonb_array_elements(o.snapshot->'quote'->'lines') ORDER BY (value->>'variantId')::uuid LOOP
     UPDATE public.commerce_simulation_stock SET quantity=quantity+(line->>'quantity')::integer
     WHERE subject=o.customer_subject AND variant_id=(line->>'variantId')::uuid;
   END LOOP;
 END IF;
 UPDATE public.admin_order_records SET status=p_status,snapshot=jsonb_set(snapshot,'{shipment}',p_shipping,true),version=version+1,updated_at=now() WHERE id=o.id RETURNING * INTO o;
 PERFORM public.admin_write_audit(a,'order.update','order',o.id,jsonb_build_object('status',p_status,'version',o.version,'fixtureStockReleased',stock_released),NULL);
 RETURN public.simulation_order_json(o);
END $fn$;

CREATE FUNCTION public.customer_simulate_checkout(p_request jsonb,p_proof text) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $fn$
DECLARE a text:=public.requesting_user_id(); actor public.commerce_simulation_actors; o public.admin_order_records;
 key uuid; h text; mode text; cart_version bigint; q jsonb; line jsonb; part jsonb; field text; val text;
 stock integer; total numeric; request_id uuid;
BEGIN
 IF a IS NULL OR char_length(a)>256 THEN PERFORM public.phase3_fail('unauthenticated'); END IF;
 IF p_proof IS NULL OR char_length(p_proof) NOT BETWEEN 32 AND 256 THEN PERFORM public.phase3_fail('forbidden'); END IF;
 SELECT * INTO actor FROM public.commerce_simulation_actors WHERE subject=a FOR SHARE;
 IF NOT FOUND OR actor.proof_hash<>encode(sha256(convert_to(p_proof,'UTF8')),'hex') THEN PERFORM public.phase3_fail('forbidden'); END IF;
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
 h:=encode(sha256(convert_to(p_request::text,'UTF8')),'hex');
 PERFORM pg_advisory_xact_lock(hashtextextended('simulation_order:'||a||':'||key::text,0));
 SELECT * INTO o FROM public.admin_order_records WHERE customer_subject=a AND request_key=key;
 IF FOUND THEN
   IF o.request_hash<>h THEN PERFORM public.phase3_fail('idempotency_conflict'); END IF;
   RETURN public.simulation_order_json(o);
 END IF;
 IF mode='cart' THEN
   PERFORM pg_advisory_xact_lock(hashtextextended('customer_cart:'||a,0));
   SELECT version INTO cart_version FROM public.customer_carts WHERE user_id=a FOR UPDATE;
   IF COALESCE(cart_version,0)<>(p_request->>'expectedCartVersion')::bigint THEN PERFORM public.phase3_fail('version_conflict'); END IF;
   IF EXISTS (SELECT 1 FROM jsonb_array_elements(p_request->'items') i LEFT JOIN public.customer_cart_items c
       ON c.user_id=a AND c.variant_id=(i->>'variantId')::uuid WHERE c.quantity IS NULL OR c.quantity<(i->>'quantity')::integer)
   THEN PERFORM public.phase3_fail('item_unavailable'); END IF;
 END IF;
 -- Lock explicit fixture rows in a consistent order; no inventory_balances mutation.
 FOR line IN SELECT value FROM jsonb_array_elements(p_request->'items') ORDER BY (value->>'variantId')::uuid LOOP
   SELECT quantity INTO stock FROM public.commerce_simulation_stock WHERE subject=a AND variant_id=(line->>'variantId')::uuid FOR UPDATE;
   IF NOT FOUND OR stock<(line->>'quantity')::integer THEN PERFORM public.phase3_fail('item_unavailable'); END IF;
 END LOOP;
 -- Match publication's record-before-variant lock order; hold price and withdrawal state through insertion.
 PERFORM r.id FROM public.cms_records r WHERE r.id IN (
   SELECT cv.product_id FROM public.catalog_variants cv JOIN jsonb_array_elements(p_request->'items') i ON cv.id=(i->>'variantId')::uuid
 ) ORDER BY r.id FOR SHARE;
 PERFORM cv.id FROM public.catalog_variants cv JOIN jsonb_array_elements(p_request->'items') i ON cv.id=(i->>'variantId')::uuid ORDER BY cv.id FOR SHARE OF cv;
 q:=public.published_quote_cart(p_request->'items');
 FOR line IN SELECT value FROM jsonb_array_elements(q->'lines') LOOP
   IF line->>'issue' IS NOT NULL AND line->>'issue'<>'quantity_unavailable' THEN PERFORM public.phase3_fail('item_unavailable'); END IF;
   IF line->'variant' IS NULL OR line->'variant'='null'::jsonb OR line->>'lineTotalPaise' IS NULL
      OR (line->'variant' ? 'cartEligible' AND line->'variant'->>'cartEligible'<>'true') THEN PERFORM public.phase3_fail('item_unavailable'); END IF;
 END LOOP;
 IF (q->>'subtotalPaise')::numeric IS DISTINCT FROM (p_request->>'expectedSubtotalPaise')::numeric THEN PERFORM public.phase3_fail('price_changed'); END IF;
 total:=(q->>'subtotalPaise')::numeric+actor.fictional_shipping_paise+actor.fictional_tax_paise;
 IF total IS NULL OR total NOT BETWEEN 0 AND 9007199254740991 THEN PERFORM public.phase3_fail('invalid_input'); END IF;
 UPDATE public.commerce_simulation_stock s SET quantity=s.quantity-(i.value->>'quantity')::integer
 FROM jsonb_array_elements(p_request->'items') i WHERE s.subject=a AND s.variant_id=(i.value->>'variantId')::uuid;
 IF mode='cart' THEN
   DELETE FROM public.customer_cart_items c USING jsonb_array_elements(p_request->'items') i
     WHERE c.user_id=a AND c.variant_id=(i.value->>'variantId')::uuid AND c.quantity=(i.value->>'quantity')::integer;
   UPDATE public.customer_cart_items c SET quantity=c.quantity-(i.value->>'quantity')::integer
     FROM jsonb_array_elements(p_request->'items') i WHERE c.user_id=a AND c.variant_id=(i.value->>'variantId')::uuid;
   UPDATE public.customer_carts SET version=version+1,updated_at=now() WHERE user_id=a;
 END IF;
 request_id:=gen_random_uuid();
 INSERT INTO public.admin_order_records(id,reference,status,total_paise,customer_subject,environment,payment_state,snapshot,request_key,request_hash)
 VALUES(request_id,'SIM-'||request_id::text,'pending',total::bigint,a,'simulation','simulated',
 jsonb_build_object('mode',mode,'contact',p_request->'contact','shipping',p_request->'shipping','billing',p_request->'billing',
 'business',p_request->'business','gstin',p_request->'gstin','quote',q,'fictionalShippingPaise',actor.fictional_shipping_paise,
 'fictionalTaxPaise',actor.fictional_tax_paise,'chargesAreFictional',true,'shipment','{}'::jsonb),key,h) RETURNING * INTO o;
 PERFORM public.admin_write_audit(a,'order.simulate','order',o.id,jsonb_build_object('environment','simulation'),NULL);
 RETURN public.simulation_order_json(o);
END $fn$;
REVOKE ALL ON FUNCTION public.customer_simulate_checkout(jsonb,text),public.customer_list_checkout_orders(integer,integer),public.customer_get_checkout_order(text),public.admin_get_checkout_order(text),public.admin_update_checkout_order(text,bigint,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.customer_simulate_checkout(jsonb,text),public.customer_list_checkout_orders(integer,integer),public.customer_get_checkout_order(text),public.admin_get_checkout_order(text),public.admin_update_checkout_order(text,bigint,text,jsonb) TO authenticated;


CREATE FUNCTION public.customer_simulation_capabilities(p_proof text) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $fn$
DECLARE a text:=public.requesting_user_id(); c public.commerce_simulation_actors;
BEGIN
 IF a IS NULL THEN PERFORM public.phase3_fail('unauthenticated'); END IF;
 SELECT * INTO c FROM public.commerce_simulation_actors WHERE subject=a;
 IF NOT FOUND OR p_proof IS NULL OR c.proof_hash<>encode(sha256(convert_to(p_proof,'UTF8')),'hex') THEN RETURN jsonb_build_object('simulationAvailable',false); END IF;
 RETURN jsonb_build_object('simulationAvailable',true,'fictionalShippingPaise',c.fictional_shipping_paise,'fictionalTaxPaise',c.fictional_tax_paise);
END $fn$;
REVOKE ALL ON FUNCTION public.customer_simulation_capabilities(text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.customer_simulation_capabilities(text) TO authenticated;
