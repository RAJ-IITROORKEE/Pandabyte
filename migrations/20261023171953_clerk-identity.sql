CREATE FUNCTION public.requesting_user_id()
RETURNS text
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog
AS $fn$
  SELECT NULLIF(auth.jwt() ->> 'sub', '')
$fn$;

REVOKE ALL ON FUNCTION public.requesting_user_id() FROM PUBLIC, anon;
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT EXECUTE ON FUNCTION public.requesting_user_id() TO authenticated;
