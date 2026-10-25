-- Read-only function assertions: no content, role, session or storage mutations.
DO $test$
DECLARE
  common_doc jsonb := jsonb_build_object('title','Settings check','slug','contact','summary','','blocks','[]'::jsonb,'seoTitle','','seoDescription','');
  contact_doc jsonb;
  nav_doc jsonb;
  nav_link jsonb := jsonb_build_object('label','Private hidden core label','href','/contact','group','header','position',0,'visible',false);
  projected jsonb;
  invalid_value jsonb;
  field_name text;
  max_length integer;
  detail text;
  rejected boolean;
BEGIN
  contact_doc := common_doc || jsonb_build_object('email','','phone','','address','','hours','','timezone','','socialLinks','[]'::jsonb);
  PERFORM public.phase3_validate_document('contact',contact_doc);
  FOR field_name,max_length IN SELECT * FROM (VALUES ('supportTitle',120),('supportText',1000),('footerTagline',160),('copyrightName',120)) AS bounds(key,max_chars) LOOP
    PERFORM public.phase3_validate_document('contact',contact_doc || jsonb_build_object(field_name,repeat('x',max_length)));
    PERFORM public.phase3_validate_document('contact',contact_doc || jsonb_build_object(field_name,''));
    FOR invalid_value IN SELECT value FROM jsonb_array_elements(jsonb_build_array(NULL,42,jsonb_build_object('bad',true),repeat('x',max_length+1),chr(1))) AS values_to_check(value) LOOP
      rejected := false;
      BEGIN
        PERFORM public.phase3_validate_document('contact',contact_doc || jsonb_build_object(field_name,invalid_value));
      EXCEPTION WHEN SQLSTATE 'P0001' THEN
        GET STACKED DIAGNOSTICS detail = PG_EXCEPTION_DETAIL;
        IF detail <> 'invalid_input' THEN RAISE; END IF;
        rejected := true;
      END;
      IF NOT rejected THEN RAISE EXCEPTION 'invalid copy value accepted'; END IF;
    END LOOP;
  END LOOP;
  nav_doc := (common_doc || jsonb_build_object('slug','primary','links',jsonb_build_array(
    nav_link,
    jsonb_build_object('label','Private hidden custom label','href','https://example.com/unlisted','group','header','position',1,'visible',false),
    jsonb_build_object('label','Academy','href','/learn','group','header','position',2,'visible',true)
  )));
  PERFORM public.phase3_validate_document('navigation',nav_doc);
  projected := public.phase3_public_document('navigation',nav_doc);
  IF jsonb_array_length(projected->'links') <> 2
    OR projected->'links'->0->>'label' <> 'Hidden navigation link'
    OR projected->'links'->0->'visible' <> 'false'::jsonb
    OR projected->'links'->1->>'label' <> 'Academy'
    OR projected::text LIKE '%Private hidden%'
    OR projected::text LIKE '%example.com%'
  THEN RAISE EXCEPTION 'navigation projection contract failed'; END IF;
  rejected := false;
  BEGIN
    PERFORM public.phase3_validate_document('navigation',nav_doc || jsonb_build_object('links',jsonb_build_array(nav_link,nav_link)));
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    GET STACKED DIAGNOSTICS detail = PG_EXCEPTION_DETAIL;
    IF detail <> 'invalid_input' THEN RAISE; END IF;
    rejected := true;
  END;
  IF NOT rejected THEN RAISE EXCEPTION 'duplicate navigation target accepted'; END IF;
  IF public.phase3_public_document('product',jsonb_build_object('sourceReview',jsonb_build_array('Private conflict detail'),'title','Board')) ? 'sourceReview'
  THEN RAISE EXCEPTION 'private source review projection leaked'; END IF;
  IF has_function_privilege('anon','public.phase3_validate_document(text,jsonb)','EXECUTE')
    OR has_function_privilege('authenticated','public.phase3_validate_document(text,jsonb)','EXECUTE')
    OR has_function_privilege('anon','public.phase6_validate_document_before_site_copy(text,jsonb)','EXECUTE')
    OR has_function_privilege('authenticated','public.phase6_validate_document_before_site_copy(text,jsonb)','EXECUTE')
    OR has_function_privilege('anon','public.phase3_public_document(text,jsonb)','EXECUTE')
    OR has_function_privilege('authenticated','public.phase3_public_document(text,jsonb)','EXECUTE')
  THEN RAISE EXCEPTION 'helper execution privilege widened'; END IF;
END $test$;
