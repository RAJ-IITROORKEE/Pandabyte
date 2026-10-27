-- Filter editable Learn drafts by collection before counting and pagination.
-- Read-only RPC; root applies this migration after review.
DROP FUNCTION public.admin_list_learn_table(text, text, text, integer, integer);

CREATE FUNCTION public.admin_list_learn_table(
  p_query text DEFAULT '',
  p_status text DEFAULT 'all',
  p_sort text DEFAULT 'updated_desc',
  p_limit integer DEFAULT 20,
  p_offset integer DEFAULT 0,
  p_collection text DEFAULT 'all'
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
    OR p_collection IS NULL OR p_collection NOT IN ('all', 'product-specs', 'embedded-systems', 'kit-guides')
    OR p_sort IS NULL OR p_sort NOT IN ('updated_desc', 'updated_asc', 'title_asc', 'title_desc')
    OR p_limit IS NULL OR p_limit NOT IN (10, 20, 50)
    OR p_offset IS NULL OR p_offset NOT BETWEEN 0 AND 10000 THEN
    PERFORM public.phase3_fail('invalid_input');
  END IF;

  WITH base AS (
    SELECT r.id, r.kind, r.title, r.slug, r.version, r.published_revision_id,
      r.archived_at, r.updated_at, COALESCE(r.draft->>'collection', 'embedded-systems') AS collection,
      CASE WHEN r.archived_at IS NOT NULL THEN 'archived'
        WHEN r.published_revision_id IS NOT NULL THEN 'published' ELSE 'draft' END AS status
    FROM public.cms_records r
    WHERE r.kind = 'resource'
  ), matching AS (
    SELECT * FROM base r
    WHERE (p_status = 'all' OR r.status = p_status)
      AND (p_collection = 'all' OR r.collection = p_collection)
      AND (v_query = '' OR strpos(lower(r.title || ' ' || r.slug), lower(v_query)) > 0)
  ), page AS (
    SELECT * FROM matching r
    ORDER BY
      CASE WHEN p_sort = 'updated_desc' THEN r.updated_at END DESC,
      CASE WHEN p_sort = 'updated_asc' THEN r.updated_at END ASC,
      CASE WHEN p_sort = 'title_asc' THEN lower(r.title) END ASC,
      CASE WHEN p_sort = 'title_desc' THEN lower(r.title) END DESC,
      r.id ASC
    LIMIT p_limit OFFSET p_offset
  )
  SELECT jsonb_build_object(
    'total', (SELECT count(*) FROM matching),
    'items', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', r.id,
        'kind', r.kind,
        'title', r.title,
        'slug', r.slug,
        'version', r.version,
        'publishedRevisionId', r.published_revision_id,
        'archived', r.archived_at IS NOT NULL,
        'updatedAt', r.updated_at
      ) ORDER BY
        CASE WHEN p_sort = 'updated_desc' THEN r.updated_at END DESC,
        CASE WHEN p_sort = 'updated_asc' THEN r.updated_at END ASC,
        CASE WHEN p_sort = 'title_asc' THEN lower(r.title) END ASC,
        CASE WHEN p_sort = 'title_desc' THEN lower(r.title) END DESC,
        r.id ASC
      ) FROM page r
    ), '[]'::jsonb)
  ) INTO result;
  RETURN result;
END $f$;

REVOKE ALL ON FUNCTION public.admin_list_learn_table(text, text, text, integer, integer, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_learn_table(text, text, text, integer, integer, text) TO authenticated;

