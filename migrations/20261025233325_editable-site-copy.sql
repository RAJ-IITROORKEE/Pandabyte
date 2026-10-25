-- Bounded development site settings. No content/role data is changed or published.
-- Forward rollback: restore prior functions in a new migration only after reviewing stored copy fields.
ALTER FUNCTION public.phase3_validate_document(text,jsonb) RENAME TO phase6_validate_document_before_site_copy;

CREATE FUNCTION public.phase3_validate_document(p_kind text,p_document jsonb)
RETURNS void LANGUAGE plpgsql STABLE
SET search_path TO 'pg_catalog','public','pg_temp'
AS $function$
DECLARE v_base jsonb := p_document; v_key text; v_max integer;
BEGIN
  IF p_kind = 'contact' THEN
    FOR v_key,v_max IN SELECT * FROM (VALUES
      ('supportTitle',120),('supportText',1000),('footerTagline',160),('copyrightName',120)
    ) AS bounds(key,max_length) LOOP
      IF p_document ? v_key AND (
        jsonb_typeof(p_document->v_key) IS DISTINCT FROM 'string'
        OR char_length(btrim(p_document->>v_key)) > v_max
        OR (p_document->>v_key) ~ '[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]'
      ) THEN PERFORM public.phase3_fail('invalid_input'); END IF;
      v_base := v_base - v_key;
    END LOOP;
  END IF;
  PERFORM public.phase6_validate_document_before_site_copy(p_kind,v_base);
  IF p_kind = 'navigation' AND EXISTS (
    SELECT 1 FROM public.phase3_jsonb_array_elements(p_document->'links') AS links(link)
    GROUP BY link->>'group', btrim(link->>'href') HAVING count(*) > 1
  ) THEN PERFORM public.phase3_fail('invalid_input'); END IF;
END $function$;
REVOKE ALL ON FUNCTION public.phase3_validate_document(text,jsonb), public.phase6_validate_document_before_site_copy(text,jsonb) FROM PUBLIC,anon,authenticated;

-- Hidden custom destinations/labels remain private. Core destinations are already code-defined;
-- a sanitized tombstone must survive projection to suppress their fallback links.
-- navigation-core-header: ["/solutions","/learn","/about","/contact","/shop?category=iot-kits","/shop","/shop?category=microcontroller","/shop?category=sensors","/shop?category=shields","/shop?category=accessories","/products/qr-logger","/products/campus-tracker","/products/smart-park","/products/nexus-solution","/solutions/skills-cli","/products/pando","/blog","/learn/youtube","/learn/product-specs","/learn/embedded-systems","/learn/kit-guides","/help","/projects","/upcoming","/careers"]
-- navigation-core-footer: ["/shop","/shop?category=iot-kits","/shop?category=microcontroller","/shop?category=sensors","/shop?category=shields","/products/qr-logger","/products/campus-tracker","/products/smart-park","/products/nexus-solution","/products/pando","/learn","/blog","/learn/youtube","/learn/product-specs","/learn/kit-guides","/help","/contact","/agent","/about","/careers","/policies#shipping","/policies#terms","/policies#privacy"]
CREATE OR REPLACE FUNCTION public.phase3_public_document(p_kind text,p_document jsonb)
RETURNS jsonb LANGUAGE sql STABLE SET search_path TO 'pg_catalog','public'
AS $function$
  SELECT CASE WHEN p_kind = 'navigation' THEN jsonb_set(p_document,'{links}',COALESCE((
    SELECT jsonb_agg(CASE WHEN link->'visible' = 'true'::jsonb THEN link ELSE
      jsonb_build_object('label','Hidden navigation link','href',link->>'href',
        'group',link->>'group','position',link->'position','visible',false) END
      ORDER BY (link->>'position')::integer,link->>'label')
    FROM public.phase3_jsonb_array_elements(COALESCE(p_document->'links','[]'::jsonb)) AS links(link)
    WHERE link->'visible' = 'true'::jsonb OR (
      link->'visible' = 'false'::jsonb AND (
        (link->>'group' = 'header' AND link->>'href' = ANY(ARRAY['/solutions','/learn','/about','/contact','/shop?category=iot-kits','/shop','/shop?category=microcontroller','/shop?category=sensors','/shop?category=shields','/shop?category=accessories','/products/qr-logger','/products/campus-tracker','/products/smart-park','/products/nexus-solution','/solutions/skills-cli','/products/pando','/blog','/learn/youtube','/learn/product-specs','/learn/embedded-systems','/learn/kit-guides','/help','/projects','/upcoming','/careers']::text[])) OR
        (link->>'group' = 'footer' AND link->>'href' = ANY(ARRAY['/shop','/shop?category=iot-kits','/shop?category=microcontroller','/shop?category=sensors','/shop?category=shields','/products/qr-logger','/products/campus-tracker','/products/smart-park','/products/nexus-solution','/products/pando','/learn','/blog','/learn/youtube','/learn/product-specs','/learn/kit-guides','/help','/contact','/agent','/about','/careers','/policies#shipping','/policies#terms','/policies#privacy']::text[]))
      )
    )
  ),'[]'::jsonb),true) ELSE p_document - 'sourceReview' END
$function$;
REVOKE ALL ON FUNCTION public.phase3_public_document(text,jsonb) FROM PUBLIC,anon,authenticated;
