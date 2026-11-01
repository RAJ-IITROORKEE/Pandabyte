-- Private attachment metadata is committed before storage writes. Incomplete uploads
-- remain attached to the inquiry and can be completed by an idempotent retry.
ALTER TABLE public.inquiries ADD COLUMN attachment_manifest jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.inquiries ADD COLUMN attachment_attempts integer NOT NULL DEFAULT 0;
ALTER TABLE public.inquiries ADD COLUMN attachment_attempt_window timestamptz;
CREATE TABLE public.inquiry_attachments (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), inquiry_id uuid NOT NULL REFERENCES public.inquiries(id),
 position integer NOT NULL CHECK(position BETWEEN 0 AND 2), filename text NOT NULL,
 mime_type text NOT NULL, byte_size integer NOT NULL, sha256 text NOT NULL,
 object_key text NOT NULL UNIQUE, ready boolean NOT NULL DEFAULT false,
 UNIQUE(inquiry_id,position)
);
ALTER TABLE public.inquiry_attachments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.inquiry_attachments FROM PUBLIC,anon,authenticated;
-- Bucket creation may install permissive policies; restrictive policies AND them.
CREATE POLICY private_inquiry_attachments_boundary ON storage.objects
AS RESTRICTIVE FOR ALL TO anon,authenticated
USING (bucket <> 'private-inquiry-attachments')
WITH CHECK (bucket <> 'private-inquiry-attachments');

CREATE FUNCTION public.submit_inquiry_with_attachments(p_name text,p_email text,p_phone text,p_subject text,p_message text,p_request_id uuid,p_submission_key text,p_attachments jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $f$
DECLARE result jsonb; item jsonb; idx integer:=0; iid uuid; existing jsonb; completed boolean; attempts integer; attempt_window timestamptz; prior boolean; expected_hash text;
BEGIN
 IF p_submission_key IS NULL OR p_submission_key !~ '^[0-9a-f]{64}$' THEN PERFORM public.phase3_fail('forbidden'); END IF;
 SELECT key_hash INTO expected_hash FROM public.contact_submission_config WHERE singleton=true;
 IF expected_hash IS NULL THEN PERFORM public.phase3_fail('contact_unconfigured'); END IF;
 IF encode(sha256(convert_to(p_submission_key,'UTF8')),'hex')<>expected_hash THEN PERFORM public.phase3_fail('forbidden'); END IF;
 IF p_attachments IS NULL OR jsonb_typeof(p_attachments)<>'array' OR jsonb_array_length(p_attachments)>3 THEN PERFORM public.phase3_fail('invalid_input'); END IF;
 FOR item IN SELECT value FROM jsonb_array_elements(p_attachments) LOOP
  IF jsonb_typeof(item)<>'object' OR (SELECT count(*) FROM jsonb_object_keys(item))<>5
   OR coalesce(item->>'filename','') !~* '^[A-Za-z0-9][A-Za-z0-9 _.-]{0,115}\.(pdf|png|webp|jpg|jpeg)$'
   OR coalesce(item->>'mimeType','') NOT IN ('application/pdf','image/jpeg','image/png','image/webp')
   OR coalesce(item->>'size','') !~ '^[0-9]{1,7}$' OR (item->>'size')::integer NOT BETWEEN 1 AND 1048576
   OR coalesce(item->>'sha256','') !~ '^[0-9a-f]{64}$'
   OR item->>'key' IS DISTINCT FROM 'inquiries/'||p_request_id::text||'/'||idx::text||'-'||(item->>'sha256') THEN PERFORM public.phase3_fail('invalid_input'); END IF;
  idx:=idx+1;
 END LOOP;
 -- Share submit_inquiry's lock so the prior/new decision cannot race another request.
 PERFORM pg_advisory_xact_lock(832642);
 SELECT EXISTS(SELECT 1 FROM public.inquiries WHERE request_id=p_request_id) INTO prior;
 result:=public.submit_verified_inquiry(p_name,p_email,p_phone,p_subject,p_message,p_request_id,p_submission_key);
 iid:=(result->>'receipt')::uuid;
 SELECT attachment_manifest,attachment_attempts,attachment_attempt_window INTO existing,attempts,attempt_window FROM public.inquiries WHERE id=iid FOR UPDATE;
 IF prior AND existing<>p_attachments THEN PERFORM public.phase3_fail('request_conflict'); END IF;
 IF NOT prior THEN
  UPDATE public.inquiries SET attachment_manifest=p_attachments WHERE id=iid;
  idx:=0;
  FOR item IN SELECT value FROM jsonb_array_elements(p_attachments) LOOP
   INSERT INTO public.inquiry_attachments(inquiry_id,position,filename,mime_type,byte_size,sha256,object_key)
    VALUES(iid,idx,item->>'filename',item->>'mimeType',(item->>'size')::integer,item->>'sha256',item->>'key');
   idx:=idx+1;
  END LOOP;
 END IF;
 SELECT NOT EXISTS(SELECT 1 FROM public.inquiry_attachments WHERE inquiry_id=iid AND NOT ready) INTO completed;
 IF NOT completed THEN
  IF attempt_window IS NULL OR attempt_window < now()-interval '1 hour' THEN attempts:=0; attempt_window:=now(); END IF;
  IF attempts>=5 THEN PERFORM public.phase3_fail('rate_limited'); END IF;
  UPDATE public.inquiries SET attachment_attempts=attempts+1,attachment_attempt_window=attempt_window WHERE id=iid;
 END IF;
 RETURN result||jsonb_build_object('attachmentsReady',completed);
END $f$;

CREATE FUNCTION public.finish_inquiry_attachments(p_request_id uuid,p_submission_key text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $f$
DECLARE expected_hash text;
BEGIN
 SELECT key_hash INTO expected_hash FROM public.contact_submission_config WHERE singleton=true;
 IF p_submission_key IS NULL OR p_submission_key !~ '^[0-9a-f]{64}$' OR expected_hash IS NULL OR encode(sha256(convert_to(p_submission_key,'UTF8')),'hex')<>expected_hash THEN PERFORM public.phase3_fail('forbidden'); END IF;
 UPDATE public.inquiry_attachments SET ready=true WHERE inquiry_id=(SELECT id FROM public.inquiries WHERE request_id=p_request_id);
END $f$;

CREATE FUNCTION public.admin_inquiry_attachments(p_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $f$
BEGIN
 PERFORM public.admin_assert_capability('inquiries.manage');
 IF NOT EXISTS(SELECT 1 FROM public.inquiries WHERE id=p_id) THEN PERFORM public.phase3_fail('inquiry_not_found'); END IF;
 RETURN jsonb_build_object('attachments',coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'filename',filename,'mimeType',mime_type,'size',byte_size,'ready',ready) ORDER BY position) FROM public.inquiry_attachments WHERE inquiry_id=p_id),'[]'::jsonb));
END $f$;

CREATE FUNCTION public.admin_inquiry_attachment(p_inquiry_id uuid,p_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $f$
DECLARE a public.inquiry_attachments;
BEGIN
 PERFORM public.admin_assert_capability('inquiries.manage');
 SELECT * INTO a FROM public.inquiry_attachments WHERE inquiry_id=p_inquiry_id AND id=p_id AND ready;
 IF NOT FOUND THEN PERFORM public.phase3_fail('inquiry_not_found'); END IF;
 RETURN jsonb_build_object('key',a.object_key,'size',a.byte_size,'sha256',a.sha256,'filename',a.filename);
END $f$;
REVOKE ALL ON FUNCTION public.submit_inquiry_with_attachments(text,text,text,text,text,uuid,text,jsonb),public.finish_inquiry_attachments(uuid,text),public.admin_inquiry_attachments(uuid),public.admin_inquiry_attachment(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.submit_inquiry_with_attachments(text,text,text,text,text,uuid,text,jsonb),public.finish_inquiry_attachments(uuid,text) TO anon,authenticated;
GRANT EXECUTE ON FUNCTION public.admin_inquiry_attachments(uuid),public.admin_inquiry_attachment(uuid,uuid) TO authenticated;
