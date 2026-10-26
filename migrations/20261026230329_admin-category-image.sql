-- Add a bounded lead-image projection to the existing private table RPC.
-- Roll back with a forward migration after deploying callers that accept the old shape.
ALTER FUNCTION public.admin_list_categories(text,text,text,integer,integer) RENAME TO admin_list_categories_before_image;

CREATE FUNCTION public.admin_list_categories(p_query text DEFAULT '',p_status text DEFAULT 'all',p_sort text DEFAULT 'updated_desc',p_limit integer DEFAULT 20,p_offset integer DEFAULT 0)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $f$
DECLARE result jsonb; items jsonb;
BEGIN
  result := public.admin_list_categories_before_image(p_query,p_status,p_sort,p_limit,p_offset);
  SELECT COALESCE(jsonb_agg(row.value || jsonb_build_object('image', (
    SELECT jsonb_build_object('mediaId', m.id, 'alt', m.alt_text)
    FROM public.cms_records r JOIN public.cms_media m ON m.id::text = r.draft->'mediaIds'->>0
    WHERE r.kind = 'category' AND r.id::text = row.value->>'id' AND NOT m.archived AND m.mime_type = 'image/webp'
    LIMIT 1
  )) ORDER BY row.ordinality), '[]'::jsonb) INTO items
  FROM jsonb_array_elements(result->'items') WITH ORDINALITY AS row(value,ordinality);
  RETURN jsonb_set(result,'{items}',items);
END $f$;
REVOKE ALL ON FUNCTION public.admin_list_categories_before_image(text,text,text,integer,integer) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.admin_list_categories(text,text,text,integer,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_categories(text,text,text,integer,integer) TO authenticated;
