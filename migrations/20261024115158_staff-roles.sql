-- Additive role management; existing API/RPC capability checks remain authoritative.
-- Rollback: remove role callers first; use a reviewed forward migration preserving
-- memberships/audit and effective grants. Never drop populated access records.
CREATE TABLE public.staff_role_memberships (
  user_id text PRIMARY KEY CHECK (char_length(user_id) BETWEEN 1 AND 256 AND user_id !~ '[[:cntrl:]]'),
  role text NOT NULL CHECK (role IN ('ADMIN','EDITOR','CATALOG','SUPPORT','CUSTOMER')),
  version bigint NOT NULL DEFAULT 1 CHECK (version BETWEEN 1 AND 9007199254740991),
  protected boolean NOT NULL DEFAULT false CHECK (NOT protected OR role='ADMIN'),
  assigned_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX staff_roles_list_idx ON public.staff_role_memberships(updated_at DESC,user_id);
CREATE TABLE public.staff_role_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id text NOT NULL,
  previous_role text,
  role text NOT NULL,
  actor text NOT NULL,
  reason text NOT NULL CHECK (char_length(btrim(reason)) BETWEEN 1 AND 500),
  occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX staff_role_events_user_idx ON public.staff_role_events(user_id,occurred_at DESC);
ALTER TABLE public.staff_role_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_role_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.staff_role_memberships,public.staff_role_events FROM PUBLIC,anon,authenticated;
REVOKE ALL ON SEQUENCE public.staff_role_events_id_seq FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.staff_role_memberships TO authenticated;
CREATE POLICY staff_roles_select ON public.staff_role_memberships FOR SELECT TO authenticated
  USING (user_id=(SELECT public.requesting_user_id()) OR (SELECT public.has_capability('staff.manage')));

CREATE FUNCTION public.staff_role_json(p_row public.staff_role_memberships)
RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $fn$
  SELECT jsonb_build_object('userId',(p_row).user_id,'role',(p_row).role,'version',(p_row).version,
    'protected',(p_row).protected,'updatedAt',(p_row).updated_at)
$fn$;
REVOKE ALL ON FUNCTION public.staff_role_json(public.staff_role_memberships) FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.staff_apply_role(p_user_id text,p_role text,p_protected boolean,p_reason text,p_actor text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $fn$
DECLARE v_old public.staff_role_memberships; v_new public.staff_role_memberships; v_cap text; v_caps text[];
BEGIN
  IF p_user_id IS NULL OR char_length(btrim(p_user_id)) NOT BETWEEN 1 AND 256 OR p_user_id<>btrim(p_user_id)
    OR p_user_id ~ '[[:cntrl:]]' OR p_role IS NULL OR p_role NOT IN ('ADMIN','EDITOR','CATALOG','SUPPORT','CUSTOMER')
    OR p_protected IS NULL OR (p_protected AND p_role<>'ADMIN')
    OR p_reason IS NULL OR char_length(btrim(p_reason)) NOT BETWEEN 1 AND 500 OR p_reason ~ '[[:cntrl:]]'
  THEN PERFORM public.phase3_fail('invalid_input'); END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('staff-role-memberships',0));
  SELECT * INTO v_old FROM public.staff_role_memberships WHERE user_id=p_user_id FOR UPDATE;
  IF p_role<>'CUSTOMER' AND (v_old.user_id IS NULL OR v_old.role='CUSTOMER')
    AND (SELECT count(*) FROM public.staff_role_memberships WHERE role<>'CUSTOMER')>=100
  THEN PERFORM public.phase3_fail('staff_limit'); END IF;
  IF v_old.version=9007199254740991 THEN PERFORM public.phase3_fail('version_conflict'); END IF;
  v_caps:=CASE p_role
    WHEN 'ADMIN' THEN ARRAY['content.edit','catalog.edit','content.publish','orders.manage','staff.manage','media.manage','inquiries.manage']
    WHEN 'EDITOR' THEN ARRAY['content.edit','content.publish','media.manage']
    WHEN 'CATALOG' THEN ARRAY['catalog.edit','media.manage','orders.manage']
    WHEN 'SUPPORT' THEN ARRAY['inquiries.manage'] ELSE '{}'::text[] END;
  -- Role adoption replaces manual grants, never combines them into hidden privileges.
  FOR v_cap IN SELECT capability FROM public.staff_capabilities WHERE user_id=p_user_id LOOP
    INSERT INTO public.staff_capability_events(user_id,capability,enabled,actor,reason)
      VALUES(p_user_id,v_cap,false,p_actor,btrim(p_reason));
  END LOOP;
  DELETE FROM public.staff_capabilities WHERE user_id=p_user_id;
  FOREACH v_cap IN ARRAY v_caps LOOP
    INSERT INTO public.staff_capabilities(user_id,capability,granted_by) VALUES(p_user_id,v_cap,p_actor);
    INSERT INTO public.staff_capability_events(user_id,capability,enabled,actor,reason)
      VALUES(p_user_id,v_cap,true,p_actor,btrim(p_reason));
  END LOOP;
  INSERT INTO public.staff_role_memberships(user_id,role,protected,assigned_by)
    VALUES(p_user_id,p_role,p_protected,p_actor)
    ON CONFLICT(user_id) DO UPDATE SET role=excluded.role,protected=excluded.protected,
      assigned_by=excluded.assigned_by,version=staff_role_memberships.version+1,updated_at=now()
    RETURNING * INTO v_new;
  INSERT INTO public.staff_role_events(user_id,previous_role,role,actor,reason)
    VALUES(p_user_id,v_old.role,p_role,p_actor,btrim(p_reason));
  RETURN public.staff_role_json(v_new);
END $fn$;
REVOKE ALL ON FUNCTION public.staff_apply_role(text,text,boolean,text,text) FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.staff_set_role(p_user_id text,p_role text,p_expected_version bigint,p_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $fn$
DECLARE v_actor text; v_old public.staff_role_memberships;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('staff-role-memberships',0));
  -- Recheck capability after serialization so a queued revoked admin cannot act.
  v_actor:=public.admin_assert_capability('staff.manage');
  IF p_expected_version IS NULL OR p_expected_version NOT BETWEEN 0 AND 9007199254740990
    THEN PERFORM public.phase3_fail('invalid_input'); END IF;
  SELECT * INTO v_old FROM public.staff_role_memberships WHERE user_id=p_user_id FOR UPDATE;
  IF v_old.protected THEN PERFORM public.phase3_fail('protected_admin'); END IF;
  IF p_user_id=v_actor THEN PERFORM public.phase3_fail('self_change'); END IF;
  IF COALESCE(v_old.version,0)<>p_expected_version THEN PERFORM public.phase3_fail('version_conflict'); END IF;
  IF v_old.role='ADMIN' AND p_role<>'ADMIN' AND (SELECT count(*) FROM public.staff_role_memberships WHERE role='ADMIN')<=1
    THEN PERFORM public.phase3_fail('last_admin'); END IF;
  RETURN public.staff_apply_role(p_user_id,p_role,false,p_reason,v_actor);
END $fn$;
REVOKE ALL ON FUNCTION public.staff_set_role(text,text,bigint,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.staff_set_role(text,text,bigint,text) TO authenticated;

CREATE FUNCTION public.project_admin_set_staff_role(p_user_id text,p_role text,p_protected boolean,p_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $fn$
BEGIN
  RETURN public.staff_apply_role(p_user_id,p_role,p_protected,p_reason,'project_admin');
END $fn$;
REVOKE ALL ON FUNCTION public.project_admin_set_staff_role(text,text,boolean,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.project_admin_set_staff_role(text,text,boolean,text) TO project_admin;

CREATE FUNCTION public.staff_list_roles(p_limit integer DEFAULT 25,p_offset integer DEFAULT 0)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $fn$
DECLARE v_result jsonb;
BEGIN
  PERFORM public.admin_assert_capability('staff.manage');
  IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 50 OR p_offset IS NULL OR p_offset NOT BETWEEN 0 AND 5000
    THEN PERFORM public.phase3_fail('invalid_input'); END IF;
  SELECT jsonb_build_object('items',COALESCE((SELECT jsonb_agg(public.staff_role_json(s) ORDER BY s.updated_at DESC,s.user_id)
    FROM (SELECT * FROM public.staff_role_memberships ORDER BY updated_at DESC,user_id LIMIT p_limit OFFSET p_offset) s),'[]'),
    'total',(SELECT count(*) FROM public.staff_role_memberships)) INTO v_result;
  RETURN v_result;
END $fn$;
REVOKE ALL ON FUNCTION public.staff_list_roles(integer,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.staff_list_roles(integer,integer) TO authenticated;

ALTER FUNCTION public.set_staff_capability(text,text,boolean,text) RENAME TO set_manual_staff_capability;
REVOKE ALL ON FUNCTION public.set_manual_staff_capability(text,text,boolean,text) FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.set_staff_capability(target_user_id text,capability_name text,enabled boolean,reason text)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public,pg_temp AS $fn$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('staff-role-memberships',0));
  IF EXISTS(SELECT 1 FROM public.staff_role_memberships WHERE user_id=target_user_id)
    THEN PERFORM public.phase3_fail('role_managed'); END IF;
  PERFORM public.set_manual_staff_capability(target_user_id,capability_name,enabled,reason);
END $fn$;
REVOKE ALL ON FUNCTION public.set_staff_capability(text,text,boolean,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.set_staff_capability(text,text,boolean,text) TO project_admin;
