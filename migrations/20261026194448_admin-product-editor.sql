-- Product administration only; no catalog records or publication state are changed.
-- Forward rollback: keep optional content readable and revert consumers before removing wrappers.
CREATE FUNCTION public.admin_list_products(p_query text DEFAULT '',p_status text DEFAULT 'all',p_category_id uuid DEFAULT NULL,p_sort text DEFAULT 'updated_desc',p_limit integer DEFAULT 20,p_offset integer DEFAULT 0)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $f$
DECLARE result jsonb;
BEGIN
 PERFORM public.admin_assert_capability('catalog.edit');
 IF p_query IS NULL OR char_length(p_query)>120 OR p_query ~ '[[:cntrl:]]' OR p_status IS NULL OR p_status NOT IN ('all','draft','published','archived') OR p_sort IS NULL OR p_sort NOT IN ('updated_desc','updated_asc','title_asc','title_desc','price_asc','price_desc') OR p_limit IS NULL OR p_limit NOT IN (10,20,50) OR p_offset IS NULL OR p_offset NOT BETWEEN 0 AND 10000 THEN PERFORM public.phase3_fail('invalid_input'); END IF;
 WITH base AS (
  SELECT r.*, (r.draft ? 'sourceObservation' OR COALESCE(rev.document ? 'sourceObservation',false)) AS source_only,
   CASE WHEN r.archived_at IS NOT NULL THEN 'archived' WHEN r.published_revision_id IS NOT NULL THEN 'published' ELSE 'draft' END AS status
  FROM public.cms_records r LEFT JOIN public.cms_revisions rev ON rev.id=r.published_revision_id WHERE r.kind='product'
 ), matching AS (
  SELECT r.*, price.summary AS price,price.effective AS sort_price FROM base r
  LEFT JOIN LATERAL (
   WITH amounts AS (
    SELECT cv.id,cv.sku,cv.regular_paise,CASE WHEN cv.sale_paise IS NOT NULL AND cv.sale_from<=now() AND now()<cv.sale_until THEN cv.sale_paise ELSE cv.regular_paise END AS effective
    FROM public.catalog_variants cv WHERE cv.product_id=r.id AND cv.archived_at IS NULL AND cv.regular_paise IS NOT NULL AND NOT r.source_only
   ) SELECT a.effective,jsonb_build_object('regularPricePaise',a.regular_paise,'effectivePricePaise',a.effective,'isOnSale',a.effective<a.regular_paise,'from',(SELECT count(DISTINCT effective)>1 FROM amounts)) AS summary FROM amounts a ORDER BY a.effective,a.sku,a.id LIMIT 1
  ) price ON true
  WHERE (p_status='all' OR r.status=p_status)
   AND (p_category_id IS NULL OR r.draft->'categoryIds' @> jsonb_build_array(p_category_id::text))
   AND (btrim(p_query)='' OR position(lower(btrim(p_query)) in lower(r.title||' '||r.slug))>0 OR EXISTS(SELECT 1 FROM jsonb_array_elements(COALESCE(r.draft->'variants','[]'::jsonb)) v WHERE lower(v->>'sku')=lower(btrim(p_query))))
 ), page AS (
  SELECT * FROM matching ORDER BY
   CASE WHEN p_sort='updated_desc' THEN updated_at END DESC,CASE WHEN p_sort='updated_asc' THEN updated_at END ASC,
   CASE WHEN p_sort='title_asc' THEN lower(title) END ASC,CASE WHEN p_sort='title_desc' THEN lower(title) END DESC,
   CASE WHEN p_sort='price_asc' THEN sort_price END ASC NULLS LAST,CASE WHEN p_sort='price_desc' THEN sort_price END DESC NULLS LAST,id DESC LIMIT p_limit OFFSET p_offset
 ) SELECT jsonb_build_object('total',(SELECT count(*) FROM matching),'items',COALESCE((SELECT jsonb_agg(jsonb_build_object(
  'id',r.id,'title',r.title,'slug',r.slug,'version',r.version,'status',r.status,'updatedAt',r.updated_at,'sourceObservation',r.source_only,'price',r.price,
  'image',(SELECT jsonb_build_object('mediaId',m.id,'alt',m.alt_text) FROM jsonb_array_elements_text(COALESCE(r.draft->'mediaIds','[]'::jsonb)) WITH ORDINALITY g(id,position) JOIN public.cms_media m ON m.id=g.id::uuid AND NOT m.archived AND m.mime_type='image/webp' ORDER BY g.position LIMIT 1),
  'categories',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',c.id,'title',c.title) ORDER BY c.title,c.id) FROM public.cms_records c WHERE c.kind='category' AND c.archived_at IS NULL AND r.draft->'categoryIds' @> jsonb_build_array(c.id::text)),'[]'::jsonb)
 )) FROM page r),'[]'::jsonb),'categoryOptions',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',c.id,'title',c.title) ORDER BY c.title,c.id) FROM (SELECT id,title FROM public.cms_records WHERE kind='category' AND archived_at IS NULL ORDER BY title,id LIMIT 100) c),'[]'::jsonb)) INTO result;
 RETURN result;
END $f$;
REVOKE ALL ON FUNCTION public.admin_list_products(text,text,uuid,text,integer,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_products(text,text,uuid,text,integer,integer) TO authenticated;

CREATE FUNCTION public.admin_list_product_prices(p_product_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $f$
DECLARE actor text; r public.cms_records; source_only boolean;
BEGIN
 actor:=public.admin_assert_capability('catalog.edit');
 SELECT * INTO r FROM public.cms_records WHERE id=p_product_id AND kind='product';
 IF NOT FOUND THEN PERFORM public.phase3_fail('not_found'); END IF;
 source_only:=r.draft ? 'sourceObservation' OR EXISTS(SELECT 1 FROM public.cms_revisions WHERE id=r.published_revision_id AND document ? 'sourceObservation');
 RETURN jsonb_build_object('sourceObservation',source_only,'items',COALESCE((SELECT jsonb_agg(public.phase3_admin_variant_json(v.id,actor) ORDER BY v.sku,v.id) FROM (SELECT id,sku FROM public.catalog_variants WHERE product_id=p_product_id AND archived_at IS NULL ORDER BY sku,id LIMIT 100) v),'[]'::jsonb));
END $f$;
REVOKE ALL ON FUNCTION public.admin_list_product_prices(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_product_prices(uuid) TO authenticated;

CREATE FUNCTION public.admin_save_product_with_prices(p_id uuid,p_expected_version bigint,p_document jsonb,p_prices jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $f$
DECLARE result jsonb; saved_id uuid; entry jsonb; variant_id uuid;
BEGIN
 PERFORM public.admin_assert_capability('catalog.edit');
 IF p_prices IS NULL OR jsonb_typeof(p_prices) IS DISTINCT FROM 'array' OR jsonb_array_length(p_prices)>100 THEN PERFORM public.phase3_fail('invalid_input'); END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_prices) e GROUP BY lower(e->>'sku') HAVING count(*)>1) THEN PERFORM public.phase3_fail('invalid_input'); END IF;
 result:=public.admin_save_record(p_id,'product',p_expected_version,p_document);
 saved_id:=(result->'record'->>'id')::uuid;
 FOR entry IN SELECT value FROM jsonb_array_elements(p_prices) ORDER BY value->>'sku' LOOP
  IF jsonb_typeof(entry) IS DISTINCT FROM 'object' OR NOT(entry ?& ARRAY['sku','expectedPriceVersion','regularPricePaise','salePricePaise','saleStartsAt','saleEndsAt','reason']) OR EXISTS(SELECT 1 FROM jsonb_object_keys(entry) k WHERE k NOT IN ('sku','expectedPriceVersion','regularPricePaise','salePricePaise','saleStartsAt','saleEndsAt','reason')) OR jsonb_typeof(entry->'sku') IS DISTINCT FROM 'string' OR jsonb_typeof(entry->'expectedPriceVersion') IS DISTINCT FROM 'number' OR (entry->>'expectedPriceVersion') !~ '^[0-9]+$' OR jsonb_typeof(entry->'regularPricePaise') IS DISTINCT FROM 'number' OR (entry->>'regularPricePaise') !~ '^[0-9]+$' OR (entry->'salePricePaise'<>'null'::jsonb AND (jsonb_typeof(entry->'salePricePaise') IS DISTINCT FROM 'number' OR (entry->>'salePricePaise') !~ '^[0-9]+$')) OR jsonb_typeof(entry->'reason') IS DISTINCT FROM 'string' THEN PERFORM public.phase3_fail('invalid_input'); END IF;
  SELECT id INTO variant_id FROM public.catalog_variants WHERE product_id=saved_id AND sku=entry->>'sku' AND archived_at IS NULL;
  IF NOT FOUND THEN PERFORM public.phase3_fail('invalid_input'); END IF;
  PERFORM public.admin_set_variant_price(variant_id,(entry->>'expectedPriceVersion')::bigint,(entry->>'regularPricePaise')::bigint,(entry->>'salePricePaise')::bigint,(entry->>'saleStartsAt')::timestamptz,(entry->>'saleEndsAt')::timestamptz,entry->>'reason');
 END LOOP;
 RETURN result;
EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range OR invalid_datetime_format OR datetime_field_overflow THEN PERFORM public.phase3_fail('invalid_input');
END $f$;
REVOKE ALL ON FUNCTION public.admin_save_product_with_prices(uuid,bigint,jsonb,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.admin_save_product_with_prices(uuid,bigint,jsonb,jsonb) TO authenticated;

CREATE FUNCTION public.product_rich_node_valid(n jsonb,parent text,depth integer,lists integer)
RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,public,pg_temp AS $f$
DECLARE t text:=n->>'type'; a jsonb:=COALESCE(n->'attrs','{}'::jsonb); child jsonb; mark jsonb; ma jsonb; children text[]; allowed text[]; next_lists integer;
BEGIN
 IF depth>12 OR jsonb_typeof(n) IS DISTINCT FROM 'object' OR EXISTS(SELECT 1 FROM jsonb_object_keys(n) k WHERE k NOT IN ('type','attrs','text','marks','content')) OR jsonb_typeof(n->'type') IS DISTINCT FROM 'string' OR jsonb_typeof(a) IS DISTINCT FROM 'object' THEN RETURN false; END IF;
 children:=CASE parent WHEN 'root' THEN ARRAY['doc'] WHEN 'doc' THEN ARRAY['paragraph','heading','bulletList','orderedList','blockquote','codeBlock','horizontalRule','table','image'] WHEN 'paragraph' THEN ARRAY['text','hardBreak'] WHEN 'heading' THEN ARRAY['text','hardBreak'] WHEN 'codeBlock' THEN ARRAY['text'] WHEN 'bulletList' THEN ARRAY['listItem'] WHEN 'orderedList' THEN ARRAY['listItem'] WHEN 'listItem' THEN ARRAY['paragraph','bulletList','orderedList','blockquote','codeBlock'] WHEN 'blockquote' THEN ARRAY['paragraph','heading','bulletList','orderedList'] WHEN 'table' THEN ARRAY['tableRow'] WHEN 'tableRow' THEN ARRAY['tableHeader','tableCell'] WHEN 'tableHeader' THEN ARRAY['paragraph','bulletList','orderedList'] WHEN 'tableCell' THEN ARRAY['paragraph','bulletList','orderedList'] ELSE ARRAY[]::text[] END;
 IF NOT(t=ANY(children)) THEN RETURN false; END IF;
 allowed:=CASE t WHEN 'paragraph' THEN ARRAY['textAlign'] WHEN 'heading' THEN ARRAY['level','textAlign'] WHEN 'orderedList' THEN ARRAY['start'] WHEN 'codeBlock' THEN ARRAY['language'] WHEN 'image' THEN ARRAY['mediaId','alt','caption'] WHEN 'tableHeader' THEN ARRAY['colspan','rowspan','colwidth'] WHEN 'tableCell' THEN ARRAY['colspan','rowspan','colwidth'] ELSE ARRAY[]::text[] END;
 IF EXISTS(SELECT 1 FROM jsonb_object_keys(a) k WHERE NOT(k=ANY(allowed))) THEN RETURN false; END IF;
 IF a ? 'textAlign' AND a->'textAlign'<>'null'::jsonb AND (a->>'textAlign') NOT IN ('left','center','right') THEN RETURN false; END IF;
 IF t='heading' AND (jsonb_typeof(a->'level') IS DISTINCT FROM 'number' OR a->>'level' NOT IN ('2','3','4')) THEN RETURN false; END IF;
 IF a ? 'start' AND (jsonb_typeof(a->'start') IS DISTINCT FROM 'number' OR (a->>'start') !~ '^[0-9]+$' OR (a->>'start')::numeric NOT BETWEEN 1 AND 10000) THEN RETURN false; END IF;
 IF a ? 'language' AND a->'language'<>'null'::jsonb AND (jsonb_typeof(a->'language') IS DISTINCT FROM 'string' OR char_length(a->>'language')>40 OR a->>'language' ~ '[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]') THEN RETURN false; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_each(a) e WHERE e.key IN ('colspan','rowspan') AND (jsonb_typeof(e.value)<>'number' OR e.value::text !~ '^[0-9]+$' OR e.value::text::numeric NOT BETWEEN 1 AND 10)) THEN RETURN false; END IF;
 IF a ? 'colwidth' AND a->'colwidth'<>'null'::jsonb THEN
  IF jsonb_typeof(a->'colwidth')<>'array' OR jsonb_array_length(a->'colwidth')>10 THEN RETURN false; END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(a->'colwidth') w WHERE jsonb_typeof(w)<>'number' OR w::text !~ '^[0-9]+$' OR w::text::numeric NOT BETWEEN 20 AND 2000) THEN RETURN false; END IF;
 END IF;
 IF t='image' AND (jsonb_typeof(a->'mediaId') IS DISTINCT FROM 'string' OR a->>'mediaId' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' OR jsonb_typeof(a->'alt') IS DISTINCT FROM 'string' OR char_length(btrim(a->>'alt')) NOT BETWEEN 1 AND 300 OR a->>'alt' ~ '[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]' OR (a ? 'caption' AND a->'caption'<>'null'::jsonb AND (jsonb_typeof(a->'caption')<>'string' OR char_length(a->>'caption')>500 OR a->>'caption' ~ '[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]'))) THEN RETURN false; END IF;
 IF t='text' THEN
  IF jsonb_typeof(n->'text') IS DISTINCT FROM 'string' OR char_length(n->>'text')<1 OR n->>'text' ~ '[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]' OR n ? 'content' OR a<>'{}'::jsonb THEN RETURN false; END IF;
  IF n ? 'marks' THEN
   IF jsonb_typeof(n->'marks')<>'array' OR jsonb_array_length(n->'marks')>8 THEN RETURN false; END IF;
   IF EXISTS(SELECT 1 FROM jsonb_array_elements(n->'marks') m GROUP BY m->>'type' HAVING count(*)>1) THEN RETURN false; END IF;
   FOR mark IN SELECT value FROM jsonb_array_elements(n->'marks') LOOP
    ma:=COALESCE(mark->'attrs','{}'::jsonb);
    IF jsonb_typeof(mark)<>'object' OR EXISTS(SELECT 1 FROM jsonb_object_keys(mark) k WHERE k NOT IN ('type','attrs')) OR jsonb_typeof(ma)<>'object' OR jsonb_typeof(mark->'type') IS DISTINCT FROM 'string' THEN RETURN false; END IF;
    IF mark->>'type' IN ('bold','italic','underline','strike','code') THEN IF ma<>'{}'::jsonb THEN RETURN false; END IF;
    ELSIF mark->>'type'='link' THEN
     IF EXISTS(SELECT 1 FROM jsonb_object_keys(ma) k WHERE k NOT IN ('href','target','rel','class')) OR jsonb_typeof(ma->'href') IS DISTINCT FROM 'string' OR char_length(ma->>'href')>2048 OR ma->>'href' ~ '[[:space:]\x00-\x1f\x7f\\]' OR NOT((ma->>'href' ~ '^/[^/]' OR ma->>'href'='/') OR ma->>'href' ~ '^https://[^/@:[:space:]]+([:/?#]|$)') OR (ma ? 'target' AND ma->'target'<>'null'::jsonb AND ma->>'target'<>'_blank') OR (ma ? 'rel' AND ma->'rel'<>'null'::jsonb AND ma->>'rel'<>'noopener noreferrer nofollow') OR (ma ? 'class' AND ma->'class'<>'null'::jsonb) THEN RETURN false; END IF;
    ELSIF mark->>'type'='highlight' THEN IF EXISTS(SELECT 1 FROM jsonb_object_keys(ma) k WHERE k<>'color') OR COALESCE(ma->>'color','') NOT IN ('#fef08a','#bbf7d0','#bfdbfe','#fbcfe8') THEN RETURN false; END IF;
    ELSIF mark->>'type'='textStyle' THEN
     IF EXISTS(SELECT 1 FROM jsonb_object_keys(ma) k WHERE k NOT IN ('color','fontSize')) OR (ma ? 'color' AND ma->'color'<>'null'::jsonb AND ma->>'color' NOT IN ('#111827','#374151','#6b7280','#b91c1c','#c2410c','#a16207','#15803d','#0369a1','#1d4ed8','#7e22ce')) OR (ma ? 'fontSize' AND ma->'fontSize'<>'null'::jsonb AND ma->>'fontSize' NOT IN ('12px','14px','16px','18px','20px','24px','32px')) THEN RETURN false; END IF;
    ELSE RETURN false; END IF;
   END LOOP;
  END IF;
  RETURN true;
 END IF;
 IF n ? 'text' OR n ? 'marks' THEN RETURN false; END IF;
 IF t IN ('image','horizontalRule','hardBreak') THEN RETURN NOT(n ? 'content') OR n->'content'='[]'::jsonb; END IF;
 IF n ? 'content' AND jsonb_typeof(n->'content')<>'array' THEN RETURN false; END IF;
 IF jsonb_array_length(COALESCE(n->'content','[]'::jsonb))>(CASE WHEN t='doc' THEN 200 ELSE 500 END) OR (t IN ('bulletList','orderedList','table','tableRow','tableCell','tableHeader','listItem') AND jsonb_array_length(COALESCE(n->'content','[]'::jsonb))=0) THEN RETURN false; END IF;
 next_lists:=lists+CASE WHEN t IN ('bulletList','orderedList') THEN 1 ELSE 0 END;
 IF next_lists>3 THEN RETURN false; END IF;
 FOR child IN SELECT value FROM jsonb_array_elements(COALESCE(n->'content','[]'::jsonb)) LOOP IF NOT public.product_rich_node_valid(child,t,depth+1,next_lists) THEN RETURN false; END IF; END LOOP;
 RETURN true;
END $f$;
REVOKE ALL ON FUNCTION public.product_rich_node_valid(jsonb,text,integer,integer) FROM PUBLIC,anon,authenticated;

ALTER FUNCTION public.phase3_validate_document(text,jsonb) RENAME TO product_editor_validate_document_before;
CREATE FUNCTION public.phase3_validate_document(p_kind text,p_document jsonb)
RETURNS void LANGUAGE plpgsql STABLE SET search_path=pg_catalog,public,pg_temp AS $f$
DECLARE node_count bigint; text_count bigint; image_count bigint;
BEGIN
 IF p_kind<>'product' AND p_document ?| ARRAY['tags','richContent','documentMediaId'] AND p_document ?| ARRAY['richContent','documentMediaId'] THEN PERFORM public.phase3_fail('invalid_input'); END IF;
 IF p_kind='product' THEN
  IF p_document ? 'mediaIds' AND (jsonb_typeof(p_document->'mediaIds')<>'array' OR jsonb_array_length(p_document->'mediaIds')>5) THEN PERFORM public.phase3_fail('invalid_input'); END IF;
  IF p_document ? 'tags' THEN
   IF jsonb_typeof(p_document->'tags')<>'array' OR jsonb_array_length(p_document->'tags')>30 THEN PERFORM public.phase3_fail('invalid_input'); END IF;
   IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_document->'tags') t WHERE jsonb_typeof(t)<>'string' OR char_length(btrim(t#>>'{}')) NOT BETWEEN 1 AND 60 OR t#>>'{}' ~ '[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]') OR EXISTS(SELECT 1 FROM jsonb_array_elements_text(p_document->'tags') t GROUP BY lower(btrim(t)) HAVING count(*)>1) THEN PERFORM public.phase3_fail('invalid_input'); END IF;
  END IF;
  IF p_document ? 'documentMediaId' AND (jsonb_typeof(p_document->'documentMediaId') IS DISTINCT FROM 'string' OR p_document->>'documentMediaId' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$') THEN PERFORM public.phase3_fail('invalid_input'); END IF;
  IF p_document ? 'richContent' THEN
   IF NOT public.product_rich_node_valid(p_document->'richContent','root',0,0) THEN PERFORM public.phase3_fail('invalid_input'); END IF;
   WITH RECURSIVE nodes(n) AS (SELECT p_document->'richContent' UNION ALL SELECT child FROM nodes CROSS JOIN LATERAL jsonb_array_elements(COALESCE(n->'content','[]'::jsonb)) child)
   SELECT count(*),COALESCE(sum(char_length(n->>'text')),0),count(*) FILTER(WHERE n->>'type'='image') INTO node_count,text_count,image_count FROM nodes;
   IF node_count>2000 OR text_count>100000 OR image_count>30 THEN PERFORM public.phase3_fail('invalid_input'); END IF;
  END IF;
  PERFORM public.product_editor_validate_document_before(p_kind,p_document-ARRAY['tags','richContent','documentMediaId']);
 ELSE PERFORM public.product_editor_validate_document_before(p_kind,p_document); END IF;
END $f$;
REVOKE ALL ON FUNCTION public.phase3_validate_document(text,jsonb),public.product_editor_validate_document_before(text,jsonb) FROM PUBLIC,anon,authenticated;

ALTER FUNCTION public.phase3_document_media_ids(jsonb) RENAME TO product_editor_document_media_ids_before;
CREATE FUNCTION public.phase3_document_media_ids(p_document jsonb)
RETURNS TABLE(media_id uuid) LANGUAGE sql IMMUTABLE SET search_path=pg_catalog,public AS $f$
 WITH RECURSIVE nodes(n) AS (SELECT p_document->'richContent' WHERE p_document ? 'richContent' UNION ALL SELECT child FROM nodes CROSS JOIN LATERAL jsonb_array_elements(COALESCE(n->'content','[]'::jsonb)) child)
 SELECT media_id FROM public.product_editor_document_media_ids_before(p_document)
 UNION SELECT (p_document->>'documentMediaId')::uuid WHERE p_document ? 'documentMediaId'
 UNION SELECT (n->'attrs'->>'mediaId')::uuid FROM nodes WHERE n->>'type'='image'
$f$;
REVOKE ALL ON FUNCTION public.phase3_document_media_ids(jsonb),public.product_editor_document_media_ids_before(jsonb) FROM PUBLIC,anon,authenticated;

ALTER FUNCTION public.phase3_validate_media_refs(jsonb,boolean) RENAME TO product_editor_validate_media_refs_before;
CREATE FUNCTION public.phase3_validate_media_refs(p_document jsonb,p_require_public boolean)
RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $f$
BEGIN
 PERFORM public.product_editor_validate_media_refs_before(p_document,p_require_public);
 IF EXISTS(SELECT 1 FROM public.phase3_document_media_ids(p_document) r LEFT JOIN public.cms_media m ON m.id=r.media_id WHERE m.id IS NULL OR m.archived OR (p_require_public AND NOT m.published)) THEN PERFORM public.phase3_fail('invalid_state'); END IF;
 IF p_document ? 'documentMediaId' AND NOT EXISTS(SELECT 1 FROM public.cms_media WHERE id=(p_document->>'documentMediaId')::uuid AND mime_type='application/vnd.openxmlformats-officedocument.wordprocessingml.document' AND NOT archived) THEN PERFORM public.phase3_fail('invalid_input'); END IF;
 IF EXISTS(SELECT 1 FROM public.phase3_document_media_ids(p_document-'documentMediaId'-'model3d') r JOIN public.cms_media m ON m.id=r.media_id WHERE m.mime_type<>'image/webp') THEN PERFORM public.phase3_fail('invalid_input'); END IF;
END $f$;
REVOKE ALL ON FUNCTION public.phase3_validate_media_refs(jsonb,boolean),public.product_editor_validate_media_refs_before(jsonb,boolean) FROM PUBLIC,anon,authenticated;

ALTER TABLE public.cms_media ADD COLUMN document_sha256 text;
ALTER TABLE public.cms_media DROP CONSTRAINT cms_media_object_key_check,DROP CONSTRAINT cms_media_mime_type_check,DROP CONSTRAINT cms_media_shape_check;
ALTER TABLE public.cms_media
 ADD CONSTRAINT cms_media_object_key_check CHECK(object_key ~ '^assets/[0-9a-f-]{36}[.](webp|pdf|glb|docx)$'),
 ADD CONSTRAINT cms_media_mime_type_check CHECK(mime_type IN ('image/webp','application/pdf','model/gltf-binary','application/vnd.openxmlformats-officedocument.wordprocessingml.document')),
 ADD CONSTRAINT cms_media_shape_check CHECK(
  (mime_type='application/pdf' AND width IS NULL AND height IS NULL AND byte_size<=2097152 AND model_sha256 IS NULL AND model_triangles IS NULL AND document_sha256 IS NULL)
  OR (mime_type='image/webp' AND width BETWEEN 1 AND 8192 AND height BETWEEN 1 AND 8192 AND width IS NOT NULL AND height IS NOT NULL AND width::bigint*height<=20000000 AND model_sha256 IS NULL AND model_triangles IS NULL AND document_sha256 IS NULL)
  OR (mime_type='model/gltf-binary' AND width IS NULL AND height IS NULL AND model_sha256 IS NOT NULL AND model_sha256 ~ '^[0-9a-f]{64}$' AND model_triangles IS NOT NULL AND model_triangles BETWEEN 1 AND 2000000 AND document_sha256 IS NULL)
  OR (mime_type='application/vnd.openxmlformats-officedocument.wordprocessingml.document' AND width IS NULL AND height IS NULL AND model_sha256 IS NULL AND model_triangles IS NULL AND document_sha256 IS NOT NULL AND document_sha256 ~ '^[0-9a-f]{64}$'));

-- Reuse the existing server-only binary-validation proof; no new secret or provider configuration.
CREATE FUNCTION public.admin_register_document_media(p_id uuid,p_key text,p_url text,p_filename text,p_size integer,p_alt text,p_source text,p_sha256 text,p_validation_key text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $f$
DECLARE actor text; m public.cms_media;
BEGIN
 actor:=public.admin_assert_capability('media.manage');
 IF p_validation_key IS NULL OR p_validation_key !~ '^[0-9a-f]{64}$' OR NOT EXISTS(SELECT 1 FROM public.product_model_validation_config WHERE singleton AND key_hash=encode(sha256(convert_to(p_validation_key,'UTF8')),'hex')) THEN PERFORM public.phase3_fail('forbidden'); END IF;
 IF p_id IS NULL OR p_key IS DISTINCT FROM 'assets/'||p_id::text||'.docx' OR p_url IS NULL OR p_url NOT LIKE 'https://%' OR p_filename IS NULL OR p_filename !~ '^[[:alnum:]][[:alnum:] ._()-]{0,119}$' OR p_size IS NULL OR p_size NOT BETWEEN 1 AND 4194304 OR p_alt IS NULL OR char_length(btrim(p_alt)) NOT BETWEEN 1 AND 300 OR p_source IS NULL OR char_length(p_source)>500 OR p_sha256 IS NULL OR p_sha256 !~ '^[0-9a-f]{64}$' THEN PERFORM public.phase3_fail('invalid_input'); END IF;
 IF NOT EXISTS(SELECT 1 FROM storage.objects WHERE bucket='editorial-media' AND key=p_key AND uploaded_by=actor AND size=p_size AND mime_type='application/vnd.openxmlformats-officedocument.wordprocessingml.document') THEN PERFORM public.phase3_fail('invalid_input'); END IF;
 INSERT INTO public.cms_media(id,object_key,storage_url,filename,mime_type,byte_size,alt_text,source,created_by,document_sha256) VALUES(p_id,p_key,p_url,p_filename,'application/vnd.openxmlformats-officedocument.wordprocessingml.document',p_size,btrim(p_alt),btrim(p_source),actor,p_sha256) RETURNING * INTO m;
 INSERT INTO public.editorial_media_events(media_id,actor,action,version) VALUES(m.id,actor,'upload',m.version);
 RETURN jsonb_build_object('media',public.media_admin_dto(m));
END $f$;
REVOKE ALL ON FUNCTION public.admin_register_document_media(uuid,text,text,text,integer,text,text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.admin_register_document_media(uuid,text,text,text,integer,text,text,text,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.media_storage_allowed(p_key text,p_operation text)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $f$
DECLARE staff_read boolean:=false; staff_write boolean:=false;
BEGIN
 IF p_key IS NULL OR p_key !~ '^assets/[0-9a-f-]{36}[.](webp|pdf|glb|docx)$' THEN RETURN false; END IF;
 IF public.requesting_user_id() IS NOT NULL THEN staff_write:=public.has_capability('media.manage'); staff_read:=staff_write OR public.has_capability('catalog.edit') OR public.has_capability('content.edit'); END IF;
 IF p_operation='read' THEN RETURN staff_read OR EXISTS(SELECT 1 FROM public.cms_media WHERE object_key=p_key AND published AND NOT archived AND (mime_type<>'model/gltf-binary' OR model_public_allowed)); END IF;
 IF p_operation IN ('write','delete') THEN RETURN staff_write AND NOT EXISTS(SELECT 1 FROM public.cms_media WHERE object_key=p_key); END IF;
 RETURN false;
END $f$;
ALTER POLICY editorial_media_insert_boundary ON storage.objects WITH CHECK(bucket<>'editorial-media' OR (public.media_storage_allowed(key,'write') AND uploaded_by=public.requesting_user_id() AND size BETWEEN 1 AND 4194304 AND (mime_type IN ('image/webp','model/gltf-binary','application/vnd.openxmlformats-officedocument.wordprocessingml.document') OR (mime_type='application/pdf' AND size<=2097152))));

CREATE OR REPLACE FUNCTION public.public_get_media(p_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $f$
 SELECT jsonb_build_object('media',jsonb_build_object('id',id,'objectKey',object_key,'filename',filename,'mimeType',mime_type,'byteSize',byte_size,'width',width,'height',height,'modelSha256',model_sha256,'documentSha256',document_sha256)) FROM public.cms_media WHERE id=p_id AND published AND NOT archived AND (mime_type<>'model/gltf-binary' OR model_public_allowed)
$f$;
CREATE OR REPLACE FUNCTION public.editor_get_media(p_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $f$
BEGIN
 IF public.requesting_user_id() IS NULL THEN PERFORM public.phase3_fail('unauthenticated'); END IF;
 IF NOT(public.has_capability('media.manage') OR public.has_capability('catalog.edit') OR public.has_capability('content.edit')) THEN PERFORM public.phase3_fail('forbidden'); END IF;
 RETURN(SELECT jsonb_build_object('media',jsonb_build_object('id',id,'objectKey',object_key,'filename',filename,'mimeType',mime_type,'byteSize',byte_size,'width',width,'height',height,'modelSha256',model_sha256,'documentSha256',document_sha256)) FROM public.cms_media WHERE id=p_id AND NOT archived);
END $f$;

-- Keep catalog cards bounded: full rich content is delivered only with product detail.
ALTER FUNCTION public.published_list_products(text,uuid[],bigint,bigint,text,text,integer,integer) RENAME TO product_editor_list_products_before;
CREATE FUNCTION public.published_list_products(p_query text,p_category_ids uuid[],p_min_price_paise bigint,p_max_price_paise bigint,p_availability text,p_sort text,p_limit integer,p_offset integer)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $f$
DECLARE result jsonb;
BEGIN
 result:=public.product_editor_list_products_before(p_query,p_category_ids,p_min_price_paise,p_max_price_paise,p_availability,p_sort,p_limit,p_offset);
 RETURN jsonb_set(result,'{items}',COALESCE((SELECT jsonb_agg(jsonb_set(item,'{document}',item->'document'-'richContent') ORDER BY ord) FROM jsonb_array_elements(result->'items') WITH ORDINALITY i(item,ord)),'[]'::jsonb));
END $f$;
REVOKE ALL ON FUNCTION public.product_editor_list_products_before(text,uuid[],bigint,bigint,text,text,integer,integer),public.published_list_products(text,uuid[],bigint,bigint,text,text,integer,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.published_list_products(text,uuid[],bigint,bigint,text,text,integer,integer) TO anon,authenticated;
