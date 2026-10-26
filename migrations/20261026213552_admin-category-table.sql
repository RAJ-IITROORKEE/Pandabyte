-- Development Admin category table: private search, filters, sorting and bounded pagination.
-- Additive read-only RPC; no records change. Rollback callers first, then revoke the unused RPC.
CREATE OR REPLACE FUNCTION public.admin_list_categories(
  p_query text DEFAULT '',
  p_status text DEFAULT 'all',
  p_sort text DEFAULT 'updated_desc',
  p_limit integer DEFAULT 20,
  p_offset integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $f$
DECLARE
  result jsonb;
BEGIN
  PERFORM public.admin_assert_capability('catalog.edit');
  IF p_query IS NULL OR char_length(p_query) > 120 OR p_query ~ '[[:cntrl:]]'
    OR p_status IS NULL OR p_status NOT IN ('all', 'draft', 'published', 'archived')
    OR p_sort IS NULL OR p_sort NOT IN ('updated_desc', 'updated_asc', 'title_asc', 'title_desc', 'position_asc', 'position_desc', 'products_desc')
    OR p_limit IS NULL OR p_limit NOT IN (10, 20, 50)
    OR p_offset IS NULL OR p_offset NOT BETWEEN 0 AND 10000 THEN
    PERFORM public.phase3_fail('invalid_input');
  END IF;

  WITH base AS (
    SELECT r.id, r.title, r.slug, r.version, r.updated_at,
      CASE WHEN r.archived_at IS NOT NULL THEN 'archived'
        WHEN r.published_revision_id IS NOT NULL THEN 'published' ELSE 'draft' END AS status,
      CASE WHEN (r.draft->>'position') ~ '^[0-9]{1,7}$' THEN
        CASE WHEN (r.draft->>'position')::numeric <= 1000000 THEN (r.draft->>'position')::integer ELSE 0 END
        ELSE 0 END AS position,
      CASE WHEN lower(r.draft->>'parentId') ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN (
        SELECT jsonb_build_object('id', parent.id, 'title', parent.title)
        FROM public.cms_records parent
        WHERE parent.kind = 'category' AND parent.id::text = lower(r.draft->>'parentId')
        LIMIT 1
      ) ELSE NULL END AS parent,
      (SELECT count(*) FROM public.cms_records p
       WHERE p.kind = 'product' AND p.archived_at IS NULL
         AND p.draft->'categoryIds' @> jsonb_build_array(r.id::text)) AS product_count
    FROM public.cms_records r
    WHERE r.kind = 'category'
  ), matching AS (
    SELECT * FROM base c
    WHERE (p_status = 'all' OR c.status = p_status)
      AND (btrim(p_query) = '' OR strpos(lower(c.title || ' ' || c.slug), lower(btrim(p_query))) > 0)
  ), page AS (
    SELECT * FROM matching c
    ORDER BY
      CASE WHEN p_sort = 'updated_desc' THEN c.updated_at END DESC,
      CASE WHEN p_sort = 'updated_asc' THEN c.updated_at END ASC,
      CASE WHEN p_sort = 'title_asc' THEN lower(c.title) END ASC,
      CASE WHEN p_sort = 'title_desc' THEN lower(c.title) END DESC,
      CASE WHEN p_sort = 'position_asc' THEN c.position END ASC,
      CASE WHEN p_sort = 'position_desc' THEN c.position END DESC,
      CASE WHEN p_sort = 'products_desc' THEN c.product_count END DESC,
      c.id ASC
    LIMIT p_limit OFFSET p_offset
  )
  SELECT jsonb_build_object(
    'total', (SELECT count(*) FROM matching),
    'items', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', c.id, 'title', c.title, 'slug', c.slug, 'version', c.version, 'status', c.status,
        'updatedAt', c.updated_at, 'parent', c.parent, 'productCount', c.product_count, 'position', c.position
      ) ORDER BY
        CASE WHEN p_sort = 'updated_desc' THEN c.updated_at END DESC,
        CASE WHEN p_sort = 'updated_asc' THEN c.updated_at END ASC,
        CASE WHEN p_sort = 'title_asc' THEN lower(c.title) END ASC,
        CASE WHEN p_sort = 'title_desc' THEN lower(c.title) END DESC,
        CASE WHEN p_sort = 'position_asc' THEN c.position END ASC,
        CASE WHEN p_sort = 'position_desc' THEN c.position END DESC,
        CASE WHEN p_sort = 'products_desc' THEN c.product_count END DESC,
        c.id ASC
      ) FROM page c
    ), '[]'::jsonb)
  ) INTO result;
  RETURN result;
END $f$;

REVOKE ALL ON FUNCTION public.admin_list_categories(text, text, text, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_categories(text, text, text, integer, integer) TO authenticated;
