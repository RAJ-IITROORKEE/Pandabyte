-- Authorized development source-observation catalog. Preserve normal commerce guards and all existing ACLs.
CREATE OR REPLACE FUNCTION public.phase3_validate_document(p_kind text, p_document jsonb)
 RETURNS void
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
DECLARE v_base jsonb := p_document;
BEGIN
  IF p_kind = 'product' THEN
    IF p_document ? 'modelNumbers' AND (
      jsonb_typeof(p_document->'modelNumbers') IS DISTINCT FROM 'array'
      OR public.phase3_jsonb_array_length(p_document->'modelNumbers') > 20
      OR EXISTS(SELECT 1 FROM public.phase3_jsonb_array_elements(p_document->'modelNumbers') a(value)
        WHERE jsonb_typeof(value) IS DISTINCT FROM 'string'
          OR char_length(btrim(value #>> '{}')) NOT BETWEEN 1 AND 80
          OR (value #>> '{}') ~ '[[:cntrl:]]' OR (value #>> '{}') !~* '[a-z0-9]')
      OR (SELECT count(*) <> count(DISTINCT lower(btrim(value #>> '{}')))
        FROM public.phase3_jsonb_array_elements(p_document->'modelNumbers') a(value))
    ) THEN PERFORM public.phase3_fail('invalid_input'); END IF;
    IF p_document ? 'sourceObservation' THEN
      IF jsonb_typeof(p_document->'sourceObservation') IS DISTINCT FROM 'object' THEN PERFORM public.phase3_fail('invalid_input'); END IF;
      IF (SELECT count(*) FROM jsonb_object_keys(p_document->'sourceObservation')) <> 3
        OR NOT (p_document->'sourceObservation' ?& ARRAY['priceText','capturedAt','sourceUrl'])
        OR jsonb_typeof(p_document->'sourceObservation'->'priceText') IS DISTINCT FROM 'string'
        OR char_length(p_document->'sourceObservation'->>'priceText') > 160
        OR (p_document->'sourceObservation'->>'priceText') ~ '[[:cntrl:]]'
        OR jsonb_typeof(p_document->'sourceObservation'->'capturedAt') IS DISTINCT FROM 'string'
        OR (p_document->'sourceObservation'->>'capturedAt') !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,9})?(Z|[+-]\d{2}:\d{2})$'
        OR jsonb_typeof(p_document->'sourceObservation'->'sourceUrl') IS DISTINCT FROM 'string'
        OR char_length(p_document->'sourceObservation'->>'sourceUrl') > 2048
        OR NOT public.phase3_is_safe_public_href(p_document->'sourceObservation'->>'sourceUrl')
        OR (p_document->'sourceObservation'->>'sourceUrl') !~ '^https://'
      THEN PERFORM public.phase3_fail('invalid_input'); END IF;
      BEGIN PERFORM (p_document->'sourceObservation'->>'capturedAt')::timestamptz;
      EXCEPTION WHEN OTHERS THEN PERFORM public.phase3_fail('invalid_input'); END;
    END IF;
    IF p_document ? 'sourceReview' AND (jsonb_typeof(p_document->'sourceReview') IS DISTINCT FROM 'array'
      OR public.phase3_jsonb_array_length(p_document->'sourceReview') > 64
      OR EXISTS(SELECT 1 FROM public.phase3_jsonb_array_elements(p_document->'sourceReview') n(value)
        WHERE jsonb_typeof(value) IS DISTINCT FROM 'string' OR char_length(value #>> '{}') > 2000
          OR (value #>> '{}') ~ '[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]'))
    THEN PERFORM public.phase3_fail('invalid_input'); END IF;
    v_base := v_base - 'sourceObservation' - 'sourceReview';
    v_base := v_base - 'modelNumbers';
  ELSIF p_kind = 'resource' THEN
    IF p_document ? 'collection' AND (jsonb_typeof(p_document->'collection') IS DISTINCT FROM 'string'
      OR p_document->>'collection' NOT IN ('product-specs','embedded-systems','kit-guides')) THEN
      PERFORM public.phase3_fail('invalid_input');
    END IF;
    v_base := v_base - 'collection';
  END IF;
  PERFORM public.phase3_validate_document_base(p_kind,v_base);
END $function$;

CREATE OR REPLACE FUNCTION public.phase3_public_document(p_kind text, p_document jsonb)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'pg_catalog', 'public'
AS $function$
  SELECT CASE WHEN p_kind = 'navigation' THEN
    jsonb_set(
      p_document,
      '{links}',
      COALESCE((
        SELECT jsonb_agg(link ORDER BY (link->>'position')::integer, link->>'label')
        FROM public.phase3_jsonb_array_elements(COALESCE(p_document->'links', '[]'::jsonb)) AS links(link)
        WHERE link->'visible' = 'true'::jsonb
      ), '[]'::jsonb),
      true
    )
  ELSE p_document - 'sourceReview' END
$function$;

CREATE OR REPLACE FUNCTION public.phase3_public_variant_json(p_variant jsonb, p_document jsonb)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
  SELECT CASE WHEN p_document ? 'sourceObservation' THEN jsonb_build_object(
    'id',cv.id,'sku',p_variant->>'sku','label',p_variant->>'label',
    'regularPricePaise',NULL,'effectivePricePaise',NULL,'isOnSale',false,'saleEndsAt',NULL,'availability','unavailable'
  ) ELSE jsonb_build_object(
    'id', cv.id,
    'sku', p_variant->>'sku',
    'label', p_variant->>'label',
    'regularPricePaise', cv.regular_paise,
    'effectivePricePaise', CASE
      WHEN cv.sale_paise IS NOT NULL AND now() >= cv.sale_from AND now() < cv.sale_until THEN cv.sale_paise
      ELSE cv.regular_paise END,
    'isOnSale', cv.sale_paise IS NOT NULL AND now() >= cv.sale_from AND now() < cv.sale_until,
    'saleEndsAt', CASE WHEN cv.sale_paise IS NOT NULL AND now() >= cv.sale_from AND now() < cv.sale_until
      THEN cv.sale_until ELSE NULL END,
    'availability', CASE WHEN COALESCE(ib.available_quantity, 0) > 0 THEN 'available' ELSE 'unavailable' END
  )
  END
  FROM public.catalog_variants cv
  LEFT JOIN public.inventory_balances ib ON ib.variant_id = cv.id
  WHERE cv.id = (p_variant->>'id')::uuid
    AND cv.product_id IS NOT NULL AND cv.archived_at IS NULL
$function$;

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
        WHERE cv.product_id=p_id AND (cv.regular_paise IS NOT NULL OR cv.sale_paise IS NOT NULL OR COALESCE(ib.available_quantity,0)<>0)
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

CREATE OR REPLACE FUNCTION public.admin_set_variant_price(p_variant_id uuid, p_expected_version bigint, p_regular_paise bigint, p_sale_paise bigint, p_sale_from timestamp with time zone, p_sale_until timestamp with time zone, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
DECLARE
  v_subject text;
  v_variant public.catalog_variants%ROWTYPE;
  v_new_version bigint;
BEGIN
  v_subject := public.admin_assert_capability('catalog.edit');
  IF p_variant_id IS NULL OR p_expected_version IS NULL OR p_expected_version < 0
    OR p_regular_paise IS NULL OR p_regular_paise NOT BETWEEN 0 AND 10000000000
    OR (p_sale_paise IS NOT NULL AND p_sale_paise NOT BETWEEN 0 AND 10000000000)
    OR p_reason IS NULL OR char_length(btrim(p_reason)) NOT BETWEEN 1 AND 500
    OR (p_sale_paise IS NULL AND (p_sale_from IS NOT NULL OR p_sale_until IS NOT NULL))
    OR (p_sale_paise IS NOT NULL AND (p_regular_paise IS NULL OR p_sale_from IS NULL
      OR p_sale_until IS NULL OR p_sale_from >= p_sale_until OR p_sale_paise > p_regular_paise)) THEN
    PERFORM public.phase3_fail('invalid_input');
  END IF;
  SELECT cv.* INTO v_variant FROM public.catalog_variants cv
    WHERE cv.id = p_variant_id FOR UPDATE;
  IF NOT FOUND THEN PERFORM public.phase3_fail('not_found'); END IF;
  IF v_variant.archived_at IS NOT NULL OR EXISTS (
    SELECT 1 FROM public.cms_records r WHERE r.id = v_variant.product_id AND r.archived_at IS NOT NULL
  ) THEN PERFORM public.phase3_fail('invalid_state'); END IF;
  IF EXISTS (SELECT 1 FROM public.cms_records r LEFT JOIN public.cms_revisions rev ON rev.id=r.published_revision_id
    WHERE r.id=v_variant.product_id AND (r.draft ? 'sourceObservation' OR rev.document ? 'sourceObservation'))
  THEN PERFORM public.phase3_fail('invalid_state'); END IF;
  IF v_variant.price_version <> p_expected_version THEN PERFORM public.phase3_fail('version_conflict'); END IF;
  v_new_version := v_variant.price_version + 1;
  UPDATE public.catalog_variants
    SET regular_paise = p_regular_paise, sale_paise = p_sale_paise,
        sale_from = p_sale_from, sale_until = p_sale_until,
        price_version = v_new_version, updated_at = now()
    WHERE id = p_variant_id;
  INSERT INTO public.variant_price_events (
    variant_id, version, regular_paise, sale_paise, sale_from, sale_until, actor, reason
  ) VALUES (
    p_variant_id, v_new_version, p_regular_paise, p_sale_paise,
    p_sale_from, p_sale_until, v_subject, btrim(p_reason)
  );
  PERFORM public.admin_write_audit(v_subject, 'variant.price.set', 'variant', p_variant_id,
    jsonb_build_object('version', v_new_version, 'regularPaise', p_regular_paise,
      'salePaise', p_sale_paise, 'saleFrom', p_sale_from, 'saleUntil', p_sale_until), p_reason);
  RETURN jsonb_build_object('variant', public.phase3_admin_variant_json(p_variant_id, v_subject));
END
$function$;

CREATE OR REPLACE FUNCTION public.admin_adjust_inventory(p_variant_id uuid, p_expected_version bigint, p_delta integer, p_reason text, p_request_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
DECLARE
  v_subject text;
  v_variant public.catalog_variants%ROWTYPE;
  v_balance public.inventory_balances%ROWTYPE;
  v_existing public.inventory_movements%ROWTYPE;
  v_quantity bigint;
  v_new_version bigint;
BEGIN
  v_subject := public.admin_assert_capability('orders.manage');
  IF p_variant_id IS NULL OR p_expected_version IS NULL OR p_expected_version < 0
    OR p_delta IS NULL OR p_delta NOT BETWEEN -1000000 AND 1000000 OR p_delta = 0 OR p_reason IS NULL
    OR char_length(btrim(p_reason)) NOT BETWEEN 1 AND 500 OR p_request_id IS NULL THEN
    PERFORM public.phase3_fail('invalid_input');
  END IF;
  PERFORM pg_advisory_xact_lock(832642, hashtext(p_request_id::text));
  SELECT movement.* INTO v_existing FROM public.inventory_movements movement
    WHERE movement.request_id = p_request_id;
  IF FOUND THEN
    IF v_existing.actor <> v_subject OR v_existing.variant_id <> p_variant_id OR v_existing.delta <> p_delta
      OR v_existing.reason <> btrim(p_reason) THEN
      PERFORM public.phase3_fail('request_conflict');
    END IF;
    RETURN jsonb_build_object('variant', public.phase3_admin_variant_json(p_variant_id, v_subject));
  END IF;
  SELECT cv.* INTO v_variant FROM public.catalog_variants cv
    WHERE cv.id = p_variant_id FOR UPDATE;
  IF NOT FOUND THEN PERFORM public.phase3_fail('not_found'); END IF;
  IF v_variant.archived_at IS NOT NULL OR EXISTS (
    SELECT 1 FROM public.cms_records r WHERE r.id = v_variant.product_id AND r.archived_at IS NOT NULL
  ) THEN PERFORM public.phase3_fail('invalid_state'); END IF;
  IF EXISTS (SELECT 1 FROM public.cms_records r LEFT JOIN public.cms_revisions rev ON rev.id=r.published_revision_id
    WHERE r.id=v_variant.product_id AND (r.draft ? 'sourceObservation' OR rev.document ? 'sourceObservation'))
  THEN PERFORM public.phase3_fail('invalid_state'); END IF;
  SELECT ib.* INTO v_balance FROM public.inventory_balances ib
    WHERE ib.variant_id = p_variant_id FOR UPDATE;
  IF NOT FOUND THEN
    INSERT INTO public.inventory_balances (variant_id) VALUES (p_variant_id)
      ON CONFLICT (variant_id) DO NOTHING;
    SELECT ib.* INTO v_balance FROM public.inventory_balances ib
      WHERE ib.variant_id = p_variant_id FOR UPDATE;
  END IF;
  IF v_balance.version <> p_expected_version THEN PERFORM public.phase3_fail('version_conflict'); END IF;
  v_quantity := v_balance.available_quantity::bigint + p_delta::bigint;
  IF v_quantity NOT BETWEEN 0 AND 2147483647 THEN PERFORM public.phase3_fail('stock_conflict'); END IF;
  v_new_version := v_balance.version + 1;
  UPDATE public.inventory_balances
    SET available_quantity = v_quantity::integer, version = v_new_version, updated_at = now()
    WHERE variant_id = p_variant_id;
  INSERT INTO public.inventory_movements (
    variant_id, request_id, delta, balance_after, stock_version, reason, actor
  ) VALUES (
    p_variant_id, p_request_id, p_delta, v_quantity::integer,
    v_new_version, btrim(p_reason), v_subject
  );
  PERFORM public.admin_write_audit(v_subject, 'variant.inventory.adjust', 'variant', p_variant_id,
    jsonb_build_object('version', v_new_version, 'delta', p_delta,
      'availableQuantity', v_quantity, 'requestId', p_request_id), p_reason);
  RETURN jsonb_build_object('variant', public.phase3_admin_variant_json(p_variant_id, v_subject));
END
$function$;

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
      AND (j.value->>'id')::uuid=cv.id AND NOT (rev.document ? 'sourceObservation');
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

CREATE OR REPLACE FUNCTION public.published_list_products(p_query text, p_category_ids uuid[], p_min_price_paise bigint, p_max_price_paise bigint, p_availability text, p_sort text, p_limit integer, p_offset integer)
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
          CASE WHEN c.document ? 'sourceObservation' THEN NULL WHEN cv.sale_paise IS NOT NULL AND now()>=cv.sale_from AND now()<cv.sale_until THEN cv.sale_paise ELSE cv.regular_paise END price,
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
