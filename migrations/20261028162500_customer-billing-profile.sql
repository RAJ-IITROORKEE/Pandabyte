-- Additive current billing preferences only; existing addresses and order snapshots are unchanged.
-- Rollback: remove callers first; preserve customer data and use a reviewed forward migration.
CREATE TABLE public.customer_billing_profiles (
  user_id text PRIMARY KEY CHECK (char_length(user_id) BETWEEN 1 AND 256),
  business_name text NOT NULL DEFAULT '' CHECK (char_length(business_name) <= 160 AND business_name=btrim(business_name) AND business_name !~ '[[:cntrl:]]' AND business_name !~ U&'[\007F-\009F]'),
  contact_email text NOT NULL DEFAULT '' CHECK (char_length(contact_email) <= 254 AND contact_email=btrim(contact_email) AND contact_email !~ '[[:cntrl:]]' AND contact_email !~ U&'[\007F-\009F]' AND (contact_email='' OR contact_email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$')),
  gstin text NOT NULL DEFAULT '' CHECK (gstin='' OR gstin ~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][A-Z0-9]Z[A-Z0-9]$'),
  version bigint NOT NULL DEFAULT 1 CHECK (version BETWEEN 1 AND 9007199254740991),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.customer_billing_profiles ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.customer_billing_profiles FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.customer_billing_profiles TO authenticated;
CREATE POLICY customer_billing_profiles_read_own ON public.customer_billing_profiles FOR SELECT TO authenticated
  USING (user_id=(SELECT public.requesting_user_id()));

CREATE FUNCTION public.customer_get_billing_profile()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $fn$
DECLARE actor text:=public.requesting_user_id(); profile public.customer_billing_profiles;
BEGIN
  IF actor IS NULL OR char_length(actor)>256 THEN PERFORM public.phase3_fail('unauthenticated'); END IF;
  SELECT * INTO profile FROM public.customer_billing_profiles WHERE user_id=actor;
  RETURN jsonb_build_object('version',COALESCE(profile.version,0),'businessName',COALESCE(profile.business_name,''),'contactEmail',COALESCE(profile.contact_email,''),'gstin',COALESCE(profile.gstin,''));
END $fn$;
REVOKE ALL ON FUNCTION public.customer_get_billing_profile() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.customer_get_billing_profile() TO authenticated;

CREATE FUNCTION public.customer_save_billing_profile(p_expected_version bigint,p_business_name text,p_contact_email text,p_gstin text)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $fn$
DECLARE actor text:=public.requesting_user_id(); current_version bigint;
BEGIN
  IF actor IS NULL OR char_length(actor)>256 THEN PERFORM public.phase3_fail('unauthenticated'); END IF;
  IF p_expected_version IS NULL OR p_expected_version NOT BETWEEN 0 AND 9007199254740990
    OR p_business_name IS NULL OR char_length(p_business_name)>160 OR p_business_name ~ '[[:cntrl:]]' OR p_business_name ~ U&'[\007F-\009F]'
    OR p_contact_email IS NULL OR char_length(p_contact_email)>254 OR p_contact_email ~ '[[:cntrl:]]' OR p_contact_email ~ U&'[\007F-\009F]'
    OR (btrim(p_contact_email)<>'' AND btrim(p_contact_email) !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$')
    OR p_gstin IS NULL OR char_length(p_gstin)>15 OR (btrim(p_gstin)<>'' AND upper(btrim(p_gstin)) !~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][A-Z0-9]Z[A-Z0-9]$')
  THEN PERFORM public.phase3_fail('invalid_input'); END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('customer_billing_profiles:'||actor,0));
  SELECT version INTO current_version FROM public.customer_billing_profiles WHERE user_id=actor FOR UPDATE;
  IF COALESCE(current_version,0)<>p_expected_version THEN PERFORM public.phase3_fail('version_conflict'); END IF;
  INSERT INTO public.customer_billing_profiles(user_id,business_name,contact_email,gstin)
    VALUES(actor,btrim(p_business_name),btrim(p_contact_email),upper(btrim(p_gstin)))
    ON CONFLICT(user_id) DO UPDATE SET business_name=EXCLUDED.business_name,contact_email=EXCLUDED.contact_email,gstin=EXCLUDED.gstin,
      version=customer_billing_profiles.version+1,updated_at=clock_timestamp();
  RETURN public.customer_get_billing_profile();
END $fn$;
REVOKE ALL ON FUNCTION public.customer_save_billing_profile(bigint,text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.customer_save_billing_profile(bigint,text,text,text) TO authenticated;
