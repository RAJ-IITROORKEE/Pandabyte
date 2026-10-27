-- Stop before changing validation if any existing page would be stranded.
LOCK TABLE public.cms_records, public.cms_live_routes, public.cms_slug_redirects IN SHARE ROW EXCLUSIVE MODE;
DO $f$
BEGIN
 IF EXISTS (SELECT 1 FROM public.cms_records WHERE kind='page' AND (slug=ANY(ARRAY['cart','checkout','help-center','admin-login']) OR draft->>'slug'=ANY(ARRAY['cart','checkout','help-center','admin-login'])))
 OR EXISTS (SELECT 1 FROM public.cms_live_routes WHERE kind='page' AND slug=ANY(ARRAY['cart','checkout','help-center','admin-login']))
 OR EXISTS (SELECT 1 FROM public.cms_slug_redirects WHERE kind='page' AND from_slug=ANY(ARRAY['cart','checkout','help-center','admin-login'])) THEN
  RAISE EXCEPTION 'Resolve existing page route collisions before applying this migration';
 END IF;
END $f$;

ALTER FUNCTION public.phase3_validate_document(text,jsonb) RENAME TO page_routes_validate_document_before;
CREATE FUNCTION public.phase3_validate_document(p_kind text,p_document jsonb)
RETURNS void LANGUAGE plpgsql STABLE SET search_path=pg_catalog,public,pg_temp AS $f$
BEGIN
 IF p_kind='page' AND p_document->>'slug'=ANY(ARRAY['cart','checkout','help-center','admin-login']) THEN
  PERFORM public.phase3_fail('duplicate_route');
 END IF;
 PERFORM public.page_routes_validate_document_before(p_kind,p_document);
END $f$;
REVOKE ALL ON FUNCTION public.phase3_validate_document(text,jsonb),public.page_routes_validate_document_before(text,jsonb) FROM PUBLIC,anon,authenticated;
