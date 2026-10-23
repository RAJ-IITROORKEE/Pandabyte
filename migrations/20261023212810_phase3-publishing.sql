-- Additive Phase 3 development publishing infrastructure.
GRANT USAGE ON SCHEMA public TO anon, authenticated;
-- New shared editorial storage metadata. Existing customer buckets remain unchanged.
CREATE TABLE public.cms_media (
 id uuid PRIMARY KEY,
 object_key text NOT NULL UNIQUE CHECK(object_key ~ '^assets/[0-9a-f-]{36}[.](webp|pdf)$'),
 storage_url text NOT NULL CHECK(storage_url LIKE 'https://%'),
 filename text NOT NULL CHECK(char_length(filename) BETWEEN 1 AND 120),
 mime_type text NOT NULL CHECK(mime_type IN ('image/webp','application/pdf')),
 byte_size integer NOT NULL CHECK(byte_size BETWEEN 1 AND 4194304),
 width integer, height integer,
 alt_text text NOT NULL CHECK(char_length(btrim(alt_text)) BETWEEN 1 AND 300),
 source text NOT NULL DEFAULT '' CHECK(char_length(source)<=500),
 version bigint NOT NULL DEFAULT 1 CHECK(version>0),
 published boolean NOT NULL DEFAULT false,
 archived boolean NOT NULL DEFAULT false,
 created_by text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK((mime_type='application/pdf' AND width IS NULL AND height IS NULL AND byte_size<=2097152)
   OR (mime_type='image/webp' AND width IS NOT NULL AND height IS NOT NULL AND width BETWEEN 1 AND 8192 AND height BETWEEN 1 AND 8192 AND width::bigint*height<=20000000)),
 CHECK(NOT (published AND archived))
);
CREATE INDEX cms_media_created_idx ON public.cms_media(created_at DESC,id);
ALTER TABLE public.cms_media ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.cms_media FROM PUBLIC,anon,authenticated;


-- Phase 3 core schema draft. Root owns migration assembly and application.
-- Requires the cms_media table prelude (id, published, archived, ...).

-- Extend the existing least-privilege allowlist without granting any capability.
ALTER TABLE public.staff_capabilities
  DROP CONSTRAINT IF EXISTS staff_capabilities_capability_check;
ALTER TABLE public.staff_capabilities
  ADD CONSTRAINT staff_capabilities_capability_check
  CHECK (capability IN (
    'content.edit', 'catalog.edit', 'content.publish', 'orders.manage',
    'staff.manage', 'media.manage', 'inquiries.manage'
  ));

CREATE OR REPLACE FUNCTION public.set_staff_capability(
  target_user_id text,
  capability_name text,
  enabled boolean,
  reason text
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog
AS $fn$
BEGIN
  IF target_user_id IS NULL OR char_length(btrim(target_user_id)) NOT BETWEEN 1 AND 256
    OR capability_name IS NULL OR capability_name NOT IN (
      'content.edit', 'catalog.edit', 'content.publish', 'orders.manage',
      'staff.manage', 'media.manage', 'inquiries.manage'
    )
    OR enabled IS NULL OR reason IS NULL OR char_length(btrim(reason)) NOT BETWEEN 1 AND 500 THEN
    RAISE EXCEPTION 'Invalid capability operation' USING ERRCODE = '22023';
  END IF;
  IF enabled THEN
    INSERT INTO public.staff_capabilities (user_id, capability, granted_by)
    VALUES (target_user_id, capability_name, current_user)
    ON CONFLICT (user_id, capability) DO NOTHING;
  ELSE
    DELETE FROM public.staff_capabilities
    WHERE user_id = target_user_id AND capability = capability_name;
  END IF;
  INSERT INTO public.staff_capability_events (user_id, capability, enabled, actor, reason)
  VALUES (target_user_id, capability_name, enabled, current_user, btrim(reason));
END
$fn$;

CREATE TABLE public.cms_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL CHECK (kind IN (
    'product', 'category', 'blog', 'page', 'faq', 'team',
    'navigation', 'contact', 'solution', 'resource', 'video'
  )),
  title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 160),
  slug text NOT NULL CHECK (char_length(slug) BETWEEN 1 AND 160),
  draft jsonb NOT NULL CHECK (jsonb_typeof(draft) = 'object'),
  version bigint NOT NULL DEFAULT 1 CHECK (version > 0),
  published_revision_id uuid,
  draft_source_revision_id uuid,
  archived_at timestamptz,
  archived_by text,
  created_by text NOT NULL,
  updated_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cms_records_id_kind_key UNIQUE (id, kind),
  CONSTRAINT cms_records_archive_actor_check CHECK ((archived_at IS NULL) = (archived_by IS NULL))
);
CREATE INDEX cms_records_kind_updated_idx
  ON public.cms_records (kind, updated_at DESC, id DESC);
CREATE UNIQUE INDEX cms_records_singleton_contact_idx
  ON public.cms_records (kind) WHERE kind = 'contact' AND archived_at IS NULL;
CREATE UNIQUE INDEX cms_records_singleton_navigation_idx
  ON public.cms_records (kind) WHERE kind = 'navigation' AND archived_at IS NULL;

CREATE TABLE public.cms_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  record_id uuid NOT NULL REFERENCES public.cms_records(id) ON DELETE RESTRICT,
  revision_number bigint NOT NULL CHECK (revision_number > 0),
  source_version bigint NOT NULL CHECK (source_version > 0),
  source_revision_id uuid,
  title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 160),
  slug text NOT NULL CHECK (char_length(slug) BETWEEN 1 AND 160),
  document jsonb NOT NULL CHECK (jsonb_typeof(document) = 'object'),
  published_at timestamptz NOT NULL DEFAULT now(),
  published_by text NOT NULL,
  CONSTRAINT cms_revisions_record_number_key UNIQUE (record_id, revision_number),
  CONSTRAINT cms_revisions_record_id_key UNIQUE (record_id, id),
  CONSTRAINT cms_revisions_source_same_record_fk
    FOREIGN KEY (record_id, source_revision_id)
    REFERENCES public.cms_revisions(record_id, id) ON DELETE RESTRICT
);
CREATE INDEX cms_revisions_record_history_idx
  ON public.cms_revisions (record_id, revision_number DESC);
ALTER TABLE public.cms_records
  ADD CONSTRAINT cms_records_published_revision_fk
  FOREIGN KEY (id, published_revision_id)
  REFERENCES public.cms_revisions (record_id, id) ON DELETE RESTRICT;
ALTER TABLE public.cms_records
  ADD CONSTRAINT cms_records_draft_source_revision_fk
  FOREIGN KEY (id, draft_source_revision_id)
  REFERENCES public.cms_revisions (record_id, id) ON DELETE RESTRICT;

CREATE TABLE public.cms_live_routes (
  record_id uuid PRIMARY KEY,
  kind text NOT NULL,
  slug text NOT NULL,
  path text NOT NULL,
  revision_id uuid NOT NULL,
  published_at timestamptz NOT NULL,
  CONSTRAINT cms_live_routes_record_kind_fk
    FOREIGN KEY (record_id, kind) REFERENCES public.cms_records (id, kind) ON DELETE RESTRICT,
  CONSTRAINT cms_live_routes_revision_fk
    FOREIGN KEY (record_id, revision_id) REFERENCES public.cms_revisions (record_id, id) ON DELETE RESTRICT,
  CONSTRAINT cms_live_routes_kind_slug_key UNIQUE (kind, slug),
  CONSTRAINT cms_live_routes_path_key UNIQUE (path)
);

CREATE TABLE public.cms_slug_redirects (
  from_path text PRIMARY KEY,
  kind text NOT NULL,
  from_slug text NOT NULL,
  record_id uuid NOT NULL REFERENCES public.cms_records(id) ON DELETE RESTRICT,
  target_path text NOT NULL,
  target_slug text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cms_slug_redirects_kind_from_slug_key UNIQUE (kind, from_slug),
  CONSTRAINT cms_slug_redirects_no_self_redirect CHECK (from_path <> target_path)
);
CREATE INDEX cms_slug_redirects_record_idx ON public.cms_slug_redirects (record_id);

CREATE TABLE public.catalog_variants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL,
  product_kind text NOT NULL DEFAULT 'product' CHECK (product_kind = 'product'),
  sku text NOT NULL CHECK (char_length(sku) BETWEEN 1 AND 80),
  regular_paise bigint CHECK (regular_paise BETWEEN 0 AND 10000000000),
  sale_paise bigint CHECK (sale_paise BETWEEN 0 AND 10000000000),
  sale_from timestamptz,
  sale_until timestamptz,
  price_version bigint NOT NULL DEFAULT 0 CHECK (price_version >= 0),
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT catalog_variants_product_fk
    FOREIGN KEY (product_id, product_kind)
    REFERENCES public.cms_records (id, kind) ON DELETE RESTRICT,
  CONSTRAINT catalog_variants_sale_shape_check CHECK (
    (sale_paise IS NULL AND sale_from IS NULL AND sale_until IS NULL)
    OR (sale_paise IS NOT NULL AND sale_from IS NOT NULL AND sale_until IS NOT NULL
        AND sale_from < sale_until AND regular_paise IS NOT NULL AND sale_paise <= regular_paise)
  )
);
CREATE UNIQUE INDEX catalog_variants_active_sku_key
  ON public.catalog_variants (lower(sku)) WHERE archived_at IS NULL;
CREATE INDEX catalog_variants_product_idx
  ON public.catalog_variants (product_id, id) WHERE archived_at IS NULL;

CREATE TABLE public.product_categories (
  product_id uuid NOT NULL,
  product_kind text NOT NULL DEFAULT 'product' CHECK (product_kind = 'product'),
  category_id uuid NOT NULL,
  category_kind text NOT NULL DEFAULT 'category' CHECK (category_kind = 'category'),
  linked_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (product_id, category_id),
  CONSTRAINT product_categories_product_fk
    FOREIGN KEY (product_id, product_kind)
    REFERENCES public.cms_records (id, kind) ON DELETE RESTRICT,
  CONSTRAINT product_categories_category_fk
    FOREIGN KEY (category_id, category_kind)
    REFERENCES public.cms_records (id, kind) ON DELETE RESTRICT
);
CREATE INDEX product_categories_category_idx ON public.product_categories (category_id, product_id);

CREATE TABLE public.inventory_balances (
  variant_id uuid PRIMARY KEY REFERENCES public.catalog_variants(id) ON DELETE RESTRICT,
  available_quantity integer NOT NULL DEFAULT 0 CHECK (available_quantity >= 0),
  version bigint NOT NULL DEFAULT 0 CHECK (version >= 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.variant_price_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  variant_id uuid NOT NULL REFERENCES public.catalog_variants(id) ON DELETE RESTRICT,
  version bigint NOT NULL CHECK (version > 0),
  regular_paise bigint,
  sale_paise bigint,
  sale_from timestamptz,
  sale_until timestamptz,
  actor text NOT NULL,
  reason text NOT NULL CHECK (char_length(reason) BETWEEN 1 AND 500),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT variant_price_events_version_key UNIQUE (variant_id, version)
);
CREATE INDEX variant_price_events_history_idx
  ON public.variant_price_events (variant_id, occurred_at DESC, id DESC);

CREATE TABLE public.inventory_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  variant_id uuid NOT NULL REFERENCES public.catalog_variants(id) ON DELETE RESTRICT,
  request_id uuid NOT NULL UNIQUE,
  delta integer NOT NULL CHECK (delta <> 0),
  balance_after integer NOT NULL CHECK (balance_after >= 0),
  stock_version bigint NOT NULL CHECK (stock_version > 0),
  reason text NOT NULL CHECK (char_length(reason) BETWEEN 1 AND 500),
  actor text NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX inventory_movements_history_idx
  ON public.inventory_movements (variant_id, occurred_at DESC, id DESC);

CREATE TABLE public.cms_audit_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  actor text NOT NULL,
  action text NOT NULL CHECK (char_length(action) BETWEEN 1 AND 80),
  entity_type text NOT NULL CHECK (char_length(entity_type) BETWEEN 1 AND 40),
  entity_id uuid,
  details jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(details) = 'object'),
  reason text CHECK (reason IS NULL OR char_length(reason) BETWEEN 1 AND 500),
  occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX cms_audit_events_entity_history_idx
  ON public.cms_audit_events (entity_type, entity_id, occurred_at DESC, id DESC);
CREATE INDEX cms_audit_events_actor_history_idx
  ON public.cms_audit_events (actor, occurred_at DESC, id DESC);

CREATE FUNCTION public.phase3_fail(p_code text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $fn$
BEGIN
  RAISE EXCEPTION 'Phase 3 request failed'
    USING ERRCODE = 'P0001', DETAIL = p_code;
END
$fn$;

CREATE FUNCTION public.admin_assert_capability(p_capability text)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $fn$
DECLARE
  v_subject text;
BEGIN
  IF p_capability IS NULL OR p_capability NOT IN (
    'content.edit', 'catalog.edit', 'content.publish', 'orders.manage',
    'staff.manage', 'media.manage', 'inquiries.manage'
  ) THEN
    PERFORM public.phase3_fail('invalid_input');
  END IF;
  v_subject := public.requesting_user_id();
  IF v_subject IS NULL OR char_length(v_subject) NOT BETWEEN 1 AND 256 THEN
    PERFORM public.phase3_fail('unauthenticated');
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.staff_capabilities sc
    WHERE sc.user_id = v_subject AND sc.capability = p_capability
  ) THEN
    PERFORM public.phase3_fail('forbidden');
  END IF;
  RETURN v_subject;
END
$fn$;

CREATE FUNCTION public.phase3_is_safe_url(p_value text, p_allow_relative boolean DEFAULT true)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog
AS $fn$
  SELECT p_value IS NOT NULL
    AND char_length(p_value) BETWEEN 1 AND 2048
    AND p_value !~ '[[:cntrl:]]'
    AND position(chr(92) in p_value) = 0
    AND (
      p_value ~* '^https://[^/@[:space:]]+([/?#][^[:space:]]*)?$'
      OR (p_allow_relative AND left(p_value, 1) = '/' AND left(p_value, 2) <> '//'
          AND p_value !~ '[[:space:]]')
    )
$fn$;

CREATE FUNCTION public.phase3_route_path(p_kind text, p_slug text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog
AS $fn$
  SELECT CASE p_kind
    WHEN 'product' THEN '/products/' || p_slug
    WHEN 'category' THEN '/shop/' || p_slug
    WHEN 'blog' THEN '/blog/' || p_slug
    WHEN 'page' THEN CASE WHEN p_slug = 'home' THEN '/' ELSE '/' || p_slug END
    WHEN 'faq' THEN '/faqs/' || p_slug
    WHEN 'team' THEN '/team/' || p_slug
    WHEN 'navigation' THEN '/_content/navigation'
    WHEN 'contact' THEN '/contact'
    WHEN 'solution' THEN '/solutions/' || p_slug
    WHEN 'resource' THEN '/learn/resources/' || p_slug
    WHEN 'video' THEN '/learn/youtube/' || p_slug
    ELSE NULL
  END
$fn$;

CREATE FUNCTION public.phase3_is_safe_public_href(p_value text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog, public
AS $fn$
  SELECT CASE
    WHEN p_value IS NULL THEN false
    WHEN p_value ~* '^https://' THEN public.phase3_is_safe_url(p_value, false)
    WHEN left(p_value, 1) <> '/' OR left(p_value, 2) = '//' OR position(chr(92) in p_value) > 0
      OR p_value ~ '[[:cntrl:][:space:]]' THEN false
    ELSE
      split_part(split_part(p_value, '?', 1), '#', 1) !~ '(^|/)[.][.]?(/|$)'
      AND split_part(split_part(p_value, '?', 1), '#', 1) !~* '^/(api|admin|staff|sign-in|sign-up|account|admin-preview|_content|_next|node_modules|\.git|\.next)(/|$)'
      AND (
        split_part(split_part(p_value, '?', 1), '#', 1) = '/'
        OR split_part(split_part(p_value, '?', 1), '#', 1) ~* '^/(products|shop|solutions|learn|about|contact|blog|faqs|team|help|policies)(/|$)'
        OR split_part(split_part(p_value, '?', 1), '#', 1) ~ '^/[a-z0-9]+(-[a-z0-9]+)*$'
      )
  END
$fn$;

CREATE FUNCTION public.phase3_document_media_ids(p_document jsonb)
RETURNS TABLE(media_id uuid)
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog
AS $fn$
  SELECT DISTINCT (value #>> '{}')::uuid
  FROM jsonb_array_elements(CASE WHEN jsonb_typeof(p_document->'mediaIds') = 'array'
    THEN p_document->'mediaIds' ELSE '[]'::jsonb END) AS media(value)
  UNION
  SELECT DISTINCT (block->>'mediaId')::uuid
  FROM jsonb_array_elements(CASE WHEN jsonb_typeof(p_document->'blocks') = 'array'
    THEN p_document->'blocks' ELSE '[]'::jsonb END) AS blocks(block)
  WHERE block->>'type' = 'image' AND block ? 'mediaId'
$fn$;

CREATE FUNCTION public.phase3_document_uses_media(p_document jsonb, p_media_id uuid)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog
AS $fn$
  SELECT EXISTS (
    SELECT 1 FROM public.phase3_document_media_ids(p_document) ids WHERE ids.media_id = p_media_id
  )
$fn$;

CREATE FUNCTION public.phase3_integer_in_range(p_value jsonb, p_min bigint, p_max bigint)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog
AS $fn$
  SELECT CASE
    WHEN jsonb_typeof(p_value) = 'number' AND p_value::text ~ '^(0|[1-9][0-9]*)$'
      THEN p_value::text::numeric BETWEEN p_min AND p_max
    ELSE false
  END
$fn$;

CREATE FUNCTION public.phase3_jsonb_array_length(p_value jsonb)
RETURNS integer
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog
AS $fn$
  SELECT CASE WHEN jsonb_typeof(p_value) = 'array' THEN jsonb_array_length(p_value) ELSE -1 END
$fn$;

CREATE FUNCTION public.phase3_jsonb_array_elements(p_value jsonb)
RETURNS SETOF jsonb
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog
AS $fn$
  SELECT element FROM jsonb_array_elements(
    CASE WHEN jsonb_typeof(p_value) = 'array' THEN p_value ELSE '[]'::jsonb END
  ) AS values(element)
$fn$;

CREATE FUNCTION public.phase3_jsonb_object_keys(p_value jsonb)
RETURNS SETOF text
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog
AS $fn$
  SELECT key FROM jsonb_object_keys(
    CASE WHEN jsonb_typeof(p_value) = 'object' THEN p_value ELSE '{}'::jsonb END
  ) AS keys(key)
$fn$;

CREATE FUNCTION public.phase3_valid_position(p_value jsonb)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog
AS $fn$
  SELECT public.phase3_integer_in_range(p_value, 0, 1000000)
$fn$;

CREATE FUNCTION public.phase3_validate_document(p_kind text, p_document jsonb)
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
    FOR v_block IN SELECT value FROM public.phase3_jsonb_array_elements(p_document->'blocks') LOOP
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
    FOR v_item IN SELECT value FROM public.phase3_jsonb_array_elements(p_document->'variants') LOOP
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
    FOR v_item IN SELECT value FROM public.phase3_jsonb_array_elements(p_document->'specifications') LOOP
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
    FOR v_item IN SELECT value FROM public.phase3_jsonb_array_elements(p_document->'kitContents') LOOP
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
    FOR v_item IN SELECT value FROM public.phase3_jsonb_array_elements(p_document->'resources') LOOP
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
    FOR v_item IN SELECT value FROM public.phase3_jsonb_array_elements(p_document->'links') LOOP
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
    FOR v_item IN SELECT value FROM public.phase3_jsonb_array_elements(p_document->'links') LOOP
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
      FOR v_item IN SELECT value FROM public.phase3_jsonb_array_elements(p_document->'socialLinks') LOOP
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

CREATE FUNCTION public.phase3_validate_media_refs(p_document jsonb, p_require_public boolean)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $fn$
DECLARE
  v_media_id uuid;
  v_found boolean;
  v_published boolean;
  v_archived boolean;
BEGIN
  FOR v_media_id IN SELECT ids.media_id FROM public.phase3_document_media_ids(p_document) ids LOOP
    SELECT true, m.published, m.archived
      INTO v_found, v_published, v_archived
      FROM public.cms_media m WHERE m.id = v_media_id;
    IF NOT FOUND THEN
      PERFORM public.phase3_fail('media_not_found');
    END IF;
    IF v_archived THEN
      PERFORM public.phase3_fail('media_not_found');
    END IF;
    IF p_require_public AND NOT v_published THEN
      PERFORM public.phase3_fail('invalid_state');
    END IF;
  END LOOP;
END
$fn$;

CREATE FUNCTION public.phase3_block_media_withdrawal()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $fn$
BEGIN
  IF (OLD.published IS TRUE AND NEW.published IS DISTINCT FROM TRUE)
    OR (OLD.archived IS FALSE AND NEW.archived IS DISTINCT FROM FALSE) THEN
    PERFORM pg_advisory_xact_lock(832641);
    IF EXISTS (
      SELECT 1
      FROM public.cms_records r
      JOIN public.cms_revisions rev
        ON rev.record_id = r.id AND rev.id = r.published_revision_id
      WHERE public.phase3_document_uses_media(rev.document, NEW.id)
    ) THEN
      PERFORM public.phase3_fail('invalid_state');
    END IF;
  END IF;
  RETURN NEW;
END
$fn$;
CREATE TRIGGER cms_media_published_reference_guard
  BEFORE UPDATE OF published, archived ON public.cms_media
  FOR EACH ROW EXECUTE FUNCTION public.phase3_block_media_withdrawal();

CREATE FUNCTION public.phase3_validate_category_parent(
  p_record_id uuid,
  p_document jsonb,
  p_require_published boolean
)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $fn$
DECLARE
  v_parent_id uuid;
  v_parent_kind text;
  v_parent_archived timestamptz;
  v_parent_published uuid;
  v_cycle boolean;
BEGIN
  IF jsonb_typeof(p_document->'parentId') IS DISTINCT FROM 'string' THEN
    RETURN;
  END IF;
  v_parent_id := (p_document->>'parentId')::uuid;
  IF p_record_id IS NOT NULL AND v_parent_id = p_record_id THEN
    PERFORM public.phase3_fail('invalid_input');
  END IF;
  SELECT c.kind, c.archived_at, c.published_revision_id
    INTO v_parent_kind, v_parent_archived, v_parent_published
    FROM public.cms_records c WHERE c.id = v_parent_id;
  IF NOT FOUND OR v_parent_kind <> 'category' THEN
    PERFORM public.phase3_fail('not_found');
  END IF;
  IF v_parent_archived IS NOT NULL THEN
    PERFORM public.phase3_fail('invalid_state');
  END IF;
  IF p_require_published AND v_parent_published IS NULL THEN
    PERFORM public.phase3_fail('invalid_state');
  END IF;
  IF p_record_id IS NOT NULL THEN
    WITH RECURSIVE ancestors(id, parent_id, visited) AS (
      SELECT c.id,
        CASE WHEN p_require_published THEN pr.document->>'parentId' ELSE c.draft->>'parentId' END,
        ARRAY[c.id]
      FROM public.cms_records c
      LEFT JOIN public.cms_revisions pr ON pr.record_id = c.id AND pr.id = c.published_revision_id
      WHERE c.id = v_parent_id AND c.kind = 'category'
      UNION ALL
      SELECT c.id,
        CASE WHEN p_require_published THEN pr.document->>'parentId' ELSE c.draft->>'parentId' END,
        a.visited || c.id
      FROM ancestors a
      JOIN public.cms_records c ON c.id = (a.parent_id)::uuid AND c.kind = 'category'
      LEFT JOIN public.cms_revisions pr ON pr.record_id = c.id AND pr.id = c.published_revision_id
      WHERE a.parent_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        AND NOT c.id = ANY(a.visited)
    )
    SELECT EXISTS (SELECT 1 FROM ancestors WHERE id = p_record_id) INTO v_cycle;
    IF v_cycle THEN
      PERFORM public.phase3_fail('invalid_input');
    END IF;
  END IF;
END
$fn$;

CREATE FUNCTION public.phase3_validate_product_references(
  p_kind text,
  p_record_id uuid,
  p_document jsonb,
  p_require_published boolean
)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $fn$
DECLARE
  v_id uuid;
  v_target_kind text;
  v_archived timestamptz;
  v_published uuid;
BEGIN
  IF p_kind = 'product' THEN
    FOR v_id IN
      SELECT (value #>> '{}')::uuid
      FROM public.phase3_jsonb_array_elements(COALESCE(p_document->'categoryIds', '[]'::jsonb)) AS refs(value)
    LOOP
      SELECT c.kind, c.archived_at, c.published_revision_id
        INTO v_target_kind, v_archived, v_published
        FROM public.cms_records c WHERE c.id = v_id;
      IF NOT FOUND OR v_target_kind <> 'category' THEN
        PERFORM public.phase3_fail('not_found');
      END IF;
      IF v_archived IS NOT NULL OR (p_require_published AND v_published IS NULL) THEN
        PERFORM public.phase3_fail('invalid_state');
      END IF;
    END LOOP;
    FOR v_id IN
      SELECT DISTINCT (value->>'productId')::uuid
      FROM public.phase3_jsonb_array_elements(COALESCE(p_document->'kitContents', '[]'::jsonb)) AS refs(value)
      WHERE value ? 'productId'
    LOOP
      IF v_id = p_record_id THEN
        PERFORM public.phase3_fail('invalid_input');
      END IF;
      SELECT c.kind, c.archived_at, c.published_revision_id
        INTO v_target_kind, v_archived, v_published
        FROM public.cms_records c WHERE c.id = v_id;
      IF NOT FOUND OR v_target_kind <> 'product' THEN
        PERFORM public.phase3_fail('not_found');
      END IF;
      IF v_archived IS NOT NULL OR (p_require_published AND v_published IS NULL) THEN
        PERFORM public.phase3_fail('invalid_state');
      END IF;
    END LOOP;
  ELSIF p_kind IN ('resource','video') THEN
    FOR v_id IN
      SELECT (value #>> '{}')::uuid
      FROM public.phase3_jsonb_array_elements(COALESCE(p_document->'productIds', '[]'::jsonb)) AS refs(value)
    LOOP
      SELECT c.kind, c.archived_at, c.published_revision_id
        INTO v_target_kind, v_archived, v_published
        FROM public.cms_records c WHERE c.id = v_id;
      IF NOT FOUND OR v_target_kind <> 'product' THEN
        PERFORM public.phase3_fail('not_found');
      END IF;
      IF v_archived IS NOT NULL OR (p_require_published AND v_published IS NULL) THEN
        PERFORM public.phase3_fail('invalid_state');
      END IF;
    END LOOP;
  END IF;
END
$fn$;

CREATE FUNCTION public.phase3_record_uses_product(p_document jsonb, p_product_id uuid)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog
AS $fn$
  SELECT EXISTS (
    SELECT 1 FROM public.phase3_jsonb_array_elements(CASE WHEN jsonb_typeof(p_document->'productIds') = 'array'
      THEN p_document->'productIds' ELSE '[]'::jsonb END) refs(value)
    WHERE (value #>> '{}') = p_product_id::text
  ) OR EXISTS (
    SELECT 1 FROM public.phase3_jsonb_array_elements(CASE WHEN jsonb_typeof(p_document->'kitContents') = 'array'
      THEN p_document->'kitContents' ELSE '[]'::jsonb END) refs(value)
    WHERE value->>'productId' = p_product_id::text
  )
$fn$;

CREATE FUNCTION public.phase3_category_has_dependents(p_category_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $fn$
  SELECT EXISTS (
    SELECT 1 FROM public.product_categories pc WHERE pc.category_id = p_category_id
  ) OR EXISTS (
    SELECT 1 FROM public.cms_records product
    WHERE product.kind = 'product'
      AND EXISTS (SELECT 1 FROM public.phase3_jsonb_array_elements(COALESCE(product.draft->'categoryIds','[]'::jsonb)) refs(value)
        WHERE value #>> '{}' = p_category_id::text)
  ) OR EXISTS (
    SELECT 1 FROM public.cms_records child
    WHERE child.kind = 'category'
      AND child.draft->>'parentId' = p_category_id::text
  ) OR EXISTS (
    SELECT 1 FROM public.cms_revisions rev
    JOIN public.cms_records child ON child.id = rev.record_id AND child.kind = 'category'
      AND child.published_revision_id = rev.id
    WHERE rev.document->>'parentId' = p_category_id::text
  )
$fn$;

CREATE FUNCTION public.phase3_product_has_dependents(p_product_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $fn$
  SELECT EXISTS (
    SELECT 1 FROM public.cms_records r
    WHERE r.id <> p_product_id AND r.kind IN ('product','resource','video')
      AND public.phase3_record_uses_product(r.draft, p_product_id)
  ) OR EXISTS (
    SELECT 1 FROM public.cms_revisions rev
    JOIN public.cms_records r ON r.id = rev.record_id AND r.published_revision_id = rev.id
    WHERE r.id <> p_product_id AND r.kind IN ('product','resource','video')
      AND public.phase3_record_uses_product(rev.document, p_product_id)
  )
$fn$;

CREATE FUNCTION public.phase3_admin_record_json(p_record_id uuid)
RETURNS jsonb
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $fn$
  SELECT jsonb_build_object(
    'id', r.id,
    'kind', r.kind,
    'title', r.title,
    'slug', r.slug,
    'document', r.draft,
    'version', r.version,
    'publishedRevisionId', r.published_revision_id,
    'archived', r.archived_at IS NOT NULL,
    'updatedAt', r.updated_at,
    'revisions', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', revisions.id,
        'revisionNumber', revisions.revision_number,
        'title', revisions.title,
        'slug', revisions.slug,
        'publishedAt', revisions.published_at,
        'publishedBySubject', revisions.published_by,
        'sourceRevisionId', revisions.source_revision_id
      ) ORDER BY revisions.revision_number DESC)
      FROM (
        SELECT rev.* FROM public.cms_revisions rev
        WHERE rev.record_id = r.id
        ORDER BY rev.revision_number DESC LIMIT 50
      ) revisions
    ), '[]'::jsonb)
  )
  FROM public.cms_records r WHERE r.id = p_record_id
$fn$;

CREATE FUNCTION public.phase3_sync_product_variants(p_record_id uuid, p_document jsonb)
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
  FOR v_item IN SELECT value FROM public.phase3_jsonb_array_elements(p_document->'variants') LOOP
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

CREATE FUNCTION public.phase3_public_variant_json(p_variant jsonb, p_document jsonb)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $fn$
  SELECT jsonb_build_object(
    'id', cv.id,
    'sku', p_variant->>'sku',
    'label', p_variant->>'label',
    'regularPricePaise', cv.regular_paise,
    'effectivePricePaise', CASE
      WHEN cv.sale_paise IS NOT NULL AND now() >= cv.sale_from AND now() < cv.sale_until THEN cv.sale_paise
      ELSE cv.regular_paise END,
    'isOnSale', cv.sale_paise IS NOT NULL AND now() >= cv.sale_from AND now() < cv.sale_until,
    'saleEndsAt', CASE WHEN cv.sale_paise IS NOT NULL AND now() >= cv.sale_from AND now() < cv.sale_until
      THEN cv.sale_until ELSE NULL END,
    'availability', CASE WHEN COALESCE(ib.available_quantity, 0) > 0 THEN 'available' ELSE 'unavailable' END
  )
  FROM public.catalog_variants cv
  LEFT JOIN public.inventory_balances ib ON ib.variant_id = cv.id
  WHERE cv.id = (p_variant->>'id')::uuid
    AND cv.product_id IS NOT NULL AND cv.archived_at IS NULL
$fn$;

CREATE FUNCTION public.phase3_public_document(p_kind text, p_document jsonb)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = pg_catalog, public
AS $fn$
  SELECT CASE WHEN p_kind = 'navigation' THEN
    jsonb_set(
      p_document,
      '{links}',
      COALESCE((
        SELECT jsonb_agg(link ORDER BY (link->>'position')::integer, link->>'label')
        FROM public.phase3_jsonb_array_elements(COALESCE(p_document->'links', '[]'::jsonb)) AS links(link)
        WHERE link->'visible' = 'true'::jsonb
      ), '[]'::jsonb),
      true
    )
  ELSE p_document END
$fn$;

CREATE FUNCTION public.phase3_admin_variant_json(p_variant_id uuid, p_subject text)
RETURNS jsonb
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $fn$
  SELECT jsonb_build_object(
    'id', cv.id,
    'productId', cv.product_id,
    'productTitle', r.title,
    'sku', cv.sku,
    'label', COALESCE(
      (SELECT draft_variant->>'label'
       FROM public.phase3_jsonb_array_elements(COALESCE(r.draft->'variants', '[]'::jsonb)) AS v(draft_variant)
       WHERE draft_variant->>'id' = cv.id::text LIMIT 1),
      (SELECT published_variant->>'label'
       FROM public.cms_revisions rev
       CROSS JOIN LATERAL public.phase3_jsonb_array_elements(COALESCE(rev.document->'variants', '[]'::jsonb)) AS v(published_variant)
       WHERE rev.record_id = r.id AND rev.id = r.published_revision_id
         AND published_variant->>'id' = cv.id::text LIMIT 1),
      cv.sku
    ),
    'regularPaise', CASE WHEN EXISTS (
      SELECT 1 FROM public.staff_capabilities sc
      WHERE sc.user_id = p_subject AND sc.capability = 'catalog.edit'
    ) THEN cv.regular_paise ELSE NULL END,
    'salePaise', CASE WHEN EXISTS (
      SELECT 1 FROM public.staff_capabilities sc
      WHERE sc.user_id = p_subject AND sc.capability = 'catalog.edit'
    ) THEN cv.sale_paise ELSE NULL END,
    'saleFrom', CASE WHEN EXISTS (
      SELECT 1 FROM public.staff_capabilities sc
      WHERE sc.user_id = p_subject AND sc.capability = 'catalog.edit'
    ) THEN cv.sale_from ELSE NULL END,
    'saleUntil', CASE WHEN EXISTS (
      SELECT 1 FROM public.staff_capabilities sc
      WHERE sc.user_id = p_subject AND sc.capability = 'catalog.edit'
    ) THEN cv.sale_until ELSE NULL END,
    'priceVersion', CASE WHEN EXISTS (
      SELECT 1 FROM public.staff_capabilities sc
      WHERE sc.user_id = p_subject AND sc.capability = 'catalog.edit'
    ) THEN cv.price_version ELSE 0 END,
    'stock', CASE WHEN EXISTS (
      SELECT 1 FROM public.staff_capabilities sc
      WHERE sc.user_id = p_subject AND sc.capability = 'orders.manage'
    ) THEN ib.available_quantity ELSE NULL END,
    'stockVersion', CASE WHEN EXISTS (
      SELECT 1 FROM public.staff_capabilities sc
      WHERE sc.user_id = p_subject AND sc.capability = 'orders.manage'
    ) THEN ib.version ELSE NULL END
  )
  FROM public.catalog_variants cv
  JOIN public.cms_records r ON r.id = cv.product_id AND r.kind = 'product'
  LEFT JOIN public.inventory_balances ib ON ib.variant_id = cv.id
  WHERE cv.id = p_variant_id
$fn$;

CREATE FUNCTION public.admin_list_records(
  p_kind text,
  p_query text,
  p_limit integer,
  p_offset integer
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $fn$
DECLARE
  v_subject text;
  v_query text := btrim(COALESCE(p_query, ''));
  v_total bigint;
  v_items jsonb;
  v_capability text;
BEGIN
  IF p_kind IS NULL OR p_kind NOT IN (
    'product', 'category', 'blog', 'page', 'faq', 'team',
    'navigation', 'contact', 'solution', 'resource', 'video'
  ) OR p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 100
    OR p_offset IS NULL OR p_offset NOT BETWEEN 0 AND 10000
    OR char_length(v_query) > 120 OR v_query ~ '[[:cntrl:]]' THEN
    PERFORM public.phase3_fail('invalid_input');
  END IF;
  v_capability := CASE WHEN p_kind IN ('product','category') THEN 'catalog.edit' ELSE 'content.edit' END;
  v_subject := public.admin_assert_capability(v_capability);
  WITH matching AS (
    SELECT r.id, r.kind, r.title, r.slug, r.version, r.published_revision_id,
      r.archived_at, r.updated_at
    FROM public.cms_records r
    WHERE r.kind = p_kind
      AND (v_query = ''
        OR position(lower(v_query) in lower(r.title || ' ' || r.slug)) > 0
        OR (p_kind = 'product' AND EXISTS (
          SELECT 1 FROM public.phase3_jsonb_array_elements(COALESCE(r.draft->'variants', '[]'::jsonb)) AS variants(value)
          WHERE lower(value->>'sku') = lower(v_query)
        )))
  ), page_rows AS (
    SELECT * FROM matching ORDER BY updated_at DESC, id DESC LIMIT p_limit OFFSET p_offset
  )
  SELECT (SELECT count(*) FROM matching),
    COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'id', page_rows.id,
      'kind', page_rows.kind,
      'title', page_rows.title,
      'slug', page_rows.slug,
      'version', page_rows.version,
      'publishedRevisionId', page_rows.published_revision_id,
      'archived', page_rows.archived_at IS NOT NULL,
      'updatedAt', page_rows.updated_at
    ) ORDER BY page_rows.updated_at DESC, page_rows.id DESC) FROM page_rows), '[]'::jsonb)
  INTO v_total, v_items;
  RETURN jsonb_build_object('items', v_items, 'total', v_total);
END
$fn$;

CREATE FUNCTION public.admin_get_record(p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $fn$
DECLARE
  v_subject text;
  v_kind text;
  v_capability text;
  v_record jsonb;
BEGIN
  IF p_id IS NULL THEN PERFORM public.phase3_fail('invalid_input'); END IF;
  v_subject := public.requesting_user_id();
  IF v_subject IS NULL OR char_length(v_subject) NOT BETWEEN 1 AND 256 THEN
    PERFORM public.phase3_fail('unauthenticated');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.staff_capabilities sc
      WHERE sc.user_id = v_subject AND sc.capability IN ('catalog.edit','content.edit')) THEN
    PERFORM public.phase3_fail('forbidden');
  END IF;
  SELECT r.kind INTO v_kind FROM public.cms_records r WHERE r.id = p_id;
  IF NOT FOUND THEN PERFORM public.phase3_fail('not_found'); END IF;
  v_capability := CASE WHEN v_kind IN ('product','category') THEN 'catalog.edit' ELSE 'content.edit' END;
  PERFORM public.admin_assert_capability(v_capability);
  v_record := public.phase3_admin_record_json(p_id);
  RETURN jsonb_build_object('record', v_record);
END
$fn$;

CREATE FUNCTION public.admin_list_variants(
  p_query text,
  p_limit integer,
  p_offset integer
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $fn$
DECLARE
  v_subject text;
  v_query text := btrim(COALESCE(p_query, ''));
  v_total bigint;
  v_items jsonb;
BEGIN
  IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 100
    OR p_offset IS NULL OR p_offset NOT BETWEEN 0 AND 10000
    OR char_length(v_query) > 120 OR v_query ~ '[[:cntrl:]]' THEN
    PERFORM public.phase3_fail('invalid_input');
  END IF;
  v_subject := public.requesting_user_id();
  IF v_subject IS NULL OR char_length(v_subject) NOT BETWEEN 1 AND 256 THEN
    PERFORM public.phase3_fail('unauthenticated');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.staff_capabilities sc
      WHERE sc.user_id = v_subject AND sc.capability IN ('catalog.edit','orders.manage')) THEN
    PERFORM public.phase3_fail('forbidden');
  END IF;
  WITH matching AS (
    SELECT cv.id, cv.sku, r.title, cv.updated_at
    FROM public.catalog_variants cv
    JOIN public.cms_records r ON r.id = cv.product_id AND r.kind = 'product'
    WHERE r.archived_at IS NULL AND cv.archived_at IS NULL
      AND (v_query = '' OR position(lower(v_query) in lower(r.title)) > 0 OR lower(cv.sku) = lower(v_query))
  ), page_rows AS (
    SELECT id, updated_at FROM matching ORDER BY updated_at DESC, id DESC LIMIT p_limit OFFSET p_offset
  )
  SELECT (SELECT count(*) FROM matching),
    COALESCE((SELECT jsonb_agg(public.phase3_admin_variant_json(page_rows.id, v_subject)
      ORDER BY page_rows.updated_at DESC, page_rows.id DESC) FROM page_rows), '[]'::jsonb)
  INTO v_total, v_items;
  RETURN jsonb_build_object('items', v_items, 'total', v_total);
END
$fn$;

CREATE FUNCTION public.published_list_records(
  p_kind text,
  p_query text,
  p_limit integer,
  p_offset integer
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $fn$
DECLARE
  v_query text := btrim(COALESCE(p_query, ''));
  v_total bigint;
  v_items jsonb;
  v_doc jsonb;
BEGIN
  IF p_kind IS NULL OR p_kind NOT IN (
    'product', 'category', 'blog', 'page', 'faq', 'team',
    'navigation', 'contact', 'solution', 'resource', 'video'
  ) OR p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 100
    OR p_offset IS NULL OR p_offset NOT BETWEEN 0 AND 10000
    OR char_length(v_query) > 120 OR v_query ~ '[[:cntrl:]]' THEN
    PERFORM public.phase3_fail('invalid_input');
  END IF;
  WITH matching AS (
    SELECT r.id, r.kind, rev.title, rev.slug, rev.document, rev.id AS revision_id, rev.published_at
    FROM public.cms_live_routes route
    JOIN public.cms_records r ON r.id = route.record_id
      AND r.kind = route.kind AND r.published_revision_id = route.revision_id
    JOIN public.cms_revisions rev ON rev.record_id = r.id AND rev.id = r.published_revision_id
    WHERE route.kind = p_kind AND r.archived_at IS NULL
      AND (v_query = '' OR position(lower(v_query) in lower(
        rev.title || ' ' || rev.slug || ' ' || COALESCE(rev.document->>'summary','')
      )) > 0 OR (p_kind = 'product' AND EXISTS (
        SELECT 1 FROM public.phase3_jsonb_array_elements(COALESCE(rev.document->'variants','[]'::jsonb)) AS variants(value)
        WHERE lower(value->>'sku') = lower(v_query)
      )))
  ), page_rows AS (
    SELECT * FROM matching ORDER BY published_at DESC, id DESC LIMIT p_limit OFFSET p_offset
  )
  SELECT (SELECT count(*) FROM matching),
    COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', page_rows.id,
          'kind', page_rows.kind,
          'title', page_rows.title,
          'slug', page_rows.slug,
          'summary', page_rows.document->>'summary',
          'document', public.phase3_public_document(page_rows.kind, page_rows.document) - 'blocks',
          'revisionId', page_rows.revision_id,
          'publishedAt', page_rows.published_at
        ) || CASE WHEN page_rows.kind = 'product' THEN jsonb_build_object('variants', (
          SELECT COALESCE(jsonb_agg(public.phase3_public_variant_json(v.variant, page_rows.document)
            ORDER BY v.ordinality), '[]'::jsonb)
          FROM public.phase3_jsonb_array_elements(page_rows.document->'variants') WITH ORDINALITY AS v(variant, ordinality)
        )) ELSE '{}'::jsonb END
        ORDER BY page_rows.published_at DESC, page_rows.id DESC
      ) FROM page_rows
    ), '[]'::jsonb)
  INTO v_total, v_items;

  FOR v_doc IN
    SELECT item->'document' FROM public.phase3_jsonb_array_elements(v_items) AS items(item)
  LOOP
    PERFORM public.phase3_validate_media_refs(v_doc, true);
  END LOOP;
  RETURN jsonb_build_object('items', v_items, 'total', v_total);
END
$fn$;

CREATE FUNCTION public.published_get_record(p_kind text, p_slug text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $fn$
DECLARE
  v_route public.cms_live_routes%ROWTYPE;
  v_redirect public.cms_slug_redirects%ROWTYPE;
  v_revision public.cms_revisions%ROWTYPE;
  v_document jsonb;
  v_variants jsonb;
BEGIN
  IF p_kind IS NULL OR p_kind NOT IN (
    'product', 'category', 'blog', 'page', 'faq', 'team',
    'navigation', 'contact', 'solution', 'resource', 'video'
  ) OR p_slug IS NULL OR char_length(p_slug) NOT BETWEEN 1 AND 160 THEN
    PERFORM public.phase3_fail('invalid_input');
  END IF;
  SELECT route.* INTO v_route FROM public.cms_live_routes route
  JOIN public.cms_records r ON r.id = route.record_id AND r.kind = route.kind
    AND r.published_revision_id = route.revision_id AND r.archived_at IS NULL
  WHERE route.kind = p_kind AND route.slug = p_slug;
  IF NOT FOUND THEN
    SELECT redirect.* INTO v_redirect FROM public.cms_slug_redirects redirect
    JOIN public.cms_live_routes target ON target.record_id = redirect.record_id
      AND target.path = redirect.target_path AND target.slug = redirect.target_slug
      AND target.kind = redirect.kind
    JOIN public.cms_records r ON r.id = target.record_id AND r.published_revision_id = target.revision_id
      AND r.archived_at IS NULL
    WHERE redirect.kind = p_kind AND redirect.from_slug = p_slug;
    IF FOUND THEN
      RETURN jsonb_build_object('redirectTo', v_redirect.target_slug);
    END IF;
    PERFORM public.phase3_fail('not_found');
  END IF;
  SELECT rev.* INTO v_revision FROM public.cms_revisions rev
  WHERE rev.record_id = v_route.record_id AND rev.id = v_route.revision_id;
  IF NOT FOUND THEN PERFORM public.phase3_fail('not_found'); END IF;
  v_document := public.phase3_public_document(v_route.kind, v_revision.document);
  PERFORM public.phase3_validate_media_refs(v_document, true);
  IF v_route.kind = 'product' THEN
    SELECT COALESCE(jsonb_agg(public.phase3_public_variant_json(v.variant, v_revision.document)
      ORDER BY v.ordinality), '[]'::jsonb)
      INTO v_variants
      FROM public.phase3_jsonb_array_elements(v_revision.document->'variants') WITH ORDINALITY AS v(variant, ordinality);
  END IF;
  RETURN jsonb_build_object('record',
    jsonb_build_object(
      'id', v_route.record_id,
      'kind', v_route.kind,
      'title', v_revision.title,
      'slug', v_revision.slug,
      'summary', v_document->>'summary',
      'document', v_document,
      'revisionId', v_revision.id,
      'publishedAt', v_revision.published_at
    ) || CASE WHEN v_route.kind = 'product' THEN jsonb_build_object('variants', v_variants) ELSE '{}'::jsonb END
  );
END
$fn$;

CREATE FUNCTION public.admin_write_audit(
  p_actor text,
  p_action text,
  p_entity_type text,
  p_entity_id uuid,
  p_details jsonb DEFAULT '{}'::jsonb,
  p_reason text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $fn$
BEGIN
  IF p_actor IS NULL OR char_length(p_actor) NOT BETWEEN 1 AND 256
    OR p_action IS NULL OR char_length(p_action) NOT BETWEEN 1 AND 80
    OR p_entity_type IS NULL OR char_length(p_entity_type) NOT BETWEEN 1 AND 40
    OR p_details IS NULL OR jsonb_typeof(p_details) IS DISTINCT FROM 'object'
    OR octet_length(p_details::text) > 8192
    OR (p_reason IS NOT NULL AND char_length(btrim(p_reason)) NOT BETWEEN 1 AND 500) THEN
    PERFORM public.phase3_fail('invalid_input');
  END IF;
  INSERT INTO public.cms_audit_events (actor, action, entity_type, entity_id, details, reason)
  VALUES (p_actor, p_action, p_entity_type, p_entity_id, p_details,
    CASE WHEN p_reason IS NULL THEN NULL ELSE btrim(p_reason) END);
END
$fn$;

CREATE FUNCTION public.admin_save_record(
  p_id uuid,
  p_kind text,
  p_expected_version bigint,
  p_document jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $fn$
DECLARE
  v_subject text;
  v_required_capability text;
  v_record public.cms_records%ROWTYPE;
  v_document jsonb := p_document;
  v_new_version bigint;
BEGIN
  IF p_kind IS NULL OR p_kind NOT IN (
    'product','category','blog','page','faq','team','navigation','contact','solution','resource','video'
  ) OR (p_id IS NULL AND p_expected_version IS NOT NULL)
    OR (p_id IS NOT NULL AND (p_expected_version IS NULL OR p_expected_version < 1)) THEN
    PERFORM public.phase3_fail('invalid_input');
  END IF;
  PERFORM public.phase3_validate_document(p_kind, p_document);
  v_required_capability := CASE WHEN p_kind IN ('product','category') THEN 'catalog.edit' ELSE 'content.edit' END;
  v_subject := public.admin_assert_capability(v_required_capability);
  PERFORM pg_advisory_xact_lock(832641);

  IF p_id IS NULL THEN
    PERFORM public.phase3_validate_media_refs(v_document, false);
    IF p_kind = 'category' THEN
      PERFORM public.phase3_validate_category_parent(NULL, v_document, false);
    ELSIF p_kind IN ('product','resource','video') THEN
      PERFORM public.phase3_validate_product_references(p_kind, NULL, v_document, false);
    END IF;
    BEGIN
      INSERT INTO public.cms_records (kind, title, slug, draft, created_by, updated_by)
      VALUES (p_kind, v_document->>'title', v_document->>'slug', v_document, v_subject, v_subject)
      RETURNING * INTO v_record;
    EXCEPTION WHEN unique_violation THEN
      PERFORM public.phase3_fail('duplicate_route');
    END;
    IF p_kind = 'product' THEN
      v_document := public.phase3_sync_product_variants(v_record.id, v_document);
      UPDATE public.cms_records SET draft = v_document WHERE id = v_record.id;
    END IF;
    PERFORM public.admin_write_audit(v_subject, 'record.create', p_kind, v_record.id,
      jsonb_build_object('version', 1, 'slug', v_document->>'slug'));
  ELSE
    SELECT r.* INTO v_record FROM public.cms_records r WHERE r.id = p_id FOR UPDATE;
    IF NOT FOUND THEN PERFORM public.phase3_fail('not_found'); END IF;
    IF v_record.kind <> p_kind THEN PERFORM public.phase3_fail('invalid_input'); END IF;
    IF v_record.version <> p_expected_version THEN PERFORM public.phase3_fail('version_conflict'); END IF;
    IF v_record.archived_at IS NOT NULL THEN PERFORM public.phase3_fail('invalid_state'); END IF;
    PERFORM public.phase3_validate_media_refs(v_document, false);
    IF p_kind = 'category' THEN
      PERFORM public.phase3_validate_category_parent(p_id, v_document, false);
    ELSIF p_kind IN ('product','resource','video') THEN
      PERFORM public.phase3_validate_product_references(p_kind, p_id, v_document, false);
    END IF;
    IF p_kind = 'product' THEN
      v_document := public.phase3_sync_product_variants(p_id, v_document);
    END IF;
    v_new_version := v_record.version + 1;
    UPDATE public.cms_records
      SET title = v_document->>'title', slug = v_document->>'slug', draft = v_document,
          version = v_new_version, updated_by = v_subject, updated_at = now()
      WHERE id = p_id;
    PERFORM public.admin_write_audit(v_subject, 'record.save', p_kind, p_id,
      jsonb_build_object('version', v_new_version, 'slug', v_document->>'slug'));
  END IF;
  RETURN jsonb_build_object('record', public.phase3_admin_record_json(COALESCE(p_id, v_record.id)));
END
$fn$;

CREATE FUNCTION public.admin_transition_record(
  p_id uuid,
  p_expected_version bigint,
  p_action text,
  p_revision_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $fn$
DECLARE
  v_subject text;
  v_required_capability text;
  v_record public.cms_records%ROWTYPE;
  v_revision public.cms_revisions%ROWTYPE;
  v_old_route public.cms_live_routes%ROWTYPE;
  v_document jsonb;
  v_revision_id uuid;
  v_revision_number bigint;
  v_path text;
  v_previous_slug text;
  v_previous_path text;
  v_new_version bigint;
  v_has_old_route boolean := false;
BEGIN
  IF p_id IS NULL OR p_expected_version IS NULL OR p_expected_version < 1
    OR p_action IS NULL OR p_action NOT IN ('publish','unpublish','archive','restore')
    OR (p_action = 'restore' AND p_revision_id IS NULL)
    OR (p_action <> 'restore' AND p_revision_id IS NOT NULL) THEN
    PERFORM public.phase3_fail('invalid_input');
  END IF;
  v_subject := public.requesting_user_id();
  IF v_subject IS NULL OR char_length(v_subject) NOT BETWEEN 1 AND 256 THEN
    PERFORM public.phase3_fail('unauthenticated');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.staff_capabilities sc
      WHERE sc.user_id = v_subject AND sc.capability IN ('catalog.edit','content.edit')) THEN
    PERFORM public.phase3_fail('forbidden');
  END IF;
  PERFORM pg_advisory_xact_lock(832641);
  SELECT r.* INTO v_record FROM public.cms_records r WHERE r.id = p_id FOR UPDATE;
  IF NOT FOUND THEN PERFORM public.phase3_fail('not_found'); END IF;
  v_required_capability := CASE WHEN v_record.kind IN ('product','category') THEN 'catalog.edit' ELSE 'content.edit' END;
  v_subject := public.admin_assert_capability(v_required_capability);
  IF p_action <> 'restore' THEN
    PERFORM public.admin_assert_capability('content.publish');
  END IF;
  IF v_record.version <> p_expected_version THEN PERFORM public.phase3_fail('version_conflict'); END IF;
  v_new_version := v_record.version + 1;

  IF p_action = 'restore' THEN
    SELECT rev.* INTO v_revision FROM public.cms_revisions rev
      WHERE rev.record_id = p_id AND rev.id = p_revision_id;
    IF NOT FOUND THEN PERFORM public.phase3_fail('not_found'); END IF;
    v_document := v_revision.document;
    PERFORM public.phase3_validate_document(v_record.kind, v_document);
    PERFORM public.phase3_validate_media_refs(v_document, false);
    IF v_record.kind = 'category' THEN
      PERFORM public.phase3_validate_category_parent(p_id, v_document, false);
    ELSIF v_record.kind IN ('product','resource','video') THEN
      PERFORM public.phase3_validate_product_references(v_record.kind, p_id, v_document, false);
    END IF;
    IF v_record.kind = 'product' THEN
      v_document := public.phase3_sync_product_variants(p_id, v_document);
    END IF;
    UPDATE public.cms_records
      SET title = v_document->>'title', slug = v_document->>'slug', draft = v_document,
          draft_source_revision_id = p_revision_id, archived_at = NULL, archived_by = NULL,
          version = v_new_version, updated_by = v_subject, updated_at = now()
      WHERE id = p_id;
    PERFORM public.admin_write_audit(v_subject, 'record.restore', v_record.kind, p_id,
      jsonb_build_object('version', v_new_version, 'sourceRevisionId', p_revision_id));
  ELSIF p_action = 'publish' THEN
    IF v_record.archived_at IS NOT NULL THEN PERFORM public.phase3_fail('invalid_state'); END IF;
    v_document := v_record.draft;
    PERFORM public.phase3_validate_document(v_record.kind, v_document);
    PERFORM public.phase3_validate_media_refs(v_document, true);
    IF v_record.kind = 'category' THEN
      PERFORM public.phase3_validate_category_parent(p_id, v_document, true);
    ELSIF v_record.kind IN ('product','resource','video') THEN
      PERFORM public.phase3_validate_product_references(v_record.kind, p_id, v_document, true);
    END IF;
    IF v_record.kind = 'product' THEN
      v_document := public.phase3_sync_product_variants(p_id, v_document);
      IF EXISTS (
        SELECT 1 FROM public.phase3_jsonb_array_elements(v_document->'variants') AS desired(item)
        JOIN public.catalog_variants cv ON cv.id = (desired.item->>'id')::uuid
        WHERE cv.regular_paise IS NULL
      ) THEN
        PERFORM public.phase3_fail('invalid_state');
      END IF;
      PERFORM cv.id FROM public.catalog_variants cv
        WHERE cv.product_id = p_id AND cv.archived_at IS NULL
          AND NOT EXISTS (SELECT 1 FROM public.phase3_jsonb_array_elements(v_document->'variants') AS desired(item)
            WHERE item->>'id' = cv.id::text)
        ORDER BY cv.id FOR UPDATE;
      IF EXISTS (
        SELECT 1 FROM public.catalog_variants cv
        JOIN public.inventory_balances ib ON ib.variant_id = cv.id
        WHERE cv.product_id = p_id AND cv.archived_at IS NULL
          AND NOT EXISTS (SELECT 1 FROM public.phase3_jsonb_array_elements(v_document->'variants') AS desired(item)
            WHERE item->>'id' = cv.id::text)
          AND ib.available_quantity > 0
      ) THEN
        PERFORM public.phase3_fail('invalid_state');
      END IF;
      UPDATE public.catalog_variants cv
        SET archived_at = now(), updated_at = now()
        WHERE cv.product_id = p_id AND cv.archived_at IS NULL
          AND NOT EXISTS (SELECT 1 FROM public.phase3_jsonb_array_elements(v_document->'variants') AS desired(item)
            WHERE item->>'id' = cv.id::text);
      DELETE FROM public.product_categories WHERE product_id = p_id;
      INSERT INTO public.product_categories (product_id, category_id)
        SELECT p_id, (value #>> '{}')::uuid
        FROM public.phase3_jsonb_array_elements(COALESCE(v_document->'categoryIds','[]'::jsonb)) AS categories(value);
    END IF;
    SELECT route.* INTO v_old_route FROM public.cms_live_routes route WHERE route.record_id = p_id FOR UPDATE;
    v_has_old_route := FOUND;
    v_path := public.phase3_route_path(v_record.kind, v_document->>'slug');
    IF v_path IS NULL THEN PERFORM public.phase3_fail('invalid_input'); END IF;
    SELECT COALESCE(max(revision_number), 0) + 1 INTO v_revision_number
      FROM public.cms_revisions WHERE record_id = p_id;
    INSERT INTO public.cms_revisions (
      record_id, revision_number, source_version, source_revision_id,
      title, slug, document, published_by
    ) VALUES (
      p_id, v_revision_number, v_record.version, v_record.draft_source_revision_id,
      v_document->>'title', v_document->>'slug', v_document, v_subject
    ) RETURNING id INTO v_revision_id;
    IF EXISTS (SELECT 1 FROM public.cms_slug_redirects redir
        WHERE redir.from_path = v_path AND redir.record_id <> p_id) THEN
      PERFORM public.phase3_fail('duplicate_route');
    END IF;
    DELETE FROM public.cms_slug_redirects WHERE from_path = v_path AND record_id = p_id;
    BEGIN
      INSERT INTO public.cms_live_routes (record_id, kind, slug, path, revision_id, published_at)
      VALUES (p_id, v_record.kind, v_document->>'slug', v_path, v_revision_id, now())
      ON CONFLICT (record_id) DO UPDATE SET
        kind = EXCLUDED.kind, slug = EXCLUDED.slug, path = EXCLUDED.path,
        revision_id = EXCLUDED.revision_id, published_at = EXCLUDED.published_at;
    EXCEPTION WHEN unique_violation THEN
      PERFORM public.phase3_fail('duplicate_route');
    END;
    IF v_has_old_route AND v_old_route.path <> v_path THEN
      IF EXISTS (SELECT 1 FROM public.cms_slug_redirects redir
          WHERE redir.from_path = v_old_route.path AND redir.record_id <> p_id) THEN
        PERFORM public.phase3_fail('duplicate_route');
      END IF;
      DELETE FROM public.cms_slug_redirects WHERE from_path = v_old_route.path AND record_id = p_id;
      INSERT INTO public.cms_slug_redirects (from_path, kind, from_slug, record_id, target_path, target_slug)
      VALUES (v_old_route.path, v_old_route.kind, v_old_route.slug, p_id, v_path, v_document->>'slug');
    ELSIF NOT v_has_old_route THEN
      SELECT rev.slug INTO v_previous_slug FROM public.cms_revisions rev
        WHERE rev.record_id = p_id ORDER BY rev.revision_number DESC LIMIT 1;
      IF FOUND THEN
        v_previous_path := public.phase3_route_path(v_record.kind, v_previous_slug);
        IF v_previous_path IS NOT NULL AND v_previous_path <> v_path THEN
          IF EXISTS (SELECT 1 FROM public.cms_slug_redirects redir
              WHERE redir.from_path = v_previous_path AND redir.record_id <> p_id) THEN
            PERFORM public.phase3_fail('duplicate_route');
          END IF;
          DELETE FROM public.cms_slug_redirects WHERE from_path = v_previous_path AND record_id = p_id;
          INSERT INTO public.cms_slug_redirects (from_path, kind, from_slug, record_id, target_path, target_slug)
          VALUES (v_previous_path, v_record.kind, v_previous_slug, p_id, v_path, v_document->>'slug');
        END IF;
      END IF;
    END IF;
    UPDATE public.cms_slug_redirects
      SET target_path = v_path, target_slug = v_document->>'slug', updated_at = now()
      WHERE record_id = p_id AND from_path <> v_path;
    UPDATE public.cms_records
      SET title = v_document->>'title', slug = v_document->>'slug', draft = v_document,
          published_revision_id = v_revision_id, draft_source_revision_id = NULL,
          version = v_new_version, updated_by = v_subject, updated_at = now()
      WHERE id = p_id;
    PERFORM public.admin_write_audit(v_subject, 'record.publish', v_record.kind, p_id,
      jsonb_build_object('version', v_new_version, 'revisionId', v_revision_id,
        'revisionNumber', v_revision_number, 'slug', v_document->>'slug'));
  ELSE
    IF v_record.archived_at IS NOT NULL THEN PERFORM public.phase3_fail('invalid_state'); END IF;
    IF p_action = 'unpublish' AND v_record.published_revision_id IS NULL THEN
      PERFORM public.phase3_fail('invalid_state');
    END IF;
    IF v_record.kind = 'category' AND public.phase3_category_has_dependents(p_id) THEN
      PERFORM public.phase3_fail('invalid_state');
    ELSIF v_record.kind = 'product' AND public.phase3_product_has_dependents(p_id) THEN
      PERFORM public.phase3_fail('invalid_state');
    END IF;
    IF p_action = 'archive' AND v_record.kind = 'product' THEN
      PERFORM cv.id FROM public.catalog_variants cv
        WHERE cv.product_id = p_id AND cv.archived_at IS NULL
        ORDER BY cv.id FOR UPDATE;
      IF EXISTS (
        SELECT 1 FROM public.catalog_variants cv
        JOIN public.inventory_balances ib ON ib.variant_id = cv.id
        WHERE cv.product_id = p_id AND ib.available_quantity > 0
      ) THEN
        PERFORM public.phase3_fail('invalid_state');
      END IF;
    END IF;
    DELETE FROM public.cms_live_routes WHERE record_id = p_id;
    IF v_record.kind = 'product' THEN
      DELETE FROM public.product_categories WHERE product_id = p_id;
      IF p_action = 'archive' THEN
        UPDATE public.catalog_variants SET archived_at = now(), updated_at = now()
          WHERE product_id = p_id AND archived_at IS NULL;
      END IF;
    END IF;
    UPDATE public.cms_records
      SET published_revision_id = NULL,
          archived_at = CASE WHEN p_action = 'archive' THEN now() ELSE archived_at END,
          archived_by = CASE WHEN p_action = 'archive' THEN v_subject ELSE archived_by END,
          version = v_new_version, updated_by = v_subject, updated_at = now()
      WHERE id = p_id;
    PERFORM public.admin_write_audit(v_subject, 'record.' || p_action, v_record.kind, p_id,
      jsonb_build_object('version', v_new_version, 'previousRevisionId', v_record.published_revision_id));
  END IF;
  RETURN jsonb_build_object('record', public.phase3_admin_record_json(p_id));
END
$fn$;

CREATE FUNCTION public.admin_set_variant_price(
  p_variant_id uuid,
  p_expected_version bigint,
  p_regular_paise bigint,
  p_sale_paise bigint,
  p_sale_from timestamptz,
  p_sale_until timestamptz,
  p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $fn$
DECLARE
  v_subject text;
  v_variant public.catalog_variants%ROWTYPE;
  v_new_version bigint;
BEGIN
  v_subject := public.admin_assert_capability('catalog.edit');
  IF p_variant_id IS NULL OR p_expected_version IS NULL OR p_expected_version < 0
    OR p_regular_paise IS NULL OR p_regular_paise NOT BETWEEN 0 AND 10000000000
    OR (p_sale_paise IS NOT NULL AND p_sale_paise NOT BETWEEN 0 AND 10000000000)
    OR p_reason IS NULL OR char_length(btrim(p_reason)) NOT BETWEEN 1 AND 500
    OR (p_sale_paise IS NULL AND (p_sale_from IS NOT NULL OR p_sale_until IS NOT NULL))
    OR (p_sale_paise IS NOT NULL AND (p_regular_paise IS NULL OR p_sale_from IS NULL
      OR p_sale_until IS NULL OR p_sale_from >= p_sale_until OR p_sale_paise > p_regular_paise)) THEN
    PERFORM public.phase3_fail('invalid_input');
  END IF;
  SELECT cv.* INTO v_variant FROM public.catalog_variants cv
    WHERE cv.id = p_variant_id FOR UPDATE;
  IF NOT FOUND THEN PERFORM public.phase3_fail('not_found'); END IF;
  IF v_variant.archived_at IS NOT NULL OR EXISTS (
    SELECT 1 FROM public.cms_records r WHERE r.id = v_variant.product_id AND r.archived_at IS NOT NULL
  ) THEN PERFORM public.phase3_fail('invalid_state'); END IF;
  IF v_variant.price_version <> p_expected_version THEN PERFORM public.phase3_fail('version_conflict'); END IF;
  v_new_version := v_variant.price_version + 1;
  UPDATE public.catalog_variants
    SET regular_paise = p_regular_paise, sale_paise = p_sale_paise,
        sale_from = p_sale_from, sale_until = p_sale_until,
        price_version = v_new_version, updated_at = now()
    WHERE id = p_variant_id;
  INSERT INTO public.variant_price_events (
    variant_id, version, regular_paise, sale_paise, sale_from, sale_until, actor, reason
  ) VALUES (
    p_variant_id, v_new_version, p_regular_paise, p_sale_paise,
    p_sale_from, p_sale_until, v_subject, btrim(p_reason)
  );
  PERFORM public.admin_write_audit(v_subject, 'variant.price.set', 'variant', p_variant_id,
    jsonb_build_object('version', v_new_version, 'regularPaise', p_regular_paise,
      'salePaise', p_sale_paise, 'saleFrom', p_sale_from, 'saleUntil', p_sale_until), p_reason);
  RETURN jsonb_build_object('variant', public.phase3_admin_variant_json(p_variant_id, v_subject));
END
$fn$;

CREATE FUNCTION public.admin_adjust_inventory(
  p_variant_id uuid,
  p_expected_version bigint,
  p_delta integer,
  p_reason text,
  p_request_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $fn$
DECLARE
  v_subject text;
  v_variant public.catalog_variants%ROWTYPE;
  v_balance public.inventory_balances%ROWTYPE;
  v_existing public.inventory_movements%ROWTYPE;
  v_quantity bigint;
  v_new_version bigint;
BEGIN
  v_subject := public.admin_assert_capability('orders.manage');
  IF p_variant_id IS NULL OR p_expected_version IS NULL OR p_expected_version < 0
    OR p_delta IS NULL OR p_delta NOT BETWEEN -1000000 AND 1000000 OR p_delta = 0 OR p_reason IS NULL
    OR char_length(btrim(p_reason)) NOT BETWEEN 1 AND 500 OR p_request_id IS NULL THEN
    PERFORM public.phase3_fail('invalid_input');
  END IF;
  PERFORM pg_advisory_xact_lock(832642, hashtext(p_request_id::text));
  SELECT movement.* INTO v_existing FROM public.inventory_movements movement
    WHERE movement.request_id = p_request_id;
  IF FOUND THEN
    IF v_existing.actor <> v_subject OR v_existing.variant_id <> p_variant_id OR v_existing.delta <> p_delta
      OR v_existing.reason <> btrim(p_reason) THEN
      PERFORM public.phase3_fail('request_conflict');
    END IF;
    RETURN jsonb_build_object('variant', public.phase3_admin_variant_json(p_variant_id, v_subject));
  END IF;
  SELECT cv.* INTO v_variant FROM public.catalog_variants cv
    WHERE cv.id = p_variant_id FOR UPDATE;
  IF NOT FOUND THEN PERFORM public.phase3_fail('not_found'); END IF;
  IF v_variant.archived_at IS NOT NULL OR EXISTS (
    SELECT 1 FROM public.cms_records r WHERE r.id = v_variant.product_id AND r.archived_at IS NOT NULL
  ) THEN PERFORM public.phase3_fail('invalid_state'); END IF;
  SELECT ib.* INTO v_balance FROM public.inventory_balances ib
    WHERE ib.variant_id = p_variant_id FOR UPDATE;
  IF NOT FOUND THEN
    INSERT INTO public.inventory_balances (variant_id) VALUES (p_variant_id)
      ON CONFLICT (variant_id) DO NOTHING;
    SELECT ib.* INTO v_balance FROM public.inventory_balances ib
      WHERE ib.variant_id = p_variant_id FOR UPDATE;
  END IF;
  IF v_balance.version <> p_expected_version THEN PERFORM public.phase3_fail('version_conflict'); END IF;
  v_quantity := v_balance.available_quantity::bigint + p_delta::bigint;
  IF v_quantity NOT BETWEEN 0 AND 2147483647 THEN PERFORM public.phase3_fail('stock_conflict'); END IF;
  v_new_version := v_balance.version + 1;
  UPDATE public.inventory_balances
    SET available_quantity = v_quantity::integer, version = v_new_version, updated_at = now()
    WHERE variant_id = p_variant_id;
  INSERT INTO public.inventory_movements (
    variant_id, request_id, delta, balance_after, stock_version, reason, actor
  ) VALUES (
    p_variant_id, p_request_id, p_delta, v_quantity::integer,
    v_new_version, btrim(p_reason), v_subject
  );
  PERFORM public.admin_write_audit(v_subject, 'variant.inventory.adjust', 'variant', p_variant_id,
    jsonb_build_object('version', v_new_version, 'delta', p_delta,
      'availableQuantity', v_quantity, 'requestId', p_request_id), p_reason);
  RETURN jsonb_build_object('variant', public.phase3_admin_variant_json(p_variant_id, v_subject));
END
$fn$;

ALTER TABLE public.cms_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cms_revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cms_live_routes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cms_slug_redirects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.catalog_variants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_balances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.variant_price_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cms_audit_events ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.cms_records FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.cms_revisions FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.cms_live_routes FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.cms_slug_redirects FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.catalog_variants FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.product_categories FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.inventory_balances FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.variant_price_events FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.inventory_movements FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.cms_audit_events FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.phase3_fail(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_assert_capability(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.phase3_is_safe_url(text, boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.phase3_route_path(text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.phase3_is_safe_public_href(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.phase3_document_media_ids(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.phase3_document_uses_media(jsonb, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.phase3_integer_in_range(jsonb, bigint, bigint) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.phase3_jsonb_array_length(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.phase3_jsonb_array_elements(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.phase3_jsonb_object_keys(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.phase3_valid_position(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.phase3_validate_document(text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.phase3_validate_media_refs(jsonb, boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.phase3_block_media_withdrawal() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.phase3_validate_category_parent(uuid, jsonb, boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.phase3_validate_product_references(text, uuid, jsonb, boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.phase3_record_uses_product(jsonb, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.phase3_category_has_dependents(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.phase3_product_has_dependents(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.phase3_admin_record_json(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.phase3_sync_product_variants(uuid, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.phase3_public_variant_json(jsonb, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.phase3_public_document(text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.phase3_admin_variant_json(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_write_audit(text, text, text, uuid, jsonb, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_list_records(text, text, integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_get_record(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_save_record(uuid, text, bigint, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_transition_record(uuid, bigint, text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_list_variants(text, integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_set_variant_price(uuid, bigint, bigint, bigint, timestamptz, timestamptz, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_adjust_inventory(uuid, bigint, integer, text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.published_list_records(text, text, integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.published_get_record(text, text) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.admin_list_records(text, text, integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_record(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_save_record(uuid, text, bigint, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_transition_record(uuid, bigint, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_variants(text, integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_variant_price(uuid, bigint, bigint, bigint, timestamptz, timestamptz, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_adjust_inventory(uuid, bigint, integer, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.published_list_records(text, text, integer, integer) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.published_get_record(text, text) TO anon, authenticated;


CREATE TABLE public.editorial_media_events (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 media_id uuid NOT NULL REFERENCES public.cms_media(id), actor text NOT NULL,
 action text NOT NULL, version bigint NOT NULL, occurred_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(media_id,version)
);
ALTER TABLE public.editorial_media_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.editorial_media_events FROM PUBLIC,anon,authenticated;
REVOKE ALL ON SEQUENCE public.editorial_media_events_id_seq FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.media_referenced(p_id uuid,p_live_only boolean DEFAULT false)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $f$
 SELECT EXISTS(
  SELECT 1 FROM public.cms_records r LEFT JOIN public.cms_revisions v ON v.id=r.published_revision_id
  WHERE (NOT p_live_only AND (r.draft->'mediaIds' @> jsonb_build_array(p_id::text)
       OR EXISTS(SELECT 1 FROM jsonb_array_elements(COALESCE(r.draft->'blocks','[]'::jsonb)) b WHERE b->>'mediaId'=p_id::text)))
    OR (v.id IS NOT NULL AND (v.document->'mediaIds' @> jsonb_build_array(p_id::text)
       OR EXISTS(SELECT 1 FROM jsonb_array_elements(COALESCE(v.document->'blocks','[]'::jsonb)) b WHERE b->>'mediaId'=p_id::text)))
 ) OR (NOT p_live_only AND EXISTS(SELECT 1 FROM public.cms_revisions v WHERE
    v.document->'mediaIds' @> jsonb_build_array(p_id::text) OR EXISTS(
      SELECT 1 FROM jsonb_array_elements(COALESCE(v.document->'blocks','[]'::jsonb)) b WHERE b->>'mediaId'=p_id::text)))
$f$;
REVOKE ALL ON FUNCTION public.media_referenced(uuid,boolean) FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.media_admin_dto(p_media public.cms_media)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $f$
 SELECT jsonb_build_object('id',p_media.id,'filename',p_media.filename,'mimeType',p_media.mime_type,
  'byteSize',p_media.byte_size,'width',p_media.width,'height',p_media.height,'altText',p_media.alt_text,
  'source',p_media.source,'version',p_media.version,'published',p_media.published,'archived',p_media.archived,
  'referenced',public.media_referenced(p_media.id,false),'url','/api/media/'||p_media.id::text)
$f$;
REVOKE ALL ON FUNCTION public.media_admin_dto(public.cms_media) FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.admin_register_media(p_id uuid,p_key text,p_url text,p_filename text,p_mime text,p_size integer,p_width integer,p_height integer,p_alt text,p_source text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $f$
DECLARE actor text; m public.cms_media;
BEGIN
 actor:=public.admin_assert_capability('media.manage');
 IF p_id IS NULL OR p_key IS NULL OR p_key<>('assets/'||p_id::text||CASE WHEN p_mime='image/webp' THEN '.webp' ELSE '.pdf' END)
 OR p_url IS NULL OR p_url NOT LIKE 'https://%' OR p_filename IS NULL OR p_filename !~ '^[[:alnum:]][[:alnum:] ._()-]{0,119}$' OR p_alt IS NULL OR char_length(btrim(p_alt)) NOT BETWEEN 1 AND 300
 OR p_source IS NULL OR char_length(p_source)>500 THEN PERFORM public.phase3_fail('invalid_input'); END IF;
 IF NOT EXISTS(SELECT 1 FROM storage.objects WHERE bucket='editorial-media' AND key=p_key AND uploaded_by=actor AND size=p_size AND mime_type=p_mime)
 THEN PERFORM public.phase3_fail('invalid_input'); END IF;
 INSERT INTO public.cms_media(id,object_key,storage_url,filename,mime_type,byte_size,width,height,alt_text,source,created_by)
 VALUES(p_id,p_key,p_url,p_filename,p_mime,p_size,p_width,p_height,btrim(p_alt),btrim(p_source),actor) RETURNING * INTO m;
 INSERT INTO public.editorial_media_events(media_id,actor,action,version) VALUES(m.id,actor,'upload',m.version);
 RETURN jsonb_build_object('media',public.media_admin_dto(m));
END $f$;

CREATE FUNCTION public.admin_list_media(p_query text DEFAULT '',p_limit integer DEFAULT 25,p_offset integer DEFAULT 0)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $f$
DECLARE items jsonb; total bigint;
BEGIN
 PERFORM public.admin_assert_capability('media.manage');
 IF p_query IS NULL OR char_length(p_query)>100 OR p_limit IS NULL OR p_offset IS NULL OR p_limit NOT BETWEEN 1 AND 50 OR p_offset NOT BETWEEN 0 AND 1000000 THEN PERFORM public.phase3_fail('invalid_input'); END IF;
 SELECT count(*) INTO total FROM public.cms_media WHERE NOT archived AND (filename ILIKE '%'||p_query||'%' OR alt_text ILIKE '%'||p_query||'%');
 SELECT COALESCE(jsonb_agg(public.media_admin_dto(m::public.cms_media) ORDER BY m.created_at DESC,m.id),'[]'::jsonb) INTO items FROM(
 SELECT * FROM public.cms_media WHERE NOT archived AND (filename ILIKE '%'||p_query||'%' OR alt_text ILIKE '%'||p_query||'%') ORDER BY created_at DESC,id LIMIT p_limit OFFSET p_offset) m;
 RETURN jsonb_build_object('items',items,'total',total);
END $f$;

CREATE FUNCTION public.admin_update_media(p_id uuid,p_expected_version bigint,p_alt text,p_source text,p_published boolean,p_archive boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $f$
DECLARE actor text; m public.cms_media;
BEGIN
 actor:=public.admin_assert_capability('media.manage');
 PERFORM pg_advisory_xact_lock(832641);
 SELECT * INTO m FROM public.cms_media WHERE id=p_id FOR UPDATE;
 IF NOT FOUND THEN PERFORM public.phase3_fail('media_not_found'); END IF;
 IF p_expected_version IS NULL OR p_expected_version<>m.version THEN PERFORM public.phase3_fail('version_conflict'); END IF;
 IF p_published IS NULL OR p_archive IS NULL OR m.archived THEN PERFORM public.phase3_fail('invalid_state'); END IF;
 IF p_published<>m.published THEN PERFORM public.admin_assert_capability('content.publish'); END IF;
 IF (p_archive OR NOT p_published) AND public.media_referenced(m.id,p_live_only:=NOT p_archive) THEN PERFORM public.phase3_fail('media_referenced'); END IF;
 IF NOT p_archive AND (p_alt IS NULL OR char_length(btrim(p_alt)) NOT BETWEEN 1 AND 300 OR p_source IS NULL OR char_length(p_source)>500) THEN PERFORM public.phase3_fail('invalid_input'); END IF;
 UPDATE public.cms_media SET alt_text=COALESCE(btrim(p_alt),alt_text),source=COALESCE(btrim(p_source),source),published=p_published,
 archived=p_archive,version=version+1,updated_at=now() WHERE id=p_id RETURNING * INTO m;
 INSERT INTO public.editorial_media_events(media_id,actor,action,version) VALUES(m.id,actor,CASE WHEN p_archive THEN 'archive' ELSE 'update' END,m.version);
 RETURN jsonb_build_object('media',public.media_admin_dto(m));
END $f$;

CREATE FUNCTION public.media_storage_allowed(p_key text,p_operation text)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $f$
DECLARE staff_read boolean:=false; staff_write boolean:=false;
BEGIN
 IF p_key IS NULL OR p_key !~ '^assets/[0-9a-f-]{36}[.](webp|pdf)$' THEN RETURN false; END IF;
 IF public.requesting_user_id() IS NOT NULL THEN
  staff_write:=public.has_capability('media.manage');
  staff_read:=staff_write OR public.has_capability('catalog.edit') OR public.has_capability('content.edit');
 END IF;
 IF p_operation='read' THEN RETURN staff_read OR EXISTS(SELECT 1 FROM public.cms_media WHERE object_key=p_key AND published AND NOT archived); END IF;
 IF p_operation='write' THEN RETURN staff_write AND NOT EXISTS(SELECT 1 FROM public.cms_media WHERE object_key=p_key); END IF;
 IF p_operation='delete' THEN RETURN staff_write AND NOT EXISTS(SELECT 1 FROM public.cms_media WHERE object_key=p_key); END IF;
 RETURN false;
END $f$;
REVOKE ALL ON FUNCTION public.media_storage_allowed(text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.media_storage_allowed(text,text) TO anon,authenticated;

CREATE FUNCTION public.public_get_media(p_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $f$
 SELECT jsonb_build_object('media',jsonb_build_object('id',id,'objectKey',object_key,'filename',filename,'mimeType',mime_type,'byteSize',byte_size,'width',width,'height',height))
 FROM public.cms_media WHERE id=p_id AND published AND NOT archived
$f$;

CREATE FUNCTION public.editor_get_media(p_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $f$
BEGIN
 IF public.requesting_user_id() IS NULL THEN PERFORM public.phase3_fail('unauthenticated'); END IF;
 IF NOT(public.has_capability('media.manage') OR public.has_capability('catalog.edit') OR public.has_capability('content.edit')) THEN PERFORM public.phase3_fail('forbidden'); END IF;
 RETURN(SELECT jsonb_build_object('media',jsonb_build_object('id',id,'objectKey',object_key,'filename',filename,'mimeType',mime_type,'byteSize',byte_size,'width',width,'height',height)) FROM public.cms_media WHERE id=p_id AND NOT archived);
END $f$;

ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
CREATE POLICY editorial_media_read ON storage.objects FOR SELECT TO anon,authenticated USING(bucket='editorial-media' AND public.media_storage_allowed(key,'read'));
CREATE POLICY editorial_media_read_boundary ON storage.objects AS RESTRICTIVE FOR SELECT TO anon,authenticated USING(bucket<>'editorial-media' OR public.media_storage_allowed(key,'read'));
CREATE POLICY editorial_media_anon_only ON storage.objects AS RESTRICTIVE FOR SELECT TO anon USING(bucket='editorial-media' AND public.media_storage_allowed(key,'read'));
CREATE POLICY editorial_media_insert ON storage.objects FOR INSERT TO authenticated WITH CHECK(bucket='editorial-media' AND public.media_storage_allowed(key,'write'));
CREATE POLICY editorial_media_insert_boundary ON storage.objects AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK(bucket<>'editorial-media' OR
 (public.media_storage_allowed(key,'write') AND uploaded_by=public.requesting_user_id() AND size BETWEEN 1 AND 4194304 AND (mime_type='image/webp' OR (mime_type='application/pdf' AND size<=2097152))));
CREATE POLICY editorial_media_no_overwrite ON storage.objects AS RESTRICTIVE FOR UPDATE TO authenticated USING(bucket<>'editorial-media') WITH CHECK(bucket<>'editorial-media');
CREATE POLICY editorial_media_cleanup ON storage.objects FOR DELETE TO authenticated USING(bucket='editorial-media' AND public.media_storage_allowed(key,'delete'));
CREATE POLICY editorial_media_cleanup_boundary ON storage.objects AS RESTRICTIVE FOR DELETE TO authenticated USING(bucket<>'editorial-media' OR public.media_storage_allowed(key,'delete'));
GRANT USAGE ON SCHEMA storage TO anon;
GRANT SELECT ON storage.objects TO anon;

CREATE TABLE public.inquiries (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), request_id uuid NOT NULL UNIQUE,
 name text NOT NULL CHECK(char_length(btrim(name)) BETWEEN 1 AND 120),
 email text NOT NULL CHECK(char_length(email) BETWEEN 3 AND 254), phone text NOT NULL CHECK(char_length(phone)<=40),
 subject text NOT NULL CHECK(char_length(btrim(subject)) BETWEEN 1 AND 200), message text NOT NULL CHECK(char_length(btrim(message)) BETWEEN 1 AND 5000),
 status text NOT NULL DEFAULT 'new' CHECK(status IN('new','in_progress','resolved','spam')),
 version bigint NOT NULL DEFAULT 1, created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX inquiries_created_idx ON public.inquiries(created_at DESC,id);
CREATE INDEX inquiries_email_created_idx ON public.inquiries(email,created_at DESC);
CREATE INDEX inquiries_status_created_idx ON public.inquiries(status,created_at DESC,id);
CREATE TABLE public.inquiry_notes (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, inquiry_id uuid NOT NULL REFERENCES public.inquiries(id),
 text text NOT NULL CHECK(char_length(text) BETWEEN 1 AND 2048),actor text NOT NULL,created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX inquiry_notes_inquiry_idx ON public.inquiry_notes(inquiry_id,id);
CREATE TABLE public.inquiry_notifications (
 inquiry_id uuid PRIMARY KEY REFERENCES public.inquiries(id),status text NOT NULL DEFAULT 'unconfigured' CHECK(status='unconfigured'),created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.inquiries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inquiry_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inquiry_notifications ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.inquiries,public.inquiry_notes,public.inquiry_notifications FROM PUBLIC,anon,authenticated;
REVOKE ALL ON SEQUENCE public.inquiry_notes_id_seq FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.inquiry_dto(p_inquiry public.inquiries)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $f$
 SELECT jsonb_build_object('id',p_inquiry.id,'name',p_inquiry.name,'email',p_inquiry.email,'phone',p_inquiry.phone,'subject',p_inquiry.subject,'message',p_inquiry.message,
 'status',p_inquiry.status,'version',p_inquiry.version,'createdAt',p_inquiry.created_at,'notificationStatus','unconfigured')
$f$;
REVOKE ALL ON FUNCTION public.inquiry_dto(public.inquiries) FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.submit_inquiry(p_name text,p_email text,p_phone text,p_subject text,p_message text,p_request_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $f$
DECLARE i public.inquiries;
BEGIN
 IF p_request_id IS NULL OR p_name IS NULL OR char_length(btrim(p_name)) NOT BETWEEN 1 AND 120 OR p_email IS NULL
 OR char_length(p_email)>254 OR p_email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' OR p_phone IS NULL OR char_length(p_phone)>40
 OR p_subject IS NULL OR char_length(btrim(p_subject)) NOT BETWEEN 1 AND 200 OR p_message IS NULL OR char_length(btrim(p_message)) NOT BETWEEN 1 AND 5000
 THEN PERFORM public.phase3_fail('invalid_input'); END IF;
 PERFORM pg_advisory_xact_lock(832642);
 SELECT * INTO i FROM public.inquiries WHERE request_id=p_request_id;
 IF FOUND THEN
  IF i.name<>btrim(p_name) OR i.email<>lower(btrim(p_email)) OR i.phone<>btrim(p_phone) OR i.subject<>btrim(p_subject) OR i.message<>btrim(p_message) THEN PERFORM public.phase3_fail('request_conflict'); END IF;
  RETURN jsonb_build_object('receipt',i.id,'notificationStatus','unconfigured');
 END IF;
 IF (SELECT count(*) FROM public.inquiries WHERE email=lower(btrim(p_email)) AND created_at>now()-interval '1 hour')>=5
 OR (SELECT count(*) FROM public.inquiries WHERE created_at>now()-interval '1 hour')>=100 THEN PERFORM public.phase3_fail('rate_limited'); END IF;
 INSERT INTO public.inquiries(request_id,name,email,phone,subject,message) VALUES(p_request_id,btrim(p_name),lower(btrim(p_email)),btrim(p_phone),btrim(p_subject),btrim(p_message)) RETURNING * INTO i;
 INSERT INTO public.inquiry_notifications(inquiry_id) VALUES(i.id);
 RETURN jsonb_build_object('receipt',i.id,'notificationStatus','unconfigured');
END $f$;

CREATE FUNCTION public.admin_list_inquiries(p_query text DEFAULT '',p_status text DEFAULT NULL,p_limit integer DEFAULT 25,p_offset integer DEFAULT 0)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $f$
DECLARE items jsonb; total bigint;
BEGIN
 PERFORM public.admin_assert_capability('inquiries.manage');
 IF p_query IS NULL OR char_length(p_query)>100 OR p_limit IS NULL OR p_offset IS NULL OR p_limit NOT BETWEEN 1 AND 50 OR p_offset NOT BETWEEN 0 AND 1000000 OR (p_status IS NOT NULL AND p_status NOT IN('new','in_progress','resolved','spam')) THEN PERFORM public.phase3_fail('invalid_input'); END IF;
 SELECT count(*) INTO total FROM public.inquiries WHERE (p_status IS NULL OR status=p_status) AND (subject ILIKE '%'||p_query||'%' OR email ILIKE '%'||p_query||'%');
 SELECT COALESCE(jsonb_agg(public.inquiry_dto(i::public.inquiries) ORDER BY i.created_at DESC,i.id),'[]'::jsonb) INTO items FROM(SELECT * FROM public.inquiries WHERE (p_status IS NULL OR status=p_status) AND (subject ILIKE '%'||p_query||'%' OR email ILIKE '%'||p_query||'%') ORDER BY created_at DESC,id LIMIT p_limit OFFSET p_offset) i;
 RETURN jsonb_build_object('items',items,'total',total);
END $f$;

CREATE FUNCTION public.admin_get_inquiry(p_id uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $f$
DECLARE i public.inquiries; notes jsonb;
BEGIN
 PERFORM public.admin_assert_capability('inquiries.manage');
 SELECT * INTO i FROM public.inquiries WHERE id=p_id;
 IF NOT FOUND THEN PERFORM public.phase3_fail('inquiry_not_found'); END IF;
 SELECT COALESCE(jsonb_agg(jsonb_build_object('id',n.id,'text',n.text,'actor',n.actor,'createdAt',n.created_at) ORDER BY n.id),'[]'::jsonb) INTO notes FROM public.inquiry_notes n WHERE n.inquiry_id=p_id;
 RETURN jsonb_build_object('inquiry',public.inquiry_dto(i)||jsonb_build_object('notes',notes));
END $f$;

CREATE FUNCTION public.admin_update_inquiry(p_id uuid,p_expected_version bigint,p_status text,p_note text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $f$
DECLARE actor text; i public.inquiries;
BEGIN
 actor:=public.admin_assert_capability('inquiries.manage');
 IF p_status IS NULL OR p_status NOT IN('new','in_progress','resolved','spam') OR p_note IS NULL OR char_length(p_note)>2000 THEN PERFORM public.phase3_fail('invalid_input'); END IF;
 SELECT * INTO i FROM public.inquiries WHERE id=p_id FOR UPDATE;
 IF NOT FOUND THEN PERFORM public.phase3_fail('inquiry_not_found'); END IF;
 IF p_expected_version IS NULL OR p_expected_version<>i.version THEN PERFORM public.phase3_fail('version_conflict'); END IF;
 INSERT INTO public.inquiry_notes(inquiry_id,text,actor) VALUES(p_id,'Status: '||p_status||CASE WHEN btrim(p_note)<>'' THEN E'\n'||btrim(p_note) ELSE '' END,actor);
 UPDATE public.inquiries SET status=p_status,version=version+1,updated_at=now() WHERE id=p_id;
 RETURN public.admin_get_inquiry(p_id);
END $f$;

REVOKE ALL ON FUNCTION public.admin_register_media(uuid,text,text,text,text,integer,integer,integer,text,text),public.admin_list_media(text,integer,integer),public.admin_update_media(uuid,bigint,text,text,boolean,boolean),public.editor_get_media(uuid),public.public_get_media(uuid),public.submit_inquiry(text,text,text,text,text,uuid),public.admin_list_inquiries(text,text,integer,integer),public.admin_get_inquiry(uuid),public.admin_update_inquiry(uuid,bigint,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.admin_register_media(uuid,text,text,text,text,integer,integer,integer,text,text),public.admin_list_media(text,integer,integer),public.admin_update_media(uuid,bigint,text,text,boolean,boolean),public.editor_get_media(uuid),public.admin_list_inquiries(text,text,integer,integer),public.admin_get_inquiry(uuid),public.admin_update_inquiry(uuid,bigint,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.public_get_media(uuid),public.submit_inquiry(text,text,text,text,text,uuid) TO anon,authenticated;
