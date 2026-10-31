-- Additive Control Room intake metadata only. Root applies transactionally after review.
-- No storage provisioning, canonical mutation, fetch, worker, evaluation or promotion.
CREATE TABLE public.panda_agent_intakes (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 created_by text NOT NULL CHECK(char_length(created_by) BETWEEN 1 AND 256 AND created_by !~ '[[:cntrl:]]'),
 idempotency_key text NOT NULL CHECK(idempotency_key ~ '^[A-Za-z0-9_-]{16,128}$'),
 input_hash text NOT NULL CHECK(input_hash ~ '^[0-9a-f]{64}$'),
 kind text NOT NULL CHECK(kind IN ('link','upload')),
 title text NOT NULL CHECK(char_length(title) BETWEEN 1 AND 180 AND title=btrim(title) AND title !~ '[[:cntrl:]]'),
 source_url text, filename text, media_type text, expected_size integer, expected_sha256 text,
 object_key text GENERATED ALWAYS AS (CASE WHEN kind='upload' THEN 'intakes/'||id::text||'/source.'||CASE media_type WHEN 'application/pdf' THEN 'pdf' WHEN 'text/markdown' THEN 'md' ELSE 'txt' END ELSE NULL END) STORED,
 publisher text NOT NULL CHECK(char_length(publisher)<=120 AND publisher !~ '[[:cntrl:]]'),
 purpose text NOT NULL CHECK(char_length(purpose)<=500 AND purpose !~ '[[:cntrl:]]'),
 rights_statement text NOT NULL CHECK(char_length(rights_statement)<=1000 AND rights_statement !~ '[[:cntrl:]]'),
 status text NOT NULL CHECK(status IN ('upload_pending','pending_review','accepted_for_preparation','rejected','upload_failed','upload_outcome_unknown')),
 integrity_status text NOT NULL DEFAULT 'integrity_pending' CHECK(integrity_status='integrity_pending'),
 rights_status text NOT NULL DEFAULT 'unknown' CHECK(rights_status IN ('unknown','permitted','denied')),
 review_decision text CHECK(review_decision IN ('accept_for_preparation','reject')),
 rights_evidence text CHECK(char_length(rights_evidence) BETWEEN 1 AND 1000 AND rights_evidence !~ '[[:cntrl:]]'),
 review_reason text CHECK(char_length(review_reason) BETWEEN 1 AND 500 AND review_reason !~ '[[:cntrl:]]'),
 reviewed_by text CHECK(reviewed_by IS NULL OR (char_length(reviewed_by) BETWEEN 1 AND 256 AND reviewed_by !~ '[[:cntrl:]]')), reviewed_at timestamptz,
 upload_outcome_reason text CHECK(char_length(upload_outcome_reason) BETWEEN 1 AND 500 AND upload_outcome_reason !~ '[[:cntrl:]]'),
 version bigint NOT NULL DEFAULT 1 CHECK(version BETWEEN 1 AND 9007199254740991),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(created_by,idempotency_key),
 CHECK((kind='link' AND source_url IS NOT NULL AND filename IS NULL AND media_type IS NULL AND expected_size IS NULL AND expected_sha256 IS NULL AND status NOT IN ('upload_pending','upload_failed','upload_outcome_unknown')) OR
       (kind='upload' AND source_url IS NULL AND filename IS NOT NULL AND media_type IS NOT NULL AND expected_size IS NOT NULL AND expected_sha256 IS NOT NULL AND char_length(filename) BETWEEN 1 AND 180 AND filename !~ '[[:cntrl:]]' AND position('/' in filename)=0 AND position(chr(92) in filename)=0
        AND expected_size BETWEEN 1 AND 3145728 AND expected_sha256 ~ '^[0-9a-f]{64}$'
        AND ((media_type='application/pdf' AND lower(filename) ~ '\.pdf$') OR (media_type='text/markdown' AND lower(filename) ~ '\.md$') OR (media_type='text/plain' AND lower(filename) ~ '\.txt$')))),
 CHECK((review_decision IS NULL AND reviewed_by IS NULL AND reviewed_at IS NULL AND rights_evidence IS NULL AND review_reason IS NULL AND rights_status='unknown' AND status NOT IN ('accepted_for_preparation','rejected')) OR
       (review_decision IS NOT NULL AND reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL AND rights_evidence IS NOT NULL AND review_reason IS NOT NULL AND
        ((review_decision='accept_for_preparation' AND status='accepted_for_preparation' AND rights_status='permitted') OR (review_decision='reject' AND status='rejected'))))
);
CREATE INDEX panda_agent_intakes_page ON public.panda_agent_intakes(created_at DESC,id DESC);
CREATE INDEX panda_agent_intakes_status_page ON public.panda_agent_intakes(status,created_at DESC,id DESC);
CREATE TABLE public.panda_agent_intake_events (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 intake_id uuid NOT NULL REFERENCES public.panda_agent_intakes(id) ON DELETE RESTRICT,
 intake_version bigint NOT NULL CHECK(intake_version>0),
 action text NOT NULL CHECK(action IN ('register_link','reserve_upload','record_upload_outcome','review')),
 actor text NOT NULL CHECK(char_length(actor) BETWEEN 1 AND 256 AND actor !~ '[[:cntrl:]]'),
 previous_status text CHECK(previous_status IS NULL OR previous_status IN ('upload_pending','pending_review','accepted_for_preparation','rejected','upload_failed','upload_outcome_unknown')),
 status text NOT NULL CHECK(status IN ('upload_pending','pending_review','accepted_for_preparation','rejected','upload_failed','upload_outcome_unknown')), rights_status text NOT NULL CHECK(rights_status IN ('unknown','permitted','denied')),
 reason text NOT NULL CHECK(char_length(reason) BETWEEN 1 AND 500 AND reason !~ '[[:cntrl:]]'),
 created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(intake_id,intake_version)
);
ALTER TABLE public.panda_agent_intakes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.panda_agent_intake_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.panda_agent_intakes,public.panda_agent_intake_events FROM PUBLIC,anon,authenticated;
REVOKE ALL ON SEQUENCE public.panda_agent_intake_events_id_seq FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.panda_agent_control_room_admin() RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE actor text;
BEGIN
 -- staff_apply_role/staff_set_role acquire EXCLUSIVE on this identical key.
 PERFORM pg_advisory_xact_lock_shared(hashtextextended('staff-role-memberships',0));
 actor:=public.requesting_user_id();
 IF actor IS NULL THEN PERFORM public.phase3_fail('unauthenticated'); END IF;
 IF NOT EXISTS(SELECT 1 FROM public.staff_role_memberships WHERE user_id=actor AND role='ADMIN') THEN PERFORM public.phase3_fail('forbidden'); END IF;
 RETURN actor;
END $$;
CREATE FUNCTION public.panda_agent_control_room_text(p_value text,p_max integer,p_min integer DEFAULT 0) RETURNS boolean
LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $$
 SELECT p_value IS NOT NULL AND char_length(p_value) BETWEEN p_min AND p_max AND p_value=btrim(p_value) AND p_value !~ '[[:cntrl:]]'
$$;
CREATE FUNCTION public.panda_agent_control_room_url(p_url text) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog AS $$
DECLARE authority text; host text; label text;
BEGIN
 IF p_url IS NULL OR char_length(p_url) NOT BETWEEN 1 AND 2048 OR p_url ~ '[[:space:][:cntrl:]]' OR position(chr(92) in p_url)>0
    OR p_url !~ '^https://[A-Za-z0-9.-]+(:443)?(/[^?#]*)?$' THEN RETURN false; END IF;
 authority:=split_part(substring(p_url from 9),'/',1); host:=lower(regexp_replace(authority,':443$',''));
 IF char_length(host)>253 OR host !~ '^[a-z0-9][a-z0-9.-]*\.[a-z]{2,63}$'
    OR host ~ '(^|\.)(localhost|local|localdomain|internal|invalid|test|onion|lan|home)$' THEN RETURN false; END IF;
 FOREACH label IN ARRAY string_to_array(host,'.') LOOP
  IF char_length(label) NOT BETWEEN 1 AND 63 OR label !~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?$' THEN RETURN false; END IF;
 END LOOP;
 RETURN true; -- Syntax only. No DNS/fetch/redirect/SSRF certification.
END $$;
ALTER TABLE public.panda_agent_intakes ADD CONSTRAINT panda_agent_intake_url CHECK(source_url IS NULL OR public.panda_agent_control_room_url(source_url));

CREATE FUNCTION public.panda_agent_control_room_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public,pg_temp AS $$
BEGIN
 IF TG_OP='DELETE' OR TG_TABLE_NAME='panda_agent_intake_events' THEN RAISE EXCEPTION 'immutable intake history'; END IF;
 -- Do not read the generated object_key in a BEFORE trigger.
 IF (NEW.id,NEW.created_by,NEW.idempotency_key,NEW.input_hash,NEW.kind,NEW.title,NEW.source_url,NEW.filename,NEW.media_type,NEW.expected_size,NEW.expected_sha256,NEW.publisher,NEW.purpose,NEW.rights_statement,NEW.integrity_status,NEW.created_at) IS DISTINCT FROM
    (OLD.id,OLD.created_by,OLD.idempotency_key,OLD.input_hash,OLD.kind,OLD.title,OLD.source_url,OLD.filename,OLD.media_type,OLD.expected_size,OLD.expected_sha256,OLD.publisher,OLD.purpose,OLD.rights_statement,OLD.integrity_status,OLD.created_at)
    OR NEW.version<>OLD.version+1 OR NEW.updated_at<OLD.updated_at
    OR NOT ((OLD.kind='upload' AND OLD.status='upload_pending' AND NEW.status IN ('pending_review','upload_failed','upload_outcome_unknown') AND
             (NEW.rights_status,NEW.review_decision,NEW.rights_evidence,NEW.review_reason,NEW.reviewed_by,NEW.reviewed_at) IS NOT DISTINCT FROM
             (OLD.rights_status,OLD.review_decision,OLD.rights_evidence,OLD.review_reason,OLD.reviewed_by,OLD.reviewed_at)) OR
            (OLD.status='pending_review' AND NEW.status IN ('accepted_for_preparation','rejected') AND NEW.upload_outcome_reason IS NOT DISTINCT FROM OLD.upload_outcome_reason))
 THEN RAISE EXCEPTION 'immutable intake identity or invalid transition'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER panda_agent_intakes_guard BEFORE UPDATE OR DELETE ON public.panda_agent_intakes FOR EACH ROW EXECUTE FUNCTION public.panda_agent_control_room_guard();
CREATE TRIGGER panda_agent_intake_events_guard BEFORE UPDATE OR DELETE ON public.panda_agent_intake_events FOR EACH ROW EXECUTE FUNCTION public.panda_agent_control_room_guard();
CREATE FUNCTION public.panda_agent_control_room_dto(p_row public.panda_agent_intakes) RETURNS jsonb
LANGUAGE sql STABLE SET search_path=pg_catalog AS $$
 SELECT jsonb_build_object('reference',(p_row).id,'title',(p_row).title,'kind',(p_row).kind,'status',(p_row).status,
  'rightsStatus',(p_row).rights_status,'integrityStatus',(p_row).integrity_status,'createdAt',(p_row).created_at,'updatedAt',(p_row).updated_at,'version',(p_row).version,
  'publisher',(p_row).publisher,'purpose',(p_row).purpose,'rightsStatement',(p_row).rights_statement,
  'sourceSummary',CASE WHEN (p_row).kind='link' THEN jsonb_build_object('url',(p_row).source_url,'fetched',false) ELSE NULL END,
  'uploadSummary',CASE WHEN (p_row).kind='upload' THEN jsonb_build_object('filename',(p_row).filename,'mediaType',(p_row).media_type,'expectedSize',(p_row).expected_size,'expectedSha256',(p_row).expected_sha256) ELSE NULL END,
  'reviewSummary',CASE WHEN (p_row).review_decision IS NOT NULL THEN jsonb_build_object('decision',(p_row).review_decision,'reason',(p_row).review_reason,'rightsEvidence',(p_row).rights_evidence,'reviewedAt',(p_row).reviewed_at) ELSE NULL END)
$$;

CREATE FUNCTION public.panda_agent_control_room_overview() RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
BEGIN
 PERFORM public.panda_agent_control_room_admin();
 RETURN jsonb_build_object('counts',jsonb_build_object('sources',(SELECT count(*) FROM public.panda_agent_sources),'versions',(SELECT count(*) FROM public.panda_agent_versions),'chunks',(SELECT count(*) FROM public.panda_agent_chunks),
   'approvedVersions',(SELECT count(*) FROM public.panda_agent_versions v JOIN public.panda_agent_sources s ON s.id=v.source_id WHERE v.state='approved' AND s.review_state='approved' AND s.rights_status='permitted' AND v.withdrawn_at IS NULL AND v.deleted_at IS NULL AND s.withdrawn_at IS NULL AND s.deleted_at IS NULL)),
  'candidateSummary',jsonb_build_object('sealedInactive',(SELECT count(*) FROM public.panda_agent_releases WHERE state='candidate' AND sealed),'invalidated',(SELECT count(*) FROM public.panda_agent_releases WHERE state='invalidated'),'activeReleaseExists',false),
  'intakeSummary',(SELECT coalesce(jsonb_object_agg(status,n),'{}'::jsonb) FROM (SELECT status,count(*) n FROM public.panda_agent_intakes GROUP BY status) q),
  'availability',jsonb_build_object('metadata','ready','uploads','unconfigured','retrieval','unavailable','evaluation','unavailable','promotion','unsupported'));
END $$;
CREATE FUNCTION public.panda_agent_control_room_list_intakes(p_limit integer DEFAULT 20,p_before timestamptz DEFAULT NULL,p_before_id uuid DEFAULT NULL,p_status text DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE result jsonb;
BEGIN
 PERFORM public.panda_agent_control_room_admin();
 IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 50 OR (p_before IS NULL)<>(p_before_id IS NULL) OR
    (p_status IS NOT NULL AND p_status NOT IN ('upload_pending','pending_review','accepted_for_preparation','rejected','upload_failed','upload_outcome_unknown')) THEN PERFORM public.phase3_fail('invalid_input'); END IF;
 WITH page AS (SELECT i AS item,i.created_at,i.id FROM public.panda_agent_intakes i WHERE (p_status IS NULL OR i.status=p_status) AND (p_before IS NULL OR (i.created_at,i.id)<(p_before,p_before_id)) ORDER BY i.created_at DESC,i.id DESC LIMIT p_limit+1),
 visible AS (SELECT * FROM page ORDER BY created_at DESC,id DESC LIMIT p_limit)
 SELECT jsonb_build_object('items',coalesce((SELECT jsonb_agg(public.panda_agent_control_room_dto(v.item) ORDER BY v.created_at DESC,v.id DESC) FROM visible v),'[]'::jsonb),
  'nextCursor',CASE WHEN (SELECT count(*) FROM page)>p_limit THEN (SELECT jsonb_build_object('before',created_at,'beforeId',id) FROM visible ORDER BY created_at,id LIMIT 1) ELSE NULL END) INTO result;
 RETURN result;
END $$;
CREATE FUNCTION public.panda_agent_control_room_get_intake(p_reference uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE item public.panda_agent_intakes;
BEGIN
 PERFORM public.panda_agent_control_room_admin();
 SELECT * INTO item FROM public.panda_agent_intakes WHERE id=p_reference;
 IF NOT FOUND THEN PERFORM public.phase3_fail('not_found'); END IF;
 RETURN public.panda_agent_control_room_dto(item);
END $$;

CREATE FUNCTION public.panda_agent_control_room_register_link(p_key text,p_title text,p_url text,p_publisher text,p_purpose text,p_rights_statement text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE actor text; fingerprint text; item public.panda_agent_intakes;
BEGIN
 actor:=public.panda_agent_control_room_admin();
 IF p_key IS NULL OR p_key !~ '^[A-Za-z0-9_-]{16,128}$' OR NOT public.panda_agent_control_room_text(p_title,180,1) OR NOT public.panda_agent_control_room_url(p_url)
    OR NOT public.panda_agent_control_room_text(p_publisher,120) OR NOT public.panda_agent_control_room_text(p_purpose,500) OR NOT public.panda_agent_control_room_text(p_rights_statement,1000) THEN PERFORM public.phase3_fail('invalid_input'); END IF;
 fingerprint:=encode(sha256(convert_to(jsonb_build_array('link',p_title,p_url,p_publisher,p_purpose,p_rights_statement)::text,'UTF8')),'hex');
 INSERT INTO public.panda_agent_intakes(created_by,idempotency_key,input_hash,kind,title,source_url,publisher,purpose,rights_statement,status)
 VALUES(actor,p_key,fingerprint,'link',p_title,p_url,p_publisher,p_purpose,p_rights_statement,'pending_review') ON CONFLICT(created_by,idempotency_key) DO NOTHING RETURNING * INTO item;
 IF NOT FOUND THEN
  SELECT * INTO item FROM public.panda_agent_intakes WHERE created_by=actor AND idempotency_key=p_key FOR UPDATE;
  IF item.input_hash IS DISTINCT FROM fingerprint THEN PERFORM public.phase3_fail('request_conflict'); END IF;
 ELSE
  INSERT INTO public.panda_agent_intake_events(intake_id,intake_version,action,actor,status,rights_status,reason) VALUES(item.id,item.version,'register_link',actor,item.status,item.rights_status,'Metadata only; URL not fetched');
 END IF;
 RETURN public.panda_agent_control_room_dto(item);
END $$;
CREATE FUNCTION public.panda_agent_control_room_reserve_upload(p_key text,p_title text,p_filename text,p_media_type text,p_expected_size integer,p_expected_sha256 text,p_publisher text,p_purpose text,p_rights_statement text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE actor text; fingerprint text; item public.panda_agent_intakes; created boolean;
BEGIN
 actor:=public.panda_agent_control_room_admin();
 IF p_key IS NULL OR p_key !~ '^[A-Za-z0-9_-]{16,128}$' OR NOT public.panda_agent_control_room_text(p_title,180,1) OR NOT public.panda_agent_control_room_text(p_filename,180,1)
    OR position('/' in p_filename)>0 OR position(chr(92) in p_filename)>0 OR p_expected_size IS NULL OR p_expected_size NOT BETWEEN 1 AND 3145728
    OR p_expected_sha256 IS NULL OR p_expected_sha256 !~ '^[0-9a-f]{64}$' OR p_media_type IS NULL OR
    NOT ((p_media_type='application/pdf' AND lower(p_filename) ~ '\.pdf$') OR (p_media_type='text/markdown' AND lower(p_filename) ~ '\.md$') OR (p_media_type='text/plain' AND lower(p_filename) ~ '\.txt$'))
    OR NOT public.panda_agent_control_room_text(p_publisher,120) OR NOT public.panda_agent_control_room_text(p_purpose,500) OR NOT public.panda_agent_control_room_text(p_rights_statement,1000) THEN PERFORM public.phase3_fail('invalid_input'); END IF;
 fingerprint:=encode(sha256(convert_to(jsonb_build_array('upload',p_title,p_filename,p_media_type,p_expected_size,p_expected_sha256,p_publisher,p_purpose,p_rights_statement)::text,'UTF8')),'hex');
 INSERT INTO public.panda_agent_intakes(created_by,idempotency_key,input_hash,kind,title,filename,media_type,expected_size,expected_sha256,publisher,purpose,rights_statement,status)
 VALUES(actor,p_key,fingerprint,'upload',p_title,p_filename,p_media_type,p_expected_size,p_expected_sha256,p_publisher,p_purpose,p_rights_statement,'upload_pending') ON CONFLICT(created_by,idempotency_key) DO NOTHING RETURNING * INTO item;
 created:=FOUND;
 IF NOT created THEN
  SELECT * INTO item FROM public.panda_agent_intakes WHERE created_by=actor AND idempotency_key=p_key FOR UPDATE;
  IF item.input_hash IS DISTINCT FROM fingerprint THEN PERFORM public.phase3_fail('request_conflict'); END IF;
 ELSE
  INSERT INTO public.panda_agent_intake_events(intake_id,intake_version,action,actor,status,rights_status,reason) VALUES(item.id,item.version,'reserve_upload',actor,item.status,item.rights_status,'Private bytes not verified; upload intent only');
 END IF;
 RETURN jsonb_build_object('intake',public.panda_agent_control_room_dto(item),'created',created);
END $$;
CREATE FUNCTION public.panda_agent_control_room_record_upload_outcome(p_reference uuid,p_expected_version bigint,p_outcome text,p_reason text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE actor text; item public.panda_agent_intakes; previous text;
BEGIN
 actor:=public.panda_agent_control_room_admin();
 IF p_expected_version IS NULL OR p_expected_version NOT BETWEEN 1 AND 9007199254740990 OR p_outcome IS NULL OR p_outcome NOT IN ('pending_review','upload_failed','upload_outcome_unknown') OR NOT public.panda_agent_control_room_text(p_reason,500,1) THEN PERFORM public.phase3_fail('invalid_input'); END IF;
 SELECT * INTO item FROM public.panda_agent_intakes WHERE id=p_reference FOR UPDATE;
 IF NOT FOUND THEN PERFORM public.phase3_fail('not_found'); END IF;
 IF item.version<>p_expected_version OR item.kind<>'upload' OR item.status<>'upload_pending' THEN PERFORM public.phase3_fail('version_conflict'); END IF;
 previous:=item.status;
 UPDATE public.panda_agent_intakes SET status=p_outcome,upload_outcome_reason=p_reason,version=version+1,updated_at=now() WHERE id=item.id RETURNING * INTO item;
 INSERT INTO public.panda_agent_intake_events(intake_id,intake_version,action,actor,previous_status,status,rights_status,reason) VALUES(item.id,item.version,'record_upload_outcome',actor,previous,item.status,item.rights_status,p_reason);
 RETURN public.panda_agent_control_room_dto(item); -- integrity_pending even for a reported successful HTTP write.
END $$;
CREATE FUNCTION public.panda_agent_control_room_review(p_reference uuid,p_expected_version bigint,p_decision text,p_rights text,p_rights_evidence text,p_reason text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE actor text; item public.panda_agent_intakes;
BEGIN
 actor:=public.panda_agent_control_room_admin();
 IF p_expected_version IS NULL OR p_expected_version NOT BETWEEN 1 AND 9007199254740990 OR p_decision IS NULL OR p_decision NOT IN ('accept_for_preparation','reject') OR p_rights IS NULL OR p_rights NOT IN ('unknown','permitted','denied')
    OR (p_decision='accept_for_preparation' AND p_rights<>'permitted') OR NOT public.panda_agent_control_room_text(p_rights_evidence,1000,1) OR NOT public.panda_agent_control_room_text(p_reason,500,1) THEN PERFORM public.phase3_fail('invalid_input'); END IF;
 SELECT * INTO item FROM public.panda_agent_intakes WHERE id=p_reference FOR UPDATE;
 IF NOT FOUND THEN PERFORM public.phase3_fail('not_found'); END IF;
 IF item.version<>p_expected_version OR item.status<>'pending_review' THEN PERFORM public.phase3_fail('version_conflict'); END IF;
 UPDATE public.panda_agent_intakes SET status=CASE p_decision WHEN 'reject' THEN 'rejected' ELSE 'accepted_for_preparation' END,rights_status=p_rights,rights_evidence=p_rights_evidence,review_decision=p_decision,review_reason=p_reason,reviewed_by=actor,reviewed_at=now(),version=version+1,updated_at=now() WHERE id=item.id RETURNING * INTO item;
 INSERT INTO public.panda_agent_intake_events(intake_id,intake_version,action,actor,previous_status,status,rights_status,reason) VALUES(item.id,item.version,'review',actor,'pending_review',item.status,item.rights_status,p_reason);
 RETURN public.panda_agent_control_room_dto(item);
END $$;

REVOKE ALL ON FUNCTION public.panda_agent_control_room_admin(),public.panda_agent_control_room_text(text,integer,integer),public.panda_agent_control_room_url(text),public.panda_agent_control_room_guard(),public.panda_agent_control_room_dto(public.panda_agent_intakes) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.panda_agent_control_room_overview(),public.panda_agent_control_room_list_intakes(integer,timestamptz,uuid,text),public.panda_agent_control_room_get_intake(uuid),public.panda_agent_control_room_register_link(text,text,text,text,text,text),public.panda_agent_control_room_reserve_upload(text,text,text,text,integer,text,text,text,text),public.panda_agent_control_room_record_upload_outcome(uuid,bigint,text,text),public.panda_agent_control_room_review(uuid,bigint,text,text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.panda_agent_control_room_overview(),public.panda_agent_control_room_list_intakes(integer,timestamptz,uuid,text),public.panda_agent_control_room_get_intake(uuid),public.panda_agent_control_room_register_link(text,text,text,text,text,text),public.panda_agent_control_room_reserve_upload(text,text,text,text,integer,text,text,text,text),public.panda_agent_control_room_record_upload_outcome(uuid,bigint,text,text),public.panda_agent_control_room_review(uuid,bigint,text,text,text,text) TO authenticated;
