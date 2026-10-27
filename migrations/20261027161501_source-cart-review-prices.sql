-- Owner-authorized source cart review. Stored captured prices become provisional
-- cart amounts; source provenance, unknown stock and all Admin guards remain intact.
-- No data, inventory, reservations, orders or payment state is changed.
-- Roll back with a forward function replacement; preserve saved cart lines.
CREATE OR REPLACE FUNCTION public.phase3_public_variant_json(p_variant jsonb,p_document jsonb)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $f$
 SELECT jsonb_build_object(
   'id',cv.id,'sku',p_variant->>'sku','label',p_variant->>'label',
   'regularPricePaise',cv.regular_paise,'effectivePricePaise',public.catalog_effective_price(cv),
   'isOnSale',COALESCE(public.catalog_effective_price(cv)<cv.regular_paise,false)
     OR (cv.sale_paise IS NOT NULL AND now()>=cv.sale_from AND now()<cv.sale_until),
   'saleEndsAt',CASE WHEN cv.sale_paise IS NOT NULL AND now()>=cv.sale_from AND now()<cv.sale_until THEN cv.sale_until ELSE NULL END,
   'availability',CASE WHEN p_document ? 'sourceObservation' THEN 'unavailable'
     WHEN COALESCE(ib.available_quantity,0)>0 THEN 'available' ELSE 'unavailable' END
 ) || CASE WHEN p_document ? 'sourceObservation' THEN jsonb_build_object(
   'cartEligible',cv.regular_paise IS NOT NULL AND public.catalog_effective_price(cv) IS NOT NULL
 ) ELSE '{}'::jsonb END
 FROM public.catalog_variants cv LEFT JOIN public.inventory_balances ib ON ib.variant_id=cv.id
 WHERE cv.id=(p_variant->>'id')::uuid AND cv.product_id IS NOT NULL AND cv.archived_at IS NULL
$f$;

CREATE OR REPLACE FUNCTION public.published_quote_cart(p_items jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
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
END $function$;
