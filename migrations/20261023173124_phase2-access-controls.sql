CREATE TABLE public.customer_profiles (
  user_id text PRIMARY KEY DEFAULT public.requesting_user_id(),
  display_name text NOT NULL DEFAULT '' CHECK (char_length(display_name) <= 120),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.customer_profiles ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.customer_profiles FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.customer_profiles TO authenticated;
GRANT INSERT (user_id, display_name) ON public.customer_profiles TO authenticated;
GRANT UPDATE (display_name) ON public.customer_profiles TO authenticated;
CREATE POLICY customer_profiles_select ON public.customer_profiles FOR SELECT TO authenticated
  USING (user_id = (SELECT public.requesting_user_id()));
CREATE POLICY customer_profiles_insert ON public.customer_profiles FOR INSERT TO authenticated
  WITH CHECK (user_id = (SELECT public.requesting_user_id()));
CREATE POLICY customer_profiles_update ON public.customer_profiles FOR UPDATE TO authenticated
  USING (user_id = (SELECT public.requesting_user_id()))
  WITH CHECK (user_id = (SELECT public.requesting_user_id()));

CREATE TABLE public.staff_capabilities (
  user_id text NOT NULL,
  capability text NOT NULL CHECK (capability IN ('content.edit','catalog.edit','content.publish','orders.manage','staff.manage')),
  granted_at timestamptz NOT NULL DEFAULT now(),
  granted_by text NOT NULL,
  PRIMARY KEY (user_id, capability)
);
ALTER TABLE public.staff_capabilities ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.staff_capabilities FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.staff_capabilities TO authenticated;
CREATE POLICY staff_capabilities_select ON public.staff_capabilities FOR SELECT TO authenticated
  USING (user_id = (SELECT public.requesting_user_id()));

CREATE TABLE public.staff_capability_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id text NOT NULL,
  capability text NOT NULL,
  enabled boolean NOT NULL,
  actor text NOT NULL,
  reason text NOT NULL CHECK (char_length(reason) BETWEEN 1 AND 500),
  occurred_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.staff_capability_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.staff_capability_events FROM PUBLIC, anon, authenticated;
REVOKE ALL ON SEQUENCE public.staff_capability_events_id_seq FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.has_capability(capability_name text)
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER
SET search_path = pg_catalog
AS $fn$
  SELECT EXISTS (
    SELECT 1 FROM public.staff_capabilities
    WHERE user_id = (SELECT public.requesting_user_id())
      AND capability = capability_name
  )
$fn$;
REVOKE ALL ON FUNCTION public.has_capability(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_capability(text) TO authenticated;

CREATE FUNCTION public.set_staff_capability(target_user_id text, capability_name text, enabled boolean, reason text)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER
SET search_path = pg_catalog
AS $fn$
BEGIN
  IF target_user_id IS NULL OR char_length(btrim(target_user_id)) NOT BETWEEN 1 AND 256
    OR capability_name IS NULL OR capability_name NOT IN ('content.edit','catalog.edit','content.publish','orders.manage','staff.manage')
    OR enabled IS NULL OR reason IS NULL OR char_length(btrim(reason)) NOT BETWEEN 1 AND 500 THEN
    RAISE EXCEPTION 'Invalid capability operation' USING ERRCODE = '22023';
  END IF;
  IF enabled THEN
    INSERT INTO public.staff_capabilities (user_id, capability, granted_by)
    VALUES (target_user_id, capability_name, current_user)
    ON CONFLICT (user_id, capability) DO NOTHING;
  ELSE
    DELETE FROM public.staff_capabilities
    WHERE user_id = target_user_id AND capability = capability_name;
  END IF;
  INSERT INTO public.staff_capability_events (user_id, capability, enabled, actor, reason)
  VALUES (target_user_id, capability_name, enabled, current_user, btrim(reason));
END
$fn$;
REVOKE ALL ON FUNCTION public.set_staff_capability(text,text,boolean,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_staff_capability(text,text,boolean,text) TO project_admin;

CREATE TABLE public.account_files (
  id uuid PRIMARY KEY,
  user_id text NOT NULL DEFAULT public.requesting_user_id(),
  object_key text NOT NULL UNIQUE,
  storage_url text NOT NULL CHECK (storage_url LIKE 'https://%'),
  filename text NOT NULL CHECK (char_length(filename) BETWEEN 1 AND 120),
  byte_size integer NOT NULL CHECK (byte_size BETWEEN 1 AND 65536),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (object_key = user_id || '/' || id::text || '.txt')
);
CREATE INDEX account_files_owner_created_idx ON public.account_files (user_id, created_at DESC, id);
ALTER TABLE public.account_files ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.account_files FROM PUBLIC, anon, authenticated;
GRANT SELECT, DELETE ON public.account_files TO authenticated;
GRANT INSERT (id, user_id, object_key, storage_url, filename, byte_size) ON public.account_files TO authenticated;
CREATE POLICY account_files_select ON public.account_files FOR SELECT TO authenticated
  USING (user_id = (SELECT public.requesting_user_id()));
CREATE POLICY account_files_insert ON public.account_files FOR INSERT TO authenticated
  WITH CHECK (user_id = (SELECT public.requesting_user_id()));
CREATE POLICY account_files_delete ON public.account_files FOR DELETE TO authenticated
  USING (user_id = (SELECT public.requesting_user_id()));

ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
CREATE POLICY private_account_files_select ON storage.objects FOR SELECT TO authenticated
  USING (bucket = 'private-account-files'
    AND uploaded_by = (SELECT public.requesting_user_id())
    AND split_part(key, '/', 1) = (SELECT public.requesting_user_id()));
CREATE POLICY private_account_files_insert ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket = 'private-account-files'
    AND uploaded_by = (SELECT public.requesting_user_id())
    AND split_part(key, '/', 1) = (SELECT public.requesting_user_id()));
CREATE POLICY private_account_files_delete ON storage.objects FOR DELETE TO authenticated
  USING (bucket = 'private-account-files'
    AND uploaded_by = (SELECT public.requesting_user_id())
    AND split_part(key, '/', 1) = (SELECT public.requesting_user_id()));
GRANT USAGE ON SCHEMA storage TO authenticated;
GRANT SELECT, INSERT, DELETE ON storage.objects TO authenticated;
