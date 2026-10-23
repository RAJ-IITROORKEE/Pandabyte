-- Repair JSON helper output aliases without changing function privileges or applied history.
CREATE OR REPLACE FUNCTION public.phase3_validate_document(p_kind text, p_document jsonb)
RETURNS void
LANGUAGE plpgsql
IMMUTABLE
SET search_path = pg_catalog, public, pg_temp
AS $fn$
DECLARE
  v_allowed text[];
  v_item jsonb;
  v_block jsonb;
  v_type text;
  v_key text;
  v_count integer;
  v_slug text;
BEGIN
  IF p_kind IS NULL OR p_kind NOT IN (
    'product', 'category', 'blog', 'page', 'faq', 'team',
    'navigation', 'contact', 'solution', 'resource', 'video'
  ) OR p_document IS NULL OR jsonb_typeof(p_document) IS DISTINCT FROM 'object'
    OR octet_length(p_document::text) > 262144 THEN
    PERFORM public.phase3_fail('invalid_input');
  END IF;
  v_allowed := ARRAY['title','slug','summary','blocks','seoTitle','seoDescription'];
  CASE p_kind
    WHEN 'product' THEN v_allowed := v_allowed || ARRAY[
      'categoryIds','variants','specifications','compatibility','kitContents','resources','mediaIds'];
    WHEN 'category' THEN v_allowed := v_allowed || ARRAY['parentId','position','mediaIds'];
    WHEN 'blog' THEN v_allowed := v_allowed || ARRAY['author','tags','mediaIds'];
    WHEN 'faq' THEN v_allowed := v_allowed || ARRAY['answer','topic','placements','position'];
    WHEN 'team' THEN v_allowed := v_allowed || ARRAY['name','role','bio','mediaIds','links','position'];
    WHEN 'navigation' THEN v_allowed := v_allowed || ARRAY['links'];
    WHEN 'contact' THEN v_allowed := v_allowed || ARRAY[
      'email','phone','address','hours','timezone','socialLinks'];
    WHEN 'resource' THEN v_allowed := v_allowed || ARRAY['url','productIds','position'];
    WHEN 'video' THEN v_allowed := v_allowed || ARRAY['url','productIds','position'];
    ELSE NULL;
  END CASE;
  IF EXISTS (SELECT 1 FROM public.phase3_jsonb_object_keys(p_document) AS keys(key) WHERE NOT key = ANY(v_allowed)) THEN
    PERFORM public.phase3_fail('invalid_input');
  END IF;
  IF jsonb_typeof(p_document->'title') IS DISTINCT FROM 'string'
    OR char_length(btrim(p_document->>'title')) NOT BETWEEN 1 AND 160
    OR jsonb_typeof(p_document->'slug') IS DISTINCT FROM 'string'
    OR char_length(p_document->>'slug') NOT BETWEEN 1 AND 160
    OR (p_document->>'slug') !~ '^[a-z0-9]+(-[a-z0-9]+)*$' THEN
    PERFORM public.phase3_fail('invalid_input');
  END IF;
  v_slug := p_document->>'slug';
  IF p_kind = 'contact' AND v_slug <> 'contact' THEN
    PERFORM public.phase3_fail('invalid_input');
  ELSIF p_kind = 'navigation' AND v_slug <> 'primary' THEN
    PERFORM public.phase3_fail('invalid_input');
  ELSIF p_kind = 'page' AND v_slug = ANY(ARRAY[
    'products','shop','blog','solutions','learn','contact','agent',
      'account','admin','staff','sign-in','sign-up','api','admin-preview'
  ]) THEN
    PERFORM public.phase3_fail('duplicate_route');
  END IF;
  IF p_document ? 'summary' AND (jsonb_typeof(p_document->'summary') IS DISTINCT FROM 'string'
    OR char_length(p_document->>'summary') > 1000) THEN
    PERFORM public.phase3_fail('invalid_input');
  END IF;
  IF p_document ? 'seoTitle' AND (jsonb_typeof(p_document->'seoTitle') IS DISTINCT FROM 'string'
    OR char_length(p_document->>'seoTitle') > 160) THEN
    PERFORM public.phase3_fail('invalid_input');
  END IF;
  IF p_document ? 'seoDescription' AND (jsonb_typeof(p_document->'seoDescription') IS DISTINCT FROM 'string'
    OR char_length(p_document->>'seoDescription') > 320) THEN
    PERFORM public.phase3_fail('invalid_input');
  END IF;
  IF p_document ? 'blocks' THEN
    IF jsonb_typeof(p_document->'blocks') IS DISTINCT FROM 'array'
      OR public.phase3_jsonb_array_length(p_document->'blocks') > 100 THEN
      PERFORM public.phase3_fail('invalid_input');
    END IF;
    FOR v_block IN SELECT item FROM public.phase3_jsonb_array_elements(p_document->'blocks') AS items(item) LOOP
      IF jsonb_typeof(v_block) IS DISTINCT FROM 'object' OR jsonb_typeof(v_block->'type') IS DISTINCT FROM 'string' THEN
        PERFORM public.phase3_fail('invalid_input');
      END IF;
      v_type := v_block->>'type';
      IF v_type = 'paragraph' THEN
        v_allowed := ARRAY['type','text'];
        IF jsonb_typeof(v_block->'text') IS DISTINCT FROM 'string' OR char_length(v_block->>'text') > 8000 THEN
          PERFORM public.phase3_fail('invalid_input');
        END IF;
      ELSIF v_type = 'heading' THEN
        v_allowed := ARRAY['type','level','text'];
        IF jsonb_typeof(v_block->'level') IS DISTINCT FROM 'number'
          OR (v_block->>'level') NOT IN ('1','2','3')
          OR jsonb_typeof(v_block->'text') IS DISTINCT FROM 'string' OR char_length(v_block->>'text') NOT BETWEEN 1 AND 8000 THEN
          PERFORM public.phase3_fail('invalid_input');
        END IF;
      ELSIF v_type = 'code' THEN
        v_allowed := ARRAY['type','language','code'];
        IF jsonb_typeof(v_block->'code') IS DISTINCT FROM 'string' OR char_length(v_block->>'code') > 12000
          OR (v_block ? 'language' AND (jsonb_typeof(v_block->'language') IS DISTINCT FROM 'string'
            OR char_length(v_block->>'language') > 40)) THEN
          PERFORM public.phase3_fail('invalid_input');
        END IF;
      ELSIF v_type IN ('bulletList','orderedList') THEN
        v_allowed := ARRAY['type','items'];
        IF jsonb_typeof(v_block->'items') IS DISTINCT FROM 'array' OR public.phase3_jsonb_array_length(v_block->'items') NOT BETWEEN 1 AND 50
          OR EXISTS (SELECT 1 FROM public.phase3_jsonb_array_elements(v_block->'items') AS items(value)
            WHERE jsonb_typeof(value) IS DISTINCT FROM 'string' OR char_length(value #>> '{}') NOT BETWEEN 1 AND 1000) THEN
          PERFORM public.phase3_fail('invalid_input');
        END IF;
      ELSIF v_type = 'link' THEN
        v_allowed := ARRAY['type','label','url'];
        IF jsonb_typeof(v_block->'label') IS DISTINCT FROM 'string' OR char_length(v_block->>'label') NOT BETWEEN 1 AND 120
          OR NOT public.phase3_is_safe_url(v_block->>'url', true) THEN
          PERFORM public.phase3_fail('invalid_input');
        END IF;
      ELSIF v_type = 'image' THEN
        v_allowed := ARRAY['type','mediaId','alt'];
        IF jsonb_typeof(v_block->'mediaId') IS DISTINCT FROM 'string'
          OR (v_block->>'mediaId') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
          OR jsonb_typeof(v_block->'alt') IS DISTINCT FROM 'string' OR char_length(v_block->>'alt') > 240 THEN
          PERFORM public.phase3_fail('invalid_input');
        END IF;
      ELSIF v_type = 'table' THEN
        v_allowed := ARRAY['type','headers','rows'];
        IF jsonb_typeof(v_block->'headers') IS DISTINCT FROM 'array' OR public.phase3_jsonb_array_length(v_block->'headers') NOT BETWEEN 1 AND 12
          OR jsonb_typeof(v_block->'rows') IS DISTINCT FROM 'array' OR public.phase3_jsonb_array_length(v_block->'rows') > 40
          OR EXISTS (SELECT 1 FROM public.phase3_jsonb_array_elements(v_block->'headers') AS h(value)
            WHERE jsonb_typeof(value) IS DISTINCT FROM 'string' OR char_length(value #>> '{}') > 120)
          OR EXISTS (SELECT 1 FROM public.phase3_jsonb_array_elements(v_block->'rows') AS r(row_value)
            WHERE jsonb_typeof(row_value) IS DISTINCT FROM 'array' OR public.phase3_jsonb_array_length(row_value) IS DISTINCT FROM public.phase3_jsonb_array_length(v_block->'headers')
              OR EXISTS (SELECT 1 FROM public.phase3_jsonb_array_elements(row_value) AS c(value)
                WHERE jsonb_typeof(value) IS DISTINCT FROM 'string' OR char_length(value #>> '{}') > 500)) THEN
          PERFORM public.phase3_fail('invalid_input');
        END IF;
      ELSE
        PERFORM public.phase3_fail('invalid_input');
      END IF;
      IF EXISTS (SELECT 1 FROM public.phase3_jsonb_object_keys(v_block) AS keys(key) WHERE NOT key = ANY(v_allowed)) THEN
        PERFORM public.phase3_fail('invalid_input');
      END IF;
    END LOOP;
  END IF;

  -- Every family below is bounded and rejects unknown keys at its own nested level.
  IF p_kind = 'product' THEN
    IF jsonb_typeof(p_document->'variants') IS DISTINCT FROM 'array'
      OR public.phase3_jsonb_array_length(p_document->'variants') NOT BETWEEN 1 AND 100
      OR jsonb_typeof(p_document->'categoryIds') IS DISTINCT FROM 'array'
      OR public.phase3_jsonb_array_length(p_document->'categoryIds') > 50
      OR jsonb_typeof(p_document->'specifications') IS DISTINCT FROM 'array'
      OR public.phase3_jsonb_array_length(p_document->'specifications') > 100
      OR jsonb_typeof(p_document->'compatibility') IS DISTINCT FROM 'array'
      OR public.phase3_jsonb_array_length(p_document->'compatibility') > 50
      OR jsonb_typeof(p_document->'kitContents') IS DISTINCT FROM 'array'
      OR public.phase3_jsonb_array_length(p_document->'kitContents') > 100
      OR jsonb_typeof(p_document->'resources') IS DISTINCT FROM 'array'
      OR public.phase3_jsonb_array_length(p_document->'resources') > 100
      OR jsonb_typeof(p_document->'mediaIds') IS DISTINCT FROM 'array'
      OR public.phase3_jsonb_array_length(p_document->'mediaIds') > 100 THEN
      PERFORM public.phase3_fail('invalid_input');
    END IF;
    FOR v_item IN SELECT item FROM public.phase3_jsonb_array_elements(p_document->'variants') AS items(item) LOOP
      IF jsonb_typeof(v_item) IS DISTINCT FROM 'object'
        OR EXISTS (SELECT 1 FROM public.phase3_jsonb_object_keys(v_item) AS keys(key) WHERE key NOT IN ('id','sku','label'))
        OR jsonb_typeof(v_item->'sku') IS DISTINCT FROM 'string'
        OR char_length(btrim(v_item->>'sku')) NOT BETWEEN 1 AND 80
        OR (v_item->>'sku') !~ '^[A-Za-z0-9._-]+$'
        OR jsonb_typeof(v_item->'label') IS DISTINCT FROM 'string'
        OR char_length(btrim(v_item->>'label')) NOT BETWEEN 1 AND 120
        OR (v_item ? 'id' AND (jsonb_typeof(v_item->'id') IS DISTINCT FROM 'string'
          OR (v_item->>'id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')) THEN
        PERFORM public.phase3_fail('invalid_input');
      END IF;
    END LOOP;
    IF (SELECT count(*) IS DISTINCT FROM count(DISTINCT lower(value->>'sku')) FROM public.phase3_jsonb_array_elements(p_document->'variants'))
      OR (SELECT count(*) IS DISTINCT FROM count(DISTINCT lower(value->>'id')) FROM public.phase3_jsonb_array_elements(p_document->'variants') WHERE value ? 'id') THEN
      PERFORM public.phase3_fail('invalid_input');
    END IF;
    IF EXISTS (SELECT 1 FROM public.phase3_jsonb_array_elements(p_document->'categoryIds') AS vals(value)
      WHERE jsonb_typeof(value) IS DISTINCT FROM 'string' OR (value #>> '{}') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')
      OR (SELECT count(*) IS DISTINCT FROM count(DISTINCT lower(value #>> '{}')) FROM public.phase3_jsonb_array_elements(p_document->'categoryIds')) THEN
      PERFORM public.phase3_fail('invalid_input');
    END IF;
    FOR v_item IN SELECT item FROM public.phase3_jsonb_array_elements(p_document->'specifications') AS items(item) LOOP
      IF jsonb_typeof(v_item) IS DISTINCT FROM 'object'
        OR EXISTS (SELECT 1 FROM public.phase3_jsonb_object_keys(v_item) AS keys(key) WHERE key NOT IN ('name','value'))
        OR jsonb_typeof(v_item->'name') IS DISTINCT FROM 'string'
        OR char_length(btrim(v_item->>'name')) NOT BETWEEN 1 AND 120
        OR jsonb_typeof(v_item->'value') IS DISTINCT FROM 'string'
        OR char_length(btrim(v_item->>'value')) NOT BETWEEN 1 AND 2000 THEN
        PERFORM public.phase3_fail('invalid_input');
      END IF;
    END LOOP;
    IF EXISTS (SELECT 1 FROM public.phase3_jsonb_array_elements(p_document->'compatibility') AS vals(value)
      WHERE jsonb_typeof(value) IS DISTINCT FROM 'string' OR char_length(btrim(value #>> '{}')) NOT BETWEEN 1 AND 240) THEN
      PERFORM public.phase3_fail('invalid_input');
    END IF;
    FOR v_item IN SELECT item FROM public.phase3_jsonb_array_elements(p_document->'kitContents') AS items(item) LOOP
      IF jsonb_typeof(v_item) IS DISTINCT FROM 'object'
        OR EXISTS (SELECT 1 FROM public.phase3_jsonb_object_keys(v_item) AS keys(key) WHERE key NOT IN ('productId','title','quantity'))
        OR jsonb_typeof(v_item->'title') IS DISTINCT FROM 'string'
        OR char_length(btrim(v_item->>'title')) NOT BETWEEN 1 AND 160
        OR NOT public.phase3_integer_in_range(v_item->'quantity', 1, 10000)
        OR (v_item ? 'productId' AND (jsonb_typeof(v_item->'productId') IS DISTINCT FROM 'string'
          OR (v_item->>'productId') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')) THEN
        PERFORM public.phase3_fail('invalid_input');
      END IF;
    END LOOP;
    FOR v_item IN SELECT item FROM public.phase3_jsonb_array_elements(p_document->'resources') AS items(item) LOOP
      IF jsonb_typeof(v_item) IS DISTINCT FROM 'object'
        OR EXISTS (SELECT 1 FROM public.phase3_jsonb_object_keys(v_item) AS keys(key) WHERE key NOT IN ('label','url'))
        OR jsonb_typeof(v_item->'label') IS DISTINCT FROM 'string'
        OR char_length(btrim(v_item->>'label')) NOT BETWEEN 1 AND 160
        OR NOT public.phase3_is_safe_url(v_item->>'url', true) THEN
        PERFORM public.phase3_fail('invalid_input');
      END IF;
    END LOOP;
  ELSIF p_kind = 'category' THEN
    IF NOT (p_document ? 'parentId') THEN
      PERFORM public.phase3_fail('invalid_input');
    END IF;
    IF p_document->'parentId' <> 'null'::jsonb
      AND (jsonb_typeof(p_document->'parentId') IS DISTINCT FROM 'string'
        OR (p_document->>'parentId') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$') THEN
      PERFORM public.phase3_fail('invalid_input');
    END IF;
    IF NOT public.phase3_valid_position(p_document->'position')
      OR jsonb_typeof(p_document->'mediaIds') IS DISTINCT FROM 'array' OR public.phase3_jsonb_array_length(p_document->'mediaIds') > 100 THEN
      PERFORM public.phase3_fail('invalid_input');
    END IF;
  ELSIF p_kind = 'blog' THEN
    IF jsonb_typeof(p_document->'author') IS DISTINCT FROM 'string' OR char_length(p_document->>'author') > 160
      OR jsonb_typeof(p_document->'tags') IS DISTINCT FROM 'array' OR public.phase3_jsonb_array_length(p_document->'tags') > 30
      OR EXISTS (SELECT 1 FROM public.phase3_jsonb_array_elements(p_document->'tags') AS vals(value)
        WHERE jsonb_typeof(value) IS DISTINCT FROM 'string' OR char_length(btrim(value #>> '{}')) NOT BETWEEN 1 AND 60) THEN
      PERFORM public.phase3_fail('invalid_input');
    END IF;
  ELSIF p_kind = 'faq' THEN
    IF jsonb_typeof(p_document->'answer') IS DISTINCT FROM 'string' OR char_length(p_document->>'answer') > 8000
      OR jsonb_typeof(p_document->'topic') IS DISTINCT FROM 'string' OR char_length(p_document->>'topic') > 120
       OR jsonb_typeof(p_document->'placements') IS DISTINCT FROM 'array' OR public.phase3_jsonb_array_length(p_document->'placements') > 6
      OR EXISTS (SELECT 1 FROM public.phase3_jsonb_array_elements(p_document->'placements') AS vals(value)
         WHERE jsonb_typeof(value) IS DISTINCT FROM 'string'
           OR value #>> '{}' NOT IN ('home','about','contact','help','product','solutions'))
       OR (SELECT count(*) IS DISTINCT FROM count(DISTINCT value #>> '{}')
         FROM public.phase3_jsonb_array_elements(p_document->'placements'))
       OR NOT public.phase3_valid_position(p_document->'position') THEN
      PERFORM public.phase3_fail('invalid_input');
    END IF;
  ELSIF p_kind = 'team' THEN
    IF jsonb_typeof(p_document->'name') IS DISTINCT FROM 'string' OR char_length(p_document->>'name') > 160
      OR jsonb_typeof(p_document->'role') IS DISTINCT FROM 'string' OR char_length(p_document->>'role') > 120
      OR jsonb_typeof(p_document->'bio') IS DISTINCT FROM 'string' OR char_length(p_document->>'bio') > 4000
      OR jsonb_typeof(p_document->'links') IS DISTINCT FROM 'array' OR public.phase3_jsonb_array_length(p_document->'links') > 30
      OR NOT public.phase3_valid_position(p_document->'position') THEN
      PERFORM public.phase3_fail('invalid_input');
    END IF;
    FOR v_item IN SELECT item FROM public.phase3_jsonb_array_elements(p_document->'links') AS items(item) LOOP
      IF jsonb_typeof(v_item) IS DISTINCT FROM 'object' OR EXISTS (
        SELECT 1 FROM public.phase3_jsonb_object_keys(v_item) AS keys(key) WHERE key NOT IN ('label','url'))
        OR jsonb_typeof(v_item->'label') IS DISTINCT FROM 'string' OR char_length(v_item->>'label') NOT BETWEEN 1 AND 120
        OR NOT public.phase3_is_safe_url(v_item->>'url', false) THEN
        PERFORM public.phase3_fail('invalid_input');
      END IF;
    END LOOP;
  ELSIF p_kind = 'navigation' THEN
    IF jsonb_typeof(p_document->'links') IS DISTINCT FROM 'array' OR public.phase3_jsonb_array_length(p_document->'links') > 100 THEN
      PERFORM public.phase3_fail('invalid_input');
    END IF;
    FOR v_item IN SELECT item FROM public.phase3_jsonb_array_elements(p_document->'links') AS items(item) LOOP
      IF jsonb_typeof(v_item) IS DISTINCT FROM 'object' OR EXISTS (
        SELECT 1 FROM public.phase3_jsonb_object_keys(v_item) AS keys(key)
        WHERE key NOT IN ('label','href','group','position','visible'))
        OR jsonb_typeof(v_item->'label') IS DISTINCT FROM 'string' OR char_length(v_item->>'label') NOT BETWEEN 1 AND 120
        OR NOT public.phase3_is_safe_public_href(v_item->>'href')
        OR jsonb_typeof(v_item->'group') IS DISTINCT FROM 'string'
        OR v_item->>'group' NOT IN ('header','footer')
        OR NOT public.phase3_valid_position(v_item->'position')
        OR jsonb_typeof(v_item->'visible') IS DISTINCT FROM 'boolean' THEN
        PERFORM public.phase3_fail('invalid_input');
      END IF;
    END LOOP;
  ELSIF p_kind = 'contact' THEN
    IF jsonb_typeof(p_document->'email') IS DISTINCT FROM 'string' OR char_length(p_document->>'email') > 254
      OR jsonb_typeof(p_document->'phone') IS DISTINCT FROM 'string' OR char_length(p_document->>'phone') > 48
      OR jsonb_typeof(p_document->'address') IS DISTINCT FROM 'string' OR char_length(p_document->>'address') > 1000
      OR jsonb_typeof(p_document->'hours') IS DISTINCT FROM 'string' OR char_length(p_document->>'hours') > 1000
      OR jsonb_typeof(p_document->'timezone') IS DISTINCT FROM 'string' OR char_length(p_document->>'timezone') > 100 THEN
        PERFORM public.phase3_fail('invalid_input');
    END IF;
    IF p_document->>'email' <> '' AND p_document->>'email' !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' THEN
      PERFORM public.phase3_fail('invalid_input');
    END IF;
    IF p_document ? 'socialLinks' AND (jsonb_typeof(p_document->'socialLinks') IS DISTINCT FROM 'array'
      OR public.phase3_jsonb_array_length(p_document->'socialLinks') > 30) THEN
      PERFORM public.phase3_fail('invalid_input');
    END IF;
    IF p_document ? 'socialLinks' THEN
      FOR v_item IN SELECT item FROM public.phase3_jsonb_array_elements(p_document->'socialLinks') AS items(item) LOOP
        IF jsonb_typeof(v_item) IS DISTINCT FROM 'object' OR EXISTS (
          SELECT 1 FROM public.phase3_jsonb_object_keys(v_item) AS keys(key) WHERE key NOT IN ('label','url'))
          OR jsonb_typeof(v_item->'label') IS DISTINCT FROM 'string' OR char_length(v_item->>'label') NOT BETWEEN 1 AND 120
          OR NOT public.phase3_is_safe_url(v_item->>'url', false) THEN
          PERFORM public.phase3_fail('invalid_input');
        END IF;
      END LOOP;
    END IF;
  ELSIF p_kind IN ('resource','video') THEN
    IF jsonb_typeof(p_document->'url') IS DISTINCT FROM 'string'
      OR char_length(btrim(p_document->>'url')) NOT BETWEEN 1 AND 2048
      OR ((p_kind = 'resource' AND NOT public.phase3_is_safe_url(p_document->>'url', false))
        OR (p_kind = 'video' AND (p_document->>'url') !~ '^[A-Za-z0-9_-]{11}$'
          AND NOT public.phase3_is_safe_url(p_document->>'url', false)))
      OR jsonb_typeof(p_document->'productIds') IS DISTINCT FROM 'array' OR public.phase3_jsonb_array_length(p_document->'productIds') > 100
      OR EXISTS (SELECT 1 FROM public.phase3_jsonb_array_elements(p_document->'productIds') AS vals(value)
        WHERE jsonb_typeof(value) IS DISTINCT FROM 'string' OR (value #>> '{}') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')
      OR NOT public.phase3_valid_position(p_document->'position')
      OR (SELECT count(*) IS DISTINCT FROM count(DISTINCT lower(value #>> '{}'))
        FROM public.phase3_jsonb_array_elements(p_document->'productIds')) THEN
      PERFORM public.phase3_fail('invalid_input');
    END IF;
    IF p_kind = 'video' AND (p_document->>'url') !~ '^[A-Za-z0-9_-]{11}$'
      AND (p_document->>'url') !~* '^https://(www\.|m\.)?(youtube\.com/(watch\?v=|embed/|shorts/)[A-Za-z0-9_-]{11}([&?#].*)?|youtu\.be/[A-Za-z0-9_-]{11}([?&#].*)?|youtube-nocookie\.com/embed/[A-Za-z0-9_-]{11}([?&#].*)?)$' THEN
      PERFORM public.phase3_fail('invalid_input');
    END IF;
  END IF;

  IF p_kind IN ('product','category','blog','team') AND p_document ? 'mediaIds' THEN
    IF jsonb_typeof(p_document->'mediaIds') IS DISTINCT FROM 'array' OR public.phase3_jsonb_array_length(p_document->'mediaIds') > 100
      OR EXISTS (SELECT 1 FROM public.phase3_jsonb_array_elements(p_document->'mediaIds') AS vals(value)
        WHERE jsonb_typeof(value) IS DISTINCT FROM 'string' OR (value #>> '{}') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')
      OR (SELECT count(*) IS DISTINCT FROM count(DISTINCT value #>> '{}') FROM public.phase3_jsonb_array_elements(p_document->'mediaIds')) THEN
      PERFORM public.phase3_fail('invalid_input');
    END IF;
  END IF;
END
$fn$;

CREATE OR REPLACE FUNCTION public.phase3_sync_product_variants(p_record_id uuid, p_document jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $fn$
DECLARE
  v_item jsonb;
  v_variant_id uuid;
  v_product_id uuid;
  v_existing_sku text;
  v_sku text;
  v_label text;
  v_variants jsonb := '[]'::jsonb;
BEGIN
  FOR v_item IN SELECT item FROM public.phase3_jsonb_array_elements(p_document->'variants') AS items(item) LOOP
    v_sku := btrim(v_item->>'sku');
    v_label := btrim(v_item->>'label');
    IF v_item ? 'id' THEN
      v_variant_id := (v_item->>'id')::uuid;
      SELECT cv.product_id, cv.sku INTO v_product_id, v_existing_sku
        FROM public.catalog_variants cv WHERE cv.id = v_variant_id FOR UPDATE;
      IF NOT FOUND OR v_product_id <> p_record_id THEN
        PERFORM public.phase3_fail('invalid_input');
      END IF;
      IF v_existing_sku <> v_sku THEN
        PERFORM public.phase3_fail('invalid_state');
      END IF;
      BEGIN
        UPDATE public.catalog_variants cv
          SET archived_at = NULL, updated_at = now()
          WHERE cv.id = v_variant_id;
      EXCEPTION WHEN unique_violation THEN
        PERFORM public.phase3_fail('sku_conflict');
      END;
    ELSE
      BEGIN
        INSERT INTO public.catalog_variants (product_id, sku)
          VALUES (p_record_id, v_sku) RETURNING id INTO v_variant_id;
      EXCEPTION WHEN unique_violation THEN
        PERFORM public.phase3_fail('sku_conflict');
      END;
    END IF;
    INSERT INTO public.inventory_balances (variant_id) VALUES (v_variant_id) ON CONFLICT (variant_id) DO NOTHING;
    v_variants := v_variants || jsonb_build_array(jsonb_build_object(
      'id', v_variant_id, 'sku', v_sku, 'label', v_label
    ));
  END LOOP;
  RETURN jsonb_set(p_document, '{variants}', v_variants, true);
END
$fn$;
