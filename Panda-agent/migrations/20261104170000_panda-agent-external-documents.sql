-- Source only: additive private uploaded-document staging; does not mutate sealed product releases.
CREATE TABLE public.panda_agent_external_documents (
 intake_id uuid PRIMARY KEY REFERENCES public.panda_agent_intakes(id) ON DELETE RESTRICT,
 source_version bigint NOT NULL CHECK(source_version>0),
 original_sha256 text NOT NULL CHECK(original_sha256 ~ '^[0-9a-f]{64}$'),
 normalized_sha256 text NOT NULL CHECK(normalized_sha256 ~ '^[0-9a-f]{64}$'),
 parser_version text NOT NULL CHECK(parser_version='private-upload-v1'),
 status text NOT NULL DEFAULT 'prepared' CHECK(status IN ('prepared','withdrawn')),
 version bigint NOT NULL DEFAULT 1 CHECK(version BETWEEN 1 AND 9007199254740991),
 created_at timestamptz NOT NULL DEFAULT now(), withdrawn_at timestamptz,
 CHECK((status='prepared' AND withdrawn_at IS NULL) OR (status='withdrawn' AND withdrawn_at IS NOT NULL))
);
CREATE TABLE public.panda_agent_external_chunks (
 intake_id uuid NOT NULL REFERENCES public.panda_agent_external_documents(intake_id) ON DELETE RESTRICT,
 ordinal integer NOT NULL CHECK(ordinal BETWEEN 1 AND 256),
 text_body text NOT NULL CHECK(char_length(text_body) BETWEEN 1 AND 12000),
 text_sha256 text NOT NULL CHECK(text_sha256 ~ '^[0-9a-f]{64}$'),
 section_path jsonb NOT NULL CHECK(jsonb_typeof(section_path)='array' AND jsonb_array_length(section_path)<=12),
 PRIMARY KEY(intake_id,ordinal)
);
ALTER TABLE public.panda_agent_external_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.panda_agent_external_chunks ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.panda_agent_external_documents,public.panda_agent_external_chunks FROM PUBLIC,anon,authenticated;

-- Provisioned out of band by the privileged operator; never exposed to authenticated clients.
CREATE TABLE public.panda_agent_ingestion_signing_key (singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton), key_bytes bytea NOT NULL CHECK(octet_length(key_bytes)=32), revoked_at timestamptz);
CREATE TABLE public.panda_agent_ingestion_claims (intake_id uuid PRIMARY KEY REFERENCES public.panda_agent_intakes(id) ON DELETE RESTRICT, nonce uuid NOT NULL UNIQUE, actor text NOT NULL, source_version bigint NOT NULL CHECK(source_version>0), status text NOT NULL CHECK(status IN ('processing','prepared','failed')), lease_expires_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE public.panda_agent_ingestion_receipts (nonce uuid PRIMARY KEY, actor text NOT NULL, payload_sha256 text NOT NULL CHECK(payload_sha256 ~ '^[0-9a-f]{64}$'), intake_id uuid NOT NULL REFERENCES public.panda_agent_intakes(id) ON DELETE RESTRICT, created_at timestamptz NOT NULL DEFAULT now());
ALTER TABLE public.panda_agent_ingestion_signing_key ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.panda_agent_ingestion_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.panda_agent_ingestion_claims ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.panda_agent_ingestion_signing_key,public.panda_agent_ingestion_receipts,public.panda_agent_ingestion_claims FROM PUBLIC,anon,authenticated;
-- The caller must independently verify private storage bytes against this receipt before parsing.
CREATE FUNCTION public.panda_agent_external_source(p_reference uuid,p_version bigint,p_nonce uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE i public.panda_agent_intakes; d public.panda_agent_external_documents; claim public.panda_agent_ingestion_claims; v_actor text;
BEGIN
 v_actor:=public.panda_agent_control_room_admin();
 IF p_nonce IS NULL THEN PERFORM public.phase3_fail('invalid_input'); END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('panda-agent-external-documents-cap',0));
 SELECT * INTO i FROM public.panda_agent_intakes WHERE id=p_reference FOR UPDATE;
 IF NOT FOUND THEN PERFORM public.phase3_fail('not_found'); END IF;
 IF i.version IS DISTINCT FROM p_version OR i.kind<>'upload' OR i.status<>'accepted_for_preparation' OR i.rights_status<>'permitted' OR i.review_decision<>'accept_for_preparation' THEN PERFORM public.phase3_fail('invalid_state'); END IF;
 SELECT * INTO d FROM public.panda_agent_external_documents WHERE intake_id=p_reference;
 IF FOUND THEN
  IF d.status='prepared' AND d.source_version=p_version THEN RETURN jsonb_build_object('status','prepared','reference',d.intake_id,'version',d.version,'chunkCount',(SELECT count(*) FROM public.panda_agent_external_chunks WHERE intake_id=d.intake_id)); END IF;
  PERFORM public.phase3_fail('invalid_state');
 END IF;
 IF EXISTS(SELECT 1 FROM public.panda_agent_ingestion_claims WHERE nonce=p_nonce) THEN PERFORM public.phase3_fail('request_conflict'); END IF;
 SELECT * INTO claim FROM public.panda_agent_ingestion_claims WHERE intake_id=p_reference FOR UPDATE;
 IF FOUND THEN
  IF claim.source_version<>p_version OR (claim.status='processing' AND claim.lease_expires_at>clock_timestamp()) OR claim.status='prepared' THEN PERFORM public.phase3_fail('invalid_state'); END IF;
  UPDATE public.panda_agent_ingestion_claims SET nonce=p_nonce,actor=v_actor,source_version=p_version,status='processing',lease_expires_at=clock_timestamp()+interval '120 seconds' WHERE intake_id=p_reference;
 ELSE
  IF (SELECT count(*) FROM public.panda_agent_ingestion_claims)>=1000 THEN PERFORM public.phase3_fail('invalid_state'); END IF;
  INSERT INTO public.panda_agent_ingestion_claims(intake_id,nonce,actor,source_version,status,lease_expires_at) VALUES(p_reference,p_nonce,v_actor,p_version,'processing',clock_timestamp()+interval '120 seconds');
 END IF;
 RETURN jsonb_build_object('reference',i.id,'version',i.version,'mediaType',i.media_type,'expectedSize',i.expected_size,'expectedSha256',i.expected_sha256,'filename',i.filename);
END $$;
-- Atomic commit rechecks the reviewed source version/rights under lock; repeated exact output is idempotent.
CREATE FUNCTION public.panda_agent_external_commit(p_payload text,p_mac text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE i public.panda_agent_intakes; d public.panda_agent_external_documents; item jsonb; n integer:=0; v_actor text; payload jsonb; key_material bytea; v_nonce uuid; expiry bigint; payload_hash text; prior public.panda_agent_ingestion_receipts; p_reference uuid; p_source_version bigint; p_original_sha256 text; p_normalized_sha256 text; p_parser_version text; p_chunks jsonb;
BEGIN
 v_actor:=public.panda_agent_control_room_admin();
 IF p_payload IS NULL OR octet_length(p_payload)>1000000 OR p_mac IS NULL OR p_mac !~ '^[0-9a-f]{64}$' THEN PERFORM public.phase3_fail('invalid_input'); END IF;
 SELECT key_bytes INTO key_material FROM public.panda_agent_ingestion_signing_key WHERE singleton AND revoked_at IS NULL;
 IF key_material IS NULL OR p_mac<>encode(public.hmac(convert_to('pandabyte/external-ingestion/v1','UTF8')||decode('00','hex')||convert_to(p_payload,'UTF8'),key_material,'sha256'),'hex') THEN PERFORM public.phase3_fail('forbidden'); END IF;
 BEGIN payload:=p_payload::jsonb; EXCEPTION WHEN others THEN PERFORM public.phase3_fail('invalid_input'); END;
 IF jsonb_typeof(payload) IS DISTINCT FROM 'object' OR (SELECT count(*) FROM jsonb_object_keys(payload))<>10 OR NOT(payload ?& ARRAY['version','actor','reference','sourceVersion','originalSha256','normalizedSha256','parserVersion','chunks','nonce','expiresAt']) OR payload->'version' IS DISTINCT FROM '1'::jsonb OR payload->>'actor' IS DISTINCT FROM v_actor THEN PERFORM public.phase3_fail('invalid_input'); END IF;
 BEGIN p_reference:=(payload->>'reference')::uuid; p_source_version:=(payload->>'sourceVersion')::bigint; v_nonce:=(payload->>'nonce')::uuid; expiry:=(payload->>'expiresAt')::bigint; EXCEPTION WHEN others THEN PERFORM public.phase3_fail('invalid_input'); END;
 IF p_reference IS NULL OR p_source_version IS NULL OR p_source_version<1 OR v_nonce IS NULL OR expiry IS NULL OR expiry<floor(extract(epoch from clock_timestamp())) OR expiry>floor(extract(epoch from clock_timestamp()))+120 THEN PERFORM public.phase3_fail('invalid_input'); END IF;
 p_original_sha256:=payload->>'originalSha256';p_normalized_sha256:=payload->>'normalizedSha256';p_parser_version:=payload->>'parserVersion';p_chunks:=payload->'chunks';payload_hash:=encode(sha256(convert_to(p_payload,'UTF8')),'hex');
 PERFORM pg_advisory_xact_lock(hashtextextended('panda-agent-external-documents-cap',0));
 SELECT * INTO prior FROM public.panda_agent_ingestion_receipts WHERE panda_agent_ingestion_receipts.nonce=v_nonce;
 IF FOUND AND (prior.actor IS DISTINCT FROM v_actor OR prior.payload_sha256 IS DISTINCT FROM payload_hash OR prior.intake_id IS DISTINCT FROM p_reference) THEN PERFORM public.phase3_fail('request_conflict'); END IF;
 IF NOT EXISTS(SELECT 1 FROM public.panda_agent_ingestion_claims c WHERE c.intake_id=p_reference AND c.nonce=v_nonce AND c.actor=v_actor AND c.source_version=p_source_version AND c.status IN ('processing','prepared') AND (c.status='prepared' OR c.lease_expires_at>clock_timestamp()) FOR UPDATE) THEN PERFORM public.phase3_fail('invalid_state'); END IF;
 SELECT * INTO i FROM public.panda_agent_intakes WHERE id=p_reference FOR UPDATE;
 IF NOT FOUND THEN PERFORM public.phase3_fail('not_found'); END IF;
 IF i.version IS DISTINCT FROM p_source_version OR i.kind<>'upload' OR i.status<>'accepted_for_preparation' OR i.rights_status<>'permitted' OR i.review_decision<>'accept_for_preparation' OR i.expected_sha256 IS DISTINCT FROM p_original_sha256 THEN PERFORM public.phase3_fail('invalid_state'); END IF;
 IF p_original_sha256 !~ '^[0-9a-f]{64}$' OR p_normalized_sha256 !~ '^[0-9a-f]{64}$' OR p_parser_version IS DISTINCT FROM 'private-upload-v1' OR jsonb_typeof(p_chunks) IS DISTINCT FROM 'array' OR jsonb_array_length(p_chunks) NOT BETWEEN 1 AND 256 THEN PERFORM public.phase3_fail('invalid_input'); END IF;
 SELECT * INTO d FROM public.panda_agent_external_documents WHERE intake_id=p_reference FOR UPDATE;
 IF FOUND THEN
  IF d.status='prepared' AND d.source_version=p_source_version AND d.original_sha256=p_original_sha256 AND d.normalized_sha256=p_normalized_sha256 AND d.parser_version=p_parser_version AND (SELECT coalesce(jsonb_agg(jsonb_build_object('text',text_body,'textSha256',text_sha256,'sectionPath',section_path) ORDER BY ordinal),'[]'::jsonb) FROM public.panda_agent_external_chunks WHERE intake_id=d.intake_id)=p_chunks THEN INSERT INTO public.panda_agent_ingestion_receipts(nonce,actor,payload_sha256,intake_id) VALUES(v_nonce,v_actor,payload_hash,p_reference) ON CONFLICT(nonce) DO NOTHING; RETURN jsonb_build_object('status','prepared','reference',d.intake_id,'version',d.version); END IF;
  PERFORM public.phase3_fail('request_conflict');
 END IF;
 IF (SELECT count(*) FROM public.panda_agent_external_documents)>=1000 THEN PERFORM public.phase3_fail('invalid_state'); END IF;
 INSERT INTO public.panda_agent_external_documents(intake_id,source_version,original_sha256,normalized_sha256,parser_version) VALUES(p_reference,p_source_version,p_original_sha256,p_normalized_sha256,p_parser_version);
 FOR item IN SELECT value FROM jsonb_array_elements(p_chunks) LOOP
  n:=n+1;
  IF jsonb_typeof(item)<>'object' OR (SELECT count(*) FROM jsonb_object_keys(item))<>3 OR NOT(item ?& ARRAY['text','textSha256','sectionPath']) OR jsonb_typeof(item->'text')<>'string' OR char_length(item->>'text') NOT BETWEEN 1 AND 12000 OR item->>'textSha256' !~ '^[0-9a-f]{64}$' OR encode(sha256(convert_to(item->>'text','UTF8')),'hex')<>item->>'textSha256' OR jsonb_typeof(item->'sectionPath')<>'array' OR jsonb_array_length(item->'sectionPath')>12 OR EXISTS(SELECT 1 FROM jsonb_array_elements(item->'sectionPath') s WHERE jsonb_typeof(s)<>'string' OR char_length(s#>>'{}')>200) THEN PERFORM public.phase3_fail('invalid_input'); END IF;
  INSERT INTO public.panda_agent_external_chunks(intake_id,ordinal,text_body,text_sha256,section_path) VALUES(p_reference,n,item->>'text',item->>'textSha256',item->'sectionPath');
 END LOOP;
 INSERT INTO public.panda_agent_ingestion_receipts(nonce,actor,payload_sha256,intake_id) VALUES(v_nonce,v_actor,payload_hash,p_reference) ON CONFLICT(nonce) DO NOTHING;
 UPDATE public.panda_agent_ingestion_claims SET status='prepared' WHERE intake_id=p_reference AND nonce=v_nonce;
 RETURN jsonb_build_object('status','prepared','reference',p_reference,'version',1);
END $$;

CREATE FUNCTION public.panda_agent_external_fail(p_reference uuid,p_nonce uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE v_actor text; c public.panda_agent_ingestion_claims;
BEGIN
 v_actor:=public.panda_agent_control_room_admin();
 UPDATE public.panda_agent_ingestion_claims SET status='failed' WHERE intake_id=p_reference AND nonce=p_nonce AND actor=v_actor AND status='processing' AND lease_expires_at>clock_timestamp() RETURNING * INTO c;
 IF NOT FOUND THEN PERFORM public.phase3_fail('invalid_state'); END IF;
 RETURN jsonb_build_object('reference',c.intake_id,'status','failed');
END $$;
CREATE FUNCTION public.panda_agent_external_withdraw(p_reference uuid,p_version bigint) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE d public.panda_agent_external_documents;
BEGIN
 PERFORM public.panda_agent_control_room_admin();
 UPDATE public.panda_agent_external_documents SET status='withdrawn',withdrawn_at=now(),version=version+1 WHERE intake_id=p_reference AND version=p_version AND status='prepared' RETURNING * INTO d;
 IF NOT FOUND THEN PERFORM public.phase3_fail('version_conflict'); END IF;
 RETURN jsonb_build_object('status','withdrawn','reference',d.intake_id,'version',d.version);
END $$;
REVOKE ALL ON FUNCTION public.panda_agent_external_source(uuid,bigint,uuid),public.panda_agent_external_commit(text,text),public.panda_agent_external_fail(uuid,uuid),public.panda_agent_external_withdraw(uuid,bigint) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.panda_agent_external_source(uuid,bigint,uuid),public.panda_agent_external_commit(text,text),public.panda_agent_external_fail(uuid,uuid),public.panda_agent_external_withdraw(uuid,bigint) TO authenticated;


-- Admin-only metadata listing; product candidate and uploaded-document lifecycle stay separate.
CREATE FUNCTION public.panda_agent_external_documents_list(p_query text DEFAULT '',p_limit integer DEFAULT 20,p_after_title text DEFAULT NULL,p_after_kind text DEFAULT NULL,p_after_key text DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE catalog jsonb; result jsonb;
BEGIN
 PERFORM public.panda_agent_control_room_admin();
 IF p_query IS NULL OR char_length(p_query)>100 OR p_query ~ '[[:cntrl:]]' OR p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 50 OR (p_after_title IS NULL)<>(p_after_kind IS NULL) OR (p_after_title IS NULL)<>(p_after_key IS NULL) OR (p_after_title IS NOT NULL AND (char_length(p_after_title)>300 OR p_after_kind NOT IN ('product_listing','uploaded_document') OR char_length(p_after_key)>128)) THEN PERFORM public.phase3_fail('invalid_input'); END IF;
 catalog:=public.panda_agent_runtime_products();
 WITH eligible_counts AS (SELECT sku,count(*) n FROM public.panda_agent_runtime_eligible((public.panda_agent_runtime_candidate()).id) WHERE logical_chunk_id NOT IN ('21638b9445898f6a03aa24d24a7e60cc344c6bbb2bccd33959537178c2bd4fb4','3ea5b9267d4102142b48cf8e5393e1f9a42fe0c3ff283c13cff04b5bdf3864ac') GROUP BY sku), entries AS (
  SELECT lower(j->>'title') AS sort_title,'product_listing'::text AS kind,j->>'sku' AS sort_key,
    jsonb_build_object('kind','product_listing','title',j->>'title','sku',j->>'sku','status','available','chunkCount',coalesce(ec.n,0)) AS item
  FROM jsonb_array_elements(catalog->'items') j LEFT JOIN eligible_counts ec ON ec.sku=j->>'sku'
  UNION ALL
  SELECT lower(i.title),'uploaded_document',i.id::text,
    jsonb_build_object('kind','uploaded_document','title',i.title,'reference',i.id,'status',d.status,'version',d.version,'createdAt',d.created_at,'chunkCount',(SELECT count(*) FROM public.panda_agent_external_chunks c WHERE c.intake_id=i.id))
  FROM public.panda_agent_external_documents d JOIN public.panda_agent_intakes i ON i.id=d.intake_id
  WHERE i.kind='upload' AND i.status='accepted_for_preparation' AND i.rights_status='permitted' AND i.version=d.source_version
  UNION ALL
  SELECT lower(i.title),'uploaded_document',i.id::text,
    jsonb_build_object('kind','uploaded_document','title',i.title,'reference',i.id,'status',c.status,'sourceVersion',c.source_version,'createdAt',c.created_at,'canRetry',(c.status='failed' OR c.lease_expires_at<=clock_timestamp()))
  FROM public.panda_agent_ingestion_claims c JOIN public.panda_agent_intakes i ON i.id=c.intake_id
  WHERE c.status IN ('processing','failed') AND NOT EXISTS(SELECT 1 FROM public.panda_agent_external_documents d WHERE d.intake_id=c.intake_id) AND i.kind='upload' AND i.status='accepted_for_preparation' AND i.rights_status='permitted' AND i.version=c.source_version
 ), filtered AS (
  SELECT * FROM entries WHERE (p_query='' OR strpos(sort_title,lower(p_query))>0 OR (kind='product_listing' AND strpos(lower(sort_key),lower(p_query))>0))
   AND (p_after_title IS NULL OR (sort_title,kind,sort_key)>(p_after_title,p_after_kind,p_after_key))
 ), page AS (SELECT * FROM filtered ORDER BY sort_title,kind,sort_key LIMIT p_limit+1), visible AS (SELECT * FROM page ORDER BY sort_title,kind,sort_key LIMIT p_limit)
 SELECT jsonb_build_object('items',coalesce((SELECT jsonb_agg(item ORDER BY sort_title,kind,sort_key) FROM visible),'[]'::jsonb),
 'nextCursor',CASE WHEN (SELECT count(*) FROM page)>p_limit THEN (SELECT jsonb_build_object('title',sort_title,'kind',kind,'key',sort_key) FROM visible ORDER BY sort_title DESC,kind DESC,sort_key DESC LIMIT 1) ELSE NULL END,
 'stats',jsonb_build_object('productDocuments',jsonb_array_length(catalog->'items'),'productChunks',(SELECT coalesce(sum((item->>'chunkCount')::bigint),0) FROM entries WHERE kind='product_listing'),'uploadedDocuments',(SELECT count(*) FROM public.panda_agent_external_documents d JOIN public.panda_agent_intakes i ON i.id=d.intake_id WHERE d.status='prepared' AND i.status='accepted_for_preparation' AND i.rights_status='permitted' AND i.version=d.source_version),'uploadedChunks',(SELECT count(*) FROM public.panda_agent_external_chunks c JOIN public.panda_agent_external_documents d ON d.intake_id=c.intake_id JOIN public.panda_agent_intakes i ON i.id=d.intake_id WHERE d.status='prepared' AND i.status='accepted_for_preparation' AND i.rights_status='permitted' AND i.version=d.source_version))) INTO result;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.panda_agent_external_documents_list(text,integer,text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.panda_agent_external_documents_list(text,integer,text,text,text) TO authenticated;








-- Private inspection/retrieval projection. Every read rechecks current rights, source version and withdrawal.
CREATE FUNCTION public.panda_agent_external_document_read(p_reference uuid,p_version bigint) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE d public.panda_agent_external_documents; i public.panda_agent_intakes; chunks jsonb; fingerprint text;
BEGIN
 PERFORM public.panda_agent_control_room_admin();
 SELECT * INTO i FROM public.panda_agent_intakes WHERE id=p_reference AND kind='upload' AND status='accepted_for_preparation' AND rights_status='permitted' AND review_decision='accept_for_preparation' FOR SHARE;
 IF NOT FOUND THEN PERFORM public.phase3_fail('not_found'); END IF;
 SELECT * INTO d FROM public.panda_agent_external_documents WHERE intake_id=p_reference AND source_version=i.version AND version=p_version AND status='prepared' FOR SHARE;
 IF NOT FOUND THEN PERFORM public.phase3_fail('not_found'); END IF;
 IF EXISTS(SELECT 1 FROM public.panda_agent_external_chunks WHERE intake_id=d.intake_id AND encode(sha256(convert_to(text_body,'UTF8')),'hex')<>text_sha256) THEN PERFORM public.phase3_fail('invalid_state'); END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('ordinal',ordinal,'text',text_body,'textSha256',text_sha256,'sectionPath',section_path) ORDER BY ordinal),'[]'::jsonb) INTO chunks FROM public.panda_agent_external_chunks WHERE intake_id=d.intake_id;
 IF jsonb_array_length(chunks) NOT BETWEEN 1 AND 256 THEN PERFORM public.phase3_fail('invalid_state'); END IF;
 fingerprint:=encode(sha256(convert_to(jsonb_build_array(d.intake_id,d.version,d.source_version,d.original_sha256,d.normalized_sha256,d.parser_version,chunks)::text,'UTF8')),'hex');
 RETURN jsonb_build_object('reference',d.intake_id,'version',d.version,'title',i.title,'status','prepared','fingerprint',fingerprint,'chunks',chunks);
END $$;
REVOKE ALL ON FUNCTION public.panda_agent_external_document_read(uuid,bigint) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.panda_agent_external_document_read(uuid,bigint) TO authenticated;



-- Reconciliation never clears an uncertain claim; retry is offered only after expiry or a known parser failure.
CREATE FUNCTION public.panda_agent_external_status(p_reference uuid,p_source_version bigint) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE i public.panda_agent_intakes; d public.panda_agent_external_documents; c public.panda_agent_ingestion_claims;
BEGIN
 PERFORM public.panda_agent_control_room_admin();
 SELECT * INTO i FROM public.panda_agent_intakes WHERE id=p_reference AND kind='upload' AND version=p_source_version AND status='accepted_for_preparation' AND rights_status='permitted' AND review_decision='accept_for_preparation';
 IF NOT FOUND THEN PERFORM public.phase3_fail('not_found'); END IF;
 SELECT * INTO d FROM public.panda_agent_external_documents WHERE intake_id=i.id AND source_version=i.version;
 IF FOUND THEN RETURN jsonb_build_object('reference',i.id,'sourceVersion',i.version,'status',d.status,'canRetry',false,'version',d.version,'chunkCount',(SELECT count(*) FROM public.panda_agent_external_chunks WHERE intake_id=d.intake_id)); END IF;
 SELECT * INTO c FROM public.panda_agent_ingestion_claims WHERE intake_id=i.id AND source_version=i.version;
 IF FOUND THEN RETURN jsonb_build_object('reference',i.id,'sourceVersion',i.version,'status',c.status,'canRetry',(c.status='failed' OR c.status='processing' AND c.lease_expires_at<=clock_timestamp())); END IF;
 RETURN jsonb_build_object('reference',i.id,'sourceVersion',i.version,'status','not_started','canRetry',true);
END $$;
REVOKE ALL ON FUNCTION public.panda_agent_external_status(uuid,bigint) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.panda_agent_external_status(uuid,bigint) TO authenticated;


