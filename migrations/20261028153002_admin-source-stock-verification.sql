-- Explicit verified imported inventory. No catalog/content/balance data is changed by application.
-- Historical source balances remain unknown, including balances with preexisting versions/movements.
-- Forward rollback: disable initialization/adjustment routes and restore prior RPC guards/projections;
-- retain verification markers, movement operations and audit history. Do not erase recorded counts.
ALTER TABLE public.inventory_balances ADD COLUMN source_verified_at timestamptz;
ALTER TABLE public.inventory_movements ADD COLUMN operation text NOT NULL DEFAULT 'adjust'
  CONSTRAINT inventory_movements_operation_check CHECK (operation IN ('adjust','initialize'));
ALTER TABLE public.inventory_movements DROP CONSTRAINT inventory_movements_delta_check;
ALTER TABLE public.inventory_movements ADD CONSTRAINT inventory_movements_delta_check
  CHECK (delta <> 0 OR operation = 'initialize');

CREATE FUNCTION public.admin_initialize_inventory(
  p_variant_id uuid, p_expected_version bigint, p_quantity integer, p_reason text, p_request_id uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp AS $f$
DECLARE
  v_subject text;
  v_variant public.catalog_variants%ROWTYPE;
  v_balance public.inventory_balances%ROWTYPE;
  v_existing public.inventory_movements%ROWTYPE;
  v_new_version bigint;
  v_delta integer;
BEGIN
  v_subject := public.admin_assert_capability('orders.manage');
  IF p_variant_id IS NULL OR p_expected_version IS NULL OR p_expected_version NOT BETWEEN 0 AND 9007199254740990
    OR p_quantity IS NULL OR p_quantity NOT BETWEEN 0 AND 1000000 OR p_reason IS NULL
    OR char_length(btrim(p_reason)) NOT BETWEEN 1 AND 500 OR p_reason ~ '[[:cntrl:]]' OR p_request_id IS NULL THEN
    PERFORM public.phase3_fail('invalid_input');
  END IF;
  PERFORM pg_advisory_xact_lock(832642, hashtext(p_request_id::text));
  SELECT m.* INTO v_existing FROM public.inventory_movements m WHERE m.request_id=p_request_id;
  IF FOUND THEN
    IF v_existing.operation <> 'initialize' OR v_existing.actor <> v_subject
      OR v_existing.variant_id <> p_variant_id OR v_existing.balance_after <> p_quantity
      OR v_existing.stock_version <> p_expected_version + 1 OR v_existing.reason <> btrim(p_reason) THEN
      PERFORM public.phase3_fail('request_conflict');
    END IF;
    RETURN jsonb_build_object('variant', public.phase3_admin_variant_json(p_variant_id,v_subject));
  END IF;
  -- Share the catalog lifecycle lock so source/archive state cannot change during verification.
  PERFORM pg_advisory_xact_lock(832641);
  SELECT cv.* INTO v_variant FROM public.catalog_variants cv WHERE cv.id=p_variant_id FOR UPDATE;
  IF NOT FOUND THEN PERFORM public.phase3_fail('not_found'); END IF;
  IF v_variant.archived_at IS NOT NULL OR NOT EXISTS (
    SELECT 1 FROM public.cms_records r LEFT JOIN public.cms_revisions rev ON rev.id=r.published_revision_id
    WHERE r.id=v_variant.product_id AND r.kind='product' AND r.archived_at IS NULL
      AND (r.draft ? 'sourceObservation' OR COALESCE(rev.document ? 'sourceObservation',false))
  ) THEN PERFORM public.phase3_fail('invalid_state'); END IF;
  INSERT INTO public.inventory_balances(variant_id) VALUES(p_variant_id) ON CONFLICT(variant_id) DO NOTHING;
  SELECT ib.* INTO v_balance FROM public.inventory_balances ib WHERE ib.variant_id=p_variant_id FOR UPDATE;
  IF v_balance.version <> p_expected_version THEN PERFORM public.phase3_fail('version_conflict'); END IF;
  IF v_balance.source_verified_at IS NOT NULL THEN PERFORM public.phase3_fail('invalid_state'); END IF;
  v_new_version := v_balance.version + 1;
  -- Reconcile against any unverified stored balance, preserving its complete prior movement history.
  v_delta := p_quantity - v_balance.available_quantity;
  UPDATE public.inventory_balances SET available_quantity=p_quantity, version=v_new_version,
    source_verified_at=now(), updated_at=now() WHERE variant_id=p_variant_id;
  UPDATE public.catalog_variants SET updated_at=now() WHERE id=p_variant_id;
  INSERT INTO public.inventory_movements(variant_id,request_id,delta,balance_after,stock_version,reason,actor,operation)
    VALUES(p_variant_id,p_request_id,v_delta,p_quantity,v_new_version,btrim(p_reason),v_subject,'initialize');
  PERFORM public.admin_write_audit(v_subject,'variant.inventory.initialize','variant',p_variant_id,
    jsonb_build_object('version',v_new_version,'delta',v_delta,'previousQuantity',v_balance.available_quantity,
      'availableQuantity',p_quantity,'requestId',p_request_id),p_reason);
  RETURN jsonb_build_object('variant',public.phase3_admin_variant_json(p_variant_id,v_subject));
END $f$;
REVOKE ALL ON FUNCTION public.admin_initialize_inventory(uuid,bigint,integer,text,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.admin_initialize_inventory(uuid,bigint,integer,text,uuid) TO authenticated;

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
    IF v_existing.operation <> 'adjust' OR v_existing.stock_version <> p_expected_version + 1
      OR v_existing.actor <> v_subject OR v_existing.variant_id <> p_variant_id OR v_existing.delta <> p_delta
      OR v_existing.reason <> btrim(p_reason) THEN
      PERFORM public.phase3_fail('request_conflict');
    END IF;
    RETURN jsonb_build_object('variant', public.phase3_admin_variant_json(p_variant_id, v_subject));
  END IF;
  PERFORM pg_advisory_xact_lock(832641);
  SELECT cv.* INTO v_variant FROM public.catalog_variants cv
    WHERE cv.id = p_variant_id FOR UPDATE;
  IF NOT FOUND THEN PERFORM public.phase3_fail('not_found'); END IF;
  IF v_variant.archived_at IS NOT NULL OR EXISTS (
    SELECT 1 FROM public.cms_records r WHERE r.id = v_variant.product_id AND r.archived_at IS NOT NULL
  ) THEN PERFORM public.phase3_fail('invalid_state'); END IF;
  SELECT ib.* INTO v_balance FROM public.inventory_balances ib
    WHERE ib.variant_id = p_variant_id FOR UPDATE;
  IF NOT FOUND THEN
    INSERT INTO public.inventory_balances (variant_id) VALUES (p_variant_id)
      ON CONFLICT (variant_id) DO NOTHING;
    SELECT ib.* INTO v_balance FROM public.inventory_balances ib
      WHERE ib.variant_id = p_variant_id FOR UPDATE;
  END IF;
  IF v_balance.source_verified_at IS NULL AND EXISTS (
    SELECT 1 FROM public.cms_records r LEFT JOIN public.cms_revisions rev ON rev.id=r.published_revision_id
    WHERE r.id=v_variant.product_id AND (r.draft ? 'sourceObservation' OR COALESCE(rev.document ? 'sourceObservation',false))
  ) THEN PERFORM public.phase3_fail('invalid_state'); END IF;
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


CREATE OR REPLACE FUNCTION public.admin_inventory_workspace(
  p_query text,
  p_stock text,
  p_sort text,
  p_limit integer,
  p_offset integer,
  p_category_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $f$
DECLARE
  v_subject text;
  v_query text := btrim(COALESCE(p_query, ''));
  v_total bigint;
  v_items jsonb;
BEGIN
  IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 100
    OR p_offset IS NULL OR p_offset NOT BETWEEN 0 AND 10000
    OR char_length(v_query) > 120 OR v_query ~ '[[:cntrl:]]'
    OR p_stock IS NULL OR p_stock NOT IN ('all', 'unverified', 'in_stock', 'out_of_stock')
    OR p_sort IS NULL OR p_sort NOT IN ('updated_desc', 'title_asc', 'title_desc', 'sku_asc', 'sku_desc', 'stock_asc', 'stock_desc') THEN
    PERFORM public.phase3_fail('invalid_input');
  END IF;
  v_subject := public.admin_assert_capability('orders.manage');

  WITH source_state AS (
    SELECT cv.id, cv.sku, r.title, cv.updated_at,
      (COALESCE(r.draft ? 'sourceObservation', false) OR COALESCE(rev.document ? 'sourceObservation', false)) AS source_only,
      ib.available_quantity, ib.version AS stock_version, ib.source_verified_at
    FROM public.catalog_variants cv
    JOIN public.cms_records r ON r.id = cv.product_id AND r.kind = 'product'
    LEFT JOIN public.cms_revisions rev ON rev.id = r.published_revision_id
    LEFT JOIN public.inventory_balances ib ON ib.variant_id = cv.id
    WHERE r.archived_at IS NULL AND cv.archived_at IS NULL AND (p_category_id IS NULL OR r.draft->'categoryIds' @> jsonb_build_array(p_category_id::text))
  ), matching AS (
    SELECT source_state.id, source_state.sku, source_state.title, source_state.updated_at, source_state.source_only,
      CASE WHEN (source_state.source_only AND source_state.source_verified_at IS NULL) OR source_state.stock_version IS NULL OR source_state.stock_version = 0
        THEN NULL ELSE source_state.available_quantity END AS managed_quantity
    FROM source_state
  ), filtered AS (
    SELECT matching.* FROM matching
    WHERE (v_query = '' OR position(lower(v_query) in lower(matching.title)) > 0 OR lower(matching.sku) = lower(v_query))
      AND (p_stock = 'all'
        OR (p_stock = 'unverified' AND matching.managed_quantity IS NULL)
        OR (p_stock = 'in_stock' AND matching.managed_quantity > 0)
        OR (p_stock = 'out_of_stock' AND matching.managed_quantity = 0))
  ), ranked AS (
    SELECT filtered.*,
      row_number() OVER (ORDER BY
        CASE WHEN p_sort = 'updated_desc' THEN filtered.updated_at END DESC,
        CASE WHEN p_sort = 'title_asc' THEN lower(filtered.title) END ASC,
        CASE WHEN p_sort = 'title_desc' THEN lower(filtered.title) END DESC,
        CASE WHEN p_sort = 'sku_asc' THEN lower(filtered.sku) END ASC,
        CASE WHEN p_sort = 'sku_desc' THEN lower(filtered.sku) END DESC,
        CASE WHEN p_sort IN ('stock_asc', 'stock_desc') AND filtered.managed_quantity IS NULL THEN 1 ELSE 0 END ASC,
        CASE WHEN p_sort = 'stock_asc' THEN filtered.managed_quantity END ASC NULLS LAST,
        CASE WHEN p_sort = 'stock_desc' THEN filtered.managed_quantity END DESC NULLS LAST,
        CASE WHEN p_sort = 'updated_desc' THEN filtered.id END DESC,
        CASE WHEN p_sort IN ('title_asc', 'title_desc') THEN lower(filtered.sku) END ASC,
        CASE WHEN p_sort IN ('sku_asc', 'sku_desc') THEN filtered.id END ASC,
        CASE WHEN p_sort IN ('stock_asc', 'stock_desc') THEN lower(filtered.sku) END ASC,
        filtered.id ASC
      ) AS ordinal
    FROM filtered
  ), totals AS (
    SELECT count(*) AS total FROM filtered
  ), page_rows AS (
    SELECT * FROM ranked WHERE ordinal > p_offset AND ordinal <= p_offset + p_limit
  )
  SELECT totals.total,
    COALESCE(jsonb_agg(
      CASE
        WHEN page_rows.id IS NULL THEN NULL
        WHEN page_rows.managed_quantity IS NULL THEN public.phase3_admin_variant_json(page_rows.id, v_subject)
          || jsonb_build_object('sourceOnly', page_rows.source_only, 'stock', NULL)
        ELSE public.phase3_admin_variant_json(page_rows.id, v_subject)
          || jsonb_build_object('sourceOnly', page_rows.source_only)
      END || (SELECT jsonb_build_object(
 'categoryIds',COALESCE((SELECT jsonb_agg(c.id ORDER BY c.title,c.id) FROM public.cms_records c WHERE c.kind='category' AND c.archived_at IS NULL AND r.draft->'categoryIds' @> jsonb_build_array(c.id::text)),'[]'::jsonb),
 'categoryNames',COALESCE((SELECT jsonb_agg(c.title ORDER BY c.title,c.id) FROM public.cms_records c WHERE c.kind='category' AND c.archived_at IS NULL AND r.draft->'categoryIds' @> jsonb_build_array(c.id::text)),'[]'::jsonb),
 'imageId',(SELECT m.id FROM jsonb_array_elements_text(COALESCE(r.draft->'mediaIds','[]'::jsonb)) WITH ORDINALITY g(id,pos) JOIN public.cms_media m ON m.id::text=g.id AND NOT m.archived AND m.mime_type IN ('image/webp','image/png','image/jpeg') ORDER BY g.pos LIMIT 1)
 ) FROM public.catalog_variants cv JOIN public.cms_records r ON r.id=cv.product_id WHERE cv.id=page_rows.id) ORDER BY page_rows.ordinal
    ) FILTER (WHERE page_rows.id IS NOT NULL), '[]'::jsonb)
  INTO v_total, v_items
  FROM totals LEFT JOIN page_rows ON true
  GROUP BY totals.total;

  RETURN jsonb_build_object('items',v_items,'total',v_total,'categories',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',c.id,'title',c.title) ORDER BY c.title,c.id) FROM (SELECT id,title FROM public.cms_records WHERE kind='category' AND archived_at IS NULL ORDER BY title,id LIMIT 100) c),'[]'::jsonb));
END
$f$;

REVOKE ALL ON FUNCTION public.admin_inventory_workspace(text, text, text, integer, integer, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_inventory_workspace(text, text, text, integer, integer, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_inventory_stats()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $f$
DECLARE
  v_stats jsonb;
BEGIN
  PERFORM public.admin_assert_capability('orders.manage');
  WITH quantities AS (
    SELECT CASE
      WHEN ((COALESCE(r.draft ? 'sourceObservation', false)
        OR COALESCE(rev.document ? 'sourceObservation', false)) AND ib.source_verified_at IS NULL)
        OR ib.version IS NULL OR ib.version = 0 THEN NULL
      ELSE ib.available_quantity
    END AS managed_quantity
    FROM public.catalog_variants cv
    JOIN public.cms_records r ON r.id = cv.product_id AND r.kind = 'product'
    LEFT JOIN public.cms_revisions rev ON rev.id = r.published_revision_id
    LEFT JOIN public.inventory_balances ib ON ib.variant_id = cv.id
    WHERE r.archived_at IS NULL AND cv.archived_at IS NULL
  )
  SELECT jsonb_build_object(
    'total', count(*),
    'aboveZero', count(*) FILTER (WHERE managed_quantity > 0),
    'zero', count(*) FILTER (WHERE managed_quantity = 0),
    'unverified', count(*) FILTER (WHERE managed_quantity IS NULL)
  ) INTO v_stats FROM quantities;
  RETURN v_stats;
END
$f$;

REVOKE ALL ON FUNCTION public.admin_inventory_stats() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_inventory_stats() TO authenticated;

-- Permit source publication after explicit inventory verification; retain all other lifecycle guards.
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
      IF EXISTS (
        SELECT 1 FROM public.phase3_jsonb_array_elements(v_document->'variants') AS desired(item)
        JOIN public.catalog_variants cv ON cv.id = (desired.item->>'id')::uuid
        WHERE cv.regular_paise IS NULL OR cv.actual_paise IS NULL
      ) THEN
        PERFORM public.phase3_fail('invalid_state');
      END IF;
      IF v_document ? 'sourceObservation' AND EXISTS (
        SELECT 1 FROM public.catalog_variants cv LEFT JOIN public.inventory_balances ib ON ib.variant_id=cv.id
        WHERE cv.product_id=p_id AND COALESCE(ib.available_quantity,0)<>0 AND ib.source_verified_at IS NULL
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
