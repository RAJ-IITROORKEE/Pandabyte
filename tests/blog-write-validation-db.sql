-- Read-only assertions; run after the Blog validation migration in a disposable database.
DO $test$
DECLARE
 doc jsonb := jsonb_build_object('title','Blog check','slug','blog-check','summary','','blocks','[]'::jsonb,
   'seoTitle','','seoDescription','','author','','tags',jsonb_build_array('one','one'),'mediaIds','[]'::jsonb);
 invalid_doc jsonb;
 detail text;
 rejected boolean;
BEGIN
 PERFORM public.phase3_validate_document('blog',doc);
 PERFORM public.phase3_validate_document('blog',doc || jsonb_build_object('author',E'First\nLast','tags',jsonb_build_array(E'a\tb')));
 FOR invalid_doc IN SELECT value FROM jsonb_array_elements(jsonb_build_array(
   doc || jsonb_build_object('author','bad' || chr(1)),
   doc || jsonb_build_object('author',chr(127) || 'bad'),
   doc || jsonb_build_object('author',U&'\00A0author'),
   doc || jsonb_build_object('tags',jsonb_build_array('bad' || chr(1))),
   doc || jsonb_build_object('tags',jsonb_build_array('bad' || chr(127))),
   doc || jsonb_build_object('tags',jsonb_build_array(E'\t\n')),
   doc || jsonb_build_object('tags',jsonb_build_array(U&'\00A0\2003\FEFF')),
   doc || jsonb_build_object('tags',jsonb_build_array(U&'tag\00A0'))
 )) LOOP
  rejected := false;
  BEGIN
   PERFORM public.phase3_validate_document('blog',invalid_doc);
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
   GET STACKED DIAGNOSTICS detail = PG_EXCEPTION_DETAIL;
   IF detail <> 'invalid_input' THEN RAISE; END IF;
   rejected := true;
  END;
  IF NOT rejected THEN RAISE EXCEPTION 'invalid Blog document accepted'; END IF;
 END LOOP;
 IF has_function_privilege('anon','public.blog_write_fields_valid(jsonb)','EXECUTE')
   OR has_function_privilege('authenticated','public.blog_write_fields_valid(jsonb)','EXECUTE')
   OR has_function_privilege('anon','public.blog_validate_document_before(text,jsonb)','EXECUTE')
   OR has_function_privilege('authenticated','public.blog_validate_document_before(text,jsonb)','EXECUTE')
   OR has_function_privilege('anon','public.phase3_validate_document(text,jsonb)','EXECUTE')
   OR has_function_privilege('authenticated','public.phase3_validate_document(text,jsonb)','EXECUTE')
 THEN RAISE EXCEPTION 'Blog validator execution privilege widened'; END IF;
END $test$;
