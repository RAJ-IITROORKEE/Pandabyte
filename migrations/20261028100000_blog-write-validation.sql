-- Forward rollback removes this wrapper and restores the previous validator; no content is changed.
LOCK TABLE public.cms_records, public.cms_revisions IN SHARE ROW EXCLUSIVE MODE;

CREATE FUNCTION public.blog_write_fields_valid(p_document jsonb)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path=pg_catalog,public,pg_temp AS $f$
 SELECT jsonb_typeof(p_document->'author') IS NOT DISTINCT FROM 'string'
   AND p_document->>'author' = btrim(p_document->>'author', U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF')
   AND p_document->>'author' !~ '[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]'
   AND jsonb_typeof(p_document->'tags') IS NOT DISTINCT FROM 'array'
   AND NOT EXISTS (
     SELECT 1 FROM public.phase3_jsonb_array_elements(p_document->'tags') AS vals(value)
     WHERE jsonb_typeof(value) IS DISTINCT FROM 'string'
       OR btrim(value #>> '{}', U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF') = ''
       OR value #>> '{}' <> btrim(value #>> '{}', U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF')
       OR value #>> '{}' ~ '[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]'
   );
$f$;
REVOKE ALL ON FUNCTION public.blog_write_fields_valid(jsonb) FROM PUBLIC,anon,authenticated;

DO $f$
BEGIN
 IF EXISTS (SELECT 1 FROM public.cms_records WHERE kind='blog' AND public.blog_write_fields_valid(draft) IS NOT TRUE)
 OR EXISTS (SELECT 1 FROM public.cms_revisions rev JOIN public.cms_records rec ON rec.id=rev.record_id
   WHERE rec.kind='blog' AND public.blog_write_fields_valid(rev.document) IS NOT TRUE) THEN
  RAISE EXCEPTION 'Review existing Blog drafts and revisions before applying this migration';
 END IF;
END $f$;

ALTER FUNCTION public.phase3_validate_document(text,jsonb) RENAME TO blog_validate_document_before;
CREATE FUNCTION public.phase3_validate_document(p_kind text,p_document jsonb)
RETURNS void LANGUAGE plpgsql STABLE SET search_path=pg_catalog,public,pg_temp AS $f$
BEGIN
 PERFORM public.blog_validate_document_before(p_kind,p_document);
 IF p_kind='blog' AND public.blog_write_fields_valid(p_document) IS NOT TRUE THEN
  PERFORM public.phase3_fail('invalid_input');
 END IF;
END $f$;
REVOKE ALL ON FUNCTION public.phase3_validate_document(text,jsonb),public.blog_validate_document_before(text,jsonb) FROM PUBLIC,anon,authenticated;
