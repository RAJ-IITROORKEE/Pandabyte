-- Additive Inventory workspace read. Original RPC and all adjustment writers remain intact.
-- Forward fix: PostgreSQL requires the total selected beside jsonb_agg to be grouped.
-- Replaces the query RPC without changing its bounded filters, stock semantics, or grants.
CREATE FUNCTION public.admin_inventory_workspace(
  p_query text,
  p_stock text,
  p_sort text,
  p_limit integer,
  p_offset integer,
  p_category_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $f$
DECLARE
  v_subject text;
  v_query text := btrim(COALESCE(p_query, ''));
  v_total bigint;
  v_items jsonb;
BEGIN
  IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 100
    OR p_offset IS NULL OR p_offset NOT BETWEEN 0 AND 10000
    OR char_length(v_query) > 120 OR v_query ~ '[[:cntrl:]]'
    OR p_stock IS NULL OR p_stock NOT IN ('all', 'unverified', 'in_stock', 'out_of_stock')
    OR p_sort IS NULL OR p_sort NOT IN ('updated_desc', 'title_asc', 'title_desc', 'sku_asc', 'sku_desc', 'stock_asc', 'stock_desc') THEN
    PERFORM public.phase3_fail('invalid_input');
  END IF;
  v_subject := public.admin_assert_capability('orders.manage');

  WITH source_state AS (
    SELECT cv.id, cv.sku, r.title, cv.updated_at,
      (COALESCE(r.draft ? 'sourceObservation', false) OR COALESCE(rev.document ? 'sourceObservation', false)) AS source_only,
      ib.available_quantity, ib.version AS stock_version
    FROM public.catalog_variants cv
    JOIN public.cms_records r ON r.id = cv.product_id AND r.kind = 'product'
    LEFT JOIN public.cms_revisions rev ON rev.id = r.published_revision_id
    LEFT JOIN public.inventory_balances ib ON ib.variant_id = cv.id
    WHERE r.archived_at IS NULL AND cv.archived_at IS NULL AND (p_category_id IS NULL OR r.draft->'categoryIds' @> jsonb_build_array(p_category_id::text))
  ), matching AS (
    SELECT source_state.id, source_state.sku, source_state.title, source_state.updated_at, source_state.source_only,
      CASE WHEN source_state.source_only OR source_state.stock_version IS NULL OR source_state.stock_version = 0
        THEN NULL ELSE source_state.available_quantity END AS managed_quantity
    FROM source_state
  ), filtered AS (
    SELECT matching.* FROM matching
    WHERE (v_query = '' OR position(lower(v_query) in lower(matching.title)) > 0 OR lower(matching.sku) = lower(v_query))
      AND (p_stock = 'all'
        OR (p_stock = 'unverified' AND matching.managed_quantity IS NULL)
        OR (p_stock = 'in_stock' AND matching.managed_quantity > 0)
        OR (p_stock = 'out_of_stock' AND matching.managed_quantity = 0))
  ), ranked AS (
    SELECT filtered.*,
      row_number() OVER (ORDER BY
        CASE WHEN p_sort = 'updated_desc' THEN filtered.updated_at END DESC,
        CASE WHEN p_sort = 'title_asc' THEN lower(filtered.title) END ASC,
        CASE WHEN p_sort = 'title_desc' THEN lower(filtered.title) END DESC,
        CASE WHEN p_sort = 'sku_asc' THEN lower(filtered.sku) END ASC,
        CASE WHEN p_sort = 'sku_desc' THEN lower(filtered.sku) END DESC,
        CASE WHEN p_sort IN ('stock_asc', 'stock_desc') AND filtered.managed_quantity IS NULL THEN 1 ELSE 0 END ASC,
        CASE WHEN p_sort IN ('stock_asc', 'stock_desc') AND filtered.source_only THEN 1 ELSE 0 END ASC,
        CASE WHEN p_sort = 'stock_asc' THEN filtered.managed_quantity END ASC NULLS LAST,
        CASE WHEN p_sort = 'stock_desc' THEN filtered.managed_quantity END DESC NULLS LAST,
        CASE WHEN p_sort = 'updated_desc' THEN filtered.id END DESC,
        CASE WHEN p_sort IN ('title_asc', 'title_desc') THEN lower(filtered.sku) END ASC,
        CASE WHEN p_sort IN ('sku_asc', 'sku_desc') THEN filtered.id END ASC,
        CASE WHEN p_sort IN ('stock_asc', 'stock_desc') THEN lower(filtered.sku) END ASC,
        filtered.id ASC
      ) AS ordinal
    FROM filtered
  ), totals AS (
    SELECT count(*) AS total FROM filtered
  ), page_rows AS (
    SELECT * FROM ranked WHERE ordinal > p_offset AND ordinal <= p_offset + p_limit
  )
  SELECT totals.total,
    COALESCE(jsonb_agg(
      CASE
        WHEN page_rows.id IS NULL THEN NULL
        WHEN page_rows.source_only THEN public.phase3_admin_variant_json(page_rows.id, v_subject)
          || jsonb_build_object('sourceOnly', true, 'stock', NULL, 'stockVersion', NULL)
        WHEN page_rows.managed_quantity IS NULL THEN public.phase3_admin_variant_json(page_rows.id, v_subject)
          || jsonb_build_object('sourceOnly', false, 'stock', NULL)
        ELSE public.phase3_admin_variant_json(page_rows.id, v_subject)
          || jsonb_build_object('sourceOnly', false)
      END || (SELECT jsonb_build_object(
 'categoryIds',COALESCE((SELECT jsonb_agg(c.id ORDER BY c.title,c.id) FROM public.cms_records c WHERE c.kind='category' AND c.archived_at IS NULL AND r.draft->'categoryIds' @> jsonb_build_array(c.id::text)),'[]'::jsonb),
 'categoryNames',COALESCE((SELECT jsonb_agg(c.title ORDER BY c.title,c.id) FROM public.cms_records c WHERE c.kind='category' AND c.archived_at IS NULL AND r.draft->'categoryIds' @> jsonb_build_array(c.id::text)),'[]'::jsonb),
 'imageId',(SELECT m.id FROM jsonb_array_elements_text(COALESCE(r.draft->'mediaIds','[]'::jsonb)) WITH ORDINALITY g(id,pos) JOIN public.cms_media m ON m.id::text=g.id AND NOT m.archived AND m.mime_type IN ('image/webp','image/png','image/jpeg') ORDER BY g.pos LIMIT 1)
 ) FROM public.catalog_variants cv JOIN public.cms_records r ON r.id=cv.product_id WHERE cv.id=page_rows.id) ORDER BY page_rows.ordinal
    ) FILTER (WHERE page_rows.id IS NOT NULL), '[]'::jsonb)
  INTO v_total, v_items
  FROM totals LEFT JOIN page_rows ON true
  GROUP BY totals.total;

  RETURN jsonb_build_object('items',v_items,'total',v_total,'categories',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',c.id,'title',c.title) ORDER BY c.title,c.id) FROM (SELECT id,title FROM public.cms_records WHERE kind='category' AND archived_at IS NULL ORDER BY title,id LIMIT 100) c),'[]'::jsonb));
END
$f$;

REVOKE ALL ON FUNCTION public.admin_inventory_workspace(text, text, text, integer, integer, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_inventory_workspace(text, text, text, integer, integer, uuid) TO authenticated;
