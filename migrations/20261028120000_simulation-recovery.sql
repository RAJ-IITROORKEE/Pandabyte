-- Forward-only recovery fence. Keep closed keys while a delayed request can still arrive.
CREATE TABLE public.commerce_simulation_closed_requests (
 subject text NOT NULL CHECK (char_length(subject) BETWEEN 1 AND 256),
 request_key uuid NOT NULL,
 PRIMARY KEY(subject,request_key)
);
ALTER TABLE public.commerce_simulation_closed_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.commerce_simulation_closed_requests FROM PUBLIC,anon,authenticated;

ALTER FUNCTION public.customer_simulate_checkout(jsonb,text) RENAME TO customer_simulate_checkout_unchecked;
REVOKE ALL ON FUNCTION public.customer_simulate_checkout_unchecked(jsonb,text) FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.customer_simulate_checkout(p_request jsonb,p_proof text) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $fn$
DECLARE a text:=public.requesting_user_id(); k uuid;
BEGIN
 IF a IS NULL OR char_length(a)>256 THEN PERFORM public.phase3_fail('unauthenticated'); END IF;
 IF jsonb_typeof(p_request) IS DISTINCT FROM 'object' OR jsonb_typeof(p_request->'idempotencyKey') IS DISTINCT FROM 'string'
 OR (p_request->>'idempotencyKey') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
 THEN PERFORM public.phase3_fail('invalid_input'); END IF;
 k:=(p_request->>'idempotencyKey')::uuid;
 PERFORM pg_advisory_xact_lock(hashtextextended('simulation_order:'||a||':'||k::text,0));
 IF EXISTS(SELECT 1 FROM public.commerce_simulation_closed_requests WHERE subject=a AND request_key=k)
 THEN PERFORM public.phase3_fail('attempt_closed'); END IF;
 RETURN public.customer_simulate_checkout_unchecked(p_request,p_proof);
END $fn$;
REVOKE ALL ON FUNCTION public.customer_simulate_checkout(jsonb,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.customer_simulate_checkout(jsonb,text) TO authenticated;

CREATE FUNCTION public.customer_recover_simulated_checkout(p_request_key uuid,p_proof text DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $fn$
DECLARE a text:=public.requesting_user_id(); o public.admin_order_records;
BEGIN
 IF a IS NULL OR char_length(a)>256 THEN PERFORM public.phase3_fail('unauthenticated'); END IF;
 IF p_request_key IS NULL THEN PERFORM public.phase3_fail('invalid_input'); END IF;
 -- Serialize the bounded closure count, then compete with creation on its exact key lock.
 PERFORM pg_advisory_xact_lock(hashtextextended('simulation_recovery:'||a,0));
 PERFORM pg_advisory_xact_lock(hashtextextended('simulation_order:'||a||':'||p_request_key::text,0));
 SELECT * INTO o FROM public.admin_order_records
 WHERE customer_subject=a AND request_key=p_request_key AND environment='simulation';
 IF FOUND THEN RETURN jsonb_build_object('state','created','order',public.simulation_order_json(o)); END IF;
 IF EXISTS(SELECT 1 FROM public.commerce_simulation_closed_requests WHERE subject=a AND request_key=p_request_key)
 THEN RETURN jsonb_build_object('state','not_created'); END IF;
 IF p_proof IS NULL OR char_length(p_proof) NOT BETWEEN 32 AND 256
 THEN PERFORM public.phase3_fail('forbidden'); END IF;
 IF NOT EXISTS(SELECT 1 FROM public.commerce_simulation_actors WHERE subject=a AND proof_hash=encode(sha256(convert_to(p_proof,'UTF8')),'hex'))
 THEN PERFORM public.phase3_fail('forbidden'); END IF;
 IF (SELECT count(*) FROM public.commerce_simulation_closed_requests WHERE subject=a)>=100
 THEN PERFORM public.phase3_fail('recovery_limit'); END IF;
 INSERT INTO public.commerce_simulation_closed_requests(subject,request_key) VALUES(a,p_request_key);
 RETURN jsonb_build_object('state','not_created');
END $fn$;
REVOKE ALL ON FUNCTION public.customer_recover_simulated_checkout(uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.customer_recover_simulated_checkout(uuid,text) TO authenticated;
