-- Forward rollback restores the previous validator in a new migration; content is unchanged.
LOCK TABLE public.cms_records, public.cms_revisions IN SHARE ROW EXCLUSIVE MODE;

-- Decode form parameters only as far as needed to recognize ASCII keys and video IDs.
CREATE FUNCTION public.youtube_form_decode(p_value text)
RETURNS text LANGUAGE plpgsql IMMUTABLE STRICT SET search_path=pg_catalog,public,pg_temp AS $f$
DECLARE result text := ''; i integer := 1; byte integer; ch text;
BEGIN
 WHILE i <= char_length(p_value) LOOP
  ch := substr(p_value,i,1);
  IF ch = '%' AND substr(p_value,i+1,2) ~ '^[0-9A-Fa-f]{2}$' THEN
   byte := get_byte(decode(substr(p_value,i+1,2),'hex'),0);
   IF byte = 0 OR byte > 127 THEN RETURN NULL; END IF;
   result := result || chr(byte);
   i := i + 3;
  ELSE
   result := result || CASE WHEN ch='+' THEN ' ' ELSE ch END;
   i := i + 1;
  END IF;
 END LOOP;
 RETURN result;
END $f$;

CREATE FUNCTION public.youtube_video_id(p_value text)
RETURNS text LANGUAGE plpgsql IMMUTABLE STRICT SET search_path=pg_catalog,public,pg_temp AS $f$
DECLARE
 input text := btrim(p_value,U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF');
 parts text[]; path_match text[]; item text; key text; val text; video text; v_count integer := 0; at_equal integer;
BEGIN
 IF char_length(input)>2048 THEN RETURN NULL; END IF;
 IF input ~ '^[A-Za-z0-9_-]{11}$' THEN RETURN input; END IF;
 IF input ~ '[\x00-\x1f\x7f\\]' THEN RETURN NULL; END IF;
 parts := regexp_match(input,'^https://(youtu\.be|www\.youtu\.be|youtube\.com|www\.youtube\.com|m\.youtube\.com|youtube-nocookie\.com|www\.youtube-nocookie\.com)(:443)?(/[^?#]*)(\?([^#]*))?(#.*)?$','i');
 IF parts IS NULL THEN RETURN NULL; END IF;
 IF parts[5] IS NOT NULL THEN
  FOREACH item IN ARRAY string_to_array(parts[5],'&') LOOP
   at_equal := strpos(item,'=');
   IF at_equal=0 THEN key := public.youtube_form_decode(item); val := '';
   ELSE key := public.youtube_form_decode(substr(item,1,at_equal-1)); val := public.youtube_form_decode(substr(item,at_equal+1)); END IF;
   IF key='v' THEN v_count := v_count+1; video := val; END IF;
  END LOOP;
 END IF;
 IF v_count>1 THEN RETURN NULL; END IF;
 IF lower(parts[1]) IN ('youtu.be','www.youtu.be') THEN
  path_match := regexp_match(parts[3],'^/([A-Za-z0-9_-]{11})/?$');
 ELSE
  path_match := regexp_match(parts[3],'^/(?:embed|shorts|live)/([A-Za-z0-9_-]{11})/?$');
  IF path_match IS NULL AND parts[3] ~ '^/watch/?$' AND v_count=1 AND video ~ '^[A-Za-z0-9_-]{11}$' THEN RETURN video; END IF;
 END IF;
 IF path_match IS NULL THEN RETURN NULL; END IF;
 RETURN path_match[1];
END $f$;
REVOKE ALL ON FUNCTION public.youtube_form_decode(text),public.youtube_video_id(text) FROM PUBLIC,anon,authenticated;

DO $f$
BEGIN
 IF EXISTS (SELECT 1 FROM public.cms_records WHERE kind='video' AND (jsonb_typeof(draft->'url') IS DISTINCT FROM 'string' OR public.youtube_video_id(draft->>'url') IS NULL))
 OR EXISTS (SELECT 1 FROM public.cms_revisions rev JOIN public.cms_records rec ON rec.id=rev.record_id
  WHERE rec.kind='video' AND (jsonb_typeof(rev.document->'url') IS DISTINCT FROM 'string' OR public.youtube_video_id(rev.document->>'url') IS NULL)) THEN
  RAISE EXCEPTION 'Review existing video drafts and revisions before applying this migration';
 END IF;
END $f$;

ALTER FUNCTION public.phase3_validate_document(text,jsonb) RENAME TO youtube_validate_document_before;
CREATE FUNCTION public.phase3_validate_document(p_kind text,p_document jsonb)
RETURNS void LANGUAGE plpgsql STABLE SET search_path=pg_catalog,public,pg_temp AS $f$
DECLARE video_id text;
BEGIN
 IF p_kind='video' THEN
  IF jsonb_typeof(p_document->'url') IS DISTINCT FROM 'string' OR char_length(p_document->>'url')>2048 OR octet_length(p_document::text)>262144 THEN PERFORM public.phase3_fail('invalid_input'); END IF;
  video_id := public.youtube_video_id(p_document->>'url');
  IF video_id IS NULL THEN PERFORM public.phase3_fail('invalid_input'); END IF;
  PERFORM public.youtube_validate_document_before(p_kind,jsonb_set(p_document,'{url}',to_jsonb(video_id)));
 ELSE
  PERFORM public.youtube_validate_document_before(p_kind,p_document);
 END IF;
END $f$;
REVOKE ALL ON FUNCTION public.phase3_validate_document(text,jsonb),public.youtube_validate_document_before(text,jsonb) FROM PUBLIC,anon,authenticated;

