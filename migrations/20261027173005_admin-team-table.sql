-- Team-only Admin search, status filtering, sorting, and bounded pagination.
-- Read-only RPC; root applies this migration after review.
CREATE OR REPLACE FUNCTION public.admin_list_team_table(
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
    WHERE r.kind = 'team'
  ), matching AS (
    SELECT * FROM base t
    WHERE (p_status = 'all' OR t.status = p_status)
      AND (v_query = '' OR strpos(lower(t.title || ' ' || t.slug), lower(v_query)) > 0)
  ), page AS (
    SELECT * FROM matching t
    ORDER BY
      CASE WHEN p_sort = 'updated_desc' THEN t.updated_at END DESC,
      CASE WHEN p_sort = 'updated_asc' THEN t.updated_at END ASC,
      CASE WHEN p_sort = 'title_asc' THEN lower(t.title) END ASC,
      CASE WHEN p_sort = 'title_desc' THEN lower(t.title) END DESC,
      t.id ASC
    LIMIT p_limit OFFSET p_offset
  )
  SELECT jsonb_build_object(
    'total', (SELECT count(*) FROM matching),
    'items', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', t.id,
        'kind', t.kind,
        'title', t.title,
        'slug', t.slug,
        'version', t.version,
        'publishedRevisionId', t.published_revision_id,
        'archived', t.archived_at IS NOT NULL,
        'updatedAt', t.updated_at
      ) ORDER BY
        CASE WHEN p_sort = 'updated_desc' THEN t.updated_at END DESC,
        CASE WHEN p_sort = 'updated_asc' THEN t.updated_at END ASC,
        CASE WHEN p_sort = 'title_asc' THEN lower(t.title) END ASC,
        CASE WHEN p_sort = 'title_desc' THEN lower(t.title) END DESC,
        t.id ASC
      ) FROM page t
    ), '[]'::jsonb)
  ) INTO result;
  RETURN result;
END $f$;

REVOKE ALL ON FUNCTION public.admin_list_team_table(text, text, text, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_team_table(text, text, text, integer, integer) TO authenticated;
