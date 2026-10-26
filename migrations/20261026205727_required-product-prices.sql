-- Owner-approved Admin Set/Actual prices; source-only publication and purchasing status remain unchanged.
-- Forward rollback: restore callers first; keep additive actual prices and audit history.
ALTER TABLE public.catalog_variants ADD COLUMN actual_paise bigint;
ALTER TABLE public.variant_price_events ADD COLUMN actual_paise bigint;
UPDATE public.catalog_variants SET actual_paise=regular_paise WHERE regular_paise IS NOT NULL;
ALTER TABLE public.catalog_variants ADD CONSTRAINT catalog_variants_actual_check CHECK(actual_paise IS NULL OR (regular_paise IS NOT NULL AND actual_paise BETWEEN 0 AND regular_paise AND actual_paise<=10000000000 AND (sale_paise IS NULL OR sale_paise<=actual_paise)));
ALTER TABLE public.variant_price_events ADD CONSTRAINT variant_price_actual_check CHECK(actual_paise IS NULL OR (regular_paise IS NOT NULL AND actual_paise BETWEEN 0 AND regular_paise AND actual_paise<=10000000000 AND (sale_paise IS NULL OR sale_paise<=actual_paise)));

CREATE FUNCTION public.catalog_effective_price(v public.catalog_variants)
RETURNS bigint LANGUAGE sql STABLE SET search_path=pg_catalog,public AS $f$
 SELECT CASE WHEN v.sale_paise IS NOT NULL AND v.sale_from<=now() AND now()<v.sale_until THEN v.sale_paise ELSE COALESCE(v.actual_paise,v.regular_paise) END
$f$;
REVOKE ALL ON FUNCTION public.catalog_effective_price(public.catalog_variants) FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.admin_set_variant_price(p_variant_id uuid,p_expected_version bigint,p_regular_paise bigint,p_actual_paise bigint,p_sale_paise bigint,p_sale_from timestamptz,p_sale_until timestamptz,p_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $f$
DECLARE actor text; v public.catalog_variants; next_version bigint;
BEGIN
 actor:=public.admin_assert_capability('catalog.edit');
 IF p_variant_id IS NULL OR p_expected_version IS NULL OR p_expected_version<0 OR p_regular_paise IS NULL OR p_regular_paise NOT BETWEEN 0 AND 10000000000 OR p_actual_paise IS NULL OR p_actual_paise NOT BETWEEN 0 AND p_regular_paise OR p_reason IS NULL OR char_length(btrim(p_reason)) NOT BETWEEN 1 AND 500 OR (p_sale_paise IS NULL AND (p_sale_from IS NOT NULL OR p_sale_until IS NOT NULL)) OR (p_sale_paise IS NOT NULL AND (p_sale_paise NOT BETWEEN 0 AND p_actual_paise OR p_sale_from IS NULL OR p_sale_until IS NULL OR p_sale_from>=p_sale_until)) THEN PERFORM public.phase3_fail('invalid_input'); END IF;
 PERFORM pg_advisory_xact_lock(832641);
 SELECT * INTO v FROM public.catalog_variants WHERE id=p_variant_id FOR UPDATE;
 IF NOT FOUND THEN PERFORM public.phase3_fail('not_found'); END IF;
 IF v.archived_at IS NOT NULL OR EXISTS(SELECT 1 FROM public.cms_records WHERE id=v.product_id AND archived_at IS NOT NULL) THEN PERFORM public.phase3_fail('invalid_state'); END IF;
 IF v.price_version<>p_expected_version THEN PERFORM public.phase3_fail('version_conflict'); END IF;
 next_version:=v.price_version+1;
 UPDATE public.catalog_variants SET regular_paise=p_regular_paise,actual_paise=p_actual_paise,sale_paise=p_sale_paise,sale_from=p_sale_from,sale_until=p_sale_until,price_version=next_version,updated_at=now() WHERE id=p_variant_id;
 INSERT INTO public.variant_price_events(variant_id,version,regular_paise,actual_paise,sale_paise,sale_from,sale_until,actor,reason) VALUES(p_variant_id,next_version,p_regular_paise,p_actual_paise,p_sale_paise,p_sale_from,p_sale_until,actor,btrim(p_reason));
 PERFORM public.admin_write_audit(actor,'variant.price.set','variant',p_variant_id,jsonb_build_object('version',next_version,'regularPaise',p_regular_paise,'actualPaise',p_actual_paise,'salePaise',p_sale_paise,'saleFrom',p_sale_from,'saleUntil',p_sale_until),p_reason);
 RETURN jsonb_build_object('variant',public.phase3_admin_variant_json(p_variant_id,actor));
END $f$;
REVOKE ALL ON FUNCTION public.admin_set_variant_price(uuid,bigint,bigint,bigint,bigint,timestamptz,timestamptz,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_variant_price(uuid,bigint,bigint,bigint,bigint,timestamptz,timestamptz,text) TO authenticated;

-- Keep legacy callers and their source-only restriction; explicit Set/Actual writes use the overload above.
CREATE OR REPLACE FUNCTION public.admin_set_variant_price(p_variant_id uuid,p_expected_version bigint,p_regular_paise bigint,p_sale_paise bigint,p_sale_from timestamptz,p_sale_until timestamptz,p_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $f$
DECLARE v public.catalog_variants; actual bigint;
BEGIN
 PERFORM public.admin_assert_capability('catalog.edit');
 PERFORM pg_advisory_xact_lock(832641);
 SELECT * INTO v FROM public.catalog_variants WHERE id=p_variant_id FOR UPDATE;
 IF NOT FOUND THEN PERFORM public.phase3_fail('not_found'); END IF;
 IF EXISTS(SELECT 1 FROM public.cms_records r LEFT JOIN public.cms_revisions rev ON rev.id=r.published_revision_id WHERE r.id=v.product_id AND (r.draft ? 'sourceObservation' OR rev.document ? 'sourceObservation')) THEN PERFORM public.phase3_fail('invalid_state'); END IF;
 actual:=p_regular_paise;
 RETURN public.admin_set_variant_price(p_variant_id,p_expected_version,p_regular_paise,actual,p_sale_paise,p_sale_from,p_sale_until,p_reason);
END $f$;

ALTER FUNCTION public.phase3_admin_variant_json(uuid,text) RENAME TO required_prices_admin_variant_before;
CREATE FUNCTION public.phase3_admin_variant_json(p_variant_id uuid,p_subject text)
RETURNS jsonb LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $f$
 SELECT public.required_prices_admin_variant_before(p_variant_id,p_subject)||jsonb_build_object('actualPaise',CASE WHEN EXISTS(SELECT 1 FROM public.staff_capabilities WHERE user_id=p_subject AND capability='catalog.edit') THEN v.actual_paise ELSE NULL END) FROM public.catalog_variants v WHERE v.id=p_variant_id
$f$;
REVOKE ALL ON FUNCTION public.phase3_admin_variant_json(uuid,text),public.required_prices_admin_variant_before(uuid,text) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.admin_list_product_prices(p_product_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $f$
DECLARE actor text; r public.cms_records; source_only boolean;
BEGIN
 actor:=public.admin_assert_capability('catalog.edit');
 SELECT * INTO r FROM public.cms_records WHERE id=p_product_id AND kind='product' AND archived_at IS NULL;
 IF NOT FOUND THEN PERFORM public.phase3_fail('not_found'); END IF;
 source_only:=r.draft ? 'sourceObservation' OR EXISTS(SELECT 1 FROM public.cms_revisions WHERE id=r.published_revision_id AND document ? 'sourceObservation');
 RETURN jsonb_build_object('sourceObservation',source_only,'items',COALESCE((SELECT jsonb_agg((public.phase3_admin_variant_json(v.id,actor)||jsonb_build_object('stock',NULL,'stockVersion',NULL)) ORDER BY v.sku,v.id) FROM (SELECT id,sku FROM public.catalog_variants WHERE product_id=p_product_id AND archived_at IS NULL ORDER BY sku,id LIMIT 100) v),'[]'::jsonb));
END $f$;

CREATE OR REPLACE FUNCTION public.phase3_public_variant_json(p_variant jsonb,p_document jsonb)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $f$
 SELECT CASE WHEN p_document ? 'sourceObservation' THEN jsonb_build_object('id',cv.id,'sku',p_variant->>'sku','label',p_variant->>'label','regularPricePaise',NULL,'effectivePricePaise',NULL,'isOnSale',false,'saleEndsAt',NULL,'availability','unavailable')
 ELSE jsonb_build_object('id',cv.id,'sku',p_variant->>'sku','label',p_variant->>'label','regularPricePaise',cv.regular_paise,'effectivePricePaise',public.catalog_effective_price(cv),
 'isOnSale',COALESCE(public.catalog_effective_price(cv)<cv.regular_paise,false) OR (cv.sale_paise IS NOT NULL AND now()>=cv.sale_from AND now()<cv.sale_until),
 'saleEndsAt',CASE WHEN cv.sale_paise IS NOT NULL AND now()>=cv.sale_from AND now()<cv.sale_until THEN cv.sale_until ELSE NULL END,'availability',CASE WHEN COALESCE(ib.available_quantity,0)>0 THEN 'available' ELSE 'unavailable' END) END
 FROM public.catalog_variants cv LEFT JOIN public.inventory_balances ib ON ib.variant_id=cv.id WHERE cv.id=(p_variant->>'id')::uuid AND cv.product_id IS NOT NULL AND cv.archived_at IS NULL
$f$;

CREATE OR REPLACE FUNCTION public.admin_save_product_with_prices(p_id uuid,p_expected_version bigint,p_document jsonb,p_prices jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $f$
DECLARE result jsonb; saved_id uuid; entry jsonb; variant_id uuid;
BEGIN
 PERFORM public.admin_assert_capability('catalog.edit');
 IF p_prices IS NULL OR jsonb_typeof(p_prices) IS DISTINCT FROM 'array' OR jsonb_array_length(p_prices)>100 THEN PERFORM public.phase3_fail('invalid_input'); END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_prices) e GROUP BY lower(e->>'sku') HAVING count(*)>1) THEN PERFORM public.phase3_fail('invalid_input'); END IF;
 result:=public.admin_save_record(p_id,'product',p_expected_version,p_document);
 saved_id:=(result->'record'->>'id')::uuid;
 FOR entry IN SELECT value FROM jsonb_array_elements(p_prices) ORDER BY value->>'sku' LOOP
  IF jsonb_typeof(entry) IS DISTINCT FROM 'object' OR NOT(entry ?& ARRAY['sku','expectedPriceVersion','regularPricePaise','salePricePaise','saleStartsAt','saleEndsAt','reason']) OR EXISTS(SELECT 1 FROM jsonb_object_keys(entry) k WHERE k NOT IN ('sku','expectedPriceVersion','regularPricePaise','salePricePaise','saleStartsAt','saleEndsAt','reason','actualPricePaise')) OR jsonb_typeof(entry->'sku') IS DISTINCT FROM 'string' OR jsonb_typeof(entry->'expectedPriceVersion') IS DISTINCT FROM 'number' OR (entry->>'expectedPriceVersion') !~ '^[0-9]+$' OR jsonb_typeof(entry->'regularPricePaise') IS DISTINCT FROM 'number' OR (entry->>'regularPricePaise') !~ '^[0-9]+$' OR (entry->'salePricePaise'<>'null'::jsonb AND (jsonb_typeof(entry->'salePricePaise') IS DISTINCT FROM 'number' OR (entry->>'salePricePaise') !~ '^[0-9]+$')) OR jsonb_typeof(entry->'reason') IS DISTINCT FROM 'string' THEN PERFORM public.phase3_fail('invalid_input'); END IF;
  SELECT id INTO variant_id FROM public.catalog_variants WHERE product_id=saved_id AND sku=entry->>'sku' AND archived_at IS NULL;
  IF NOT FOUND THEN PERFORM public.phase3_fail('invalid_input'); END IF;
  IF entry ? 'actualPricePaise' THEN
   IF jsonb_typeof(entry->'actualPricePaise') IS DISTINCT FROM 'number' OR entry->>'actualPricePaise' !~ '^[0-9]+$' THEN PERFORM public.phase3_fail('invalid_input'); END IF;
   PERFORM public.admin_set_variant_price(variant_id,(entry->>'expectedPriceVersion')::bigint,(entry->>'regularPricePaise')::bigint,(entry->>'actualPricePaise')::bigint,(entry->>'salePricePaise')::bigint,(entry->>'saleStartsAt')::timestamptz,(entry->>'saleEndsAt')::timestamptz,entry->>'reason');
  ELSE
  PERFORM public.admin_set_variant_price(variant_id,(entry->>'expectedPriceVersion')::bigint,(entry->>'regularPricePaise')::bigint,(entry->>'salePricePaise')::bigint,(entry->>'saleStartsAt')::timestamptz,(entry->>'saleEndsAt')::timestamptz,entry->>'reason');
  END IF;
 END LOOP;
 RETURN result;
EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range OR invalid_datetime_format OR datetime_field_overflow THEN PERFORM public.phase3_fail('invalid_input');
END $f$;

CREATE OR REPLACE FUNCTION public.admin_transition_record(p_id uuid, p_expected_version bigint, p_action text, p_revision_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
DECLARE
  v_subject text;
  v_required_capability text;
  v_record public.cms_records%ROWTYPE;
  v_revision public.cms_revisions%ROWTYPE;
  v_old_route public.cms_live_routes%ROWTYPE;
  v_document jsonb;
  v_revision_id uuid;
  v_revision_number bigint;
  v_path text;
  v_previous_slug text;
  v_previous_path text;
  v_new_version bigint;
  v_has_old_route boolean := false;
BEGIN
  IF p_id IS NULL OR p_expected_version IS NULL OR p_expected_version < 1
    OR p_action IS NULL OR p_action NOT IN ('publish','unpublish','archive','restore')
    OR (p_action = 'restore' AND p_revision_id IS NULL)
    OR (p_action <> 'restore' AND p_revision_id IS NOT NULL) THEN
    PERFORM public.phase3_fail('invalid_input');
  END IF;
  v_subject := public.requesting_user_id();
  IF v_subject IS NULL OR char_length(v_subject) NOT BETWEEN 1 AND 256 THEN
    PERFORM public.phase3_fail('unauthenticated');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.staff_capabilities sc
      WHERE sc.user_id = v_subject AND sc.capability IN ('catalog.edit','content.edit')) THEN
    PERFORM public.phase3_fail('forbidden');
  END IF;
  PERFORM pg_advisory_xact_lock(832641);
  SELECT r.* INTO v_record FROM public.cms_records r WHERE r.id = p_id FOR UPDATE;
  IF NOT FOUND THEN PERFORM public.phase3_fail('not_found'); END IF;
  v_required_capability := CASE WHEN v_record.kind IN ('product','category') THEN 'catalog.edit' ELSE 'content.edit' END;
  v_subject := public.admin_assert_capability(v_required_capability);
  IF p_action <> 'restore' THEN
    PERFORM public.admin_assert_capability('content.publish');
  END IF;
  IF v_record.version <> p_expected_version THEN PERFORM public.phase3_fail('version_conflict'); END IF;
  v_new_version := v_record.version + 1;

  IF p_action = 'restore' THEN
    SELECT rev.* INTO v_revision FROM public.cms_revisions rev
      WHERE rev.record_id = p_id AND rev.id = p_revision_id;
    IF NOT FOUND THEN PERFORM public.phase3_fail('not_found'); END IF;
    v_document := v_revision.document;
    PERFORM public.phase3_validate_document(v_record.kind, v_document);
    PERFORM public.phase3_validate_media_refs(v_document, false);
    IF v_record.kind = 'category' THEN
      PERFORM public.phase3_validate_category_parent(p_id, v_document, false);
    ELSIF v_record.kind IN ('product','resource','video') THEN
      PERFORM public.phase3_validate_product_references(v_record.kind, p_id, v_document, false);
    END IF;
    IF v_record.kind = 'product' THEN
      v_document := public.phase3_sync_product_variants(p_id, v_document);
    END IF;
    UPDATE public.cms_records
      SET title = v_document->>'title', slug = v_document->>'slug', draft = v_document,
          draft_source_revision_id = p_revision_id, archived_at = NULL, archived_by = NULL,
          version = v_new_version, updated_by = v_subject, updated_at = now()
      WHERE id = p_id;
    PERFORM public.admin_write_audit(v_subject, 'record.restore', v_record.kind, p_id,
      jsonb_build_object('version', v_new_version, 'sourceRevisionId', p_revision_id));
  ELSIF p_action = 'publish' THEN
    IF v_record.archived_at IS NOT NULL THEN PERFORM public.phase3_fail('invalid_state'); END IF;
    v_document := v_record.draft;
    PERFORM public.phase3_validate_document(v_record.kind, v_document);
    PERFORM public.phase3_validate_media_refs(v_document, true);
    IF v_record.kind = 'category' THEN
      PERFORM public.phase3_validate_category_parent(p_id, v_document, true);
    ELSIF v_record.kind IN ('product','resource','video') THEN
      PERFORM public.phase3_validate_product_references(v_record.kind, p_id, v_document, true);
    END IF;
    IF v_record.kind = 'product' THEN
      v_document := public.phase3_sync_product_variants(p_id, v_document);
      IF NOT (v_document ? 'sourceObservation') AND EXISTS (
        SELECT 1 FROM public.phase3_jsonb_array_elements(v_document->'variants') AS desired(item)
        JOIN public.catalog_variants cv ON cv.id = (desired.item->>'id')::uuid
        WHERE cv.regular_paise IS NULL
      ) THEN
        PERFORM public.phase3_fail('invalid_state');
      END IF;
      IF v_document ? 'sourceObservation' AND EXISTS (
        SELECT 1 FROM public.catalog_variants cv LEFT JOIN public.inventory_balances ib ON ib.variant_id=cv.id
        WHERE cv.product_id=p_id AND COALESCE(ib.available_quantity,0)<>0
      ) THEN PERFORM public.phase3_fail('invalid_state'); END IF;
      PERFORM cv.id FROM public.catalog_variants cv
        WHERE cv.product_id = p_id AND cv.archived_at IS NULL
          AND NOT EXISTS (SELECT 1 FROM public.phase3_jsonb_array_elements(v_document->'variants') AS desired(item)
            WHERE item->>'id' = cv.id::text)
        ORDER BY cv.id FOR UPDATE;
      IF EXISTS (
        SELECT 1 FROM public.catalog_variants cv
        JOIN public.inventory_balances ib ON ib.variant_id = cv.id
        WHERE cv.product_id = p_id AND cv.archived_at IS NULL
          AND NOT EXISTS (SELECT 1 FROM public.phase3_jsonb_array_elements(v_document->'variants') AS desired(item)
            WHERE item->>'id' = cv.id::text)
          AND ib.available_quantity > 0
      ) THEN
        PERFORM public.phase3_fail('invalid_state');
      END IF;
      UPDATE public.catalog_variants cv
        SET archived_at = now(), updated_at = now()
        WHERE cv.product_id = p_id AND cv.archived_at IS NULL
          AND NOT EXISTS (SELECT 1 FROM public.phase3_jsonb_array_elements(v_document->'variants') AS desired(item)
            WHERE item->>'id' = cv.id::text);
      DELETE FROM public.product_categories WHERE product_id = p_id;
      INSERT INTO public.product_categories (product_id, category_id)
        SELECT p_id, (value #>> '{}')::uuid
        FROM public.phase3_jsonb_array_elements(COALESCE(v_document->'categoryIds','[]'::jsonb)) AS categories(value);
    END IF;
    SELECT route.* INTO v_old_route FROM public.cms_live_routes route WHERE route.record_id = p_id FOR UPDATE;
    v_has_old_route := FOUND;
    v_path := public.phase3_route_path(v_record.kind, v_document->>'slug');
    IF v_path IS NULL THEN PERFORM public.phase3_fail('invalid_input'); END IF;
    SELECT COALESCE(max(revision_number), 0) + 1 INTO v_revision_number
      FROM public.cms_revisions WHERE record_id = p_id;
    INSERT INTO public.cms_revisions (
      record_id, revision_number, source_version, source_revision_id,
      title, slug, document, published_by
    ) VALUES (
      p_id, v_revision_number, v_record.version, v_record.draft_source_revision_id,
      v_document->>'title', v_document->>'slug', v_document, v_subject
    ) RETURNING id INTO v_revision_id;
    IF EXISTS (SELECT 1 FROM public.cms_slug_redirects redir
        WHERE redir.from_path = v_path AND redir.record_id <> p_id) THEN
      PERFORM public.phase3_fail('duplicate_route');
    END IF;
    DELETE FROM public.cms_slug_redirects WHERE from_path = v_path AND record_id = p_id;
    BEGIN
      INSERT INTO public.cms_live_routes (record_id, kind, slug, path, revision_id, published_at)
      VALUES (p_id, v_record.kind, v_document->>'slug', v_path, v_revision_id, now())
      ON CONFLICT (record_id) DO UPDATE SET
        kind = EXCLUDED.kind, slug = EXCLUDED.slug, path = EXCLUDED.path,
        revision_id = EXCLUDED.revision_id, published_at = EXCLUDED.published_at;
    EXCEPTION WHEN unique_violation THEN
      PERFORM public.phase3_fail('duplicate_route');
    END;
    IF v_has_old_route AND v_old_route.path <> v_path THEN
      IF EXISTS (SELECT 1 FROM public.cms_slug_redirects redir
          WHERE redir.from_path = v_old_route.path AND redir.record_id <> p_id) THEN
        PERFORM public.phase3_fail('duplicate_route');
      END IF;
      DELETE FROM public.cms_slug_redirects WHERE from_path = v_old_route.path AND record_id = p_id;
      INSERT INTO public.cms_slug_redirects (from_path, kind, from_slug, record_id, target_path, target_slug)
      VALUES (v_old_route.path, v_old_route.kind, v_old_route.slug, p_id, v_path, v_document->>'slug');
    ELSIF NOT v_has_old_route THEN
      SELECT rev.slug INTO v_previous_slug FROM public.cms_revisions rev
        WHERE rev.record_id = p_id ORDER BY rev.revision_number DESC LIMIT 1;
      IF FOUND THEN
        v_previous_path := public.phase3_route_path(v_record.kind, v_previous_slug);
        IF v_previous_path IS NOT NULL AND v_previous_path <> v_path THEN
          IF EXISTS (SELECT 1 FROM public.cms_slug_redirects redir
              WHERE redir.from_path = v_previous_path AND redir.record_id <> p_id) THEN
            PERFORM public.phase3_fail('duplicate_route');
          END IF;
          DELETE FROM public.cms_slug_redirects WHERE from_path = v_previous_path AND record_id = p_id;
          INSERT INTO public.cms_slug_redirects (from_path, kind, from_slug, record_id, target_path, target_slug)
          VALUES (v_previous_path, v_record.kind, v_previous_slug, p_id, v_path, v_document->>'slug');
        END IF;
      END IF;
    END IF;
    UPDATE public.cms_slug_redirects
      SET target_path = v_path, target_slug = v_document->>'slug', updated_at = now()
      WHERE record_id = p_id AND from_path <> v_path;
    UPDATE public.cms_records
      SET title = v_document->>'title', slug = v_document->>'slug', draft = v_document,
          published_revision_id = v_revision_id, draft_source_revision_id = NULL,
          version = v_new_version, updated_by = v_subject, updated_at = now()
      WHERE id = p_id;
    PERFORM public.admin_write_audit(v_subject, 'record.publish', v_record.kind, p_id,
      jsonb_build_object('version', v_new_version, 'revisionId', v_revision_id,
        'revisionNumber', v_revision_number, 'slug', v_document->>'slug'));
  ELSE
    IF v_record.archived_at IS NOT NULL THEN PERFORM public.phase3_fail('invalid_state'); END IF;
    IF p_action = 'unpublish' AND v_record.published_revision_id IS NULL THEN
      PERFORM public.phase3_fail('invalid_state');
    END IF;
    IF v_record.kind = 'category' AND public.phase3_category_has_dependents(p_id) THEN
      PERFORM public.phase3_fail('invalid_state');
    ELSIF v_record.kind = 'product' AND public.phase3_product_has_dependents(p_id) THEN
      PERFORM public.phase3_fail('invalid_state');
    END IF;
    IF p_action = 'archive' AND v_record.kind = 'product' THEN
      PERFORM cv.id FROM public.catalog_variants cv
        WHERE cv.product_id = p_id AND cv.archived_at IS NULL
        ORDER BY cv.id FOR UPDATE;
      IF EXISTS (
        SELECT 1 FROM public.catalog_variants cv
        JOIN public.inventory_balances ib ON ib.variant_id = cv.id
        WHERE cv.product_id = p_id AND ib.available_quantity > 0
      ) THEN
        PERFORM public.phase3_fail('invalid_state');
      END IF;
    END IF;
    DELETE FROM public.cms_live_routes WHERE record_id = p_id;
    IF v_record.kind = 'product' THEN
      DELETE FROM public.product_categories WHERE product_id = p_id;
      IF p_action = 'archive' THEN
        UPDATE public.catalog_variants SET archived_at = now(), updated_at = now()
          WHERE product_id = p_id AND archived_at IS NULL;
      END IF;
    END IF;
    UPDATE public.cms_records
      SET published_revision_id = NULL,
          archived_at = CASE WHEN p_action = 'archive' THEN now() ELSE archived_at END,
          archived_by = CASE WHEN p_action = 'archive' THEN v_subject ELSE archived_by END,
          version = v_new_version, updated_by = v_subject, updated_at = now()
      WHERE id = p_id;
    PERFORM public.admin_write_audit(v_subject, 'record.' || p_action, v_record.kind, p_id,
      jsonb_build_object('version', v_new_version, 'previousRevisionId', v_record.published_revision_id));
  END IF;
  RETURN jsonb_build_object('record', public.phase3_admin_record_json(p_id));
END
$function$;


CREATE OR REPLACE FUNCTION public.product_editor_list_products_before(p_query text, p_category_ids uuid[], p_min_price_paise bigint, p_max_price_paise bigint, p_availability text, p_sort text, p_limit integer, p_offset integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
DECLARE
  v_query text := btrim(COALESCE(p_query,''));
  v_identifier text := public.catalog_normalize_identifier(v_query);
  v_tsquery tsquery; v_items jsonb; v_total bigint;
BEGIN
  IF char_length(v_query)>120 OR v_query ~ '[[:cntrl:]]' OR p_category_ids IS NULL OR cardinality(p_category_ids)>20
    OR array_position(p_category_ids,NULL) IS NOT NULL
    OR (p_min_price_paise IS NOT NULL AND p_min_price_paise NOT BETWEEN 0 AND 10000000000)
    OR (p_max_price_paise IS NOT NULL AND p_max_price_paise NOT BETWEEN 0 AND 10000000000)
    OR p_min_price_paise>p_max_price_paise OR p_availability IS NULL OR p_availability NOT IN ('all','available','unavailable')
    OR p_sort IS NULL OR p_sort NOT IN ('relevance','newest','price_asc','price_desc','title_asc')
    OR p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 48 OR p_offset IS NULL OR p_offset NOT BETWEEN 0 AND 10000
  THEN PERFORM public.phase3_fail('invalid_input'); END IF;
  v_tsquery := public.catalog_prefix_tsquery(v_query);
  WITH candidates AS (
    SELECT s.*,rev.document,
      CASE WHEN v_identifier<>'' AND s.identifiers @> ARRAY[v_identifier] THEN 1 ELSE 0 END exact_match,
      COALESCE(ts_rank_cd(s.search_text,v_tsquery),0) relevance
    FROM public.catalog_search_documents s
    JOIN public.cms_records r ON r.id=s.product_id AND r.kind='product' AND r.archived_at IS NULL AND r.published_revision_id=s.revision_id
    JOIN public.cms_live_routes route ON route.record_id=s.product_id AND route.revision_id=s.revision_id AND route.kind='product'
    JOIN public.cms_revisions rev ON rev.id=s.revision_id AND rev.record_id=s.product_id
    WHERE (v_query='' OR s.identifiers @> ARRAY[v_identifier] OR s.search_text @@ v_tsquery)
      AND (cardinality(p_category_ids)=0 OR s.category_ids && p_category_ids)
  ), matching AS (
    SELECT c.*,priced.variant_ids,priced.min_price,priced.any_available
    FROM candidates c
    CROSS JOIN LATERAL (
      SELECT array_agg(v.id) FILTER(WHERE p_availability<>'available' OR v.is_available) variant_ids,
        min(v.price) FILTER(WHERE p_availability<>'available' OR v.is_available) min_price,
        bool_or(v.is_available) any_available,count(*) variant_count
      FROM (
        SELECT cv.id,
          CASE WHEN c.document ? 'sourceObservation' THEN NULL ELSE public.catalog_effective_price(cv) END price,
          NOT (c.document ? 'sourceObservation') AND COALESCE(ib.available_quantity,0)>0 is_available
        FROM public.phase3_jsonb_array_elements(c.document->'variants') WITH ORDINALITY j(variant,ordinality)
        JOIN public.catalog_variants cv ON cv.id=(j.variant->>'id')::uuid AND cv.product_id=c.product_id AND cv.archived_at IS NULL
        LEFT JOIN public.inventory_balances ib ON ib.variant_id=cv.id
      ) v
      WHERE (v.price IS NOT NULL OR (c.document ? 'sourceObservation' AND p_min_price_paise IS NULL AND p_max_price_paise IS NULL AND p_availability='all'))
        AND (p_min_price_paise IS NULL OR v.price>=p_min_price_paise)
        AND (p_max_price_paise IS NULL OR v.price<=p_max_price_paise)
    ) priced
    WHERE priced.variant_count>0 AND (NOT (c.document ? 'sourceObservation') OR (p_min_price_paise IS NULL AND p_max_price_paise IS NULL AND p_availability='all'))
      AND (p_availability='all' OR (p_availability='available' AND priced.any_available)
      OR (p_availability='unavailable' AND NOT priced.any_available))
  ), ordered AS (
    SELECT m.*,row_number() OVER(ORDER BY
      CASE WHEN p_sort='relevance' THEN exact_match END DESC,
      CASE WHEN p_sort='relevance' THEN relevance END DESC,
      CASE WHEN p_sort='price_asc' THEN min_price END ASC,
      CASE WHEN p_sort='price_desc' THEN min_price END DESC NULLS LAST,
      CASE WHEN p_sort='title_asc' THEN lower(title) END ASC,
      CASE WHEN p_sort IN ('newest','relevance') THEN published_at END DESC,product_id ASC) row_order
    FROM matching m
  ), page_rows AS (SELECT * FROM ordered ORDER BY row_order LIMIT p_limit OFFSET p_offset)
  SELECT (SELECT count(*) FROM matching),COALESCE((SELECT jsonb_agg(jsonb_build_object(
    'id',product_id,'kind','product','title',title,'slug',slug,'summary',summary,
    'document',public.phase3_public_document('product',document)-'blocks','variants',
      (SELECT jsonb_agg(public.phase3_public_variant_json(j.variant,document) ORDER BY j.ordinality)
       FROM public.phase3_jsonb_array_elements(document->'variants') WITH ORDINALITY j(variant,ordinality)
       WHERE (j.variant->>'id')::uuid=ANY(variant_ids)),
    'revisionId',revision_id,'publishedAt',published_at) ORDER BY row_order) FROM page_rows),'[]'::jsonb)
  INTO v_total,v_items;
  RETURN jsonb_build_object('items',v_items,'total',v_total);
END $function$;

CREATE FUNCTION public.admin_product_price_stats()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $f$
DECLARE result jsonb;
BEGIN
 PERFORM public.admin_assert_capability('catalog.edit');
 WITH products AS (
  SELECT id,draft FROM public.cms_records WHERE kind='product' AND archived_at IS NULL
 ), priced AS (
  SELECT p.id,min(public.catalog_effective_price(v)) AS amount FROM products p JOIN public.catalog_variants v ON v.product_id=p.id AND v.archived_at IS NULL AND v.regular_paise IS NOT NULL GROUP BY p.id
 ), categories AS (
  SELECT c.id,c.title,(SELECT count(*) FROM products p WHERE p.draft->'categoryIds' @> jsonb_build_array(c.id::text)) AS count
  FROM public.cms_records c WHERE c.kind='category' AND c.archived_at IS NULL ORDER BY c.title,c.id LIMIT 500
 ) SELECT jsonb_build_object('totalProducts',(SELECT count(*) FROM products),'unpricedProducts',(SELECT count(*) FROM products)-(SELECT count(*) FROM priced),
 'categories',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',id,'title',title,'count',count) ORDER BY count DESC,title,id) FROM categories),'[]'::jsonb),
 'prices',(SELECT CASE WHEN count(*)=0 THEN NULL ELSE jsonb_build_object('minPaise',min(amount),'maxPaise',max(amount),'avgPaise',round(avg(amount))::bigint,'pricedProducts',count(*)) END FROM priced)) INTO result;
 RETURN result;
END $f$;
REVOKE ALL ON FUNCTION public.admin_product_price_stats() FROM PUBLIC,anon,authenticated;

-- Correct search/price semantics; retain legacy non-product media compatibility. No records change.
CREATE OR REPLACE FUNCTION public.admin_list_products(p_query text DEFAULT '',p_status text DEFAULT 'all',p_category_id uuid DEFAULT NULL,p_sort text DEFAULT 'updated_desc',p_limit integer DEFAULT 20,p_offset integer DEFAULT 0)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $f$
DECLARE result jsonb;
BEGIN
 PERFORM public.admin_assert_capability('catalog.edit');
 IF p_query IS NULL OR char_length(p_query)>120 OR p_query ~ '[[:cntrl:]]' OR p_status IS NULL OR p_status NOT IN ('all','draft','published','archived') OR p_sort IS NULL OR p_sort NOT IN ('updated_desc','updated_asc','title_asc','title_desc','price_asc','price_desc') OR p_limit IS NULL OR p_limit NOT IN (10,20,50) OR p_offset IS NULL OR p_offset NOT BETWEEN 0 AND 10000 THEN PERFORM public.phase3_fail('invalid_input'); END IF;
 WITH base AS (
  SELECT r.*, (r.draft ? 'sourceObservation' OR COALESCE(rev.document ? 'sourceObservation',false)) AS source_only,
   CASE WHEN r.archived_at IS NOT NULL THEN 'archived' WHEN r.published_revision_id IS NOT NULL THEN 'published' ELSE 'draft' END AS status
  FROM public.cms_records r LEFT JOIN public.cms_revisions rev ON rev.id=r.published_revision_id WHERE r.kind='product'
 ), matching AS (
  SELECT r.*, price.summary AS price,price.effective AS sort_price FROM base r
  LEFT JOIN LATERAL (
   WITH amounts AS (
    SELECT cv.id,cv.sku,cv.regular_paise,(cv.sale_paise IS NOT NULL AND cv.sale_from<=now() AND now()<cv.sale_until) AS active_sale,public.catalog_effective_price(cv) AS effective
    FROM public.catalog_variants cv WHERE cv.product_id=r.id AND cv.archived_at IS NULL AND cv.regular_paise IS NOT NULL
   ) SELECT a.effective,jsonb_build_object('regularPricePaise',a.regular_paise,'effectivePricePaise',a.effective,'isOnSale',a.effective<a.regular_paise OR a.active_sale,'from',(SELECT count(DISTINCT effective)>1 FROM amounts)) AS summary FROM amounts a ORDER BY a.effective,a.sku,a.id LIMIT 1
  ) price ON true
  WHERE (p_status='all' OR r.status=p_status)
   AND (p_category_id IS NULL OR r.draft->'categoryIds' @> jsonb_build_array(p_category_id::text))
   AND (btrim(p_query)='' OR position(lower(btrim(p_query)) in lower(r.title||' '||r.slug))>0 OR EXISTS(SELECT 1 FROM jsonb_array_elements_text(COALESCE(r.draft->'modelNumbers','[]'::jsonb)) model WHERE position(lower(btrim(p_query)) in lower(model))>0) OR EXISTS(SELECT 1 FROM jsonb_array_elements(COALESCE(r.draft->'variants','[]'::jsonb)) v WHERE lower(v->>'sku')=lower(btrim(p_query))))
 ), page AS (
  SELECT * FROM matching ORDER BY
   CASE WHEN p_sort='updated_desc' THEN updated_at END DESC,CASE WHEN p_sort='updated_asc' THEN updated_at END ASC,
   CASE WHEN p_sort='title_asc' THEN lower(title) END ASC,CASE WHEN p_sort='title_desc' THEN lower(title) END DESC,
   CASE WHEN p_sort='price_asc' THEN sort_price END ASC NULLS LAST,CASE WHEN p_sort='price_desc' THEN sort_price END DESC NULLS LAST,id DESC LIMIT p_limit OFFSET p_offset
 ) SELECT jsonb_build_object('total',(SELECT count(*) FROM matching),'items',COALESCE((SELECT jsonb_agg(jsonb_build_object(
  'id',r.id,'title',r.title,'slug',r.slug,'version',r.version,'status',r.status,'updatedAt',r.updated_at,'sourceObservation',r.source_only,'price',r.price,
  'image',(SELECT jsonb_build_object('mediaId',m.id,'alt',m.alt_text) FROM jsonb_array_elements_text(COALESCE(r.draft->'mediaIds','[]'::jsonb)) WITH ORDINALITY g(id,position) JOIN public.cms_media m ON m.id=g.id::uuid AND NOT m.archived AND m.mime_type='image/webp' ORDER BY g.position LIMIT 1),
  'categories',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',c.id,'title',c.title) ORDER BY c.title,c.id) FROM public.cms_records c WHERE c.kind='category' AND c.archived_at IS NULL AND r.draft->'categoryIds' @> jsonb_build_array(c.id::text)),'[]'::jsonb)
 )) FROM page r),'[]'::jsonb),'categoryOptions',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',c.id,'title',c.title) ORDER BY c.title,c.id) FROM (SELECT id,title FROM public.cms_records WHERE kind='category' AND archived_at IS NULL ORDER BY title,id LIMIT 100) c),'[]'::jsonb)) INTO result;
 RETURN result||jsonb_build_object('stats',public.admin_product_price_stats());
END $f$;

