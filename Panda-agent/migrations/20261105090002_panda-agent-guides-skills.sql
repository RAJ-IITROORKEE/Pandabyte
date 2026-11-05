-- Additive development guide/skill lifecycle. Prior histories and source tables remain intact.
CREATE TABLE public.panda_agent_skills (
 id text PRIMARY KEY CHECK(id IN ('product-evidence-qa','embedded-project-guide')),
 title text NOT NULL, enabled boolean NOT NULL DEFAULT false,
 active_version integer, version integer NOT NULL DEFAULT 0 CHECK(version>=0)
);
CREATE TABLE public.panda_agent_skill_versions (
 skill_id text REFERENCES public.panda_agent_skills(id), version integer CHECK(version>0),
 content text NOT NULL CHECK(length(content) BETWEEN 1 AND 8000), content_hash text NOT NULL CHECK(content_hash ~ '^[a-f0-9]{64}$'),
 source text NOT NULL, permissions jsonb NOT NULL, budget jsonb NOT NULL,
 reviewed boolean NOT NULL DEFAULT false, PRIMARY KEY(skill_id,version)
);
CREATE TABLE public.panda_agent_skill_events (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,skill_id text NOT NULL REFERENCES public.panda_agent_skills(id),
 action text NOT NULL CHECK(action IN ('review','enable','disable','rollback')),bundle_version integer,
 actor text NOT NULL, reason text NOT NULL CHECK(length(btrim(reason)) BETWEEN 1 AND 300),at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE public.panda_agent_project_memory (
 thread_id uuid PRIMARY KEY REFERENCES public.panda_agent_chats(id) ON DELETE CASCADE,
 owner_subject text NOT NULL, version integer NOT NULL DEFAULT 0, guide_turns integer NOT NULL DEFAULT 0,compactions integer NOT NULL DEFAULT 0,
 intent jsonb,questions jsonb NOT NULL DEFAULT '[]',recent_goals jsonb NOT NULL DEFAULT '[]'
);
CREATE TABLE public.panda_agent_guide_turns (
 thread_id uuid NOT NULL,request_id uuid NOT NULL, owner_subject text NOT NULL,
 input jsonb NOT NULL,skill_version integer NOT NULL,skill_hash text NOT NULL,skill_epoch integer NOT NULL,
 PRIMARY KEY(thread_id,request_id),FOREIGN KEY(thread_id,request_id) REFERENCES public.panda_agent_chat_turns(thread_id,request_id) ON DELETE CASCADE
);
CREATE TABLE public.panda_agent_project_skills (
 thread_id uuid PRIMARY KEY REFERENCES public.panda_agent_chats(id) ON DELETE CASCADE,owner_subject text NOT NULL,
 skill_version integer NOT NULL,skill_hash text NOT NULL,skill_epoch integer NOT NULL
);
ALTER TABLE public.panda_agent_lightweight_turns ADD COLUMN qa_skill_epoch integer;
DO $$ DECLARE t text;BEGIN
 FOREACH t IN ARRAY ARRAY['panda_agent_skills','panda_agent_skill_versions','panda_agent_skill_events','panda_agent_project_memory','panda_agent_guide_turns','panda_agent_project_skills'] LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,anon,authenticated',t);
 END LOOP;
END $$;

-- Preserve the source-fenced projection and add only bounded owner intent.
ALTER FUNCTION public.panda_agent_lightweight_read(uuid) RENAME TO panda_agent_lightweight_read_before_guides;
REVOKE ALL ON FUNCTION public.panda_agent_lightweight_read_before_guides(uuid) FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.panda_agent_lightweight_read(p_thread uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE r jsonb;m jsonb;BEGIN
 r:=public.panda_agent_lightweight_read_before_guides(p_thread);m:=public.panda_agent_project_read(p_thread);
 RETURN CASE WHEN m IS NULL THEN r ELSE r||jsonb_build_object('projectMemory',m) END;
END $$;
REVOKE ALL ON FUNCTION public.panda_agent_lightweight_read(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.panda_agent_lightweight_read(uuid) TO authenticated;

-- A different public turn kind cannot reuse a guide's durable identity.
ALTER FUNCTION public.panda_agent_lightweight_begin(text,text) RENAME TO panda_agent_lightweight_begin_before_guides;
ALTER FUNCTION public.panda_agent_lightweight_prepare(text,text) RENAME TO panda_agent_lightweight_prepare_before_guides;
ALTER FUNCTION public.panda_agent_lightweight_complete(text,text) RENAME TO panda_agent_lightweight_complete_before_guides;
REVOKE ALL ON FUNCTION public.panda_agent_lightweight_begin_before_guides(text,text),public.panda_agent_lightweight_prepare_before_guides(text,text),public.panda_agent_lightweight_complete_before_guides(text,text) FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.panda_agent_lightweight_begin(p_payload text,p_mac text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE v jsonb;s public.panda_agent_skills;r jsonb;BEGIN
 v:=public.panda_agent_lightweight_verify(p_payload,p_mac,'begin');
 PERFORM public.panda_agent_lightweight_admission_guard((v->>'thread')::uuid,(v->>'request')::uuid);
 IF EXISTS(SELECT 1 FROM public.panda_agent_guide_turns WHERE thread_id=(v->>'thread')::uuid AND request_id=(v->>'request')::uuid) THEN PERFORM public.phase3_fail('conflict');END IF;
 SELECT * INTO s FROM public.panda_agent_skills WHERE id='product-evidence-qa' FOR SHARE;
 IF s.enabled IS DISTINCT FROM true AND NOT EXISTS(SELECT 1 FROM public.panda_agent_chat_turns WHERE thread_id=(v->>'thread')::uuid AND request_id=(v->>'request')::uuid AND status='complete') THEN PERFORM public.phase3_fail('conflict');END IF;
 r:=public.panda_agent_lightweight_begin_before_guides(p_payload,p_mac);
 IF (r->>'admitted')::boolean THEN UPDATE public.panda_agent_lightweight_turns SET qa_skill_epoch=s.version WHERE thread_id=(v->>'thread')::uuid AND request_id=(v->>'request')::uuid;END IF;
 RETURN r;
END $$;
CREATE FUNCTION public.panda_agent_lightweight_prepare(p_payload text,p_mac text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE v jsonb;s public.panda_agent_skills;m public.panda_agent_lightweight_turns;BEGIN
 v:=public.panda_agent_lightweight_verify(p_payload,p_mac,'prepare');
 PERFORM 1 FROM public.panda_agent_chats WHERE id=(v->>'thread')::uuid AND owner_subject=public.requesting_user_id() AND archived_at IS NULL FOR UPDATE;IF NOT FOUND THEN PERFORM public.phase3_fail('not_found');END IF;
 IF EXISTS(SELECT 1 FROM public.panda_agent_guide_turns WHERE thread_id=(v->>'thread')::uuid AND request_id=(v->>'request')::uuid) THEN PERFORM public.phase3_fail('conflict');END IF;
 SELECT * INTO s FROM public.panda_agent_skills WHERE id='product-evidence-qa' FOR SHARE;
 SELECT * INTO m FROM public.panda_agent_lightweight_turns WHERE thread_id=(v->>'thread')::uuid AND request_id=(v->>'request')::uuid;
 IF s.enabled IS DISTINCT FROM true OR (m.qa_skill_epoch IS NOT NULL AND m.qa_skill_epoch IS DISTINCT FROM s.version) THEN PERFORM public.phase3_fail('conflict');END IF;
 RETURN public.panda_agent_lightweight_prepare_before_guides(p_payload,p_mac);
END $$;
CREATE FUNCTION public.panda_agent_lightweight_complete(p_payload text,p_mac text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE v jsonb;s public.panda_agent_skills;m public.panda_agent_lightweight_turns;t public.panda_agent_chat_turns;a jsonb;BEGIN
 v:=public.panda_agent_lightweight_verify(p_payload,p_mac,'complete');
 IF EXISTS(SELECT 1 FROM public.panda_agent_guide_turns WHERE thread_id=(v->>'thread')::uuid AND request_id=(v->>'request')::uuid) THEN PERFORM public.phase3_fail('conflict');END IF;
 PERFORM 1 FROM public.panda_agent_chats WHERE id=(v->>'thread')::uuid AND owner_subject=public.requesting_user_id() AND archived_at IS NULL FOR UPDATE;IF NOT FOUND THEN PERFORM public.phase3_fail('not_found');END IF;
 SELECT * INTO t FROM public.panda_agent_chat_turns WHERE thread_id=(v->>'thread')::uuid AND request_id=(v->>'request')::uuid FOR UPDATE;
 SELECT * INTO m FROM public.panda_agent_lightweight_turns WHERE thread_id=t.thread_id AND request_id=t.request_id FOR UPDATE;
 SELECT * INTO s FROM public.panda_agent_skills WHERE id='product-evidence-qa' FOR SHARE;
 IF t.status='pending' AND (s.enabled IS DISTINCT FROM true OR (m.qa_skill_epoch IS NOT NULL AND m.qa_skill_epoch IS DISTINCT FROM s.version)) THEN
  IF (v->>'exp')::bigint<extract(epoch FROM clock_timestamp()) THEN PERFORM public.phase3_fail('unauthenticated');END IF;
  a:=jsonb_build_object('outcome','insufficient','text','This request ended because its skill changed. Start a new question.','citations','[]'::jsonb);
  UPDATE public.panda_agent_lightweight_turns SET cancelled_at=clock_timestamp(),approved_response_hash=encode(sha256(convert_to(a::text,'UTF8')),'hex') WHERE thread_id=t.thread_id AND request_id=t.request_id;
  UPDATE public.panda_agent_chat_turns SET response=a,status='complete',completed_at=clock_timestamp() WHERE thread_id=t.thread_id AND request_id=t.request_id;
  RETURN public.panda_agent_lightweight_read(t.thread_id);
 END IF;
 RETURN public.panda_agent_lightweight_complete_before_guides(p_payload,p_mac);
END $$;
REVOKE ALL ON FUNCTION public.panda_agent_lightweight_begin(text,text),public.panda_agent_lightweight_prepare(text,text),public.panda_agent_lightweight_complete(text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.panda_agent_lightweight_begin(text,text),public.panda_agent_lightweight_prepare(text,text),public.panda_agent_lightweight_complete(text,text) TO authenticated;

CREATE FUNCTION public.panda_agent_skill_admin() RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
BEGIN
 IF public.requesting_user_id() IS NULL THEN PERFORM public.phase3_fail('unauthenticated'); END IF;
 PERFORM 1 FROM public.staff_role_memberships WHERE user_id=public.requesting_user_id() AND role='ADMIN' FOR SHARE;
 IF NOT FOUND THEN PERFORM public.phase3_fail('forbidden'); END IF;
END $$;
CREATE FUNCTION public.panda_agent_skills_read() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE result jsonb;BEGIN
 PERFORM public.panda_agent_skill_admin();
 SELECT jsonb_build_object('skills',jsonb_agg(jsonb_build_object('id',s.id,'title',s.title,'enabled',s.enabled,'activeVersion',s.active_version,'version',s.version,
 'versions',(SELECT coalesce(jsonb_agg(jsonb_build_object('version',v.version,'hash',v.content_hash,'source',v.source,'content',v.content,'reviewed',v.reviewed,'permissions',v.permissions,'budget',v.budget) ORDER BY v.version),'[]') FROM public.panda_agent_skill_versions v WHERE v.skill_id=s.id),
 'history',(SELECT coalesce(jsonb_agg(row ORDER BY at DESC,id DESC),'[]') FROM (SELECT e.id,e.at,jsonb_build_object('action',e.action,'bundleVersion',e.bundle_version,'at',e.at,'reason',e.reason) row FROM public.panda_agent_skill_events e WHERE e.skill_id=s.id ORDER BY e.at DESC,e.id DESC LIMIT 50) h)) ORDER BY s.id)) INTO result FROM public.panda_agent_skills s;
 RETURN result;
END $$;
CREATE FUNCTION public.panda_agent_skill_change(p_input jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE s public.panda_agent_skills;v public.panda_agent_skill_versions;act text;ver integer;BEGIN
 PERFORM public.panda_agent_skill_admin();
 IF jsonb_typeof(p_input) IS DISTINCT FROM 'object' OR NOT p_input ?& ARRAY['skillId','action','bundleVersion','expectedVersion','reason'] OR (SELECT count(*) FROM jsonb_object_keys(p_input))<>5
 OR jsonb_typeof(p_input->'action') IS DISTINCT FROM 'string' OR coalesce(p_input->>'action','') NOT IN ('review','enable','disable','rollback') OR jsonb_typeof(p_input->'reason') IS DISTINCT FROM 'string' OR length(btrim(p_input->>'reason')) NOT BETWEEN 1 AND 300
 OR jsonb_typeof(p_input->'expectedVersion') IS DISTINCT FROM 'number' OR jsonb_typeof(p_input->'bundleVersion') IS DISTINCT FROM 'number'
 OR coalesce(p_input->>'expectedVersion','') !~ '^[0-9]{1,9}$' OR coalesce(p_input->>'bundleVersion','') !~ '^[1-9][0-9]{0,3}$' THEN PERFORM public.phase3_fail('invalid'); END IF;
 SELECT * INTO s FROM public.panda_agent_skills WHERE id=p_input->>'skillId' FOR UPDATE;IF NOT FOUND THEN PERFORM public.phase3_fail('not_found');END IF;
 IF s.version<>(p_input->>'expectedVersion')::integer THEN PERFORM public.phase3_fail('conflict');END IF;
 ver:=(p_input->>'bundleVersion')::integer;act:=p_input->>'action';
 SELECT * INTO v FROM public.panda_agent_skill_versions WHERE skill_id=s.id AND version=ver FOR UPDATE;IF NOT FOUND THEN PERFORM public.phase3_fail('not_found');END IF;
 IF act='review' THEN UPDATE public.panda_agent_skill_versions SET reviewed=true WHERE skill_id=s.id AND version=ver;
 ELSIF act IN ('enable','rollback') THEN
  IF NOT v.reviewed THEN PERFORM public.phase3_fail('conflict');END IF;
  IF act='rollback' AND NOT EXISTS(SELECT 1 FROM public.panda_agent_skill_events WHERE skill_id=s.id AND bundle_version=ver AND action IN ('enable','rollback')) THEN PERFORM public.phase3_fail('conflict');END IF;
  UPDATE public.panda_agent_skills SET enabled=true,active_version=ver WHERE id=s.id;
 ELSE UPDATE public.panda_agent_skills SET enabled=false WHERE id=s.id;
 END IF;
 UPDATE public.panda_agent_skills SET version=version+1 WHERE id=s.id;
 INSERT INTO public.panda_agent_skill_events(skill_id,action,bundle_version,actor,reason) VALUES(s.id,act,ver,public.requesting_user_id(),btrim(p_input->>'reason'));
 RETURN public.panda_agent_skills_read();
END $$;

CREATE FUNCTION public.panda_agent_guide_input_valid(g jsonb) RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
 SELECT coalesce(jsonb_typeof(g)='object' AND g ?& ARRAY['goal','board','components','expectedVersion'] AND (g-ARRAY['goal','board','revision','components','expectedVersion'])='{}'
 AND jsonb_typeof(g->'goal')='string' AND length(btrim(g->>'goal')) BETWEEN 1 AND 600
 AND jsonb_typeof(g->'board')='string' AND length(btrim(g->>'board')) BETWEEN 1 AND 128
 AND (NOT g?'revision' OR (jsonb_typeof(g->'revision')='string' AND length(btrim(g->>'revision')) BETWEEN 1 AND 80))
 AND jsonb_typeof(g->'expectedVersion')='number' AND (g->>'expectedVersion') ~ '^[0-9]{1,9}$'
 AND jsonb_typeof(g->'components')='array' AND jsonb_array_length(g->'components')<=8
 AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(g->'components') x WHERE jsonb_typeof(x)<>'string' OR length(btrim(x#>>'{}')) NOT BETWEEN 1 AND 80),false)
$$;
-- Published catalog identity is not an evidence grant; this projection contains no source text.
CREATE FUNCTION public.panda_agent_guide_products() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE r jsonb;BEGIN
 IF public.requesting_user_id() IS NULL THEN PERFORM public.phase3_fail('unauthenticated');END IF;
 SELECT jsonb_build_object('items',coalesce(jsonb_agg(jsonb_build_object('id',q.id,'sku',q.sku,'title',q.title) ORDER BY q.sku),'[]'::jsonb)) INTO r FROM (
 SELECT DISTINCT cr.id,m.sku,coalesce(rev.title,cr.title) title FROM public.cms_records cr JOIN public.cms_revisions rev ON rev.record_id=cr.id AND rev.id=cr.published_revision_id
 JOIN public.panda_agent_sources s ON s.product_id=cr.id JOIN public.panda_agent_runtime_mapping() m ON m.source_url=s.canonical_url
 WHERE cr.kind='product' AND cr.archived_at IS NULL AND EXISTS(SELECT 1 FROM jsonb_array_elements(CASE WHEN jsonb_typeof(rev.document->'variants')='array' THEN rev.document->'variants' ELSE '[]'::jsonb END) v WHERE v->>'sku'=m.sku)
 ) q;RETURN r;
END $$;
CREATE FUNCTION public.panda_agent_project_read(p_thread uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE m public.panda_agent_project_memory;BEGIN
 PERFORM 1 FROM public.panda_agent_chats WHERE id=p_thread AND owner_subject=public.requesting_user_id() FOR SHARE;IF NOT FOUND THEN PERFORM public.phase3_fail('not_found');END IF;
 SELECT * INTO m FROM public.panda_agent_project_memory WHERE thread_id=p_thread AND owner_subject=public.requesting_user_id();
 IF NOT FOUND THEN RETURN NULL;END IF;
 RETURN jsonb_build_object('version',m.version,'guideTurns',m.guide_turns,'compactions',m.compactions,'intent',m.intent,'questions',m.questions,'recentGoals',m.recent_goals);
END $$;
CREATE FUNCTION public.panda_agent_guide_execution(p_thread uuid,p_request uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE g public.panda_agent_guide_turns;m public.panda_agent_lightweight_turns;BEGIN
 PERFORM 1 FROM public.panda_agent_chats WHERE id=p_thread AND owner_subject=public.requesting_user_id() FOR SHARE;IF NOT FOUND THEN PERFORM public.phase3_fail('not_found');END IF;
 SELECT * INTO g FROM public.panda_agent_guide_turns WHERE thread_id=p_thread AND request_id=p_request AND owner_subject=public.requesting_user_id();IF NOT FOUND THEN RETURN NULL;END IF;
 SELECT * INTO m FROM public.panda_agent_lightweight_turns WHERE thread_id=p_thread AND request_id=p_request;
 RETURN jsonb_build_object('input',g.input,'skill',jsonb_build_object('id','embedded-project-guide','version',g.skill_version,'hash',g.skill_hash),'epoch',g.skill_epoch,'prepared',m.request_hash IS NOT NULL,'digest',m.request_hash,'productId',m.product_id,'productSku',m.sku,'scopeHash',m.scope_hash);
END $$;
CREATE FUNCTION public.panda_agent_guide_verify(p_payload text,p_mac text,p_action text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE v jsonb;expected text;fields text[];BEGIN
 IF public.requesting_user_id() IS NULL THEN PERFORM public.phase3_fail('unauthenticated');END IF;
 IF p_payload IS NULL OR octet_length(p_payload)>32768 OR coalesce(p_mac,'') !~ '^[a-f0-9]{64}$' THEN PERFORM public.phase3_fail('invalid');END IF;
 SELECT encode(public.hmac(convert_to('panda-guide-db-v1'||chr(10)||p_payload,'UTF8'),key_bytes,'sha256'),'hex') INTO expected FROM public.panda_agent_lightweight_key WHERE singleton;
 IF expected IS NULL OR sha256(decode(expected,'hex'))<>sha256(decode(p_mac,'hex')) THEN PERFORM public.phase3_fail('unauthenticated');END IF;
 v:=p_payload::jsonb;fields:=CASE p_action WHEN 'begin' THEN ARRAY['v','action','subject','exp','thread','request','guide'] WHEN 'prepare' THEN ARRAY['v','action','subject','exp','thread','request','product','sku','scopeHash','digest'] WHEN 'complete' THEN ARRAY['v','action','subject','exp','thread','request','answer','success'] END;
 IF fields IS NULL OR jsonb_typeof(v) IS DISTINCT FROM 'object' OR NOT v?&fields OR (SELECT count(*) FROM jsonb_object_keys(v))<>cardinality(fields) OR v->'v'<>'1' OR v->>'action' IS DISTINCT FROM p_action OR v->>'subject' IS DISTINCT FROM public.requesting_user_id() OR coalesce(v->>'exp','') !~ '^[0-9]{1,11}$' THEN PERFORM public.phase3_fail('invalid');END IF;
 IF (v->>'exp')::bigint<extract(epoch FROM clock_timestamp()) OR (v->>'exp')::bigint>extract(epoch FROM clock_timestamp())+65 THEN PERFORM public.phase3_fail('unauthenticated');END IF;RETURN v;
END $$;

CREATE FUNCTION public.panda_agent_guide_begin(p_payload text,p_mac text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE v jsonb;g public.panda_agent_guide_turns;s public.panda_agent_skills;b public.panda_agent_skill_versions;m public.panda_agent_project_memory;result jsonb;BEGIN
 v:=public.panda_agent_guide_verify(p_payload,p_mac,'begin');IF public.panda_agent_guide_input_valid(v->'guide') IS NOT TRUE THEN PERFORM public.phase3_fail('invalid');END IF;
 PERFORM public.panda_agent_lightweight_admission_guard((v->>'thread')::uuid,(v->>'request')::uuid);
 SELECT * INTO g FROM public.panda_agent_guide_turns WHERE thread_id=(v->>'thread')::uuid AND request_id=(v->>'request')::uuid;
 IF FOUND THEN
  IF g.owner_subject<>public.requesting_user_id() OR g.input IS DISTINCT FROM v->'guide' THEN PERFORM public.phase3_fail('conflict');END IF;
  IF (v->>'exp')::bigint<extract(epoch FROM clock_timestamp()) THEN PERFORM public.phase3_fail('unauthenticated');END IF;
  RETURN public.panda_agent_lightweight_read(g.thread_id)||jsonb_build_object('admitted',false);
 END IF;
 IF EXISTS(SELECT 1 FROM public.panda_agent_chat_turns WHERE thread_id=(v->>'thread')::uuid AND request_id=(v->>'request')::uuid) THEN PERFORM public.phase3_fail('conflict');END IF;
 SELECT * INTO s FROM public.panda_agent_skills WHERE id='embedded-project-guide' FOR SHARE;
 SELECT * INTO b FROM public.panda_agent_skill_versions WHERE skill_id=s.id AND version=s.active_version;
 IF NOT s.enabled OR b.reviewed IS NOT TRUE THEN PERFORM public.phase3_fail('guide_disabled');END IF;
 INSERT INTO public.panda_agent_project_memory(thread_id,owner_subject) VALUES((v->>'thread')::uuid,public.requesting_user_id()) ON CONFLICT DO NOTHING;
 SELECT * INTO m FROM public.panda_agent_project_memory WHERE thread_id=(v->>'thread')::uuid AND owner_subject=public.requesting_user_id() FOR UPDATE;
 IF NOT FOUND OR m.version<>(v->'guide'->>'expectedVersion')::integer THEN PERFORM public.phase3_fail('conflict');END IF;
 INSERT INTO public.panda_agent_project_skills(thread_id,owner_subject,skill_version,skill_hash,skill_epoch) VALUES((v->>'thread')::uuid,public.requesting_user_id(),b.version,b.content_hash,s.version)
 ON CONFLICT(thread_id) DO UPDATE SET skill_version=EXCLUDED.skill_version,skill_hash=EXCLUDED.skill_hash,skill_epoch=EXCLUDED.skill_epoch;
 result:=public.panda_agent_lightweight_begin_before_guides(jsonb_build_object('v',1,'action','begin','subject',public.requesting_user_id(),'exp',(v->>'exp')::bigint,'thread',v->>'thread','request',v->>'request','question','Project guide: '||(v->'guide'->>'goal'))::text,
  (SELECT encode(public.hmac(convert_to('panda-lightweight-db-v1'||chr(10)||jsonb_build_object('v',1,'action','begin','subject',public.requesting_user_id(),'exp',(v->>'exp')::bigint,'thread',v->>'thread','request',v->>'request','question','Project guide: '||(v->'guide'->>'goal'))::text,'UTF8'),key_bytes,'sha256'),'hex') FROM public.panda_agent_lightweight_key WHERE singleton));
 INSERT INTO public.panda_agent_guide_turns(thread_id,request_id,owner_subject,input,skill_version,skill_hash,skill_epoch) VALUES((v->>'thread')::uuid,(v->>'request')::uuid,public.requesting_user_id(),v->'guide',b.version,b.content_hash,s.version);
 IF (v->>'exp')::bigint<extract(epoch FROM clock_timestamp()) THEN PERFORM public.phase3_fail('unauthenticated');END IF;RETURN result;
END $$;

CREATE FUNCTION public.panda_agent_guide_prepare(p_payload text,p_mac text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE v jsonb;g public.panda_agent_guide_turns;m public.panda_agent_lightweight_turns;s public.panda_agent_skills;sc jsonb;BEGIN
 v:=public.panda_agent_guide_verify(p_payload,p_mac,'prepare');
 PERFORM 1 FROM public.panda_agent_chats WHERE id=(v->>'thread')::uuid AND owner_subject=public.requesting_user_id() AND archived_at IS NULL FOR UPDATE;IF NOT FOUND THEN PERFORM public.phase3_fail('not_found');END IF;
 PERFORM 1 FROM public.panda_agent_chat_turns WHERE thread_id=(v->>'thread')::uuid AND request_id=(v->>'request')::uuid AND status='pending' FOR UPDATE;IF NOT FOUND THEN PERFORM public.phase3_fail('conflict');END IF;
 SELECT * INTO g FROM public.panda_agent_guide_turns WHERE thread_id=(v->>'thread')::uuid AND request_id=(v->>'request')::uuid AND owner_subject=public.requesting_user_id();IF NOT FOUND THEN PERFORM public.phase3_fail('not_found');END IF;
 SELECT * INTO s FROM public.panda_agent_skills WHERE id='embedded-project-guide' FOR SHARE;
 IF NOT s.enabled OR (s.active_version,s.version) IS DISTINCT FROM (g.skill_version,g.skill_epoch) THEN PERFORM public.phase3_fail('conflict');END IF;
 IF NOT EXISTS(SELECT 1 FROM public.panda_agent_project_skills p WHERE p.thread_id=g.thread_id AND p.owner_subject=public.requesting_user_id() AND (p.skill_version,p.skill_hash,p.skill_epoch)=(g.skill_version,g.skill_hash,g.skill_epoch)) THEN PERFORM public.phase3_fail('conflict');END IF;
 IF coalesce(v->>'digest','') !~ '^[a-f0-9]{64}$' OR length(btrim(v->>'sku')) NOT BETWEEN 1 AND 128 OR (v->'scopeHash'<>'null' AND coalesce(v->>'scopeHash','') !~ '^[a-f0-9]{64}$') THEN PERFORM public.phase3_fail('invalid');END IF;
 IF v->'scopeHash'<>'null' THEN sc:=public.panda_agent_lightweight_scope((v->>'product')::uuid);IF sc->>'scopeHash' IS DISTINCT FROM v->>'scopeHash' THEN PERFORM public.phase3_fail('conflict');END IF;END IF;
 PERFORM 1 FROM public.cms_records WHERE id=(v->>'product')::uuid AND kind='product' AND archived_at IS NULL AND published_revision_id IS NOT NULL FOR SHARE;
 IF NOT FOUND OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(public.panda_agent_guide_products()->'items') p WHERE p->>'id'=v->>'product' AND p->>'sku'=v->>'sku') THEN PERFORM public.phase3_fail('conflict');END IF;
 SELECT * INTO m FROM public.panda_agent_lightweight_turns WHERE thread_id=g.thread_id AND request_id=g.request_id FOR UPDATE;
 IF NOT FOUND THEN PERFORM public.phase3_fail('conflict');END IF;
 IF (v->>'exp')::bigint<extract(epoch FROM clock_timestamp()) THEN PERFORM public.phase3_fail('unauthenticated');END IF;
 IF m.request_hash IS NOT NULL THEN
  IF (m.request_hash,m.sku,m.product_id,m.scope_hash) IS DISTINCT FROM (v->>'digest',v->>'sku',(v->>'product')::uuid,v->>'scopeHash') THEN PERFORM public.phase3_fail('conflict');END IF;
  RETURN jsonb_build_object('execute',false);
 END IF;
 IF (v->>'exp')::bigint<extract(epoch FROM clock_timestamp()) THEN PERFORM public.phase3_fail('unauthenticated');END IF;
 UPDATE public.panda_agent_lightweight_turns SET request_hash=v->>'digest',sku=v->>'sku',product_id=(v->>'product')::uuid,scope_hash=v->>'scopeHash' WHERE thread_id=g.thread_id AND request_id=g.request_id;
 RETURN jsonb_build_object('execute',true);
END $$;

CREATE FUNCTION public.panda_agent_guide_complete(p_payload text,p_mac text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE v jsonb;g public.panda_agent_guide_turns;m public.panda_agent_lightweight_turns;t public.panda_agent_chat_turns;s public.panda_agent_skills;mem public.panda_agent_project_memory;a jsonb;bad boolean:=false;h text;BEGIN
 v:=public.panda_agent_guide_verify(p_payload,p_mac,'complete');a:=v->'answer';
 IF jsonb_typeof(v->'success') IS DISTINCT FROM 'boolean' THEN PERFORM public.phase3_fail('invalid');END IF;
 IF jsonb_typeof(a) IS DISTINCT FROM 'object' OR NOT a?&ARRAY['outcome','text','citations'] OR (a-ARRAY['outcome','text','citations'])<>'{}' OR coalesce(a->>'outcome','') NOT IN ('evidence','clarification','insufficient','conflict') OR jsonb_typeof(a->'text') IS DISTINCT FROM 'string' OR length(btrim(a->>'text')) NOT BETWEEN 1 AND 8000 OR octet_length(a::text)>24000 THEN PERFORM public.phase3_fail('invalid');END IF;
 PERFORM 1 FROM public.panda_agent_chats WHERE id=(v->>'thread')::uuid AND owner_subject=public.requesting_user_id() AND archived_at IS NULL FOR UPDATE;IF NOT FOUND THEN PERFORM public.phase3_fail('not_found');END IF;
 SELECT * INTO t FROM public.panda_agent_chat_turns WHERE thread_id=(v->>'thread')::uuid AND request_id=(v->>'request')::uuid FOR UPDATE;
 SELECT * INTO g FROM public.panda_agent_guide_turns WHERE thread_id=t.thread_id AND request_id=t.request_id AND owner_subject=public.requesting_user_id();IF NOT FOUND THEN PERFORM public.phase3_fail('not_found');END IF;
 SELECT * INTO m FROM public.panda_agent_lightweight_turns WHERE thread_id=t.thread_id AND request_id=t.request_id FOR UPDATE;
 IF NOT FOUND THEN PERFORM public.phase3_fail('conflict');END IF;
 IF (v->>'exp')::bigint<extract(epoch FROM clock_timestamp()) THEN PERFORM public.phase3_fail('unauthenticated');END IF;
 IF t.status='complete' THEN RETURN public.panda_agent_lightweight_read(t.thread_id);END IF;
 SELECT * INTO s FROM public.panda_agent_skills WHERE id='embedded-project-guide' FOR SHARE;
 SELECT * INTO mem FROM public.panda_agent_project_memory WHERE thread_id=t.thread_id AND owner_subject=public.requesting_user_id() FOR UPDATE;
 IF NOT FOUND THEN PERFORM public.phase3_fail('conflict');END IF;
 bad:=s.enabled IS DISTINCT FROM true OR (s.active_version,s.version) IS DISTINCT FROM (g.skill_version,g.skill_epoch) OR mem.version IS DISTINCT FROM (g.input->>'expectedVersion')::integer;
 IF NOT EXISTS(SELECT 1 FROM public.panda_agent_project_skills p WHERE p.thread_id=g.thread_id AND p.owner_subject=public.requesting_user_id() AND (p.skill_version,p.skill_hash,p.skill_epoch)=(g.skill_version,g.skill_hash,g.skill_epoch)) THEN bad:=true;END IF;
 BEGIN
  IF m.scope_hash IS NOT NULL AND (public.panda_agent_lightweight_scope(m.product_id)->>'scopeHash') IS DISTINCT FROM m.scope_hash THEN bad:=true;END IF;
  IF public.panda_agent_lightweight_citations_current(a,m.product_id) IS NOT TRUE THEN bad:=true;END IF;
 EXCEPTION WHEN OTHERS THEN bad:=true;END;
 IF bad THEN
  a:=jsonb_build_object('outcome','insufficient','text','This guide was not saved because its skill, project version or evidence changed. Start a new guide run.','citations','[]'::jsonb);
  UPDATE public.panda_agent_lightweight_turns SET cancelled_at=clock_timestamp() WHERE thread_id=t.thread_id AND request_id=t.request_id;
 END IF;
 IF (v->>'exp')::bigint<extract(epoch FROM clock_timestamp()) THEN PERFORM public.phase3_fail('unauthenticated');END IF;
 h:=encode(sha256(convert_to(a::text,'UTF8')),'hex');
 UPDATE public.panda_agent_lightweight_turns SET approved_response_hash=h WHERE thread_id=t.thread_id AND request_id=t.request_id;
 UPDATE public.panda_agent_chat_turns SET response=a,status='complete',completed_at=clock_timestamp() WHERE thread_id=t.thread_id AND request_id=t.request_id;
 UPDATE public.panda_agent_chats SET updated_at=clock_timestamp() WHERE id=t.thread_id;
 IF NOT bad AND m.request_hash IS NOT NULL AND v->'success'='true'::jsonb THEN
  UPDATE public.panda_agent_project_memory SET version=version+1,guide_turns=guide_turns+1,compactions=compactions+CASE WHEN (guide_turns+1)%8=0 THEN 1 ELSE 0 END,
   intent=g.input-'expectedVersion',questions='["revision","wiring","framework","component-specifications"]',recent_goals=CASE WHEN (guide_turns+1)%8=0 THEN '[]'::jsonb ELSE recent_goals||jsonb_build_array(g.input->>'goal') END WHERE thread_id=t.thread_id;
 END IF;
 RETURN public.panda_agent_lightweight_read(t.thread_id);
END $$;

DO $$ DECLARE f text;BEGIN
 FOREACH f IN ARRAY ARRAY['panda_agent_skill_admin()','panda_agent_skills_read()','panda_agent_skill_change(jsonb)','panda_agent_guide_input_valid(jsonb)','panda_agent_guide_products()','panda_agent_project_read(uuid)','panda_agent_guide_execution(uuid,uuid)','panda_agent_guide_verify(text,text,text)','panda_agent_guide_begin(text,text)','panda_agent_guide_prepare(text,text)','panda_agent_guide_complete(text,text)'] LOOP
  EXECUTE 'REVOKE ALL ON FUNCTION public.'||f||' FROM PUBLIC,anon,authenticated';
 END LOOP;
 FOREACH f IN ARRAY ARRAY['panda_agent_skills_read()','panda_agent_skill_change(jsonb)','panda_agent_guide_products()','panda_agent_project_read(uuid)','panda_agent_guide_execution(uuid,uuid)','panda_agent_guide_begin(text,text)','panda_agent_guide_prepare(text,text)','panda_agent_guide_complete(text,text)'] LOOP
  EXECUTE 'GRANT EXECUTE ON FUNCTION public.'||f||' TO authenticated';
 END LOOP;
END $$;
