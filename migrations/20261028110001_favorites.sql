-- Additive development-only favorites. Rollback requires a reviewed forward migration;
-- remove callers first and preserve customer data before removing these tables.
CREATE TABLE public.customer_favorites (
  user_id text PRIMARY KEY CHECK (char_length(user_id) BETWEEN 1 AND 256),
  version bigint NOT NULL DEFAULT 1 CHECK (version BETWEEN 1 AND 9007199254740991),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.customer_favorite_items (
  user_id text NOT NULL REFERENCES public.customer_favorites(user_id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.cms_records(id) ON DELETE RESTRICT,
  PRIMARY KEY (user_id, product_id)
);
ALTER TABLE public.customer_favorites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_favorite_items ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.customer_favorites, public.customer_favorite_items FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.customer_favorites, public.customer_favorite_items TO authenticated;
CREATE POLICY customer_favorites_read_own ON public.customer_favorites FOR SELECT TO authenticated
  USING (user_id=(SELECT public.requesting_user_id()));
CREATE POLICY customer_favorite_items_read_own ON public.customer_favorite_items FOR SELECT TO authenticated
  USING (user_id=(SELECT public.requesting_user_id()));

CREATE FUNCTION public.customer_get_favorites()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $fn$
DECLARE v_actor text:=public.requesting_user_id(); v_version bigint; v_items jsonb;
BEGIN
  IF v_actor IS NULL THEN PERFORM public.phase3_fail('unauthenticated'); END IF;
  SELECT f.version, COALESCE((SELECT jsonb_agg(jsonb_build_object(
    'productId', i.product_id, 'title', rev.title, 'slug', rev.slug) ORDER BY i.product_id)
    FROM public.customer_favorite_items i
    LEFT JOIN public.cms_records r ON r.id=i.product_id AND r.kind='product' AND r.archived_at IS NULL
    LEFT JOIN public.cms_live_routes route ON route.record_id=r.id AND route.revision_id=r.published_revision_id AND route.kind='product'
    LEFT JOIN public.cms_revisions rev ON rev.id=route.revision_id AND rev.record_id=r.id
    WHERE i.user_id=f.user_id), '[]'::jsonb)
    INTO v_version,v_items FROM public.customer_favorites f WHERE f.user_id=v_actor;
  RETURN jsonb_build_object('version',COALESCE(v_version,0),'items',COALESCE(v_items,'[]'::jsonb));
END $fn$;
REVOKE ALL ON FUNCTION public.customer_get_favorites() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.customer_get_favorites() TO authenticated;

CREATE FUNCTION public.customer_replace_favorites(p_expected_version bigint,p_product_ids jsonb)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $fn$
DECLARE v_actor text:=public.requesting_user_id(); v_version bigint; v_item jsonb;
BEGIN
  IF v_actor IS NULL THEN PERFORM public.phase3_fail('unauthenticated'); END IF;
  IF p_expected_version IS NULL OR p_expected_version NOT BETWEEN 0 AND 9007199254740990
    OR jsonb_typeof(p_product_ids) IS DISTINCT FROM 'array' THEN PERFORM public.phase3_fail('invalid_input'); END IF;
  IF jsonb_array_length(p_product_ids)>50 OR octet_length(p_product_ids::text)>8192 THEN PERFORM public.phase3_fail('invalid_input'); END IF;
  FOR v_item IN SELECT value FROM jsonb_array_elements(p_product_ids) LOOP
    IF jsonb_typeof(v_item) IS DISTINCT FROM 'string'
      OR (v_item #>> '{}') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    THEN PERFORM public.phase3_fail('invalid_input'); END IF;
  END LOOP;
  IF (SELECT count(*)<>count(DISTINCT (value #>> '{}')::uuid) FROM jsonb_array_elements(p_product_ids))
    THEN PERFORM public.phase3_fail('invalid_input'); END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('customer_favorites:'||v_actor,0));
  SELECT version INTO v_version FROM public.customer_favorites WHERE user_id=v_actor FOR UPDATE;
  IF COALESCE(v_version,0)<>p_expected_version THEN PERFORM public.phase3_fail('version_conflict'); END IF;
  FOR v_item IN SELECT value FROM jsonb_array_elements(p_product_ids) LOOP
    IF NOT EXISTS (SELECT 1 FROM public.customer_favorite_items i WHERE i.user_id=v_actor AND i.product_id=(v_item #>> '{}')::uuid)
      AND NOT EXISTS (SELECT 1 FROM public.cms_records r
        JOIN public.cms_live_routes route ON route.record_id=r.id AND route.revision_id=r.published_revision_id AND route.kind='product'
        JOIN public.cms_revisions rev ON rev.id=route.revision_id AND rev.record_id=r.id
        WHERE r.id=(v_item #>> '{}')::uuid AND r.kind='product' AND r.archived_at IS NULL)
      THEN PERFORM public.phase3_fail('item_unavailable'); END IF;
  END LOOP;
  IF v_version IS NULL THEN INSERT INTO public.customer_favorites(user_id) VALUES(v_actor);
  ELSE UPDATE public.customer_favorites SET version=version+1,updated_at=now() WHERE user_id=v_actor; END IF;
  DELETE FROM public.customer_favorite_items WHERE user_id=v_actor;
  INSERT INTO public.customer_favorite_items(user_id,product_id)
    SELECT v_actor,(value #>> '{}')::uuid FROM jsonb_array_elements(p_product_ids);
  RETURN public.customer_get_favorites();
END $fn$;
REVOKE ALL ON FUNCTION public.customer_replace_favorites(bigint,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.customer_replace_favorites(bigint,jsonb) TO authenticated;
