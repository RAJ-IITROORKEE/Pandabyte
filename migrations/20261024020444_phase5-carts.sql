-- Additive development cart slice; no reservations or order/payment mutations.
-- Rollback with a reviewed forward migration after exporting any saved carts;
-- remove app callers first and never drop populated customer data implicitly.
CREATE TABLE public.customer_carts (
  user_id text PRIMARY KEY CHECK (char_length(user_id) BETWEEN 1 AND 256),
  version bigint NOT NULL DEFAULT 1 CHECK (version BETWEEN 1 AND 9007199254740991),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.customer_cart_items (
  user_id text NOT NULL REFERENCES public.customer_carts(user_id) ON DELETE CASCADE,
  variant_id uuid NOT NULL REFERENCES public.catalog_variants(id) ON DELETE RESTRICT,
  quantity smallint NOT NULL CHECK (quantity BETWEEN 1 AND 99),
  PRIMARY KEY (user_id,variant_id)
);
CREATE INDEX customer_cart_items_variant_idx ON public.customer_cart_items(variant_id);
ALTER TABLE public.customer_carts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_cart_items ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.customer_carts,public.customer_cart_items FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.customer_carts,public.customer_cart_items TO authenticated;
CREATE POLICY customer_carts_read_own ON public.customer_carts FOR SELECT TO authenticated
  USING (user_id=(SELECT public.requesting_user_id()));
CREATE POLICY customer_cart_items_read_own ON public.customer_cart_items FOR SELECT TO authenticated
  USING (user_id=(SELECT public.requesting_user_id()));

CREATE FUNCTION public.phase5_validate_cart_items(p_items jsonb)
RETURNS void LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,public,pg_temp AS $fn$
DECLARE v_item jsonb;
BEGIN
  IF jsonb_typeof(p_items) IS DISTINCT FROM 'array' THEN PERFORM public.phase3_fail('invalid_input'); END IF;
  IF jsonb_array_length(p_items)>50 THEN PERFORM public.phase3_fail('invalid_input'); END IF;
  IF octet_length(p_items::text)>8192 THEN PERFORM public.phase3_fail('invalid_input'); END IF;
  FOR v_item IN SELECT value FROM jsonb_array_elements(p_items) LOOP
    IF jsonb_typeof(v_item) IS DISTINCT FROM 'object' THEN PERFORM public.phase3_fail('invalid_input'); END IF;
    IF (SELECT count(*) FROM jsonb_object_keys(v_item))<>2
      OR jsonb_typeof(v_item->'variantId') IS DISTINCT FROM 'string'
      OR (v_item->>'variantId') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      OR jsonb_typeof(v_item->'quantity') IS DISTINCT FROM 'number'
      OR (v_item->>'quantity') !~ '^[1-9][0-9]?$'
    THEN PERFORM public.phase3_fail('invalid_input'); END IF;
  END LOOP;
  IF (SELECT count(*)<>count(DISTINCT (value->>'variantId')::uuid) FROM jsonb_array_elements(p_items))
  THEN PERFORM public.phase3_fail('invalid_input'); END IF;
END $fn$;
REVOKE ALL ON FUNCTION public.phase5_validate_cart_items(jsonb) FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.published_quote_cart(p_items jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $fn$
DECLARE
  v_item jsonb; v_product record; v_lines jsonb:='[]'; v_variant jsonb;
  v_price bigint; v_total bigint; v_subtotal bigint:=0; v_all_priced boolean:=true;
  v_ready boolean:=true; v_quantity integer; v_issue text;
BEGIN
  PERFORM public.phase5_validate_cart_items(p_items);
  FOR v_item IN SELECT value FROM jsonb_array_elements(p_items) LOOP
    v_quantity:=(v_item->>'quantity')::integer;
    SELECT r.id product_id,rev.id revision_id,rev.slug,rev.title,
      public.phase3_public_variant_json(j.value,rev.document) variant
      INTO v_product
    FROM public.catalog_variants cv
    JOIN public.cms_records r ON r.id=cv.product_id AND r.kind='product' AND r.archived_at IS NULL
    JOIN public.cms_live_routes route ON route.record_id=r.id AND route.revision_id=r.published_revision_id AND route.kind='product'
    JOIN public.cms_revisions rev ON rev.id=r.published_revision_id AND rev.record_id=r.id
    CROSS JOIN LATERAL jsonb_array_elements(rev.document->'variants') j(value)
    WHERE cv.id=(v_item->>'variantId')::uuid AND cv.archived_at IS NULL
      AND (j.value->>'id')::uuid=cv.id;
    v_variant:=v_product.variant;
    v_price:=(v_variant->>'effectivePricePaise')::bigint;
    v_total:=v_price*v_quantity;
    v_issue:=CASE WHEN v_variant IS NULL THEN 'not_available'
      WHEN v_price IS NULL THEN 'price_unavailable'
      WHEN v_variant->>'availability'='unavailable' THEN 'quantity_unavailable' ELSE NULL END;
    v_lines:=v_lines||jsonb_build_array(jsonb_build_object(
      'variantId',lower(v_item->>'variantId'),'quantity',v_quantity,
      'productId',v_product.product_id,'revisionId',v_product.revision_id,
      'slug',v_product.slug,'title',v_product.title,'variant',v_variant,
      'lineTotalPaise',v_total,'issue',v_issue));
    IF v_total IS NULL THEN v_all_priced:=false; ELSE v_subtotal:=v_subtotal+v_total; END IF;
    IF v_issue IS NOT NULL THEN v_ready:=false; END IF;
  END LOOP;
  RETURN jsonb_build_object('lines',v_lines,'subtotalPaise',CASE WHEN v_all_priced THEN v_subtotal ELSE NULL END,
    'readyForCheckout',v_ready AND jsonb_array_length(p_items)>0);
END $fn$;
REVOKE ALL ON FUNCTION public.published_quote_cart(jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.published_quote_cart(jsonb) TO anon,authenticated;

CREATE FUNCTION public.customer_get_cart()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $fn$
DECLARE v_actor text:=public.requesting_user_id(); v_version bigint; v_items jsonb;
BEGIN
  IF v_actor IS NULL THEN PERFORM public.phase3_fail('unauthenticated'); END IF;
  -- STABLE keeps version, items and publication/price reads on one statement snapshot.
  SELECT c.version,COALESCE((SELECT jsonb_agg(jsonb_build_object('variantId',i.variant_id,'quantity',i.quantity) ORDER BY i.variant_id)
    FROM public.customer_cart_items i WHERE i.user_id=c.user_id),'[]')
    INTO v_version,v_items FROM public.customer_carts c WHERE c.user_id=v_actor;
  v_items:=COALESCE(v_items,'[]');
  RETURN jsonb_build_object('version',COALESCE(v_version,0),'items',v_items,'quote',public.published_quote_cart(v_items));
END $fn$;
REVOKE ALL ON FUNCTION public.customer_get_cart() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.customer_get_cart() TO authenticated;

CREATE FUNCTION public.customer_replace_cart(p_expected_version bigint,p_items jsonb)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $fn$
DECLARE v_actor text:=public.requesting_user_id(); v_version bigint; v_line jsonb;
BEGIN
  IF v_actor IS NULL THEN PERFORM public.phase3_fail('unauthenticated'); END IF;
  IF p_expected_version IS NULL OR p_expected_version NOT BETWEEN 0 AND 9007199254740990
    THEN PERFORM public.phase3_fail('invalid_input'); END IF;
  PERFORM public.phase5_validate_cart_items(p_items);
  PERFORM pg_advisory_xact_lock(hashtextextended('customer_cart:'||v_actor,0));
  SELECT version INTO v_version FROM public.customer_carts WHERE user_id=v_actor FOR UPDATE;
  IF COALESCE(v_version,0)<>p_expected_version THEN PERFORM public.phase3_fail('version_conflict'); END IF;
  FOR v_line IN SELECT value FROM jsonb_array_elements(public.published_quote_cart(p_items)->'lines') LOOP
    IF v_line->>'issue'='not_available' AND NOT EXISTS (
      SELECT 1 FROM public.customer_cart_items WHERE user_id=v_actor AND variant_id=(v_line->>'variantId')::uuid
    ) THEN PERFORM public.phase3_fail('item_unavailable'); END IF;
  END LOOP;
  IF v_version IS NULL THEN INSERT INTO public.customer_carts(user_id) VALUES(v_actor);
  ELSE UPDATE public.customer_carts SET version=version+1,updated_at=now() WHERE user_id=v_actor; END IF;
  DELETE FROM public.customer_cart_items WHERE user_id=v_actor;
  INSERT INTO public.customer_cart_items(user_id,variant_id,quantity)
    SELECT v_actor,(value->>'variantId')::uuid,(value->>'quantity')::smallint FROM jsonb_array_elements(p_items);
  RETURN public.customer_get_cart();
END $fn$;
REVOKE ALL ON FUNCTION public.customer_replace_cart(bigint,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.customer_replace_cart(bigint,jsonb) TO authenticated;
