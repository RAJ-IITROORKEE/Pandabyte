-- SOURCE ONLY until root review/apply. Target bucket must remain private.
-- No bucket creation, blob write, signing, overwrite, delete or integrity promotion.
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
CREATE INDEX panda_agent_intake_object_key_lookup ON public.panda_agent_intakes(object_key) WHERE kind='upload';

CREATE FUNCTION public.panda_agent_intake_storage_allowed(p_key text,p_action text,p_size integer DEFAULT NULL,p_mime text DEFAULT NULL,p_uploaded_by text DEFAULT NULL) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE actor text; reference uuid;
BEGIN
 -- SECURITY DEFINER changes current_user, not the SET ROLE context of the request.
 -- Also support a direct authenticated login with no SET ROLE override. Never anon.
 IF current_setting('role',true) IS DISTINCT FROM 'authenticated' AND NOT (
    coalesce(current_setting('role',true),'none')='none' AND session_user='authenticated') THEN RETURN false; END IF;
 PERFORM pg_advisory_xact_lock_shared(hashtextextended('staff-role-memberships',0));
 actor:=public.requesting_user_id();
 IF actor IS NULL OR NOT EXISTS(SELECT 1 FROM public.staff_role_memberships WHERE user_id=actor AND role='ADMIN') THEN RETURN false; END IF;
 IF p_action='read' THEN
  RETURN EXISTS(SELECT 1 FROM public.panda_agent_intakes WHERE kind='upload' AND object_key=p_key);
 ELSIF p_action='write' THEN
  IF p_size IS NULL OR p_size NOT BETWEEN 1 AND 3145728 OR p_mime IS NULL OR p_uploaded_by IS DISTINCT FROM actor THEN RETURN false; END IF;
  SELECT id INTO reference FROM public.panda_agent_intakes
   WHERE kind='upload' AND object_key=p_key AND created_by=actor AND status='upload_pending'
    AND expected_size=p_size AND media_type=p_mime
   FOR SHARE;
  RETURN FOUND; -- Holds the reservation status stable until the storage transaction ends.
 END IF;
 RETURN false;
END $$;
REVOKE ALL ON FUNCTION public.panda_agent_intake_storage_allowed(text,text,integer,text,text) FROM PUBLIC,anon,authenticated;
-- Policy OR operands need not short-circuit. Both roles may safely execute a BOOL-only helper.
GRANT EXECUTE ON FUNCTION public.panda_agent_intake_storage_allowed(text,text,integer,text,text) TO authenticated,anon;

CREATE POLICY panda_agent_intake_storage_read ON storage.objects FOR SELECT TO authenticated
 USING(bucket='panda-agent-intake-private' AND public.panda_agent_intake_storage_allowed(key,'read'));
CREATE POLICY panda_agent_intake_storage_insert ON storage.objects FOR INSERT TO authenticated
 WITH CHECK(bucket='panda-agent-intake-private' AND public.panda_agent_intake_storage_allowed(key,'write',size,mime_type,uploaded_by));

-- AND every existing/future permissive owner/public policy with the target boundary.
-- Other buckets retain their existing policy decisions, including existing denials.
CREATE POLICY panda_agent_intake_storage_boundary ON storage.objects AS RESTRICTIVE FOR ALL TO authenticated,anon
 USING(bucket<>'panda-agent-intake-private' OR public.panda_agent_intake_storage_allowed(key,'read'))
 WITH CHECK(bucket<>'panda-agent-intake-private' OR public.panda_agent_intake_storage_allowed(key,'write',size,mime_type,uploaded_by));
CREATE POLICY panda_agent_intake_storage_no_update ON storage.objects AS RESTRICTIVE FOR UPDATE TO authenticated,anon
 USING(bucket<>'panda-agent-intake-private') WITH CHECK(bucket<>'panda-agent-intake-private');
CREATE POLICY panda_agent_intake_storage_no_delete ON storage.objects AS RESTRICTIVE FOR DELETE TO authenticated,anon
 USING(bucket<>'panda-agent-intake-private');
-- Existing storage table/schema grants are preserved, not broadened here.
-- Public-bucket GETs, signed URLs and privileged API-key/S3 callers can bypass RLS;
-- root must verify the bucket is private and actual JWT REST storage behavior.
