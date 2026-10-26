-- Additive development 3D media. No product, price, stock or publication data changes.
-- Forward rollback: withdraw model references before a separately reviewed compensating migration.
ALTER TABLE public.cms_media
 ADD COLUMN model_sha256 text,
 ADD COLUMN model_triangles integer,
 ADD COLUMN model_public_allowed boolean NOT NULL DEFAULT false;
ALTER TABLE public.cms_media DROP CONSTRAINT cms_media_object_key_check,
 DROP CONSTRAINT cms_media_mime_type_check, DROP CONSTRAINT cms_media_check;
ALTER TABLE public.cms_media
 ADD CONSTRAINT cms_media_object_key_check CHECK(object_key ~ '^assets/[0-9a-f-]{36}[.](webp|pdf|glb)$'),
 ADD CONSTRAINT cms_media_mime_type_check CHECK(mime_type IN ('image/webp','application/pdf','model/gltf-binary')),
 ADD CONSTRAINT cms_media_shape_check CHECK(
  (mime_type='application/pdf' AND width IS NULL AND height IS NULL AND byte_size<=2097152 AND model_sha256 IS NULL AND model_triangles IS NULL)
  OR (mime_type='image/webp' AND width BETWEEN 1 AND 8192 AND height BETWEEN 1 AND 8192 AND width IS NOT NULL AND height IS NOT NULL AND width::bigint*height<=20000000 AND model_sha256 IS NULL AND model_triangles IS NULL)
  OR (mime_type='model/gltf-binary' AND width IS NULL AND height IS NULL AND model_sha256 IS NOT NULL AND model_sha256 ~ '^[0-9a-f]{64}$' AND model_triangles IS NOT NULL AND model_triangles BETWEEN 1 AND 2000000)),
 ADD CONSTRAINT cms_media_model_public_check CHECK(mime_type<>'model/gltf-binary' OR NOT published OR model_public_allowed);

CREATE TABLE public.product_model_validation_config (
 singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
 key_hash text NOT NULL CHECK(key_hash ~ '^[0-9a-f]{64}$')
);
ALTER TABLE public.product_model_validation_config ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.product_model_validation_config FROM PUBLIC,anon,authenticated;

-- Separate registration proof prevents a media editor bypassing the server binary validator via RPC.
CREATE FUNCTION public.admin_register_model_media(p_id uuid,p_key text,p_url text,p_filename text,p_size integer,p_alt text,p_source text,p_sha256 text,p_triangles integer,p_public_allowed boolean,p_validation_key text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $f$
DECLARE actor text; m public.cms_media;
BEGIN
 actor:=public.admin_assert_capability('media.manage');
 IF p_validation_key IS NULL OR p_validation_key !~ '^[0-9a-f]{64}$' OR NOT EXISTS(
  SELECT 1 FROM public.product_model_validation_config WHERE singleton AND key_hash=encode(sha256(convert_to(p_validation_key,'UTF8')),'hex'))
 THEN PERFORM public.phase3_fail('forbidden'); END IF;
 IF p_id IS NULL OR p_key IS DISTINCT FROM ('assets/'||p_id::text||'.glb')
  OR p_url IS NULL OR p_url NOT LIKE 'https://%' OR p_filename IS NULL OR p_filename !~ '^[[:alnum:]][[:alnum:] ._()-]{0,119}$'
  OR p_size IS NULL OR p_size NOT BETWEEN 1 AND 4194304 OR p_alt IS NULL OR char_length(btrim(p_alt)) NOT BETWEEN 1 AND 300
  OR p_source IS NULL OR char_length(p_source)>500 OR p_sha256 IS NULL OR p_sha256 !~ '^[0-9a-f]{64}$'
  OR p_triangles IS NULL OR p_triangles NOT BETWEEN 1 AND 2000000 OR p_public_allowed IS NULL
 THEN PERFORM public.phase3_fail('invalid_input'); END IF;
 IF p_public_allowed THEN PERFORM public.admin_assert_capability('content.publish'); END IF;
 IF NOT EXISTS(SELECT 1 FROM storage.objects WHERE bucket='editorial-media' AND key=p_key AND uploaded_by=actor AND size=p_size AND mime_type='model/gltf-binary')
 THEN PERFORM public.phase3_fail('invalid_input'); END IF;
 INSERT INTO public.cms_media(id,object_key,storage_url,filename,mime_type,byte_size,alt_text,source,created_by,model_sha256,model_triangles,model_public_allowed)
 VALUES(p_id,p_key,p_url,p_filename,'model/gltf-binary',p_size,btrim(p_alt),btrim(p_source),actor,p_sha256,p_triangles,p_public_allowed) RETURNING * INTO m;
 INSERT INTO public.editorial_media_events(media_id,actor,action,version) VALUES(m.id,actor,'upload',m.version);
 RETURN jsonb_build_object('media',public.media_admin_dto(m));
END $f$;
REVOKE ALL ON FUNCTION public.admin_register_model_media(uuid,text,text,text,integer,text,text,text,integer,boolean,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.admin_register_model_media(uuid,text,text,text,integer,text,text,text,integer,boolean,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.media_admin_dto(p_media public.cms_media)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $f$
 SELECT jsonb_build_object('id',p_media.id,'filename',p_media.filename,'mimeType',p_media.mime_type,
  'byteSize',p_media.byte_size,'width',p_media.width,'height',p_media.height,'altText',p_media.alt_text,
  'source',p_media.source,'version',p_media.version,'published',p_media.published,'archived',p_media.archived,
  'referenced',public.media_referenced(p_media.id,false),'url','/api/media/'||p_media.id::text,
  'publicUseAllowed',CASE WHEN p_media.mime_type='model/gltf-binary' THEN p_media.model_public_allowed ELSE NULL END,
  'triangles',p_media.model_triangles)
$f$;

CREATE OR REPLACE FUNCTION public.admin_list_media(p_query text DEFAULT '',p_limit integer DEFAULT 25,p_offset integer DEFAULT 0)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $f$
DECLARE items jsonb; total bigint;
BEGIN
 IF public.requesting_user_id() IS NULL THEN PERFORM public.phase3_fail('unauthenticated'); END IF;
 IF NOT(public.has_capability('media.manage') OR public.has_capability('catalog.edit') OR public.has_capability('content.edit')) THEN PERFORM public.phase3_fail('forbidden'); END IF;
 IF p_query IS NULL OR char_length(p_query)>100 OR p_limit IS NULL OR p_offset IS NULL OR p_limit NOT BETWEEN 1 AND 50 OR p_offset NOT BETWEEN 0 AND 1000000 THEN PERFORM public.phase3_fail('invalid_input'); END IF;
 SELECT count(*) INTO total FROM public.cms_media WHERE NOT archived AND (filename ILIKE '%'||p_query||'%' OR alt_text ILIKE '%'||p_query||'%');
 SELECT COALESCE(jsonb_agg(public.media_admin_dto(m::public.cms_media) ORDER BY m.created_at DESC,m.id),'[]'::jsonb) INTO items FROM(
 SELECT * FROM public.cms_media WHERE NOT archived AND (filename ILIKE '%'||p_query||'%' OR alt_text ILIKE '%'||p_query||'%') ORDER BY created_at DESC,id LIMIT p_limit OFFSET p_offset) m;
 RETURN jsonb_build_object('items',items,'total',total);
END $f$;

CREATE FUNCTION public.admin_update_model_media(p_id uuid,p_expected_version bigint,p_alt text,p_source text,p_published boolean,p_public_allowed boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $f$
DECLARE actor text; m public.cms_media;
BEGIN
 actor:=public.admin_assert_capability('media.manage');
 PERFORM pg_advisory_xact_lock(832641);
 SELECT * INTO m FROM public.cms_media WHERE id=p_id FOR UPDATE;
 IF NOT FOUND OR m.mime_type<>'model/gltf-binary' THEN PERFORM public.phase3_fail('media_not_found'); END IF;
 IF p_expected_version IS NULL OR p_expected_version<>m.version THEN PERFORM public.phase3_fail('version_conflict'); END IF;
 IF p_public_allowed IS NULL OR p_published IS NULL OR m.archived OR (p_published AND NOT p_public_allowed) THEN PERFORM public.phase3_fail('invalid_state'); END IF;
 IF p_published<>m.published OR p_public_allowed<>m.model_public_allowed THEN PERFORM public.admin_assert_capability('content.publish'); END IF;
 IF NOT p_published AND public.media_referenced(m.id,true) THEN PERFORM public.phase3_fail('media_referenced'); END IF;
 IF p_alt IS NULL OR char_length(btrim(p_alt)) NOT BETWEEN 1 AND 300 OR p_source IS NULL OR char_length(p_source)>500 THEN PERFORM public.phase3_fail('invalid_input'); END IF;
 UPDATE public.cms_media SET alt_text=btrim(p_alt),source=btrim(p_source),published=p_published,model_public_allowed=p_public_allowed,version=version+1,updated_at=now() WHERE id=p_id RETURNING * INTO m;
 INSERT INTO public.editorial_media_events(media_id,actor,action,version) VALUES(m.id,actor,'update',m.version);
 RETURN jsonb_build_object('media',public.media_admin_dto(m));
END $f$;
REVOKE ALL ON FUNCTION public.admin_update_model_media(uuid,bigint,text,text,boolean,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.admin_update_model_media(uuid,bigint,text,text,boolean,boolean) TO authenticated;

ALTER FUNCTION public.phase3_validate_document(text,jsonb) RENAME TO product_models_validate_document_before;
CREATE FUNCTION public.phase3_validate_document(p_kind text,p_document jsonb)
RETURNS void LANGUAGE plpgsql STABLE SET search_path=pg_catalog,public,pg_temp AS $f$
DECLARE v jsonb:=p_document->'model3d';
BEGIN
 IF p_document ? 'model3d' THEN
  IF p_kind<>'product' OR jsonb_typeof(v) IS DISTINCT FROM 'object' THEN PERFORM public.phase3_fail('invalid_input'); END IF;
  IF (SELECT count(*) FROM jsonb_object_keys(v))<>3 OR NOT(v ?& ARRAY['mediaId','posterId','alt'])
   OR jsonb_typeof(v->'mediaId') IS DISTINCT FROM 'string' OR (v->>'mediaId') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
   OR jsonb_typeof(v->'posterId') IS DISTINCT FROM 'string' OR (v->>'posterId') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
   OR v->>'mediaId'=v->>'posterId' OR jsonb_typeof(v->'alt') IS DISTINCT FROM 'string'
   OR char_length(btrim(v->>'alt')) NOT BETWEEN 1 AND 300 OR (v->>'alt') ~ '[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]'
  THEN PERFORM public.phase3_fail('invalid_input'); END IF;
 END IF;
 PERFORM public.product_models_validate_document_before(p_kind,p_document-'model3d');
END $f$;
REVOKE ALL ON FUNCTION public.phase3_validate_document(text,jsonb),public.product_models_validate_document_before(text,jsonb) FROM PUBLIC,anon,authenticated;

ALTER FUNCTION public.phase3_document_media_ids(jsonb) RENAME TO product_models_document_media_ids_before;
CREATE FUNCTION public.phase3_document_media_ids(p_document jsonb)
RETURNS TABLE(media_id uuid) LANGUAGE sql IMMUTABLE SET search_path=pg_catalog,public AS $f$
 SELECT media_id FROM public.product_models_document_media_ids_before(p_document)
 UNION SELECT (p_document->'model3d'->>'mediaId')::uuid WHERE p_document ? 'model3d'
 UNION SELECT (p_document->'model3d'->>'posterId')::uuid WHERE p_document ? 'model3d'
$f$;
REVOKE ALL ON FUNCTION public.phase3_document_media_ids(jsonb),public.product_models_document_media_ids_before(jsonb) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.phase3_document_uses_media(p_document jsonb,p_media_id uuid)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path=pg_catalog,public AS $f$
 SELECT EXISTS(SELECT 1 FROM public.phase3_document_media_ids(p_document) ids WHERE ids.media_id=p_media_id)
$f$;

ALTER FUNCTION public.phase3_validate_media_refs(jsonb,boolean) RENAME TO product_models_validate_media_refs_before;
CREATE FUNCTION public.phase3_validate_media_refs(p_document jsonb,p_require_public boolean)
RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $f$
BEGIN
 PERFORM public.product_models_validate_media_refs_before(p_document,p_require_public);
 IF EXISTS(SELECT 1 FROM public.product_models_document_media_ids_before(p_document) r JOIN public.cms_media m ON m.id=r.media_id WHERE m.mime_type='model/gltf-binary') THEN PERFORM public.phase3_fail('invalid_input'); END IF;
 IF p_document ? 'model3d' AND NOT EXISTS(
  SELECT 1 FROM public.cms_media m JOIN public.cms_media p ON p.id=(p_document->'model3d'->>'posterId')::uuid
  WHERE m.id=(p_document->'model3d'->>'mediaId')::uuid AND m.mime_type='model/gltf-binary' AND p.mime_type='image/webp'
   AND NOT m.archived AND NOT p.archived AND (NOT p_require_public OR (m.published AND m.model_public_allowed AND p.published)))
 THEN PERFORM public.phase3_fail('invalid_state'); END IF;
END $f$;
REVOKE ALL ON FUNCTION public.phase3_validate_media_refs(jsonb,boolean),public.product_models_validate_media_refs_before(jsonb,boolean) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.media_referenced(p_id uuid,p_live_only boolean DEFAULT false)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $f$
 SELECT EXISTS(SELECT 1 FROM public.cms_records r LEFT JOIN public.cms_revisions v ON v.id=r.published_revision_id
  WHERE (NOT p_live_only AND public.phase3_document_uses_media(r.draft,p_id)) OR (v.id IS NOT NULL AND public.phase3_document_uses_media(v.document,p_id)))
 OR (NOT p_live_only AND EXISTS(SELECT 1 FROM public.cms_revisions v WHERE public.phase3_document_uses_media(v.document,p_id)))
$f$;

ALTER FUNCTION public.phase3_public_document(text,jsonb) RENAME TO product_models_public_document_before;
CREATE FUNCTION public.phase3_public_document(p_kind text,p_document jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $f$
DECLARE v jsonb:=public.product_models_public_document_before(p_kind,p_document);
BEGIN
 IF p_kind='product' AND v ? 'model3d' AND NOT EXISTS(
  SELECT 1 FROM public.cms_media m JOIN public.cms_media p ON p.id=(v->'model3d'->>'posterId')::uuid
  WHERE m.id=(v->'model3d'->>'mediaId')::uuid AND m.mime_type='model/gltf-binary' AND m.published AND m.model_public_allowed AND NOT m.archived AND p.mime_type='image/webp' AND p.published AND NOT p.archived)
 THEN v:=v-'model3d'; END IF;
 RETURN v;
END $f$;
REVOKE ALL ON FUNCTION public.phase3_public_document(text,jsonb),public.product_models_public_document_before(text,jsonb) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.media_storage_allowed(p_key text,p_operation text)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $f$
DECLARE staff_read boolean:=false; staff_write boolean:=false;
BEGIN
 IF p_key IS NULL OR p_key !~ '^assets/[0-9a-f-]{36}[.](webp|pdf|glb)$' THEN RETURN false; END IF;
 IF public.requesting_user_id() IS NOT NULL THEN staff_write:=public.has_capability('media.manage'); staff_read:=staff_write OR public.has_capability('catalog.edit') OR public.has_capability('content.edit'); END IF;
 IF p_operation='read' THEN RETURN staff_read OR EXISTS(SELECT 1 FROM public.cms_media WHERE object_key=p_key AND published AND NOT archived AND (mime_type<>'model/gltf-binary' OR model_public_allowed)); END IF;
 IF p_operation IN ('write','delete') THEN RETURN staff_write AND NOT EXISTS(SELECT 1 FROM public.cms_media WHERE object_key=p_key); END IF;
 RETURN false;
END $f$;
-- Storage-specific policy change; retain customer bucket boundaries and no-overwrite policy.
ALTER POLICY editorial_media_insert_boundary ON storage.objects WITH CHECK(bucket<>'editorial-media' OR
 (public.media_storage_allowed(key,'write') AND uploaded_by=public.requesting_user_id() AND size BETWEEN 1 AND 4194304 AND (mime_type IN ('image/webp','model/gltf-binary') OR (mime_type='application/pdf' AND size<=2097152))));

CREATE OR REPLACE FUNCTION public.public_get_media(p_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $f$
 SELECT jsonb_build_object('media',jsonb_build_object('id',id,'objectKey',object_key,'filename',filename,'mimeType',mime_type,'byteSize',byte_size,'width',width,'height',height,'modelSha256',model_sha256))
 FROM public.cms_media WHERE id=p_id AND published AND NOT archived AND (mime_type<>'model/gltf-binary' OR model_public_allowed)
$f$;
CREATE OR REPLACE FUNCTION public.editor_get_media(p_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $f$
BEGIN
 IF public.requesting_user_id() IS NULL THEN PERFORM public.phase3_fail('unauthenticated'); END IF;
 IF NOT(public.has_capability('media.manage') OR public.has_capability('catalog.edit') OR public.has_capability('content.edit')) THEN PERFORM public.phase3_fail('forbidden'); END IF;
 RETURN(SELECT jsonb_build_object('media',jsonb_build_object('id',id,'objectKey',object_key,'filename',filename,'mimeType',mime_type,'byteSize',byte_size,'width',width,'height',height,'modelSha256',model_sha256)) FROM public.cms_media WHERE id=p_id AND NOT archived);
END $f$;
