-- Fail closed until a project operator provisions the matching server-only key hash.
CREATE TABLE public.contact_submission_config (
 singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
 key_hash text NOT NULL CHECK(key_hash ~ '^[0-9a-f]{64}$'),
 updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.contact_submission_config ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.contact_submission_config FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.submit_verified_inquiry(
 p_name text,p_email text,p_phone text,p_subject text,p_message text,p_request_id uuid,p_submission_key text
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $f$
DECLARE expected_hash text;
BEGIN
 IF p_submission_key IS NULL OR p_submission_key !~ '^[0-9a-f]{64}$' THEN
  PERFORM public.phase3_fail('forbidden');
 END IF;
 SELECT key_hash INTO expected_hash FROM public.contact_submission_config WHERE singleton=true;
 IF expected_hash IS NULL THEN PERFORM public.phase3_fail('contact_unconfigured'); END IF;
 IF encode(sha256(convert_to(p_submission_key,'UTF8')),'hex')<>expected_hash THEN
  PERFORM public.phase3_fail('forbidden');
 END IF;
 RETURN public.submit_inquiry(p_name,p_email,p_phone,p_subject,p_message,p_request_id);
END $f$;
REVOKE ALL ON FUNCTION public.submit_verified_inquiry(text,text,text,text,text,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.submit_verified_inquiry(text,text,text,text,text,uuid,text) TO anon,authenticated;
REVOKE ALL ON FUNCTION public.submit_inquiry(text,text,text,text,text,uuid) FROM PUBLIC,anon,authenticated;
