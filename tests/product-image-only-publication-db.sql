-- Run only in a disposable migrated database; all fixture changes roll back.
BEGIN;
DO $test$
DECLARE
  actor text := 'image-rpc-test:' || gen_random_uuid()::text;
  pid uuid := gen_random_uuid(); rid uuid := gen_random_uuid(); vid uuid := gen_random_uuid();
  old_id uuid := gen_random_uuid(); new_id uuid := gen_random_uuid(); private_id uuid := gen_random_uuid();
  slug text := 'image-rpc-' || replace(gen_random_uuid()::text,'-','');
  doc jsonb; draft_doc jsonb; result jsonb; mapping jsonb; scenario text; detail text; expected_detail text; rejected boolean;
BEGIN
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',actor)::text,true);
  IF public.requesting_user_id() IS DISTINCT FROM actor THEN RAISE EXCEPTION 'test JWT context unavailable'; END IF;
  INSERT INTO public.staff_capabilities(user_id,capability,granted_by) VALUES
    (actor,'catalog.edit',actor),(actor,'content.publish',actor),
    (actor || ':edit','catalog.edit',actor),(actor || ':publish','content.publish',actor);
  INSERT INTO public.cms_media(id,object_key,storage_url,filename,mime_type,byte_size,width,height,alt_text,published,created_by)
    SELECT id,'assets/'||id::text||'.webp','https://example.invalid/'||id::text,'fixture.webp','image/webp',100,10,10,'fixture',is_public,actor
    FROM (VALUES(old_id,true),(new_id,true),(private_id,false)) x(id,is_public);
  doc := jsonb_build_object('title','Image RPC test','slug',slug,'summary','published',
    'blocks',jsonb_build_array(jsonb_build_object('type','image','mediaId',old_id::text,'alt','fixture')),
    'seoTitle','','seoDescription','','categoryIds','[]'::jsonb,'modelNumbers','[]'::jsonb,
    'variants',jsonb_build_array(jsonb_build_object('id',vid,'sku',slug,'label','fixture')),
    'specifications','[]'::jsonb,'compatibility','[]'::jsonb,'kitContents','[]'::jsonb,
    'resources','[]'::jsonb,'mediaIds',jsonb_build_array(old_id::text));
  draft_doc := jsonb_set(doc,'{summary}',to_jsonb('unpublished private change'::text));
  INSERT INTO public.cms_records(id,kind,title,slug,draft,created_by,updated_by) VALUES(pid,'product','Image RPC test',slug,draft_doc,actor,actor);
  INSERT INTO public.catalog_variants(id,product_id,sku,regular_paise,actual_paise) VALUES(vid,pid,slug,100,100);
  INSERT INTO public.cms_revisions(id,record_id,revision_number,source_version,title,slug,document,published_by)
    VALUES(rid,pid,1,1,'Image RPC test',slug,doc,actor);
  INSERT INTO public.cms_live_routes(record_id,kind,slug,path,revision_id,published_at)
    VALUES(pid,'product',slug,'/products/'||slug,rid,now());
  UPDATE public.cms_records SET published_revision_id=rid WHERE id=pid;
  mapping := jsonb_build_array(jsonb_build_object('oldId',old_id::text,'newId',new_id::text));
  FOR scenario IN SELECT unnest(ARRAY['stale','revision','private','outside','duplicate','missing','no_capability','edit_only','publish_only']) LOOP
    rejected := false;
    expected_detail := CASE WHEN scenario IN ('stale','revision') THEN 'version_conflict'
      WHEN scenario='duplicate' THEN 'invalid_input'
      WHEN scenario IN ('no_capability','edit_only','publish_only') THEN 'forbidden'
      ELSE 'invalid_state' END;
    PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',CASE scenario
      WHEN 'no_capability' THEN actor || ':none' WHEN 'edit_only' THEN actor || ':edit'
      WHEN 'publish_only' THEN actor || ':publish' ELSE actor END)::text,true);
    BEGIN
      IF scenario='missing' THEN UPDATE public.cms_records SET draft=jsonb_set(draft_doc,'{mediaIds}','[]'::jsonb) WHERE id=pid; END IF;
      IF scenario='outside' THEN UPDATE public.cms_records SET draft=jsonb_set(draft_doc,'{summary}',to_jsonb(old_id::text)) WHERE id=pid; END IF;
      PERFORM public.admin_replace_published_product_images(pid,CASE WHEN scenario='stale' THEN 2 ELSE 1 END,CASE WHEN scenario='revision' THEN gen_random_uuid() ELSE rid END,
        CASE WHEN scenario='private' THEN jsonb_build_array(jsonb_build_object('oldId',old_id::text,'newId',private_id::text))
          WHEN scenario='duplicate' THEN mapping || mapping ELSE mapping END);
    EXCEPTION WHEN SQLSTATE 'P0001' THEN
      GET STACKED DIAGNOSTICS detail = PG_EXCEPTION_DETAIL;
      IF detail IS DISTINCT FROM expected_detail THEN RAISE EXCEPTION 'case %: expected %, got %',scenario,expected_detail,detail; END IF;
      rejected := true;
    END;
    IF NOT rejected THEN RAISE EXCEPTION 'invalid % accepted',scenario; END IF;
    IF NOT EXISTS (SELECT 1 FROM public.cms_records r JOIN public.cms_live_routes l ON l.record_id=r.id
        JOIN public.catalog_search_documents s ON s.product_id=r.id
        WHERE r.id=pid AND r.version=1 AND r.published_revision_id=rid AND r.draft=draft_doc
          AND l.revision_id=rid AND s.revision_id=rid)
      OR (SELECT count(*) FROM public.cms_revisions WHERE record_id=pid) <> 1
      OR (SELECT document FROM public.cms_revisions WHERE id=rid) IS DISTINCT FROM doc
    THEN RAISE EXCEPTION 'rejected % changed publication state',scenario; END IF;
  END LOOP;
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',actor)::text,true);
  result := public.admin_replace_published_product_images(pid,1,rid,mapping);
  IF (SELECT draft FROM public.cms_records WHERE id=pid) IS DISTINCT FROM
      jsonb_set(jsonb_set(draft_doc,'{mediaIds,0}',to_jsonb(new_id::text)),'{blocks,0,mediaId}',to_jsonb(new_id::text))
    OR (SELECT document FROM public.cms_revisions WHERE id=(result->>'revisionId')::uuid) IS DISTINCT FROM
      jsonb_set(jsonb_set(doc,'{mediaIds,0}',to_jsonb(new_id::text)),'{blocks,0,mediaId}',to_jsonb(new_id::text))
    OR (SELECT document FROM public.cms_revisions WHERE id=rid) IS DISTINCT FROM doc
    OR NOT EXISTS(SELECT 1 FROM public.cms_records r JOIN public.cms_live_routes l ON l.record_id=r.id AND l.revision_id=r.published_revision_id JOIN public.catalog_search_documents s ON s.product_id=r.id AND s.revision_id=r.published_revision_id WHERE r.id=pid AND r.version=2)
  THEN RAISE EXCEPTION 'image replacement violated publication or draft preservation'; END IF;
  IF has_function_privilege('anon','public.admin_replace_published_product_images(uuid,bigint,uuid,jsonb)','EXECUTE') THEN RAISE EXCEPTION 'anonymous execute granted'; END IF;
END $test$;
ROLLBACK;

