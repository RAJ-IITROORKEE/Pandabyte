-- Additive composite authority. Existing single-product/guide/diagnostic receipts stay strict.
ALTER TABLE public.panda_agent_skills DROP CONSTRAINT panda_agent_skills_id_check;
ALTER TABLE public.panda_agent_skills ADD CONSTRAINT panda_agent_skills_id_check CHECK(id IN ('product-evidence-qa','embedded-project-guide','panda-documented-firmware-help','panda-error-triage','panda-project-planner'));
CREATE TABLE public.panda_agent_composite_turns (
 thread_id uuid NOT NULL,request_id uuid NOT NULL,owner_subject text NOT NULL,
 input jsonb NOT NULL,plan jsonb NOT NULL,plan_hash text NOT NULL CHECK(plan_hash~'^[a-f0-9]{64}$'),
 skill_id text NOT NULL REFERENCES public.panda_agent_skills(id),skill_version integer NOT NULL,skill_hash text NOT NULL,skill_epoch integer NOT NULL,tool_grants jsonb NOT NULL,
 deadline_at timestamptz NOT NULL,terminal_reason text,cancelled boolean NOT NULL DEFAULT false,
 PRIMARY KEY(thread_id,request_id),UNIQUE(owner_subject,request_id),
 FOREIGN KEY(thread_id,request_id) REFERENCES public.panda_agent_chat_turns(thread_id,request_id) ON DELETE CASCADE
);
CREATE TABLE public.panda_agent_composite_calls (
 thread_id uuid NOT NULL,request_id uuid NOT NULL,call_id uuid NOT NULL,owner_subject text NOT NULL,
 need_id text NOT NULL,tool_id text NOT NULL REFERENCES public.panda_agent_tools(id),input_hash text NOT NULL CHECK(input_hash~'^[a-f0-9]{64}$'),
 tool_epoch integer NOT NULL,tool_hash text NOT NULL,state text NOT NULL DEFAULT 'unknown' CHECK(state IN ('unknown','complete')),
 worker_digest text CHECK(worker_digest~'^[a-f0-9]{64}$'),scope jsonb,result jsonb,result_hash text,
 context_fragments integer NOT NULL DEFAULT 0 CHECK(context_fragments BETWEEN 0 AND 8),context_units integer NOT NULL DEFAULT 0 CHECK(context_units BETWEEN 0 AND 20000),
 PRIMARY KEY(thread_id,request_id,call_id),UNIQUE(owner_subject,call_id),UNIQUE(thread_id,request_id,need_id),
 FOREIGN KEY(thread_id,request_id) REFERENCES public.panda_agent_composite_turns(thread_id,request_id) ON DELETE CASCADE
);
ALTER TABLE public.panda_agent_composite_turns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.panda_agent_composite_calls ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.panda_agent_composite_turns,public.panda_agent_composite_calls FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.panda_agent_composite_verify(p_payload text,p_mac text,p_action text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE v jsonb;expected text;fields text[];BEGIN
 IF public.requesting_user_id() IS NULL THEN PERFORM public.phase3_fail('unauthenticated');END IF;
 IF p_payload IS NULL OR octet_length(p_payload)>32768 OR coalesce(p_mac,'')!~'^[a-f0-9]{64}$' THEN PERFORM public.phase3_fail('invalid');END IF;
 SELECT encode(public.hmac(convert_to('panda-composite-db-v1'||chr(10)||p_payload,'UTF8'),key_bytes,'sha256'),'hex') INTO expected FROM public.panda_agent_lightweight_key WHERE singleton;
 IF expected IS NULL OR sha256(decode(expected,'hex'))<>sha256(decode(p_mac,'hex')) THEN PERFORM public.phase3_fail('unauthenticated');END IF;
 v:=p_payload::jsonb;
 fields:=ARRAY['v','action','subject','exp','thread','request']||CASE p_action WHEN 'begin' THEN ARRAY['input','plan','planHash'] WHEN 'claim' THEN ARRAY['planHash','call'] WHEN 'bind' THEN ARRAY['planHash','callId','digest','scope','contextFragments','contextUnits'] WHEN 'record' THEN ARRAY['planHash','callId','result','resultHash'] WHEN 'finish' THEN ARRAY['planHash','answer','terminalReason'] WHEN 'cancel' THEN ARRAY['planHash'] WHEN 'execution' THEN ARRAY[]::text[] ELSE NULL END;
 IF fields IS NULL OR NOT v?&fields OR (SELECT count(*) FROM jsonb_object_keys(v))<>cardinality(fields) THEN PERFORM public.phase3_fail('invalid');END IF;
 IF jsonb_typeof(v) IS DISTINCT FROM 'object' OR v->'v' IS DISTINCT FROM '1'::jsonb OR v->>'action' IS DISTINCT FROM p_action OR v->>'subject' IS DISTINCT FROM public.requesting_user_id() OR coalesce(v->>'exp','')!~'^[0-9]{1,11}$' OR jsonb_typeof(v->'exp') IS DISTINCT FROM 'number' OR NOT v?&ARRAY['thread','request'] THEN PERFORM public.phase3_fail('invalid');END IF;
 IF (v->>'exp')::bigint<extract(epoch FROM clock_timestamp()) OR (v->>'exp')::bigint>extract(epoch FROM clock_timestamp())+65 THEN PERFORM public.phase3_fail('unauthenticated');END IF;
 RETURN v;
END $$;
REVOKE ALL ON FUNCTION public.panda_agent_composite_verify(text,text,text) FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.panda_agent_composite_grants_current(g public.panda_agent_composite_turns) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE s public.panda_agent_skills;b public.panda_agent_skill_versions;c public.panda_agent_composite_calls;t public.panda_agent_tools;BEGIN
 SELECT * INTO s FROM public.panda_agent_skills WHERE id=g.skill_id FOR SHARE NOWAIT;
 SELECT * INTO b FROM public.panda_agent_skill_versions WHERE skill_id=g.skill_id AND version=g.skill_version FOR SHARE NOWAIT;
 IF s.enabled IS DISTINCT FROM true OR s.version IS DISTINCT FROM g.skill_epoch OR s.active_version IS DISTINCT FROM g.skill_version OR b.reviewed IS DISTINCT FROM true OR b.content_hash IS DISTINCT FROM g.skill_hash THEN RETURN false;END IF;
 FOR c IN SELECT * FROM public.panda_agent_composite_calls WHERE thread_id=g.thread_id AND request_id=g.request_id ORDER BY tool_id,need_id LOOP
  SELECT * INTO t FROM public.panda_agent_tools WHERE id=c.tool_id FOR SHARE NOWAIT;
  IF t.enabled IS DISTINCT FROM true OR t.version IS DISTINCT FROM c.tool_epoch OR t.manifest_hash IS DISTINCT FROM c.tool_hash OR NOT b.permissions ? c.tool_id THEN RETURN false;END IF;
 END LOOP;
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.panda_agent_composite_grants_current(public.panda_agent_composite_turns) FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.panda_agent_composite_execution(p_payload text,p_mac text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE g public.panda_agent_composite_turns;v jsonb;p_thread uuid;p_request uuid;BEGIN
 v:=public.panda_agent_composite_verify(p_payload,p_mac,'execution');p_thread:=(v->>'thread')::uuid;p_request:=(v->>'request')::uuid;
 PERFORM 1 FROM public.panda_agent_chats WHERE id=p_thread AND owner_subject=public.requesting_user_id() FOR SHARE;IF NOT FOUND THEN PERFORM public.phase3_fail('not_found');END IF;
 SELECT * INTO g FROM public.panda_agent_composite_turns WHERE thread_id=p_thread AND request_id=p_request AND owner_subject=public.requesting_user_id();IF NOT FOUND THEN RETURN NULL;END IF;
 IF (v->>'exp')::bigint<extract(epoch FROM clock_timestamp()) THEN PERFORM public.phase3_fail('unauthenticated');END IF;
 RETURN jsonb_build_object('input',g.input,'plan',g.plan,'planHash',g.plan_hash,'deadlineAt',floor(extract(epoch FROM g.deadline_at)*1000),'cancelled',g.cancelled,'terminalReason',g.terminal_reason,'skill',jsonb_build_object('id',g.skill_id,'bundleVersion',g.skill_version,'hash',g.skill_hash,'epoch',g.skill_epoch),'toolGrants',g.tool_grants,'calls',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',c.call_id,'toolId',c.tool_id,'needId',c.need_id,'inputHash',c.input_hash,'state',c.state,'digest',c.worker_digest,'scope',c.scope,'result',c.result,'resultHash',c.result_hash) ORDER BY c.need_id),'[]') FROM public.panda_agent_composite_calls c WHERE c.thread_id=g.thread_id AND c.request_id=g.request_id));
END $$;
CREATE FUNCTION public.panda_agent_composite_grants(p_skill text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE s public.panda_agent_skills;b public.panda_agent_skill_versions;BEGIN
 IF public.requesting_user_id() IS NULL THEN PERFORM public.phase3_fail('unauthenticated');END IF;
 IF p_skill NOT IN ('panda-documented-firmware-help','panda-error-triage','panda-project-planner') THEN PERFORM public.phase3_fail('invalid');END IF;
 SELECT * INTO s FROM public.panda_agent_skills WHERE id=p_skill FOR SHARE NOWAIT;
 SELECT * INTO b FROM public.panda_agent_skill_versions WHERE skill_id=s.id AND version=s.active_version FOR SHARE NOWAIT;
 IF s.enabled IS DISTINCT FROM true OR b.reviewed IS DISTINCT FROM true THEN PERFORM public.phase3_fail('conflict');END IF;
 RETURN jsonb_build_object('skill',jsonb_build_object('id',s.id,'bundleVersion',b.version,'hash',b.content_hash,'epoch',s.version,'body',b.content,'permissions',b.permissions),'tools',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',t.id,'epoch',t.version,'hash',t.manifest_hash,'enabled',t.enabled) ORDER BY t.id),'[]') FROM public.panda_agent_tools t WHERE b.permissions ? t.id));
END $$;

CREATE FUNCTION public.panda_agent_composite_begin(p_payload text,p_mac text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE v jsonb;g public.panda_agent_composite_turns;s public.panda_agent_skills;b public.panda_agent_skill_versions;r jsonb;grants jsonb;BEGIN
 v:=public.panda_agent_composite_verify(p_payload,p_mac,'begin');
 IF jsonb_typeof(v->'input') IS DISTINCT FROM 'object' OR jsonb_typeof(v->'plan') IS DISTINCT FROM 'object' OR v->'plan'->'input' IS DISTINCT FROM v->'input' OR coalesce(v->>'planHash','')!~'^[a-f0-9]{64}$' OR jsonb_typeof(v->'plan'->'needs') IS DISTINCT FROM 'array' OR jsonb_array_length(v->'plan'->'needs') NOT BETWEEN 1 AND 3 OR length(v->'input'->>'question') NOT BETWEEN 1 AND 2000 OR v->'input'->>'skillId' NOT IN ('panda-documented-firmware-help','panda-error-triage','panda-project-planner') THEN PERFORM public.phase3_fail('invalid');END IF;
 PERFORM public.panda_agent_lightweight_admission_guard((v->>'thread')::uuid,(v->>'request')::uuid);
 SELECT * INTO g FROM public.panda_agent_composite_turns WHERE thread_id=(v->>'thread')::uuid AND request_id=(v->>'request')::uuid FOR UPDATE;
 IF FOUND THEN
  IF g.owner_subject IS DISTINCT FROM public.requesting_user_id() OR g.input IS DISTINCT FROM v->'input' OR g.plan IS DISTINCT FROM v->'plan' OR g.plan_hash IS DISTINCT FROM v->>'planHash' THEN PERFORM public.phase3_fail('conflict');END IF;
  IF (v->>'exp')::bigint<extract(epoch FROM clock_timestamp()) THEN PERFORM public.phase3_fail('unauthenticated');END IF;
  RETURN public.panda_agent_lightweight_read(g.thread_id)||jsonb_build_object('admitted',false);
 END IF;
 IF EXISTS(SELECT 1 FROM public.panda_agent_chat_turns WHERE thread_id=(v->>'thread')::uuid AND request_id=(v->>'request')::uuid) THEN PERFORM public.phase3_fail('conflict');END IF;
 SELECT * INTO s FROM public.panda_agent_skills WHERE id=v->'input'->>'skillId' FOR SHARE NOWAIT;
 SELECT * INTO b FROM public.panda_agent_skill_versions WHERE skill_id=s.id AND version=s.active_version FOR SHARE NOWAIT;
 IF s.enabled IS DISTINCT FROM true OR b.reviewed IS DISTINCT FROM true THEN PERFORM public.phase3_fail('conflict');END IF;
 PERFORM 1 FROM public.panda_agent_tools t WHERE EXISTS(SELECT 1 FROM jsonb_array_elements(v->'plan'->'needs') n WHERE n->>'toolId'=t.id) ORDER BY t.id FOR SHARE NOWAIT;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',t.id,'epoch',t.version,'hash',t.manifest_hash,'enabled',t.enabled) ORDER BY t.id),'[]'::jsonb) INTO grants FROM public.panda_agent_tools t WHERE EXISTS(SELECT 1 FROM jsonb_array_elements(v->'plan'->'needs') n WHERE n->>'toolId'=t.id);
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(v->'plan'->'needs') n WHERE NOT b.permissions ? (n->>'toolId') OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(grants) q WHERE q->>'id'=n->>'toolId')) THEN PERFORM public.phase3_fail('conflict');END IF;
 r:=public.panda_agent_chat_begin_v2((v->>'thread')::uuid,(v->>'request')::uuid,v->'input'->>'question',false);
 IF (r->>'admitted')::boolean IS NOT TRUE THEN PERFORM public.phase3_fail('conflict');END IF;
 IF (v->>'exp')::bigint<extract(epoch FROM clock_timestamp()) THEN PERFORM public.phase3_fail('unauthenticated');END IF;
 INSERT INTO public.panda_agent_lightweight_turns(thread_id,request_id,owner_subject) VALUES((v->>'thread')::uuid,(v->>'request')::uuid,public.requesting_user_id());
 INSERT INTO public.panda_agent_composite_turns(thread_id,request_id,owner_subject,input,plan,plan_hash,skill_id,skill_version,skill_hash,skill_epoch,tool_grants,deadline_at) VALUES((v->>'thread')::uuid,(v->>'request')::uuid,public.requesting_user_id(),v->'input',v->'plan',v->>'planHash',s.id,b.version,b.content_hash,s.version,grants,clock_timestamp()+interval '30 seconds');
 RETURN public.panda_agent_lightweight_read((v->>'thread')::uuid)||jsonb_build_object('admitted',true);
END $$;

CREATE FUNCTION public.panda_agent_composite_claim(p_payload text,p_mac text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE v jsonb;g public.panda_agent_composite_turns;c public.panda_agent_composite_calls;t public.panda_agent_tools;b public.panda_agent_skill_versions;BEGIN
 v:=public.panda_agent_composite_verify(p_payload,p_mac,'claim');
 PERFORM 1 FROM public.panda_agent_chats WHERE id=(v->>'thread')::uuid AND owner_subject=public.requesting_user_id() AND archived_at IS NULL FOR UPDATE;IF NOT FOUND THEN PERFORM public.phase3_fail('not_found');END IF;
 SELECT * INTO g FROM public.panda_agent_composite_turns WHERE thread_id=(v->>'thread')::uuid AND request_id=(v->>'request')::uuid AND owner_subject=public.requesting_user_id() FOR UPDATE;IF NOT FOUND THEN PERFORM public.phase3_fail('not_found');END IF;
 IF g.plan_hash IS DISTINCT FROM v->>'planHash' OR coalesce(v->'call'->>'inputHash','')!~'^[a-f0-9]{64}$' OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(g.plan->'needs') n WHERE n->>'id'=v->'call'->>'needId' AND n->>'toolId'=v->'call'->>'toolId') THEN PERFORM public.phase3_fail('conflict');END IF;
 SELECT * INTO c FROM public.panda_agent_composite_calls WHERE thread_id=g.thread_id AND request_id=g.request_id AND need_id=v->'call'->>'needId';
 IF FOUND THEN
  IF c.call_id IS DISTINCT FROM (v->'call'->>'id')::uuid OR c.input_hash IS DISTINCT FROM v->'call'->>'inputHash' OR c.tool_id IS DISTINCT FROM v->'call'->>'toolId' THEN PERFORM public.phase3_fail('conflict');END IF;
  IF (v->>'exp')::bigint<extract(epoch FROM clock_timestamp()) THEN PERFORM public.phase3_fail('unauthenticated');END IF;
  RETURN jsonb_build_object('state',CASE WHEN c.state='complete' THEN 'recorded' ELSE 'unknown' END);
 END IF;
 IF g.cancelled OR g.terminal_reason IS NOT NULL OR g.deadline_at<=clock_timestamp() OR NOT public.panda_agent_composite_grants_current(g) OR NOT EXISTS(SELECT 1 FROM public.panda_agent_chat_turns WHERE thread_id=g.thread_id AND request_id=g.request_id AND status='pending') OR (SELECT count(*) FROM public.panda_agent_composite_calls WHERE thread_id=g.thread_id AND request_id=g.request_id)>=4 OR (SELECT count(*) FROM public.panda_agent_composite_calls WHERE thread_id=g.thread_id AND request_id=g.request_id AND state='unknown')>=2 THEN PERFORM public.phase3_fail('conflict');END IF;
 SELECT * INTO b FROM public.panda_agent_skill_versions WHERE skill_id=g.skill_id AND version=g.skill_version;
 SELECT * INTO t FROM public.panda_agent_tools WHERE id=v->'call'->>'toolId' FOR SHARE NOWAIT;
 IF t.enabled IS DISTINCT FROM true OR NOT b.permissions ? t.id OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(g.tool_grants) q WHERE q->>'id'=t.id AND q->'enabled'='true'::jsonb AND q->>'epoch'=t.version::text AND q->>'hash'=t.manifest_hash) THEN PERFORM public.phase3_fail('conflict');END IF;
 IF (v->>'exp')::bigint<extract(epoch FROM clock_timestamp()) THEN PERFORM public.phase3_fail('unauthenticated');END IF;
 IF g.deadline_at<=clock_timestamp() THEN PERFORM public.phase3_fail('conflict');END IF;
 INSERT INTO public.panda_agent_composite_calls(thread_id,request_id,call_id,owner_subject,need_id,tool_id,input_hash,tool_epoch,tool_hash) VALUES(g.thread_id,g.request_id,(v->'call'->>'id')::uuid,public.requesting_user_id(),v->'call'->>'needId',t.id,v->'call'->>'inputHash',t.version,t.manifest_hash);
 RETURN jsonb_build_object('state','execute');
END $$;

CREATE FUNCTION public.panda_agent_composite_bind(p_payload text,p_mac text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE v jsonb;g public.panda_agent_composite_turns;c public.panda_agent_composite_calls;sc jsonb;BEGIN
 v:=public.panda_agent_composite_verify(p_payload,p_mac,'bind');
 PERFORM 1 FROM public.panda_agent_chats WHERE id=(v->>'thread')::uuid AND owner_subject=public.requesting_user_id() AND archived_at IS NULL FOR UPDATE;IF NOT FOUND THEN PERFORM public.phase3_fail('not_found');END IF;
 SELECT * INTO g FROM public.panda_agent_composite_turns WHERE thread_id=(v->>'thread')::uuid AND request_id=(v->>'request')::uuid AND owner_subject=public.requesting_user_id() FOR UPDATE;IF NOT FOUND THEN PERFORM public.phase3_fail('not_found');END IF;
 SELECT * INTO c FROM public.panda_agent_composite_calls WHERE thread_id=g.thread_id AND request_id=g.request_id AND call_id=(v->>'callId')::uuid FOR UPDATE;IF NOT FOUND THEN PERFORM public.phase3_fail('not_found');END IF;
 IF g.cancelled OR g.terminal_reason IS NOT NULL OR g.deadline_at<=clock_timestamp() OR g.plan_hash IS DISTINCT FROM v->>'planHash' OR c.state<>'unknown' OR coalesce(v->>'digest','')!~'^[a-f0-9]{64}$' OR NOT public.panda_agent_composite_grants_current(g) THEN PERFORM public.phase3_fail('conflict');END IF;
 IF jsonb_typeof(v->'contextFragments') IS DISTINCT FROM 'number' OR jsonb_typeof(v->'contextUnits') IS DISTINCT FROM 'number' OR coalesce(v->>'contextFragments','')!~'^[0-8]$' OR coalesce(v->>'contextUnits','')!~'^[0-9]{1,5}$' OR (v->>'contextUnits')::integer>20000 THEN PERFORM public.phase3_fail('invalid');END IF;
 IF c.worker_digest IS NOT NULL AND (c.worker_digest IS DISTINCT FROM v->>'digest' OR c.scope IS DISTINCT FROM v->'scope' OR c.context_fragments IS DISTINCT FROM (v->>'contextFragments')::integer OR c.context_units IS DISTINCT FROM (v->>'contextUnits')::integer) THEN PERFORM public.phase3_fail('conflict');END IF;
 IF (SELECT coalesce(sum(context_fragments),0)+(v->>'contextFragments')::integer>8 OR coalesce(sum(context_units),0)+(v->>'contextUnits')::integer>20000 FROM public.panda_agent_composite_calls WHERE thread_id=g.thread_id AND request_id=g.request_id AND call_id<>c.call_id) THEN PERFORM public.phase3_fail('conflict');END IF;
 IF c.tool_id='panda_scoped_rag' THEN
  sc:=public.panda_agent_lightweight_scope((v->'scope'->>'productId')::uuid);
  IF sc IS DISTINCT FROM v->'scope' OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(g.plan->'needs') n WHERE n->>'id'=c.need_id AND n->>'kind'='mcu' AND n->>'productSku'=sc->>'sku') THEN PERFORM public.phase3_fail('conflict');END IF;
 ELSIF c.tool_id<>'fetch_public_docs_mcp' OR v->'scope'<>'null'::jsonb THEN PERFORM public.phase3_fail('invalid');END IF;
 IF (v->>'exp')::bigint<extract(epoch FROM clock_timestamp()) THEN PERFORM public.phase3_fail('unauthenticated');END IF;
 IF g.deadline_at<=clock_timestamp() THEN PERFORM public.phase3_fail('conflict');END IF;
 UPDATE public.panda_agent_composite_calls SET worker_digest=v->>'digest',scope=v->'scope',context_fragments=(v->>'contextFragments')::integer,context_units=(v->>'contextUnits')::integer WHERE thread_id=c.thread_id AND request_id=c.request_id AND call_id=c.call_id;
 RETURN jsonb_build_object('ok',true);
END $$;

CREATE FUNCTION public.panda_agent_composite_record(p_payload text,p_mac text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE v jsonb;g public.panda_agent_composite_turns;c public.panda_agent_composite_calls;cf integer;cu integer;BEGIN
 v:=public.panda_agent_composite_verify(p_payload,p_mac,'record');
 PERFORM 1 FROM public.panda_agent_chats WHERE id=(v->>'thread')::uuid AND owner_subject=public.requesting_user_id() AND archived_at IS NULL FOR UPDATE;IF NOT FOUND THEN PERFORM public.phase3_fail('not_found');END IF;
 SELECT * INTO g FROM public.panda_agent_composite_turns WHERE thread_id=(v->>'thread')::uuid AND request_id=(v->>'request')::uuid AND owner_subject=public.requesting_user_id() FOR UPDATE;IF NOT FOUND THEN PERFORM public.phase3_fail('not_found');END IF;
 SELECT * INTO c FROM public.panda_agent_composite_calls WHERE thread_id=g.thread_id AND request_id=g.request_id AND call_id=(v->>'callId')::uuid FOR UPDATE;IF NOT FOUND THEN PERFORM public.phase3_fail('not_found');END IF;
 IF g.cancelled OR g.terminal_reason IS NOT NULL OR g.deadline_at<=clock_timestamp() OR g.plan_hash IS DISTINCT FROM v->>'planHash' OR NOT public.panda_agent_composite_grants_current(g) OR jsonb_typeof(v->'result') IS DISTINCT FROM 'object' OR octet_length((v->'result')::text)>24000 OR coalesce(v->>'resultHash','')!~'^[a-f0-9]{64}$' THEN PERFORM public.phase3_fail('conflict');END IF;
 IF c.state='complete' AND (c.result IS DISTINCT FROM v->'result' OR c.result_hash IS DISTINCT FROM v->>'resultHash') THEN PERFORM public.phase3_fail('conflict');END IF;
 IF c.tool_id='fetch_public_docs_mcp' AND c.worker_digest IS NULL THEN PERFORM public.phase3_fail('conflict');END IF;
 cf:=c.context_fragments;cu:=c.context_units;
 IF c.tool_id='panda_scoped_rag' THEN
  IF jsonb_typeof(v->'result'->'contextFragments') IS DISTINCT FROM 'number' OR jsonb_typeof(v->'result'->'contextUnits') IS DISTINCT FROM 'number' OR coalesce(v->'result'->>'contextFragments','')!~'^[0-8]$' OR coalesce(v->'result'->>'contextUnits','')!~'^[0-9]{1,5}$' THEN PERFORM public.phase3_fail('invalid');END IF;
  cf:=(v->'result'->>'contextFragments')::integer;cu:=(v->'result'->>'contextUnits')::integer;
  IF cu>20000 OR (c.worker_digest IS NOT NULL AND (cf<>c.context_fragments OR cu<>c.context_units)) THEN PERFORM public.phase3_fail('conflict');END IF;
 END IF;
 IF (SELECT coalesce(sum(context_fragments),0)+cf>8 OR coalesce(sum(context_units),0)+cu>20000 FROM public.panda_agent_composite_calls WHERE thread_id=g.thread_id AND request_id=g.request_id AND call_id<>c.call_id) THEN PERFORM public.phase3_fail('conflict');END IF;
 IF c.tool_id='panda_scoped_rag' AND EXISTS(SELECT 1 FROM jsonb_array_elements(g.plan->'needs') n WHERE n->>'id'=c.need_id AND n->>'kind'='mcu') AND (c.worker_digest IS NULL OR c.scope IS DISTINCT FROM v->'result'->'scope' OR c.scope IS DISTINCT FROM public.panda_agent_lightweight_scope((c.scope->>'productId')::uuid) OR NOT public.panda_agent_lightweight_citations_current(v->'result'->'answer',(c.scope->>'productId')::uuid)) THEN PERFORM public.phase3_fail('conflict');END IF;
 IF (v->>'exp')::bigint<extract(epoch FROM clock_timestamp()) THEN PERFORM public.phase3_fail('unauthenticated');END IF;
 IF g.deadline_at<=clock_timestamp() THEN PERFORM public.phase3_fail('conflict');END IF;
 UPDATE public.panda_agent_composite_calls SET result=v->'result',result_hash=v->>'resultHash',state='complete',context_fragments=cf,context_units=cu WHERE thread_id=c.thread_id AND request_id=c.request_id AND call_id=c.call_id;
 RETURN jsonb_build_object('ok',true);
END $$;

-- All operations remain user-scoped and signed where they can spend work or persist text.
REVOKE ALL ON FUNCTION public.panda_agent_composite_execution(text,text),public.panda_agent_composite_grants(text),public.panda_agent_composite_begin(text,text),public.panda_agent_composite_claim(text,text),public.panda_agent_composite_bind(text,text),public.panda_agent_composite_record(text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.panda_agent_composite_execution(text,text),public.panda_agent_composite_grants(text),public.panda_agent_composite_begin(text,text),public.panda_agent_composite_claim(text,text),public.panda_agent_composite_bind(text,text),public.panda_agent_composite_record(text,text) TO authenticated;

CREATE FUNCTION public.panda_agent_composite_answer_current(g public.panda_agent_composite_turns,a jsonb) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE c public.panda_agent_composite_calls;cite jsonb;matched boolean;v jsonb;n jsonb;BEGIN
 IF jsonb_typeof(a) IS DISTINCT FROM 'object' OR NOT a?&ARRAY['outcome','text','citations'] OR (a-ARRAY['outcome','text','citations'])<>'{}'::jsonb OR coalesce(a->>'outcome','') NOT IN ('evidence','conversation','clarification','insufficient','conflict') OR jsonb_typeof(a->'text') IS DISTINCT FROM 'string' OR length(btrim(a->>'text')) NOT BETWEEN 1 AND 8000 OR octet_length(a::text)>24000 OR jsonb_typeof(a->'citations') IS DISTINCT FROM 'array' OR jsonb_array_length(a->'citations')>4 THEN RETURN false;END IF;
 IF a->>'outcome'='conversation' AND (g.input->>'task' NOT IN ('unit-conversion','project-outline') OR EXISTS(SELECT 1 FROM public.panda_agent_composite_calls x WHERE x.thread_id=g.thread_id AND x.request_id=g.request_id AND x.tool_id NOT IN ('convert_units','format_bom'))) THEN RETURN false;END IF;
 IF (a->>'outcome'='evidence') IS DISTINCT FROM (jsonb_array_length(a->'citations')>0) OR (SELECT coalesce(sum(length(x->>'quote')),0) FROM jsonb_array_elements(a->'citations') x)>600 THEN RETURN false;END IF;
 IF public.panda_agent_composite_grants_current(g) IS NOT TRUE THEN RETURN false;END IF;
 FOR n IN SELECT value FROM jsonb_array_elements(g.plan->'needs') LOOP
  IF n->>'kind'='external-gpio' AND EXISTS(SELECT 1 FROM public.panda_agent_composite_calls x WHERE x.thread_id=g.thread_id AND x.request_id=g.request_id AND x.need_id='vendor-gpio' AND x.state='complete' AND x.result->'answer'->>'outcome'='evidence') THEN CONTINUE;END IF;
  IF NOT EXISTS(SELECT 1 FROM public.panda_agent_composite_calls x WHERE x.thread_id=g.thread_id AND x.request_id=g.request_id AND x.need_id=n->>'id' AND x.tool_id=n->>'toolId' AND x.state='complete') THEN RETURN false;END IF;
 END LOOP;
 IF (SELECT coalesce(sum((x.result->>'contextFragments')::integer),0)>8 OR coalesce(sum((x.result->>'contextUnits')::integer),0)>20000 FROM public.panda_agent_composite_calls x WHERE x.thread_id=g.thread_id AND x.request_id=g.request_id AND x.tool_id='panda_scoped_rag') THEN RETURN false;END IF;
 FOR c IN SELECT * FROM public.panda_agent_composite_calls WHERE thread_id=g.thread_id AND request_id=g.request_id ORDER BY need_id LOOP
  IF c.state<>'complete' OR c.result IS NULL OR c.result_hash IS NULL THEN RETURN false;END IF;
  IF c.scope IS NOT NULL AND c.scope<>'null'::jsonb THEN
   IF c.scope IS DISTINCT FROM public.panda_agent_lightweight_scope((c.scope->>'productId')::uuid) OR public.panda_agent_lightweight_citations_current(c.result->'answer',(c.scope->>'productId')::uuid) IS NOT TRUE THEN RETURN false;END IF;
  ELSIF c.tool_id='panda_scoped_rag' THEN
   IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(g.plan->'needs') n WHERE n->>'id'=c.need_id AND n->>'kind'='vendor-gpio') THEN RETURN false;END IF;
   v:=public.panda_agent_vendor_scope('esp32','5.5.1');
   IF jsonb_array_length(coalesce(c.result->'vendorBindings','[]'::jsonb))>0 THEN
    IF v IS NULL OR c.result->'vendorBindings' IS DISTINCT FROM jsonb_build_array(jsonb_build_object('sourceId',v->>'sourceId','versionId',v->>'versionId','contentHash',v->>'contentHash')) OR c.result->'answer'->'citations'->0->>'quote'<>'#include "driver/gpio.h"' THEN RETURN false;END IF;
   ELSIF c.result->'answer'->'citations'<>'[]'::jsonb THEN RETURN false;END IF;
  END IF;
 END LOOP;
 FOR cite IN SELECT value FROM jsonb_array_elements(a->'citations') LOOP
  SELECT EXISTS(SELECT 1 FROM public.panda_agent_composite_calls x CROSS JOIN LATERAL jsonb_array_elements(coalesce(x.result->'answer'->'citations','[]'::jsonb)) q WHERE x.thread_id=g.thread_id AND x.request_id=g.request_id AND (q-'id')=(cite-'id')) INTO matched;
  IF NOT matched OR coalesce(cite->>'id','')!~'^S[1-4]$' THEN RETURN false;END IF;
 END LOOP;
 IF (SELECT count(DISTINCT x->>'id') FROM jsonb_array_elements(a->'citations') x)<>jsonb_array_length(a->'citations') THEN RETURN false;END IF;
 RETURN true;
EXCEPTION WHEN OTHERS THEN RETURN false;
END $$;
REVOKE ALL ON FUNCTION public.panda_agent_composite_answer_current(public.panda_agent_composite_turns,jsonb) FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.panda_agent_composite_finish(p_payload text,p_mac text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE v jsonb;g public.panda_agent_composite_turns;t public.panda_agent_chat_turns;a jsonb;valid boolean;reason text;BEGIN
 v:=public.panda_agent_composite_verify(p_payload,p_mac,'finish');
 PERFORM 1 FROM public.panda_agent_chats WHERE id=(v->>'thread')::uuid AND owner_subject=public.requesting_user_id() AND archived_at IS NULL FOR UPDATE;IF NOT FOUND THEN PERFORM public.phase3_fail('not_found');END IF;
 SELECT * INTO t FROM public.panda_agent_chat_turns WHERE thread_id=(v->>'thread')::uuid AND request_id=(v->>'request')::uuid FOR UPDATE;IF NOT FOUND THEN PERFORM public.phase3_fail('not_found');END IF;
 SELECT * INTO g FROM public.panda_agent_composite_turns WHERE thread_id=t.thread_id AND request_id=t.request_id AND owner_subject=public.requesting_user_id() FOR UPDATE;IF NOT FOUND THEN PERFORM public.phase3_fail('not_found');END IF;
 IF g.plan_hash IS DISTINCT FROM v->>'planHash' THEN PERFORM public.phase3_fail('conflict');END IF;
 IF (v->>'exp')::bigint<extract(epoch FROM clock_timestamp()) THEN PERFORM public.phase3_fail('unauthenticated');END IF;
 IF t.status='complete' THEN RETURN public.panda_agent_lightweight_read(g.thread_id);END IF;
 IF t.status<>'pending' THEN PERFORM public.phase3_fail('conflict');END IF;
 a:=v->'answer';reason:=v->>'terminalReason';
 IF reason NOT IN ('answered','clarification','insufficient','unavailable','budget_exhausted','cancelled') THEN PERFORM public.phase3_fail('invalid');END IF;
 valid:=NOT g.cancelled AND reason NOT IN ('cancelled','unavailable','budget_exhausted') AND public.panda_agent_composite_answer_current(g,a);
 -- A blocked source lock must not extend the admitted work deadline.
 valid:=valid AND g.deadline_at>clock_timestamp();
 IF valid IS NOT TRUE THEN
  reason:=CASE WHEN g.cancelled OR reason='cancelled' THEN 'cancelled' WHEN g.deadline_at<=clock_timestamp() THEN 'budget_exhausted' ELSE 'unavailable' END;
  a:=jsonb_build_object('outcome','insufficient','text',CASE WHEN reason='cancelled' THEN 'This request was cancelled. Start a new question when ready.' ELSE 'This request ended without a current validated result. No uncertain tool call was repeated. Start a new question.' END,'citations','[]'::jsonb);
 END IF;
 IF (v->>'exp')::bigint<extract(epoch FROM clock_timestamp()) THEN PERFORM public.phase3_fail('unauthenticated');END IF;
 UPDATE public.panda_agent_composite_turns SET terminal_reason=reason WHERE thread_id=g.thread_id AND request_id=g.request_id;
 UPDATE public.panda_agent_lightweight_turns SET approved_response_hash=encode(sha256(convert_to(a::text,'UTF8')),'hex') WHERE thread_id=g.thread_id AND request_id=g.request_id;
 UPDATE public.panda_agent_chat_turns SET response=a,status='complete',completed_at=clock_timestamp() WHERE thread_id=g.thread_id AND request_id=g.request_id;
 UPDATE public.panda_agent_chats SET updated_at=clock_timestamp() WHERE id=g.thread_id;
 RETURN public.panda_agent_lightweight_read(g.thread_id);
END $$;

CREATE FUNCTION public.panda_agent_composite_cancel(p_payload text,p_mac text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE v jsonb;g public.panda_agent_composite_turns;BEGIN
 v:=public.panda_agent_composite_verify(p_payload,p_mac,'cancel');
 PERFORM 1 FROM public.panda_agent_chats WHERE id=(v->>'thread')::uuid AND owner_subject=public.requesting_user_id() AND archived_at IS NULL FOR UPDATE;IF NOT FOUND THEN PERFORM public.phase3_fail('not_found');END IF;
 SELECT * INTO g FROM public.panda_agent_composite_turns WHERE thread_id=(v->>'thread')::uuid AND request_id=(v->>'request')::uuid AND owner_subject=public.requesting_user_id() FOR UPDATE;IF NOT FOUND THEN PERFORM public.phase3_fail('not_found');END IF;
 IF g.plan_hash IS DISTINCT FROM v->>'planHash' THEN PERFORM public.phase3_fail('conflict');END IF;
 IF (v->>'exp')::bigint<extract(epoch FROM clock_timestamp()) THEN PERFORM public.phase3_fail('unauthenticated');END IF;
 UPDATE public.panda_agent_composite_turns SET cancelled=true WHERE thread_id=g.thread_id AND request_id=g.request_id AND terminal_reason IS NULL;
 IF g.terminal_reason IS NULL THEN INSERT INTO public.panda_agent_lightweight_cancelled_requests(owner_subject,request_id,thread_id) VALUES(public.requesting_user_id(),g.request_id,g.thread_id) ON CONFLICT(owner_subject,request_id) DO NOTHING;END IF;
 RETURN jsonb_build_object('ok',true);
END $$;

ALTER FUNCTION public.panda_agent_lightweight_read(uuid) RENAME TO panda_agent_lightweight_read_before_composite;
REVOKE ALL ON FUNCTION public.panda_agent_lightweight_read_before_composite(uuid) FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.panda_agent_lightweight_read(p_thread uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE r jsonb;g public.panda_agent_composite_turns;t public.panda_agent_chat_turns;m public.panda_agent_lightweight_turns;a jsonb;ms jsonb;ts jsonb;cards jsonb;valid boolean;BEGIN
 PERFORM 1 FROM public.panda_agent_chats WHERE id=p_thread AND owner_subject=public.requesting_user_id() FOR SHARE;IF NOT FOUND THEN PERFORM public.phase3_fail('not_found');END IF;
 -- Existing wrappers can already hold lifecycle. Use NOWAIT for all new grant rows.
 FOR g IN SELECT * FROM public.panda_agent_composite_turns WHERE thread_id=p_thread AND owner_subject=public.requesting_user_id() ORDER BY request_id FOR SHARE NOWAIT LOOP
  PERFORM public.panda_agent_composite_grants_current(g);
 END LOOP;
 r:=public.panda_agent_lightweight_read_before_composite(p_thread);ms:=r->'messages';ts:=r->'turns';
 FOR g IN SELECT * FROM public.panda_agent_composite_turns WHERE thread_id=p_thread AND owner_subject=public.requesting_user_id() LOOP
  SELECT coalesce(jsonb_agg(CASE WHEN x->>'requestId'=g.request_id::text THEN x||jsonb_build_object('workflow','agentic') ELSE x END ORDER BY ord),'[]') INTO ts FROM jsonb_array_elements(ts) WITH ORDINALITY z(x,ord);
  SELECT * INTO t FROM public.panda_agent_chat_turns WHERE thread_id=p_thread AND request_id=g.request_id AND status='complete';IF NOT FOUND THEN CONTINUE;END IF;
  SELECT * INTO m FROM public.panda_agent_lightweight_turns WHERE thread_id=p_thread AND request_id=g.request_id;
  valid:=m.approved_response_hash=encode(sha256(convert_to(t.response::text,'UTF8')),'hex');
  IF g.terminal_reason IN ('cancelled','unavailable','budget_exhausted') THEN
   valid:=valid AND t.response->>'outcome'='insufficient' AND t.response->'citations'='[]'::jsonb AND t.response->>'text' IN ('This request was cancelled. Start a new question when ready.','This request ended without a current validated result. No uncertain tool call was repeated. Start a new question.');
  ELSE valid:=valid AND public.panda_agent_composite_answer_current(g,t.response);END IF;
  IF valid IS TRUE THEN a:=t.response;
  ELSE a:=jsonb_build_object('outcome','insufficient','text','This saved assistance is unavailable because a source, skill or tool grant is no longer current.','citations','[]'::jsonb);END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object('toolId',tool_id,'state',CASE WHEN state='complete' THEN 'complete' ELSE 'unknown' END) ORDER BY need_id),'[]') INTO cards FROM public.panda_agent_composite_calls WHERE thread_id=g.thread_id AND request_id=g.request_id;
  SELECT coalesce(jsonb_agg(CASE WHEN x->>'id'=t.assistant_message_id::text THEN x||jsonb_build_object('text',a->>'text','citations',a->'citations','toolCards',CASE WHEN valid THEN cards ELSE '[]'::jsonb END,'terminalReason',CASE WHEN valid THEN g.terminal_reason ELSE 'unavailable' END) ELSE x END ORDER BY ord),'[]') INTO ms FROM jsonb_array_elements(ms) WITH ORDINALITY z(x,ord);
  SELECT coalesce(jsonb_agg(CASE WHEN x->>'requestId'=t.request_id::text THEN x||jsonb_build_object('response',a) ELSE x END ORDER BY ord),'[]') INTO ts FROM jsonb_array_elements(ts) WITH ORDINALITY z(x,ord);
 END LOOP;
 RETURN r||jsonb_build_object('messages',ms,'turns',ts);
END $$;
REVOKE ALL ON FUNCTION public.panda_agent_composite_finish(text,text),public.panda_agent_composite_cancel(text,text),public.panda_agent_lightweight_read(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.panda_agent_composite_finish(text,text),public.panda_agent_composite_cancel(text,text),public.panda_agent_lightweight_read(uuid) TO authenticated;

-- A signed old workflow cannot take over a composite UUID, including cancellation.
DO $block$
DECLARE action text;name text;prior text;BEGIN
 FOREACH action IN ARRAY ARRAY['begin','prepare','complete','cancel'] LOOP
  name:='panda_agent_lightweight_'||action;prior:=name||'_before_composite';
  EXECUTE format('ALTER FUNCTION public.%I(text,text) RENAME TO %I',name,prior);
  EXECUTE format('REVOKE ALL ON FUNCTION public.%I(text,text) FROM PUBLIC,anon,authenticated',prior);
  EXECUTE format($definition$
   CREATE FUNCTION public.%I(p_payload text,p_mac text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $body$
   DECLARE v jsonb;BEGIN
    v:=public.panda_agent_lightweight_verify(p_payload,p_mac,%L);
    PERFORM 1 FROM public.panda_agent_chats WHERE id=(v->>'thread')::uuid AND owner_subject=public.requesting_user_id() AND archived_at IS NULL FOR UPDATE;IF NOT FOUND THEN PERFORM public.phase3_fail('not_found');END IF;
    IF EXISTS(SELECT 1 FROM public.panda_agent_composite_turns WHERE thread_id=(v->>'thread')::uuid AND request_id=(v->>'request')::uuid) THEN PERFORM public.phase3_fail('conflict');END IF;
    RETURN public.%I(p_payload,p_mac);
   END $body$
  $definition$,name,action,prior);
  EXECUTE format('REVOKE ALL ON FUNCTION public.%I(text,text) FROM PUBLIC,anon',name);
  EXECUTE format('GRANT EXECUTE ON FUNCTION public.%I(text,text) TO authenticated',name);
 END LOOP;
END $block$;
