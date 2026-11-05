-- Forward-only development diagnostics. No existing corpus or identity changes.
CREATE TABLE public.panda_agent_vendor_documents (
 id text PRIMARY KEY, title text NOT NULL, canonical_url text NOT NULL UNIQUE,
 chip text NOT NULL, framework text NOT NULL CHECK(framework='esp-idf'),framework_version text NOT NULL,
 current_version uuid,version integer NOT NULL DEFAULT 0 CHECK(version>=0)
);
CREATE TABLE public.panda_agent_vendor_versions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),document_id text NOT NULL REFERENCES public.panda_agent_vendor_documents(id),
 content_hash text NOT NULL CHECK(content_hash~'^[a-f0-9]{64}$'),fragments jsonb NOT NULL,
 captured_at timestamptz NOT NULL,status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','withdrawn')),
 rights_status text NOT NULL DEFAULT 'unknown' CHECK(rights_status IN ('unknown','permitted','denied')),
 rights_evidence text NOT NULL,attribution text NOT NULL,created_by text NOT NULL,reviewed_by text,reviewed_at timestamptz,
 UNIQUE(document_id,content_hash)
);
ALTER TABLE public.panda_agent_vendor_documents ADD CONSTRAINT panda_agent_vendor_current FOREIGN KEY(current_version) REFERENCES public.panda_agent_vendor_versions(id);
CREATE TABLE public.panda_agent_document_events (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,document_id text NOT NULL REFERENCES public.panda_agent_vendor_documents(id),
 version_id uuid NOT NULL REFERENCES public.panda_agent_vendor_versions(id),action text NOT NULL,actor text NOT NULL,reason text NOT NULL,at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE public.panda_agent_tools (
 id text PRIMARY KEY,enabled boolean NOT NULL DEFAULT false,version integer NOT NULL DEFAULT 0,
 manifest jsonb NOT NULL,manifest_hash text NOT NULL CHECK(manifest_hash~'^[a-f0-9]{64}$')
);
CREATE TABLE public.panda_agent_tool_events (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,tool_id text NOT NULL REFERENCES public.panda_agent_tools(id),
 enabled boolean NOT NULL,actor text NOT NULL,reason text NOT NULL,at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE public.panda_agent_diagnostic_assets (
 id uuid PRIMARY KEY,thread_id uuid NOT NULL REFERENCES public.panda_agent_chats(id) ON DELETE CASCADE,owner_subject text NOT NULL,
 image_hash text NOT NULL CHECK(image_hash~'^[a-f0-9]{64}$'),input_hash text NOT NULL CHECK(input_hash~'^[a-f0-9]{64}$'),
 bytes integer NOT NULL CHECK(bytes BETWEEN 1 AND 2097152),width integer NOT NULL CHECK(width BETWEEN 1 AND 2048),height integer NOT NULL CHECK(height BETWEEN 1 AND 2048),
 expires_at timestamptz NOT NULL,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 status text NOT NULL DEFAULT 'reserved' CHECK(status IN ('reserved','ready','unknown','deleted','expired'))
);
CREATE INDEX panda_agent_diagnostic_asset_owner ON public.panda_agent_diagnostic_assets(owner_subject,created_at DESC);
CREATE TABLE public.panda_agent_diagnostic_turns (
 thread_id uuid NOT NULL,request_id uuid NOT NULL,owner_subject text NOT NULL,input jsonb NOT NULL,qa_skill_epoch integer NOT NULL,
 scope_hash text,bindings jsonb NOT NULL DEFAULT '[]',tool_epoch integer,tool_dispatched boolean NOT NULL DEFAULT false,tool_result jsonb,
 PRIMARY KEY(thread_id,request_id),FOREIGN KEY(thread_id,request_id) REFERENCES public.panda_agent_chat_turns(thread_id,request_id) ON DELETE CASCADE
);
DO $$ DECLARE t text;BEGIN
 FOREACH t IN ARRAY ARRAY['panda_agent_vendor_documents','panda_agent_vendor_versions','panda_agent_document_events','panda_agent_tools','panda_agent_tool_events','panda_agent_diagnostic_assets','panda_agent_diagnostic_turns'] LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,anon,authenticated',t);
 END LOOP;
END $$;

CREATE FUNCTION public.panda_agent_diagnostic_verify(p_payload text,p_mac text,p_action text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE v jsonb;expected text;fields text[];BEGIN
 IF public.requesting_user_id() IS NULL THEN PERFORM public.phase3_fail('unauthenticated');END IF;
 IF p_payload IS NULL OR octet_length(p_payload)>65536 OR coalesce(p_mac,'')!~'^[a-f0-9]{64}$' THEN PERFORM public.phase3_fail('invalid');END IF;
 SELECT encode(public.hmac(convert_to('panda-diagnostic-db-v1'||chr(10)||p_payload,'UTF8'),key_bytes,'sha256'),'hex') INTO expected FROM public.panda_agent_lightweight_key WHERE singleton;
 IF expected IS NULL OR sha256(decode(expected,'hex'))<>sha256(decode(p_mac,'hex')) THEN PERFORM public.phase3_fail('unauthenticated');END IF;
 v:=p_payload::jsonb;
 fields:=CASE p_action WHEN 'begin' THEN ARRAY['thread','request','diagnostic'] WHEN 'complete' THEN ARRAY['thread','request','answer','scopeHash','bindings'] WHEN 'capture' THEN ARRAY['catalogId','contentHash','fragments','fetchedAt','rightsEvidence','attribution'] WHEN 'assetreserve' THEN ARRAY['thread','asset','sha256','inputSha256','bytes','width','height'] WHEN 'assetrecord' THEN ARRAY['thread','asset','state'] WHEN 'toolclaim' THEN ARRAY['thread','request','toolVersion'] WHEN 'toolrecord' THEN ARRAY['thread','request','toolVersion','result'] END;
 fields:=fields||ARRAY['v','action','subject','exp'];
 IF fields IS NULL OR cardinality(fields)<=4 OR jsonb_typeof(v) IS DISTINCT FROM 'object' OR NOT v?&fields OR (SELECT count(*) FROM jsonb_object_keys(v))<>cardinality(fields) OR v->'v' IS DISTINCT FROM '1'::jsonb OR v->>'action' IS DISTINCT FROM p_action OR v->>'subject' IS DISTINCT FROM public.requesting_user_id() OR jsonb_typeof(v->'exp') IS DISTINCT FROM 'number' OR coalesce(v->>'exp','')!~'^[0-9]{1,11}$' THEN PERFORM public.phase3_fail('invalid');END IF;
 IF (v->>'exp')::bigint<extract(epoch FROM clock_timestamp()) OR (v->>'exp')::bigint>extract(epoch FROM clock_timestamp())+65 THEN PERFORM public.phase3_fail('unauthenticated');END IF;RETURN v;
END $$;
REVOKE ALL ON FUNCTION public.panda_agent_diagnostic_verify(text,text,text) FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.panda_agent_diagnostic_asset_projection(a public.panda_agent_diagnostic_assets) RETURNS jsonb LANGUAGE sql STABLE AS $$
 SELECT jsonb_build_object('assetId',a.id,'threadId',a.thread_id,'sha256',a.image_hash,'inputSha256',a.input_hash,'bytes',a.bytes,'width',a.width,'height',a.height,'expiresAt',floor(extract(epoch FROM a.expires_at))::bigint,'status',CASE WHEN a.status='deleted' THEN 'deleted' WHEN a.expires_at<=clock_timestamp() THEN 'expired' ELSE a.status END)
$$;
REVOKE ALL ON FUNCTION public.panda_agent_diagnostic_asset_projection(public.panda_agent_diagnostic_assets) FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.panda_agent_diagnostic_asset_read(p_thread uuid,p_asset uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE a public.panda_agent_diagnostic_assets;BEGIN
 IF public.requesting_user_id() IS NULL THEN PERFORM public.phase3_fail('unauthenticated');END IF;
 PERFORM 1 FROM public.panda_agent_chats WHERE id=p_thread AND owner_subject=public.requesting_user_id() FOR SHARE;IF NOT FOUND THEN PERFORM public.phase3_fail('not_found');END IF;
 SELECT * INTO a FROM public.panda_agent_diagnostic_assets WHERE id=p_asset AND thread_id=p_thread AND owner_subject=public.requesting_user_id();IF NOT FOUND THEN PERFORM public.phase3_fail('not_found');END IF;
 RETURN public.panda_agent_diagnostic_asset_projection(a);
END $$;
CREATE FUNCTION public.panda_agent_diagnostic_assetreserve(p_payload text,p_mac text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE v jsonb;a public.panda_agent_diagnostic_assets;BEGIN
 v:=public.panda_agent_diagnostic_verify(p_payload,p_mac,'assetreserve');
 IF coalesce(v->>'sha256','')!~'^[a-f0-9]{64}$' OR coalesce(v->>'inputSha256','')!~'^[a-f0-9]{64}$' OR jsonb_typeof(v->'bytes') IS DISTINCT FROM 'number' OR coalesce(v->>'bytes','')!~'^[1-9][0-9]{0,6}$' OR (v->>'bytes')::integer>2097152 OR jsonb_typeof(v->'width') IS DISTINCT FROM 'number' OR jsonb_typeof(v->'height') IS DISTINCT FROM 'number' OR coalesce(v->>'width','')!~'^[1-9][0-9]{0,3}$' OR coalesce(v->>'height','')!~'^[1-9][0-9]{0,3}$' OR (v->>'width')::integer>2048 OR (v->>'height')::integer>2048 THEN PERFORM public.phase3_fail('invalid');END IF;
 PERFORM 1 FROM public.panda_agent_chats WHERE id=(v->>'thread')::uuid AND owner_subject=public.requesting_user_id() AND archived_at IS NULL FOR SHARE;IF NOT FOUND THEN PERFORM public.phase3_fail('not_found');END IF;
 PERFORM pg_advisory_xact_lock(hashtext('panda_agent_image_admission'));
 SELECT * INTO a FROM public.panda_agent_diagnostic_assets WHERE id=(v->>'asset')::uuid FOR UPDATE;
 IF FOUND THEN
  IF (v->>'exp')::bigint<extract(epoch FROM clock_timestamp()) THEN PERFORM public.phase3_fail('unauthenticated');END IF;
  IF a.owner_subject<>public.requesting_user_id() OR a.thread_id<>(v->>'thread')::uuid THEN PERFORM public.phase3_fail('not_found');END IF;
  IF (a.image_hash,a.input_hash,a.bytes,a.width,a.height) IS DISTINCT FROM (v->>'sha256',v->>'inputSha256',(v->>'bytes')::integer,(v->>'width')::integer,(v->>'height')::integer) THEN PERFORM public.phase3_fail('conflict');END IF;
  RETURN public.panda_agent_diagnostic_asset_projection(a)||jsonb_build_object('created',false);
 END IF;
 IF (SELECT count(*) FROM public.panda_agent_diagnostic_assets WHERE expires_at>clock_timestamp() AND status IN ('reserved','ready','unknown'))>=16 OR (SELECT count(*) FROM public.panda_agent_diagnostic_assets WHERE owner_subject=public.requesting_user_id() AND expires_at>clock_timestamp() AND status IN ('reserved','ready','unknown'))>=3 OR (SELECT count(*) FROM public.panda_agent_diagnostic_assets WHERE owner_subject=public.requesting_user_id() AND created_at>clock_timestamp()-interval '15 minutes')>=6 THEN PERFORM public.phase3_fail('quota');END IF;
 IF (v->>'exp')::bigint<extract(epoch FROM clock_timestamp()) THEN PERFORM public.phase3_fail('unauthenticated');END IF;
 INSERT INTO public.panda_agent_diagnostic_assets(id,thread_id,owner_subject,image_hash,input_hash,bytes,width,height,expires_at) VALUES((v->>'asset')::uuid,(v->>'thread')::uuid,public.requesting_user_id(),v->>'sha256',v->>'inputSha256',(v->>'bytes')::integer,(v->>'width')::integer,(v->>'height')::integer,to_timestamp(floor(extract(epoch FROM clock_timestamp()))+900)) RETURNING * INTO a;
 RETURN public.panda_agent_diagnostic_asset_projection(a)||jsonb_build_object('created',true);
END $$;
CREATE FUNCTION public.panda_agent_diagnostic_assetrecord(p_payload text,p_mac text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE v jsonb;a public.panda_agent_diagnostic_assets;BEGIN
 v:=public.panda_agent_diagnostic_verify(p_payload,p_mac,'assetrecord');IF coalesce(v->>'state','') NOT IN ('ready','unknown','deleted','expired') THEN PERFORM public.phase3_fail('invalid');END IF;
 PERFORM 1 FROM public.panda_agent_chats WHERE id=(v->>'thread')::uuid AND owner_subject=public.requesting_user_id() FOR SHARE;IF NOT FOUND THEN PERFORM public.phase3_fail('not_found');END IF;
 SELECT * INTO a FROM public.panda_agent_diagnostic_assets WHERE id=(v->>'asset')::uuid AND thread_id=(v->>'thread')::uuid AND owner_subject=public.requesting_user_id() FOR UPDATE;IF NOT FOUND THEN PERFORM public.phase3_fail('not_found');END IF;
 IF (v->>'exp')::bigint<extract(epoch FROM clock_timestamp()) THEN PERFORM public.phase3_fail('unauthenticated');END IF;
 IF v->>'state'='ready' AND (a.status IN ('deleted','expired') OR a.expires_at<=clock_timestamp()) THEN PERFORM public.phase3_fail('conflict');END IF;
 UPDATE public.panda_agent_diagnostic_assets SET status=CASE WHEN a.status='deleted' OR v->>'state'='deleted' THEN 'deleted' WHEN a.status='expired' OR a.expires_at<=clock_timestamp() OR v->>'state'='expired' THEN 'expired' ELSE v->>'state' END WHERE id=a.id RETURNING * INTO a;
 RETURN public.panda_agent_diagnostic_asset_projection(a);
END $$;

CREATE FUNCTION public.panda_agent_vendor_scope(p_chip text,p_version text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE d public.panda_agent_vendor_documents;s public.panda_agent_vendor_versions;digest text;BEGIN
 IF public.requesting_user_id() IS NULL THEN PERFORM public.phase3_fail('unauthenticated');END IF;
 PERFORM pg_advisory_xact_lock(hashtext('panda_agent_vendor_lifecycle'));
 SELECT * INTO d FROM public.panda_agent_vendor_documents WHERE id='espressif-esp-idf-5.5.1-esp32-gpio' AND chip=p_chip AND framework_version=p_version FOR SHARE;
 IF NOT FOUND OR d.current_version IS NULL THEN RETURN NULL;END IF;
 SELECT * INTO s FROM public.panda_agent_vendor_versions WHERE id=d.current_version AND document_id=d.id AND status='approved' AND rights_status='permitted' FOR SHARE;IF NOT FOUND THEN RETURN NULL;END IF;
 digest:=encode(sha256(convert_to(jsonb_build_object('document',d.id,'epoch',d.version,'version',s.id,'hash',s.content_hash,'fragments',s.fragments,'rights',s.rights_status)::text,'UTF8')),'hex');
 RETURN jsonb_build_object('sourceId',d.id,'versionId',s.id,'contentHash',s.content_hash,'scopeHash',digest,'approved',true,'rights',s.rights_status,'current',true,'chip',d.chip,'framework',d.framework,'frameworkVersion',d.framework_version,'fragments',s.fragments,'sourceUrl',d.canonical_url,'title',d.title,'capturedAt',to_char(s.captured_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'));
END $$;
CREATE FUNCTION public.panda_agent_documentation_read() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE result jsonb;BEGIN
 PERFORM public.panda_agent_skill_admin();
 SELECT jsonb_build_object('documents',coalesce(jsonb_agg(jsonb_build_object('catalogId',d.id,'title',d.title,'sourceUrl',d.canonical_url,'chip',d.chip,'framework',d.framework,'frameworkVersion',d.framework_version,'version',d.version,'currentVersion',d.current_version,'versions',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',s.id,'contentHash',s.content_hash,'fragments',s.fragments,'fetchedAt',s.captured_at,'status',s.status,'rights',s.rights_status,'rightsEvidence',s.rights_evidence,'attribution',s.attribution) ORDER BY s.captured_at DESC,s.id),'[]') FROM public.panda_agent_vendor_versions s WHERE s.document_id=d.id)) ORDER BY d.id),'[]'),'tools',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',t.id,'enabled',t.enabled,'version',t.version,'manifest',t.manifest,'hash',t.manifest_hash) ORDER BY t.id),'[]') FROM public.panda_agent_tools t)) INTO result FROM public.panda_agent_vendor_documents d;
 RETURN result;
END $$;
CREATE FUNCTION public.panda_agent_vendor_capture(p_payload text,p_mac text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE v jsonb;d public.panda_agent_vendor_documents;s public.panda_agent_vendor_versions;BEGIN
 v:=public.panda_agent_diagnostic_verify(p_payload,p_mac,'capture');PERFORM public.panda_agent_skill_admin();
 IF coalesce(v->>'contentHash','')!~'^[a-f0-9]{64}$' OR jsonb_typeof(v->'fragments') IS DISTINCT FROM 'array' OR jsonb_array_length(v->'fragments') NOT BETWEEN 1 AND 8 OR EXISTS(SELECT 1 FROM jsonb_array_elements(v->'fragments') x WHERE jsonb_typeof(x)<>'string' OR length(x#>>'{}') NOT BETWEEN 1 AND 3000) OR (SELECT sum(length(x#>>'{}')) FROM jsonb_array_elements(v->'fragments') x)>20000 OR (SELECT count(DISTINCT x) FROM jsonb_array_elements(v->'fragments') x)<>jsonb_array_length(v->'fragments') OR jsonb_typeof(v->'rightsEvidence') IS DISTINCT FROM 'string' OR length(btrim(v->>'rightsEvidence')) NOT BETWEEN 1 AND 2000 OR jsonb_typeof(v->'attribution') IS DISTINCT FROM 'string' OR length(btrim(v->>'attribution')) NOT BETWEEN 1 AND 400 OR jsonb_typeof(v->'fetchedAt') IS DISTINCT FROM 'string' THEN PERFORM public.phase3_fail('invalid');END IF;
 IF (v->>'fetchedAt')::timestamptz>clock_timestamp()+interval '1 minute' OR (v->>'fetchedAt')::timestamptz<clock_timestamp()-interval '1 day' THEN PERFORM public.phase3_fail('invalid');END IF;
 PERFORM pg_advisory_xact_lock(hashtext('panda_agent_vendor_lifecycle'));
 SELECT * INTO d FROM public.panda_agent_vendor_documents WHERE id=v->>'catalogId' FOR UPDATE;IF NOT FOUND THEN PERFORM public.phase3_fail('not_found');END IF;
 IF (v->>'exp')::bigint<extract(epoch FROM clock_timestamp()) THEN PERFORM public.phase3_fail('unauthenticated');END IF;
 IF NOT EXISTS(SELECT 1 FROM public.panda_agent_vendor_versions WHERE document_id=d.id AND content_hash=v->>'contentHash') THEN
  INSERT INTO public.panda_agent_vendor_versions(document_id,content_hash,fragments,captured_at,rights_evidence,attribution,created_by) VALUES(d.id,v->>'contentHash',v->'fragments',(v->>'fetchedAt')::timestamptz,v->>'rightsEvidence',v->>'attribution',public.requesting_user_id()) RETURNING * INTO s;
  UPDATE public.panda_agent_vendor_documents SET version=version+1 WHERE id=d.id;
  INSERT INTO public.panda_agent_document_events(document_id,version_id,action,actor,reason) VALUES(d.id,s.id,'capture',public.requesting_user_id(),'Pending capture; no retrieval approval');
 END IF;
 RETURN public.panda_agent_documentation_read();
END $$;
CREATE FUNCTION public.panda_agent_vendor_change(p_input jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE d public.panda_agent_vendor_documents;s public.panda_agent_vendor_versions;BEGIN
 PERFORM public.panda_agent_skill_admin();
 IF jsonb_typeof(p_input) IS DISTINCT FROM 'object' OR NOT p_input?&ARRAY['versionId','expectedVersion','action','rights','rightsEvidence','reason'] OR (SELECT count(*) FROM jsonb_object_keys(p_input))<>6 OR coalesce(p_input->>'action','') NOT IN ('approve','withdraw') OR coalesce(p_input->>'rights','') NOT IN ('permitted','unknown','denied') OR jsonb_typeof(p_input->'expectedVersion') IS DISTINCT FROM 'number' OR coalesce(p_input->>'expectedVersion','')!~'^[0-9]{1,9}$' OR jsonb_typeof(p_input->'rightsEvidence') IS DISTINCT FROM 'string' OR jsonb_typeof(p_input->'reason') IS DISTINCT FROM 'string' OR length(btrim(coalesce(p_input->>'rightsEvidence',''))) NOT BETWEEN 1 AND 2000 OR length(btrim(coalesce(p_input->>'reason',''))) NOT BETWEEN 1 AND 300 THEN PERFORM public.phase3_fail('invalid');END IF;
 PERFORM pg_advisory_xact_lock(hashtext('panda_agent_vendor_lifecycle'));
 SELECT * INTO s FROM public.panda_agent_vendor_versions WHERE id=(p_input->>'versionId')::uuid;IF NOT FOUND THEN PERFORM public.phase3_fail('not_found');END IF;
 SELECT * INTO d FROM public.panda_agent_vendor_documents WHERE id=s.document_id FOR UPDATE;
 IF d.version<>(p_input->>'expectedVersion')::integer THEN PERFORM public.phase3_fail('conflict');END IF;
 IF p_input->>'action'='approve' THEN
  IF p_input->>'rights'<>'permitted' THEN PERFORM public.phase3_fail('conflict');END IF;
  UPDATE public.panda_agent_vendor_versions SET status='approved',rights_status='permitted',rights_evidence=p_input->>'rightsEvidence',reviewed_by=public.requesting_user_id(),reviewed_at=clock_timestamp() WHERE id=s.id;
  UPDATE public.panda_agent_vendor_documents SET current_version=s.id,version=version+1 WHERE id=d.id;
 ELSE
  UPDATE public.panda_agent_vendor_versions SET status='withdrawn',rights_status=p_input->>'rights',rights_evidence=p_input->>'rightsEvidence',reviewed_by=public.requesting_user_id(),reviewed_at=clock_timestamp() WHERE id=s.id;
  UPDATE public.panda_agent_vendor_documents SET current_version=CASE WHEN current_version=s.id THEN NULL ELSE current_version END,version=version+1 WHERE id=d.id;
 END IF;
 INSERT INTO public.panda_agent_document_events(document_id,version_id,action,actor,reason) VALUES(d.id,s.id,p_input->>'action',public.requesting_user_id(),p_input->>'reason');
 RETURN public.panda_agent_documentation_read();
END $$;
CREATE FUNCTION public.panda_agent_tool_state() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE r jsonb;BEGIN
 IF public.requesting_user_id() IS NULL THEN PERFORM public.phase3_fail('unauthenticated');END IF;
 SELECT jsonb_build_object('id',id,'enabled',enabled,'version',version,'hash',manifest_hash) INTO r FROM public.panda_agent_tools WHERE id='search_vendor_docs' FOR SHARE;RETURN r;
END $$;
CREATE FUNCTION public.panda_agent_tool_change(p_input jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE t public.panda_agent_tools;BEGIN
 PERFORM public.panda_agent_skill_admin();
 IF jsonb_typeof(p_input) IS DISTINCT FROM 'object' OR NOT p_input?&ARRAY['toolId','expectedVersion','enabled','reason'] OR (SELECT count(*) FROM jsonb_object_keys(p_input))<>4 OR jsonb_typeof(p_input->'enabled') IS DISTINCT FROM 'boolean' OR jsonb_typeof(p_input->'expectedVersion') IS DISTINCT FROM 'number' OR coalesce(p_input->>'expectedVersion','')!~'^[0-9]{1,9}$' OR jsonb_typeof(p_input->'reason') IS DISTINCT FROM 'string' OR length(btrim(coalesce(p_input->>'reason',''))) NOT BETWEEN 1 AND 300 THEN PERFORM public.phase3_fail('invalid');END IF;
 SELECT * INTO t FROM public.panda_agent_tools WHERE id=p_input->>'toolId' FOR UPDATE;IF NOT FOUND THEN PERFORM public.phase3_fail('not_found');END IF;
 IF t.version<>(p_input->>'expectedVersion')::integer THEN PERFORM public.phase3_fail('conflict');END IF;
 UPDATE public.panda_agent_tools SET enabled=(p_input->>'enabled')::boolean,version=version+1 WHERE id=t.id;
 INSERT INTO public.panda_agent_tool_events(tool_id,enabled,actor,reason) VALUES(t.id,(p_input->>'enabled')::boolean,public.requesting_user_id(),p_input->>'reason');RETURN public.panda_agent_documentation_read();
END $$;

CREATE FUNCTION public.panda_agent_diagnostic_input_valid(v jsonb) RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
 SELECT coalesce(jsonb_typeof(v)='object' AND v?&ARRAY['errorText','chip','framework','frameworkVersion'] AND (SELECT count(*) FROM jsonb_object_keys(v))=CASE WHEN v?'screenshotId' THEN 5 ELSE 4 END AND jsonb_typeof(v->'errorText')='string' AND length(btrim(v->>'errorText')) BETWEEN 1 AND 1500 AND v->>'errorText'=btrim(v->>'errorText') AND v->>'chip' IN ('esp32','esp32c3','esp32c6','esp32s3') AND v->>'framework'='esp-idf' AND v->>'frameworkVersion'='5.5.1' AND (NOT v?'screenshotId' OR coalesce(v->>'screenshotId','')~'^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$'),false)
$$;
CREATE FUNCTION public.panda_agent_diagnostic_begin(p_payload text,p_mac text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE v jsonb;g public.panda_agent_diagnostic_turns;s public.panda_agent_skills;a public.panda_agent_diagnostic_assets;payload text;mac text;r jsonb;BEGIN
 v:=public.panda_agent_diagnostic_verify(p_payload,p_mac,'begin');IF public.panda_agent_diagnostic_input_valid(v->'diagnostic') IS NOT TRUE THEN PERFORM public.phase3_fail('invalid');END IF;
 PERFORM public.panda_agent_lightweight_admission_guard((v->>'thread')::uuid,(v->>'request')::uuid);
 SELECT * INTO g FROM public.panda_agent_diagnostic_turns WHERE thread_id=(v->>'thread')::uuid AND request_id=(v->>'request')::uuid;
 IF FOUND THEN
  IF g.owner_subject<>public.requesting_user_id() OR g.input IS DISTINCT FROM v->'diagnostic' THEN PERFORM public.phase3_fail('conflict');END IF;
  IF (v->>'exp')::bigint<extract(epoch FROM clock_timestamp()) THEN PERFORM public.phase3_fail('unauthenticated');END IF;
  RETURN public.panda_agent_lightweight_read(g.thread_id)||jsonb_build_object('admitted',false);
 END IF;
 IF EXISTS(SELECT 1 FROM public.panda_agent_chat_turns WHERE thread_id=(v->>'thread')::uuid AND request_id=(v->>'request')::uuid) THEN PERFORM public.phase3_fail('conflict');END IF;
 SELECT * INTO s FROM public.panda_agent_skills WHERE id='product-evidence-qa' FOR SHARE;IF s.enabled IS DISTINCT FROM true THEN PERFORM public.phase3_fail('diagnostic_disabled');END IF;
 IF v->'diagnostic'?'screenshotId' THEN
  SELECT * INTO a FROM public.panda_agent_diagnostic_assets WHERE id=(v->'diagnostic'->>'screenshotId')::uuid AND thread_id=(v->>'thread')::uuid AND owner_subject=public.requesting_user_id() AND status='ready' AND expires_at>clock_timestamp() FOR SHARE;IF NOT FOUND THEN PERFORM public.phase3_fail('not_found');END IF;
 END IF;
 payload:=jsonb_build_object('v',1,'action','begin','subject',public.requesting_user_id(),'exp',(v->>'exp')::bigint,'thread',v->>'thread','request',v->>'request','question','Diagnostic ('||(v->'diagnostic'->>'chip')||', esp-idf 5.5.1): '||(v->'diagnostic'->>'errorText'))::text;
 SELECT encode(public.hmac(convert_to('panda-lightweight-db-v1'||chr(10)||payload,'UTF8'),key_bytes,'sha256'),'hex') INTO mac FROM public.panda_agent_lightweight_key WHERE singleton;
 r:=public.panda_agent_lightweight_begin_before_guides(payload,mac);
 INSERT INTO public.panda_agent_diagnostic_turns(thread_id,request_id,owner_subject,input,qa_skill_epoch) VALUES((v->>'thread')::uuid,(v->>'request')::uuid,public.requesting_user_id(),v->'diagnostic',s.version);
 IF (v->>'exp')::bigint<extract(epoch FROM clock_timestamp()) THEN PERFORM public.phase3_fail('unauthenticated');END IF;RETURN r;
END $$;
CREATE FUNCTION public.panda_agent_diagnostic_execution(p_thread uuid,p_request uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE g public.panda_agent_diagnostic_turns;BEGIN
 IF public.requesting_user_id() IS NULL THEN PERFORM public.phase3_fail('unauthenticated');END IF;
 PERFORM 1 FROM public.panda_agent_chats WHERE id=p_thread AND owner_subject=public.requesting_user_id() FOR SHARE;IF NOT FOUND THEN PERFORM public.phase3_fail('not_found');END IF;
 SELECT * INTO g FROM public.panda_agent_diagnostic_turns WHERE thread_id=p_thread AND request_id=p_request AND owner_subject=public.requesting_user_id();IF NOT FOUND THEN RETURN NULL;END IF;
 RETURN jsonb_build_object('input',g.input,'qaSkillEpoch',g.qa_skill_epoch,'scopeHash',g.scope_hash,'bindings',g.bindings,'toolEpoch',g.tool_epoch,'toolDispatched',g.tool_dispatched,'toolResult',g.tool_result);
END $$;
CREATE FUNCTION public.panda_agent_diagnostic_answer_current(a jsonb,i jsonb,p_scope text,p_bindings jsonb) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE s jsonb;c jsonb;b jsonb;BEGIN
 IF jsonb_typeof(a) IS DISTINCT FROM 'object' OR NOT a?&ARRAY['outcome','text','citations'] OR (SELECT count(*) FROM jsonb_object_keys(a))<>3 OR jsonb_typeof(a->'text') IS DISTINCT FROM 'string' OR length(btrim(a->>'text')) NOT BETWEEN 1 AND 8000 OR octet_length(a::text)>24000 OR jsonb_typeof(a->'citations') IS DISTINCT FROM 'array' OR jsonb_array_length(a->'citations')>1 OR jsonb_typeof(p_bindings) IS DISTINCT FROM 'array' THEN RETURN false;END IF;
 IF jsonb_array_length(a->'citations')=0 THEN RETURN coalesce(a->>'outcome' IN ('clarification','insufficient','conflict'),false) AND p_bindings='[]'::jsonb;END IF;
 IF a->>'outcome'<>'evidence' OR jsonb_array_length(p_bindings)<>1 THEN RETURN false;END IF;
 s:=public.panda_agent_vendor_scope(i->>'chip',i->>'frameworkVersion');IF s IS NULL OR s->>'scopeHash' IS DISTINCT FROM p_scope THEN RETURN false;END IF;
 b:=p_bindings->0;
 IF jsonb_typeof(b) IS DISTINCT FROM 'object' OR (SELECT count(*) FROM jsonb_object_keys(b))<>3 OR b->>'sourceId' IS DISTINCT FROM s->>'sourceId' OR b->>'versionId' IS DISTINCT FROM s->>'versionId' OR b->>'contentHash' IS DISTINCT FROM s->>'contentHash' THEN RETURN false;END IF;
 c:=a->'citations'->0;
 IF jsonb_typeof(c) IS DISTINCT FROM 'object' OR (SELECT count(*) FROM jsonb_object_keys(c))<>11 OR c->>'id' IS DISTINCT FROM 'S1' OR c->>'kind' IS DISTINCT FROM 'vendor' OR c->>'vendor' IS DISTINCT FROM 'espressif' OR c->>'chip' IS DISTINCT FROM i->>'chip' OR c->>'framework' IS DISTINCT FROM 'esp-idf' OR c->>'frameworkVersion' IS DISTINCT FROM i->>'frameworkVersion' OR c->>'title' IS DISTINCT FROM s->>'title' OR c->>'sourceUrl' IS DISTINCT FROM s->>'sourceUrl' OR c->>'capturedAt' IS DISTINCT FROM s->>'capturedAt' OR c->'sectionPath' IS DISTINCT FROM '["API Reference - Normal GPIO","Header File"]'::jsonb OR jsonb_typeof(c->'quote') IS DISTINCT FROM 'string' OR length(c->>'quote') NOT BETWEEN 1 AND 600 OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements_text(s->'fragments') x WHERE position(c->>'quote' IN x)>0) THEN RETURN false;END IF;
 RETURN true;
EXCEPTION WHEN OTHERS THEN RETURN false;
END $$;
REVOKE ALL ON FUNCTION public.panda_agent_diagnostic_answer_current(jsonb,jsonb,text,jsonb) FROM PUBLIC,anon,authenticated;

-- Existing product/guide projection still runs. Restore only independently verified diagnostic evidence.
ALTER FUNCTION public.panda_agent_lightweight_read(uuid) RENAME TO panda_agent_lightweight_read_before_diagnostics;
REVOKE ALL ON FUNCTION public.panda_agent_lightweight_read_before_diagnostics(uuid) FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.panda_agent_lightweight_read(p_thread uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE r jsonb;g public.panda_agent_diagnostic_turns;t public.panda_agent_chat_turns;m public.panda_agent_lightweight_turns;a jsonb;ms jsonb;ts jsonb;BEGIN
 PERFORM 1 FROM public.panda_agent_chats WHERE id=p_thread AND owner_subject=public.requesting_user_id() FOR SHARE;IF NOT FOUND THEN PERFORM public.phase3_fail('not_found');END IF;
 IF EXISTS(SELECT 1 FROM public.panda_agent_diagnostic_turns WHERE thread_id=p_thread) THEN PERFORM pg_advisory_xact_lock(hashtext('panda_agent_lifecycle'));END IF;
 r:=public.panda_agent_lightweight_read_before_diagnostics(p_thread);ms:=r->'messages';ts:=r->'turns';
 FOR g IN SELECT * FROM public.panda_agent_diagnostic_turns WHERE thread_id=p_thread AND owner_subject=public.requesting_user_id() LOOP
  SELECT * INTO t FROM public.panda_agent_chat_turns WHERE thread_id=p_thread AND request_id=g.request_id AND status='complete';IF NOT FOUND THEN CONTINUE;END IF;
  SELECT * INTO m FROM public.panda_agent_lightweight_turns WHERE thread_id=p_thread AND request_id=g.request_id AND owner_subject=public.requesting_user_id();
  IF FOUND AND m.approved_response_hash=encode(sha256(convert_to(t.response::text,'UTF8')),'hex') AND public.panda_agent_diagnostic_answer_current(t.response,g.input,g.scope_hash,g.bindings) THEN a:=t.response;
  ELSE a:=jsonb_build_object('outcome','insufficient','text','This saved diagnostic answer is unavailable because its reviewed source or verification is no longer current.','citations','[]'::jsonb);END IF;
  SELECT coalesce(jsonb_agg(CASE WHEN x->>'id'=t.assistant_message_id::text THEN x||jsonb_build_object('text',a->>'text','citations',a->'citations') ELSE x END ORDER BY ord),'[]') INTO ms FROM jsonb_array_elements(ms) WITH ORDINALITY z(x,ord);
  SELECT coalesce(jsonb_agg(CASE WHEN x->>'requestId'=t.request_id::text THEN x||jsonb_build_object('response',a) ELSE x END ORDER BY ord),'[]') INTO ts FROM jsonb_array_elements(ts) WITH ORDINALITY z(x,ord);
 END LOOP;
 RETURN r||jsonb_build_object('messages',ms,'turns',ts);
END $$;
CREATE FUNCTION public.panda_agent_diagnostic_complete(p_payload text,p_mac text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE v jsonb;g public.panda_agent_diagnostic_turns;t public.panda_agent_chat_turns;m public.panda_agent_lightweight_turns;s public.panda_agent_skills;a jsonb;digest text;valid boolean;BEGIN
 v:=public.panda_agent_diagnostic_verify(p_payload,p_mac,'complete');a:=v->'answer';
 PERFORM 1 FROM public.panda_agent_chats WHERE id=(v->>'thread')::uuid AND owner_subject=public.requesting_user_id() AND archived_at IS NULL FOR UPDATE;IF NOT FOUND THEN PERFORM public.phase3_fail('not_found');END IF;
 SELECT * INTO t FROM public.panda_agent_chat_turns WHERE thread_id=(v->>'thread')::uuid AND request_id=(v->>'request')::uuid FOR UPDATE;
 SELECT * INTO g FROM public.panda_agent_diagnostic_turns WHERE thread_id=t.thread_id AND request_id=t.request_id AND owner_subject=public.requesting_user_id() FOR UPDATE;IF NOT FOUND THEN PERFORM public.phase3_fail('not_found');END IF;
 SELECT * INTO m FROM public.panda_agent_lightweight_turns WHERE thread_id=t.thread_id AND request_id=t.request_id AND owner_subject=public.requesting_user_id() FOR UPDATE;IF NOT FOUND THEN PERFORM public.phase3_fail('not_found');END IF;
 IF (v->>'exp')::bigint<extract(epoch FROM clock_timestamp()) THEN PERFORM public.phase3_fail('unauthenticated');END IF;
 IF t.status='complete' THEN RETURN public.panda_agent_lightweight_read(t.thread_id);END IF;
 IF t.status<>'pending' OR m.approved_response_hash IS NOT NULL OR m.request_hash IS NOT NULL THEN PERFORM public.phase3_fail('conflict');END IF;
 SELECT * INTO s FROM public.panda_agent_skills WHERE id='product-evidence-qa' FOR SHARE;
 PERFORM pg_advisory_xact_lock(hashtext('panda_agent_lifecycle'));
 valid:=s.enabled IS TRUE AND s.version=g.qa_skill_epoch AND public.panda_agent_diagnostic_answer_current(a,g.input,v->>'scopeHash',v->'bindings');
 IF g.tool_dispatched AND (g.tool_result IS NULL OR NOT EXISTS(SELECT 1 FROM public.panda_agent_tools WHERE id='search_vendor_docs' AND enabled AND version=g.tool_epoch)) THEN valid:=false;END IF;
 IF valid IS NOT TRUE THEN a:=jsonb_build_object('outcome','insufficient','text','This diagnostic request ended because its skill, reviewed evidence or optional tool changed. Start a new request.','citations','[]'::jsonb);END IF;
 IF (v->>'exp')::bigint<extract(epoch FROM clock_timestamp()) THEN PERFORM public.phase3_fail('unauthenticated');END IF;
 digest:=encode(sha256(convert_to(a::text,'UTF8')),'hex');
 UPDATE public.panda_agent_diagnostic_turns SET scope_hash=CASE WHEN valid THEN v->>'scopeHash' ELSE NULL END,bindings=CASE WHEN valid THEN v->'bindings' ELSE '[]'::jsonb END WHERE thread_id=t.thread_id AND request_id=t.request_id;
 UPDATE public.panda_agent_lightweight_turns SET approved_response_hash=digest WHERE thread_id=t.thread_id AND request_id=t.request_id;
 UPDATE public.panda_agent_chat_turns SET response=a,status='complete',completed_at=clock_timestamp() WHERE thread_id=t.thread_id AND request_id=t.request_id;
 UPDATE public.panda_agent_chats SET updated_at=clock_timestamp() WHERE id=t.thread_id;
 RETURN public.panda_agent_lightweight_read(t.thread_id);
END $$;
CREATE FUNCTION public.panda_agent_diagnostic_toolclaim(p_payload text,p_mac text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE v jsonb;g public.panda_agent_diagnostic_turns;t public.panda_agent_tools;BEGIN
 v:=public.panda_agent_diagnostic_verify(p_payload,p_mac,'toolclaim');
 PERFORM 1 FROM public.panda_agent_chats WHERE id=(v->>'thread')::uuid AND owner_subject=public.requesting_user_id() AND archived_at IS NULL FOR UPDATE;IF NOT FOUND THEN PERFORM public.phase3_fail('not_found');END IF;
 PERFORM 1 FROM public.panda_agent_chat_turns WHERE thread_id=(v->>'thread')::uuid AND request_id=(v->>'request')::uuid AND status='pending' FOR UPDATE;IF NOT FOUND THEN PERFORM public.phase3_fail('conflict');END IF;
 SELECT * INTO g FROM public.panda_agent_diagnostic_turns WHERE thread_id=(v->>'thread')::uuid AND request_id=(v->>'request')::uuid AND owner_subject=public.requesting_user_id() FOR UPDATE;IF NOT FOUND THEN PERFORM public.phase3_fail('not_found');END IF;
 IF g.input->>'chip'<>'esp32' OR g.input->>'frameworkVersion'<>'5.5.1' THEN PERFORM public.phase3_fail('conflict');END IF;
 SELECT * INTO t FROM public.panda_agent_tools WHERE id='search_vendor_docs' FOR SHARE;
 IF t.enabled IS DISTINCT FROM true OR jsonb_typeof(v->'toolVersion') IS DISTINCT FROM 'number' OR t.version::text IS DISTINCT FROM v->>'toolVersion' THEN PERFORM public.phase3_fail('conflict');END IF;
 IF (v->>'exp')::bigint<extract(epoch FROM clock_timestamp()) THEN PERFORM public.phase3_fail('unauthenticated');END IF;
 IF g.tool_dispatched THEN RETURN jsonb_build_object('execute',false);END IF;
 UPDATE public.panda_agent_diagnostic_turns SET tool_epoch=t.version,tool_dispatched=true WHERE thread_id=g.thread_id AND request_id=g.request_id;
 RETURN jsonb_build_object('execute',true);
END $$;
CREATE FUNCTION public.panda_agent_diagnostic_toolrecord(p_payload text,p_mac text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE v jsonb;g public.panda_agent_diagnostic_turns;BEGIN
 v:=public.panda_agent_diagnostic_verify(p_payload,p_mac,'toolrecord');
 PERFORM 1 FROM public.panda_agent_chats WHERE id=(v->>'thread')::uuid AND owner_subject=public.requesting_user_id() AND archived_at IS NULL FOR UPDATE;IF NOT FOUND THEN PERFORM public.phase3_fail('not_found');END IF;
 SELECT * INTO g FROM public.panda_agent_diagnostic_turns WHERE thread_id=(v->>'thread')::uuid AND request_id=(v->>'request')::uuid AND owner_subject=public.requesting_user_id() FOR UPDATE;IF NOT FOUND THEN PERFORM public.phase3_fail('not_found');END IF;
 IF NOT g.tool_dispatched OR g.tool_epoch::text IS DISTINCT FROM v->>'toolVersion' OR jsonb_typeof(v->'result') IS DISTINCT FROM 'object' OR octet_length((v->'result')::text)>4000 THEN PERFORM public.phase3_fail('invalid');END IF;
 IF NOT EXISTS(SELECT 1 FROM public.panda_agent_chat_turns WHERE thread_id=g.thread_id AND request_id=g.request_id AND status='pending') OR NOT EXISTS(SELECT 1 FROM public.panda_agent_tools WHERE id='search_vendor_docs' AND enabled AND version=g.tool_epoch) THEN PERFORM public.phase3_fail('conflict');END IF;
 IF g.tool_result IS NOT NULL AND g.tool_result IS DISTINCT FROM v->'result' THEN PERFORM public.phase3_fail('conflict');END IF;
 IF (v->>'exp')::bigint<extract(epoch FROM clock_timestamp()) THEN PERFORM public.phase3_fail('unauthenticated');END IF;
 UPDATE public.panda_agent_diagnostic_turns SET tool_result=v->'result' WHERE thread_id=g.thread_id AND request_id=g.request_id;RETURN jsonb_build_object('ok',true);
END $$;

-- Cross-kind wrappers protect the shared durable request identity.
ALTER FUNCTION public.panda_agent_lightweight_begin(text,text) RENAME TO panda_agent_lightweight_begin_before_diagnostics;
ALTER FUNCTION public.panda_agent_lightweight_prepare(text,text) RENAME TO panda_agent_lightweight_prepare_before_diagnostics;
ALTER FUNCTION public.panda_agent_lightweight_complete(text,text) RENAME TO panda_agent_lightweight_complete_before_diagnostics;
REVOKE ALL ON FUNCTION public.panda_agent_lightweight_begin_before_diagnostics(text,text),public.panda_agent_lightweight_prepare_before_diagnostics(text,text),public.panda_agent_lightweight_complete_before_diagnostics(text,text) FROM PUBLIC,anon,authenticated;
DO $$ DECLARE a text;BEGIN
 FOREACH a IN ARRAY ARRAY['begin','prepare','complete'] LOOP
  EXECUTE format($sql$CREATE FUNCTION public.panda_agent_lightweight_%1$s(p_payload text,p_mac text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $body$
  DECLARE v jsonb;BEGIN
   v:=public.panda_agent_lightweight_verify(p_payload,p_mac,'%1$s');
   IF EXISTS(SELECT 1 FROM public.panda_agent_diagnostic_turns WHERE thread_id=(v->>'thread')::uuid AND request_id=(v->>'request')::uuid) THEN PERFORM public.phase3_fail('conflict');END IF;
   RETURN public.panda_agent_lightweight_%1$s_before_diagnostics(p_payload,p_mac);
  END $body$ $sql$,a);
 END LOOP;
END $$;
-- Helpers remain private; only reviewed RPC surfaces are callable.
REVOKE ALL ON FUNCTION public.panda_agent_diagnostic_input_valid(jsonb),public.panda_agent_diagnostic_asset_read(uuid,uuid),public.panda_agent_diagnostic_assetreserve(text,text),public.panda_agent_diagnostic_assetrecord(text,text),public.panda_agent_vendor_scope(text,text),public.panda_agent_documentation_read(),public.panda_agent_vendor_capture(text,text),public.panda_agent_vendor_change(jsonb),public.panda_agent_tool_state(),public.panda_agent_tool_change(jsonb),public.panda_agent_diagnostic_begin(text,text),public.panda_agent_diagnostic_execution(uuid,uuid),public.panda_agent_diagnostic_complete(text,text),public.panda_agent_diagnostic_toolclaim(text,text),public.panda_agent_diagnostic_toolrecord(text,text),public.panda_agent_lightweight_read(uuid),public.panda_agent_lightweight_begin(text,text),public.panda_agent_lightweight_prepare(text,text),public.panda_agent_lightweight_complete(text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.panda_agent_diagnostic_asset_read(uuid,uuid),public.panda_agent_diagnostic_assetreserve(text,text),public.panda_agent_diagnostic_assetrecord(text,text),public.panda_agent_vendor_scope(text,text),public.panda_agent_documentation_read(),public.panda_agent_vendor_capture(text,text),public.panda_agent_vendor_change(jsonb),public.panda_agent_tool_state(),public.panda_agent_tool_change(jsonb),public.panda_agent_diagnostic_begin(text,text),public.panda_agent_diagnostic_execution(uuid,uuid),public.panda_agent_diagnostic_complete(text,text),public.panda_agent_diagnostic_toolclaim(text,text),public.panda_agent_diagnostic_toolrecord(text,text),public.panda_agent_lightweight_read(uuid),public.panda_agent_lightweight_begin(text,text),public.panda_agent_lightweight_prepare(text,text),public.panda_agent_lightweight_complete(text,text) TO authenticated;
