-- Forward rollback restores the prior validator in a new migration; no content is modified.
LOCK TABLE public.cms_records, public.cms_revisions IN SHARE ROW EXCLUSIVE MODE;
DO $f$
DECLARE whitespace text := U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF';
BEGIN
 IF EXISTS (SELECT 1 FROM public.cms_records WHERE kind='team' AND COALESCE(btrim(draft->>'name',whitespace),'')='')
 OR EXISTS (SELECT 1 FROM public.cms_revisions rev JOIN public.cms_records rec ON rec.id=rev.record_id
   WHERE rec.kind='team' AND COALESCE(btrim(rev.document->>'name',whitespace),'')='') THEN
  RAISE EXCEPTION 'Review existing team profiles with blank names before applying this migration';
 END IF;
END $f$;

ALTER FUNCTION public.phase3_validate_document(text,jsonb) RENAME TO team_name_validate_document_before;
CREATE FUNCTION public.phase3_validate_document(p_kind text,p_document jsonb)
RETURNS void LANGUAGE plpgsql STABLE SET search_path=pg_catalog,public,pg_temp AS $f$
BEGIN
 PERFORM public.team_name_validate_document_before(p_kind,p_document);
 IF p_kind='team' AND btrim(p_document->>'name',U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF')='' THEN
  PERFORM public.phase3_fail('invalid_input');
 END IF;
END $f$;
REVOKE ALL ON FUNCTION public.phase3_validate_document(text,jsonb),public.team_name_validate_document_before(text,jsonb) FROM PUBLIC,anon,authenticated;
