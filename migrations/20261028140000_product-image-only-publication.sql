-- Publish only reviewed product image substitutions while preserving all other draft and revision data.
-- Forward rollback: revoke execute or drop this function; existing revisions remain immutable.
CREATE FUNCTION public.admin_replace_published_product_images(
  p_id uuid, p_expected_version bigint, p_expected_revision_id uuid, p_replacements jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp AS $fn$
DECLARE
  actor text; rec public.cms_records%ROWTYPE; rev public.cms_revisions%ROWTYPE;
  route public.cms_live_routes%ROWTYPE; draft_doc jsonb; live_doc jsonb;
  pair jsonb; old_id text; new_id text; old_ids text[] := '{}'; new_ids text[] := '{}';
  next_revision uuid; next_number bigint;
BEGIN
  actor := public.admin_assert_capability('catalog.edit');
  PERFORM public.admin_assert_capability('content.publish');
  IF p_id IS NULL OR p_expected_version IS NULL OR p_expected_version < 1 OR p_expected_revision_id IS NULL
    OR jsonb_typeof(p_replacements) IS DISTINCT FROM 'array' THEN
    PERFORM public.phase3_fail('invalid_input');
  END IF;
  IF jsonb_array_length(p_replacements) NOT BETWEEN 1 AND 100 THEN PERFORM public.phase3_fail('invalid_input'); END IF;
  FOR pair IN SELECT value FROM jsonb_array_elements(p_replacements) LOOP
    IF jsonb_typeof(pair) IS DISTINCT FROM 'object' THEN PERFORM public.phase3_fail('invalid_input'); END IF;
    IF (SELECT count(*) FROM jsonb_object_keys(pair)) <> 2 OR NOT (pair ?& ARRAY['oldId','newId'])
      OR jsonb_typeof(pair->'oldId') IS DISTINCT FROM 'string' OR jsonb_typeof(pair->'newId') IS DISTINCT FROM 'string'
      OR pair->>'oldId' !~ '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$'
      OR pair->>'newId' !~ '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$' THEN
      PERFORM public.phase3_fail('invalid_input');
    END IF;
    old_ids := array_append(old_ids, pair->>'oldId'); new_ids := array_append(new_ids, pair->>'newId');
  END LOOP;
  IF cardinality(ARRAY(SELECT DISTINCT x FROM unnest(old_ids) x)) <> cardinality(old_ids)
    OR cardinality(ARRAY(SELECT DISTINCT x FROM unnest(new_ids) x)) <> cardinality(new_ids)
    OR old_ids && new_ids THEN PERFORM public.phase3_fail('invalid_input'); END IF;

  PERFORM pg_advisory_xact_lock(832641);
  SELECT * INTO rec FROM public.cms_records WHERE id=p_id FOR UPDATE;
  IF NOT FOUND THEN PERFORM public.phase3_fail('not_found'); END IF;
  IF rec.version <> p_expected_version OR rec.published_revision_id IS DISTINCT FROM p_expected_revision_id THEN
    PERFORM public.phase3_fail('version_conflict');
  END IF;
  IF rec.kind <> 'product' OR rec.archived_at IS NOT NULL THEN PERFORM public.phase3_fail('invalid_state'); END IF;
  SELECT * INTO rev FROM public.cms_revisions WHERE record_id=p_id AND id=p_expected_revision_id;
  IF NOT FOUND THEN PERFORM public.phase3_fail('invalid_state'); END IF;
  SELECT * INTO route FROM public.cms_live_routes WHERE record_id=p_id FOR UPDATE;
  IF NOT FOUND OR route.kind <> 'product' OR route.revision_id <> rev.id OR route.slug <> rev.slug
    OR route.path IS DISTINCT FROM public.phase3_route_path('product',rev.slug) THEN
    PERFORM public.phase3_fail('invalid_state');
  END IF;
  IF EXISTS (SELECT 1 FROM unnest(new_ids) id LEFT JOIN public.cms_media m ON m.id=id::uuid
    WHERE m.id IS NULL OR m.mime_type <> 'image/webp' OR NOT m.published OR m.archived) THEN
    PERFORM public.phase3_fail('invalid_state');
  END IF;
  draft_doc := rec.draft; live_doc := rev.document;
  FOREACH pair IN ARRAY ARRAY[draft_doc,live_doc] LOOP
    IF jsonb_typeof(pair->'mediaIds') IS DISTINCT FROM 'array' OR jsonb_typeof(pair->'blocks') IS DISTINCT FROM 'array'
      OR EXISTS (SELECT 1 FROM unnest(old_ids) id WHERE NOT (pair->'mediaIds' @> jsonb_build_array(id))) THEN
      PERFORM public.phase3_fail('invalid_state');
    END IF;
  END LOOP;
  FOR i IN 1..cardinality(old_ids) LOOP
    old_id := old_ids[i]; new_id := new_ids[i];
    SELECT jsonb_set(draft_doc,'{mediaIds}',jsonb_agg(CASE WHEN v=to_jsonb(old_id) THEN to_jsonb(new_id) ELSE v END ORDER BY n))
      INTO draft_doc FROM jsonb_array_elements(draft_doc->'mediaIds') WITH ORDINALITY a(v,n);
    SELECT jsonb_set(live_doc,'{mediaIds}',jsonb_agg(CASE WHEN v=to_jsonb(old_id) THEN to_jsonb(new_id) ELSE v END ORDER BY n))
      INTO live_doc FROM jsonb_array_elements(live_doc->'mediaIds') WITH ORDINALITY a(v,n);
    SELECT jsonb_set(draft_doc,'{blocks}',COALESCE(jsonb_agg(CASE WHEN v->>'type'='image' AND v->>'mediaId'=old_id THEN jsonb_set(v,'{mediaId}',to_jsonb(new_id)) ELSE v END ORDER BY n),'[]'::jsonb))
      INTO draft_doc FROM jsonb_array_elements(draft_doc->'blocks') WITH ORDINALITY a(v,n);
    SELECT jsonb_set(live_doc,'{blocks}',COALESCE(jsonb_agg(CASE WHEN v->>'type'='image' AND v->>'mediaId'=old_id THEN jsonb_set(v,'{mediaId}',to_jsonb(new_id)) ELSE v END ORDER BY n),'[]'::jsonb))
      INTO live_doc FROM jsonb_array_elements(live_doc->'blocks') WITH ORDINALITY a(v,n);
    IF position(old_id IN lower(draft_doc::text))>0 OR position(old_id IN lower(live_doc::text))>0 THEN
      PERFORM public.phase3_fail('invalid_state');
    END IF;
  END LOOP;
  PERFORM public.phase3_validate_document('product', draft_doc);
  PERFORM public.phase3_validate_document('product', live_doc);
  PERFORM public.phase3_validate_media_refs(draft_doc, false);
  PERFORM public.phase3_validate_media_refs(live_doc, true);
  PERFORM public.phase3_validate_product_references('product',p_id,live_doc,true);
  SELECT COALESCE(max(revision_number),0)+1 INTO next_number FROM public.cms_revisions WHERE record_id=p_id;
  INSERT INTO public.cms_revisions(record_id,revision_number,source_version,source_revision_id,title,slug,document,published_by)
    VALUES(p_id,next_number,rec.version,rev.id,rev.title,rev.slug,live_doc,actor) RETURNING id INTO next_revision;
  UPDATE public.cms_live_routes SET revision_id=next_revision,published_at=now() WHERE record_id=p_id;
  UPDATE public.cms_records SET draft=draft_doc,published_revision_id=next_revision,version=version+1,updated_by=actor,updated_at=now()
    WHERE id=p_id;
  PERFORM public.admin_write_audit(actor,'record.publish','product',p_id,
    jsonb_build_object('version',rec.version+1,'revisionId',next_revision,'revisionNumber',next_number,'slug',rev.slug,'imageOnly',true));
  RETURN jsonb_build_object('version',rec.version+1,'revisionId',next_revision,'revisionNumber',next_number);
END $fn$;
REVOKE ALL ON FUNCTION public.admin_replace_published_product_images(uuid,bigint,uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.admin_replace_published_product_images(uuid,bigint,uuid,jsonb) TO authenticated;

