-- Match checkout creation bounds at the direct RPC boundary.
CREATE OR REPLACE FUNCTION public.customer_simulation_capabilities(p_proof text) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $fn$
DECLARE a text:=public.requesting_user_id(); c public.commerce_simulation_actors;
BEGIN
 IF a IS NULL OR char_length(a)>256 THEN PERFORM public.phase3_fail('unauthenticated'); END IF;
 IF p_proof IS NULL OR char_length(p_proof) NOT BETWEEN 32 AND 256 THEN RETURN jsonb_build_object('simulationAvailable',false); END IF;
 SELECT * INTO c FROM public.commerce_simulation_actors WHERE subject=a;
 IF NOT FOUND OR c.proof_hash<>encode(sha256(convert_to(p_proof,'UTF8')),'hex') THEN RETURN jsonb_build_object('simulationAvailable',false); END IF;
 RETURN jsonb_build_object('simulationAvailable',true,'fictionalShippingPaise',c.fictional_shipping_paise,'fictionalTaxPaise',c.fictional_tax_paise);
END $fn$;
REVOKE ALL ON FUNCTION public.customer_simulation_capabilities(text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.customer_simulation_capabilities(text) TO authenticated;
