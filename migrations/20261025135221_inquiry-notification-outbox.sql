-- Development preparation only. Real delivery remains disabled in server configuration.
ALTER TABLE public.inquiry_notifications DROP CONSTRAINT inquiry_notifications_status_check;
ALTER TABLE public.inquiry_notifications
 ADD CONSTRAINT inquiry_notifications_status_check CHECK(status IN('unconfigured','leased','sending','accepted','failed','uncertain','suppressed')),
 ADD COLUMN version bigint NOT NULL DEFAULT 1 CHECK(version>0),
 ADD COLUMN attempt_count integer NOT NULL DEFAULT 0 CHECK(attempt_count BETWEEN 0 AND 5),
 ADD COLUMN lease_token uuid,
 ADD COLUMN lease_until timestamptz,
 ADD COLUMN last_attempt_at timestamptz,
 ADD COLUMN accepted_at timestamptz;

CREATE TABLE public.inquiry_notification_config (
 singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
 key_hash text NOT NULL CHECK(key_hash ~ '^[0-9a-f]{64}$')
);
ALTER TABLE public.inquiry_notification_config ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.inquiry_notification_config FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.assert_inquiry_dispatch_key(p_key text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $f$
BEGIN
 IF p_key IS NULL OR p_key !~ '^[0-9a-f]{64}$' OR NOT EXISTS(
  SELECT 1 FROM public.inquiry_notification_config WHERE singleton AND key_hash=encode(sha256(convert_to(p_key,'UTF8')),'hex')
 ) THEN PERFORM public.phase3_fail('forbidden'); END IF;
END $f$;
REVOKE ALL ON FUNCTION public.assert_inquiry_dispatch_key(text) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.inquiry_dto(p_inquiry public.inquiries) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $f$
 SELECT jsonb_build_object('id',p_inquiry.id,'name',p_inquiry.name,'email',p_inquiry.email,'phone',p_inquiry.phone,'subject',p_inquiry.subject,'message',p_inquiry.message,
 'status',p_inquiry.status,'version',p_inquiry.version,'createdAt',p_inquiry.created_at,
 'notificationStatus',CASE WHEN n.status='sending' AND n.lease_until<now() THEN 'uncertain' WHEN n.status='leased' AND n.lease_until<now() THEN 'unconfigured' ELSE n.status END,
 'notification',jsonb_build_object('status',CASE WHEN n.status='sending' AND n.lease_until<now() THEN 'uncertain' WHEN n.status='leased' AND n.lease_until<now() THEN 'unconfigured' ELSE n.status END,
 'version',n.version,'attempts',n.attempt_count,'lastAttemptAt',n.last_attempt_at,'acceptedAt',n.accepted_at))
 FROM public.inquiry_notifications n WHERE n.inquiry_id=p_inquiry.id
$f$;

CREATE FUNCTION public.admin_claim_inquiry_notification(p_id uuid,p_expected_version bigint,p_dispatch_key text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $f$
DECLARE actor text; i public.inquiries; n public.inquiry_notifications; token uuid;
BEGIN
 PERFORM public.assert_inquiry_dispatch_key(p_dispatch_key);
 actor:=public.admin_assert_capability('inquiries.manage');
 SELECT * INTO i FROM public.inquiries WHERE id=p_id FOR UPDATE;
 IF NOT FOUND THEN PERFORM public.phase3_fail('inquiry_not_found'); END IF;
 SELECT * INTO n FROM public.inquiry_notifications WHERE inquiry_id=p_id FOR UPDATE;
 IF NOT FOUND THEN PERFORM public.phase3_fail('inquiry_not_found'); END IF;
 IF p_expected_version IS NULL OR p_expected_version<>n.version THEN PERFORM public.phase3_fail('version_conflict'); END IF;
 IF i.status='spam' OR n.attempt_count>=5 OR NOT(n.status IN('unconfigured','failed') OR (n.status='leased' AND n.lease_until<now()))
 THEN PERFORM public.phase3_fail('invalid_state'); END IF;
 token:=gen_random_uuid();
 UPDATE public.inquiry_notifications SET status='leased',lease_token=token,lease_until=now()+interval '2 minutes',version=version+1 WHERE inquiry_id=p_id;
 INSERT INTO public.inquiry_notes(inquiry_id,text,actor) VALUES(p_id,CASE WHEN n.attempt_count>0 THEN 'Email notification retry requested.' ELSE 'Email notification requested.' END,actor);
 RETURN jsonb_build_object('token',token);
END $f$;

CREATE FUNCTION public.begin_inquiry_notification(p_id uuid,p_token uuid,p_dispatch_key text) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $f$
DECLARE i public.inquiries; n public.inquiry_notifications;
BEGIN
 PERFORM public.assert_inquiry_dispatch_key(p_dispatch_key);
 PERFORM public.admin_assert_capability('inquiries.manage');
 SELECT * INTO i FROM public.inquiries WHERE id=p_id FOR UPDATE;
 IF NOT FOUND THEN PERFORM public.phase3_fail('inquiry_not_found'); END IF;
 SELECT * INTO n FROM public.inquiry_notifications WHERE inquiry_id=p_id FOR UPDATE;
 IF NOT FOUND THEN PERFORM public.phase3_fail('inquiry_not_found'); END IF;
 IF p_token IS NULL OR n.lease_token IS DISTINCT FROM p_token THEN PERFORM public.phase3_fail('version_conflict'); END IF;
 IF n.status='suppressed' THEN RETURN false; END IF;
 IF n.status<>'leased' OR n.lease_until IS NULL OR n.lease_until<=now() OR n.attempt_count>=5 THEN PERFORM public.phase3_fail('invalid_state'); END IF;
 IF i.status='spam' THEN
  UPDATE public.inquiry_notifications SET status='suppressed',version=version+1,lease_until=NULL WHERE inquiry_id=p_id;
  RETURN false;
 END IF;
 UPDATE public.inquiry_notifications SET status='sending',attempt_count=attempt_count+1,last_attempt_at=now(),lease_until=now()+interval '2 minutes',version=version+1 WHERE inquiry_id=p_id;
 RETURN true;
END $f$;

CREATE FUNCTION public.finish_inquiry_notification(p_id uuid,p_token uuid,p_outcome text,p_dispatch_key text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $f$
DECLARE n public.inquiry_notifications;
BEGIN
 PERFORM public.assert_inquiry_dispatch_key(p_dispatch_key);
 IF p_outcome IS NULL OR p_outcome NOT IN('accepted','failed','uncertain','suppressed') THEN PERFORM public.phase3_fail('invalid_input'); END IF;
 SELECT * INTO n FROM public.inquiry_notifications WHERE inquiry_id=p_id FOR UPDATE;
 IF NOT FOUND THEN PERFORM public.phase3_fail('inquiry_not_found'); END IF;
 IF p_token IS NULL OR n.lease_token IS DISTINCT FROM p_token THEN PERFORM public.phase3_fail('version_conflict'); END IF;
 IF n.status=p_outcome THEN RETURN; END IF;
 IF n.status<>'sending' THEN PERFORM public.phase3_fail('invalid_state'); END IF;
 UPDATE public.inquiry_notifications SET status=p_outcome,version=version+1,lease_until=NULL,
 accepted_at=CASE WHEN p_outcome='accepted' THEN now() ELSE NULL END WHERE inquiry_id=p_id;
END $f$;

REVOKE ALL ON FUNCTION public.admin_claim_inquiry_notification(uuid,bigint,text),public.begin_inquiry_notification(uuid,uuid,text),public.finish_inquiry_notification(uuid,uuid,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.admin_claim_inquiry_notification(uuid,bigint,text),public.begin_inquiry_notification(uuid,uuid,text),public.finish_inquiry_notification(uuid,uuid,text,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_update_inquiry(p_id uuid,p_expected_version bigint,p_status text,p_note text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $f$
DECLARE actor text; i public.inquiries;
BEGIN
 actor:=public.admin_assert_capability('inquiries.manage');
 IF p_status IS NULL OR p_status NOT IN('new','in_progress','resolved','spam') OR p_note IS NULL OR char_length(p_note)>2000 THEN PERFORM public.phase3_fail('invalid_input'); END IF;
 SELECT * INTO i FROM public.inquiries WHERE id=p_id FOR UPDATE;
 IF NOT FOUND THEN PERFORM public.phase3_fail('inquiry_not_found'); END IF;
 IF p_expected_version IS NULL OR p_expected_version<>i.version THEN PERFORM public.phase3_fail('version_conflict'); END IF;
 INSERT INTO public.inquiry_notes(inquiry_id,text,actor) VALUES(p_id,'Status: '||p_status||CASE WHEN btrim(p_note)<>'' THEN E'\n'||btrim(p_note) ELSE '' END,actor);
 UPDATE public.inquiries SET status=p_status,version=version+1,updated_at=now() WHERE id=p_id;
 IF p_status='spam' THEN
  UPDATE public.inquiry_notifications SET status='suppressed',version=version+1,lease_until=NULL
  WHERE inquiry_id=p_id AND status IN('unconfigured','leased','failed');
 END IF;
 RETURN public.admin_get_inquiry(p_id);
END $f$;

-- The public receipt reports current queue state without exposing job credentials.
CREATE OR REPLACE FUNCTION public.submit_verified_inquiry(p_name text,p_email text,p_phone text,p_subject text,p_message text,p_request_id uuid,p_submission_key text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $f$
DECLARE expected_hash text; result jsonb;
BEGIN
 IF p_submission_key IS NULL OR p_submission_key !~ '^[0-9a-f]{64}$' THEN PERFORM public.phase3_fail('forbidden'); END IF;
 SELECT key_hash INTO expected_hash FROM public.contact_submission_config WHERE singleton=true;
 IF expected_hash IS NULL THEN PERFORM public.phase3_fail('contact_unconfigured'); END IF;
 IF encode(sha256(convert_to(p_submission_key,'UTF8')),'hex')<>expected_hash THEN PERFORM public.phase3_fail('forbidden'); END IF;
 result:=public.submit_inquiry(p_name,p_email,p_phone,p_subject,p_message,p_request_id);
 RETURN result||jsonb_build_object('notificationStatus',(SELECT status FROM public.inquiry_notifications WHERE inquiry_id=(result->>'receipt')::uuid));
END $f$;
