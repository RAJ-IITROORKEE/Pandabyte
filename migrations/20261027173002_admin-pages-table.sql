-- Pages-only Admin search, status filtering, sorting, and bounded pagination.
-- Read-only RPC; root applies this migration after review.
CREATE OR REPLACE FUNCTION public.admin_list_pages_table(
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
  v_query text := btrim(COALESCE(p_query, ''));
BEGIN
  PERFORM public.admin_assert_capability('content.edit');
  IF p_query IS NULL OR char_length(p_query) > 120 OR p_query ~ '[[:cntrl:]]'
    OR p_status IS NULL OR p_status NOT IN ('all', 'draft', 'published', 'archived')
    OR p_sort IS NULL OR p_sort NOT IN ('updated_desc', 'updated_asc', 'title_asc', 'title_desc')
    OR p_limit IS NULL OR p_limit NOT IN (10, 20, 50)
    OR p_offset IS NULL OR p_offset NOT BETWEEN 0 AND 10000 THEN
    PERFORM public.phase3_fail('invalid_input');
  END IF;

  WITH base AS (
    SELECT r.id, r.kind, r.title, r.slug, r.version, r.published_revision_id,
      r.archived_at, r.updated_at,
      CASE WHEN r.archived_at IS NOT NULL THEN 'archived'
        WHEN r.published_revision_id IS NOT NULL THEN 'published' ELSE 'draft' END AS status
    FROM public.cms_records r
    WHERE r.kind = 'page'
  ), matching AS (
    SELECT * FROM base p
    WHERE (p_status = 'all' OR p.status = p_status)
      AND (v_query = '' OR strpos(lower(p.title || ' ' || p.slug), lower(v_query)) > 0)
  ), page AS (
    SELECT * FROM matching p
    ORDER BY
      CASE WHEN p_sort = 'updated_desc' THEN p.updated_at END DESC,
      CASE WHEN p_sort = 'updated_asc' THEN p.updated_at END ASC,
      CASE WHEN p_sort = 'title_asc' THEN lower(p.title) END ASC,
      CASE WHEN p_sort = 'title_desc' THEN lower(p.title) END DESC,
      p.id ASC
    LIMIT p_limit OFFSET p_offset
  )
  SELECT jsonb_build_object(
    'total', (SELECT count(*) FROM matching),
    'items', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', p.id,
        'kind', p.kind,
        'title', p.title,
        'slug', p.slug,
        'version', p.version,
        'publishedRevisionId', p.published_revision_id,
        'archived', p.archived_at IS NOT NULL,
        'updatedAt', p.updated_at
      ) ORDER BY
        CASE WHEN p_sort = 'updated_desc' THEN p.updated_at END DESC,
        CASE WHEN p_sort = 'updated_asc' THEN p.updated_at END ASC,
        CASE WHEN p_sort = 'title_asc' THEN lower(p.title) END ASC,
        CASE WHEN p_sort = 'title_desc' THEN lower(p.title) END DESC,
        p.id ASC
      ) FROM page p
    ), '[]'::jsonb)
  ) INTO result;
  RETURN result;
END $f$;

REVOKE ALL ON FUNCTION public.admin_list_pages_table(text, text, text, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_pages_table(text, text, text, integer, integer) TO authenticated;
