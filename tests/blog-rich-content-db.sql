-- Read-only assertions; run after the Blog rich-content migration in a disposable database.
DO $test$
DECLARE
 doc jsonb := jsonb_build_object('title','Blog check','slug','blog-check','summary','','blocks',jsonb_build_array(jsonb_build_object('type','paragraph','text','Legacy')),
   'seoTitle','','seoDescription','','author','','tags','[]'::jsonb,'mediaIds','[]'::jsonb);
 rich jsonb := '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Formatted"}]}]}'::jsonb;
 image_rich jsonb := '{"type":"doc","content":[{"type":"image","attrs":{"mediaId":"d9428888-122b-11e1-b85c-61cd3cbb3210","alt":"Board"}}]}'::jsonb;
 invalid_doc jsonb; detail text; rejected boolean;
BEGIN
 PERFORM public.phase3_validate_document('blog',doc);
 PERFORM public.phase3_validate_document('blog',doc || jsonb_build_object('richContent',rich));
 PERFORM public.phase3_validate_document('blog',doc || jsonb_build_object('richContent',jsonb_set(image_rich,'{content,0,attrs,alt}',to_jsonb(repeat('x',300)))));
 PERFORM public.phase3_validate_document('blog',doc || jsonb_build_object('richContent',jsonb_set(image_rich,'{content,0,attrs,alt}',to_jsonb(U&'\00A0 Board \FEFF'))));
 FOR invalid_doc IN SELECT value FROM jsonb_array_elements(jsonb_build_array(
   doc || jsonb_build_object('richContent','{"type":"doc"}'::jsonb),
   doc || jsonb_build_object('richContent','{"type":"doc","content":[{"type":"script"}]}'::jsonb),
   doc || jsonb_build_object('richContent',rich,'author',chr(1)),
   doc || jsonb_build_object('richContent',jsonb_set(image_rich,'{content,0,attrs,alt}',to_jsonb('x'||repeat(' ',300)))),
   doc || jsonb_build_object('richContent',jsonb_set(image_rich,'{content,0,attrs,alt}',to_jsonb(U&'\00A0\FEFF\2028\3000'))),
   doc || jsonb_build_object('richContent',jsonb_set(image_rich,'{content,0,attrs,alt}',to_jsonb('Board'||chr(1))))
 )) LOOP
  rejected := false;
  BEGIN
   PERFORM public.phase3_validate_document('blog',invalid_doc);
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
   GET STACKED DIAGNOSTICS detail = PG_EXCEPTION_DETAIL;
   IF detail <> 'invalid_input' THEN RAISE; END IF;
   rejected := true;
  END;
  IF NOT rejected THEN RAISE EXCEPTION 'invalid Blog rich document accepted'; END IF;
 END LOOP;
 IF NOT EXISTS (SELECT 1 FROM public.phase3_document_media_ids(doc || '{"richContent":{"type":"doc","content":[{"type":"image","attrs":{"mediaId":"d9428888-122b-11e1-b85c-61cd3cbb3210","alt":"Board"}}]}}'::jsonb) WHERE media_id='d9428888-122b-11e1-b85c-61cd3cbb3210'::uuid) THEN
  RAISE EXCEPTION 'Blog rich image reference omitted';
 END IF;
 IF has_function_privilege('anon','public.blog_rich_validate_document_before(text,jsonb)','EXECUTE')
   OR has_function_privilege('authenticated','public.blog_rich_validate_document_before(text,jsonb)','EXECUTE')
   OR has_function_privilege('anon','public.phase3_validate_document(text,jsonb)','EXECUTE')
   OR has_function_privilege('authenticated','public.phase3_validate_document(text,jsonb)','EXECUTE')
 THEN RAISE EXCEPTION 'Blog validator execution privilege widened'; END IF;
END $test$;
