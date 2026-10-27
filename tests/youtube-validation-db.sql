-- Read-only checks; run after the migration in a disposable database.
DO $test$
DECLARE input text; expected text := 'AbCdEf_123-'; doc jsonb := jsonb_build_object('title','Video check','slug','video-check','url','AbCdEf_123-','productIds','[]'::jsonb,'position',0); rejected boolean; detail text;
BEGIN
 FOREACH input IN ARRAY ARRAY[
  'AbCdEf_123-', 'https://youtu.be/AbCdEf_123-/', 'HTTPS://WWW.YOUTU.BE:443/AbCdEf_123-?t=5',
  'https://youtube.com/watch?feature=share&v=AbCdEf_123-', 'https://m.youtube.com/watch/?%76=AbCdEf%5F123%2D#x',
  'https://www.youtube-nocookie.com/live/AbCdEf_123-?v=ignored', 'https://youtube.com/embed/AbCdEf_123-', 'https://youtube.com/shorts/AbCdEf_123-'
 ] LOOP
  IF public.youtube_video_id(input) IS DISTINCT FROM expected THEN RAISE EXCEPTION 'valid video rejected: %',input; END IF;
  PERFORM public.phase3_validate_document('video',doc || jsonb_build_object('url',input));
 END LOOP;
 FOREACH input IN ARRAY ARRAY[
  'https://youtube.com/watch?v=AbCdEf_123-&%76=AbCdEf_123-', 'https://youtube.com/embed/AbCdEf_123-?v=x&v=y',
  'https://youtube.com/watch?v=AbCdEf_123-%00', 'https://youtube.com/watch?v=AbCdEf_123%ZZ',
  'https://youtube.com:444/watch?v=AbCdEf_123-', 'https://user@youtube.com/watch?v=AbCdEf_123-',
  'http://youtube.com/watch?v=AbCdEf_123-', 'https://youtube.com.evil.test/watch?v=AbCdEf_123-',
  'https://youtube.com/Watch?v=AbCdEf_123-', 'https://youtube.com/embed/AbCdEf_123-/extra',
  'https://youtube.com/watch?v=AbCdEf_123-\x', 'https://youtube.com/watch?v=AbCdEf_123-' || chr(1)
 ] LOOP
  IF public.youtube_video_id(input) IS NOT NULL THEN RAISE EXCEPTION 'invalid video accepted: %',input; END IF;
  rejected := false;
  BEGIN
   PERFORM public.phase3_validate_document('video',doc || jsonb_build_object('url',input));
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
   GET STACKED DIAGNOSTICS detail = PG_EXCEPTION_DETAIL;
   IF detail IS DISTINCT FROM 'invalid_input' THEN RAISE; END IF;
   rejected := true;
  END;
  IF NOT rejected THEN RAISE EXCEPTION 'invalid video document accepted'; END IF;
 END LOOP;
 IF has_function_privilege('anon','public.youtube_video_id(text)','EXECUTE') OR has_function_privilege('authenticated','public.youtube_video_id(text)','EXECUTE')
 OR has_function_privilege('anon','public.youtube_form_decode(text)','EXECUTE') OR has_function_privilege('authenticated','public.youtube_form_decode(text)','EXECUTE')
 OR has_function_privilege('anon','public.youtube_validate_document_before(text,jsonb)','EXECUTE') OR has_function_privilege('authenticated','public.youtube_validate_document_before(text,jsonb)','EXECUTE')
 OR has_function_privilege('anon','public.phase3_validate_document(text,jsonb)','EXECUTE') OR has_function_privilege('authenticated','public.phase3_validate_document(text,jsonb)','EXECUTE') THEN
  RAISE EXCEPTION 'video validator execution privilege widened';
 END IF;
END $test$;
