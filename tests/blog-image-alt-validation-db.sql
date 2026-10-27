-- Read-only assertions; run after the Blog image-alt migration in a disposable database.
DO $test$
DECLARE
 common jsonb := jsonb_build_object('title','Blog check','slug','blog-check','summary','','blocks','[]'::jsonb,
   'seoTitle','','seoDescription','');
 doc jsonb := common || jsonb_build_object('author','','tags','[]'::jsonb,'mediaIds','[]'::jsonb);
 img jsonb := jsonb_build_object('type','image','mediaId','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','alt','Board');
 invalid_alt text;
 detail text;
 rejected boolean;
BEGIN
 PERFORM public.phase3_validate_document('blog',doc);
 PERFORM public.phase3_validate_document('blog',doc || jsonb_build_object('blocks',jsonb_build_array(img)));
 PERFORM public.phase3_validate_document('blog',doc || jsonb_build_object('blocks',jsonb_build_array(img || jsonb_build_object('alt',repeat('x',240)))));
 PERFORM public.phase3_validate_document('blog',doc || jsonb_build_object('blocks',jsonb_build_array(img || jsonb_build_object('alt',E'Board\nview'))));
 FOR invalid_alt IN SELECT unnest(ARRAY['',E'\t\n',U&'\00A0\2003\FEFF',U&'\00A0Board','Board ', 'bad' || chr(1), 'bad' || chr(127),repeat('x',241)]) LOOP
  rejected := false;
  BEGIN
   PERFORM public.phase3_validate_document('blog',doc || jsonb_build_object('blocks',jsonb_build_array(img || jsonb_build_object('alt',invalid_alt))));
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
   GET STACKED DIAGNOSTICS detail = PG_EXCEPTION_DETAIL;
   IF detail <> 'invalid_input' THEN RAISE; END IF;
   rejected := true;
  END;
  IF NOT rejected THEN RAISE EXCEPTION 'invalid Blog image alt accepted'; END IF;
 END LOOP;
 -- The Blog-only rule must not tighten the existing page contract.
 PERFORM public.phase3_validate_document('page',common || jsonb_build_object('blocks',jsonb_build_array(img || jsonb_build_object('alt',''))));
 IF has_function_privilege('anon','public.blog_image_alt_valid(jsonb)','EXECUTE')
   OR has_function_privilege('authenticated','public.blog_image_alt_valid(jsonb)','EXECUTE')
   OR has_function_privilege('anon','public.blog_image_validate_document_before(text,jsonb)','EXECUTE')
   OR has_function_privilege('authenticated','public.blog_image_validate_document_before(text,jsonb)','EXECUTE')
   OR has_function_privilege('anon','public.phase3_validate_document(text,jsonb)','EXECUTE')
   OR has_function_privilege('authenticated','public.phase3_validate_document(text,jsonb)','EXECUTE')
 THEN RAISE EXCEPTION 'Blog image validator execution privilege widened'; END IF;
END $test$;
