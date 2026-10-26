-- Require complete Set/Actual pairs before any product publication; drafts remain compatible.
-- No records or publication states change. Forward-only: retain configured prices and audit history.
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


