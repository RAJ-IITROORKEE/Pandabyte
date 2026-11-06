-- Additive native admission only. No runtime/provider activation or historical rewrite.
-- Rollback is to leave this empty journal unused; do not drop receipts after dispatch.
CREATE TABLE public.panda_agent_native_runs (
 thread_id uuid NOT NULL,
 request_id uuid NOT NULL,
 owner_subject text NOT NULL CHECK(length(owner_subject) BETWEEN 1 AND 512),
 receipt jsonb NOT NULL CHECK(jsonb_typeof(receipt)='object' AND octet_length(receipt::text)<2048),
 message_id text NOT NULL CHECK(message_id ~ '^msg_[a-f0-9]{12}[A-Za-z0-9]{14}$'),
 prompt_hash text NOT NULL CHECK(prompt_hash ~ '^[a-f0-9]{64}$'),
 runtime_binding text NOT NULL CHECK(runtime_binding ~ '^[a-f0-9]{64}$'),
 scopes jsonb NOT NULL CHECK(jsonb_typeof(scopes)='array' AND jsonb_array_length(scopes)<=4),
 phase text NOT NULL DEFAULT 'admitted' CHECK(phase IN ('admitted','create_claimed','created','prompt_claimed','accepted','cancel_requested','unknown','terminal')),
 version integer NOT NULL DEFAULT 1 CHECK(version>0),
 create_claimed boolean NOT NULL DEFAULT false,
 prompt_claimed boolean NOT NULL DEFAULT false,
 cancel_requested boolean NOT NULL DEFAULT false,
 removal_claimed boolean NOT NULL DEFAULT false,
 runtime_retired boolean NOT NULL DEFAULT false,
 terminal_reason text CHECK(terminal_reason IN ('answered','cancelled','unavailable')),
 native_outcome text CHECK(native_outcome IN ('succeeded','failed','interrupted')),
 response_hash text CHECK(response_hash ~ '^[a-f0-9]{64}$'),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(thread_id,request_id), UNIQUE(owner_subject,request_id),
 FOREIGN KEY(thread_id,request_id) REFERENCES public.panda_agent_lightweight_turns(thread_id,request_id) ON DELETE CASCADE,
 CHECK(NOT prompt_claimed OR create_claimed),
 CHECK(phase<>'admitted' OR NOT (create_claimed OR prompt_claimed OR cancel_requested)),
 CHECK((phase='terminal')=(terminal_reason IS NOT NULL)),
 CHECK((phase='terminal')=(response_hash IS NOT NULL)),
 CHECK(phase='terminal' OR native_outcome IS NULL),
 CHECK(phase NOT IN ('create_claimed','created','prompt_claimed','accepted') OR create_claimed),
 CHECK(phase NOT IN ('prompt_claimed','accepted') OR prompt_claimed),
 CHECK(phase<>'cancel_requested' OR cancel_requested),
 CHECK(NOT removal_claimed OR phase='terminal'),
 CHECK(NOT runtime_retired OR (phase='terminal' AND removal_claimed))
);
CREATE UNIQUE INDEX panda_agent_native_session_unique ON public.panda_agent_native_runs((receipt->>'sessionID'));
ALTER TABLE public.panda_agent_native_runs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.panda_agent_native_runs FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.panda_agent_native_verify(p_payload text,p_mac text,p_action text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE v jsonb; expected text; actor text:=public.requesting_user_id();
BEGIN
 IF actor IS NULL THEN PERFORM public.phase3_fail('unauthenticated'); END IF;
 IF p_payload IS NULL OR octet_length(p_payload)>32768 OR p_mac IS NULL OR p_mac !~ '^[a-f0-9]{64}$' THEN PERFORM public.phase3_fail('invalid'); END IF;
 SELECT encode(public.hmac(convert_to('panda-native-db-v1'||chr(10)||p_payload,'UTF8'),key_bytes,'sha256'),'hex') INTO expected FROM public.panda_agent_lightweight_key WHERE singleton;
 IF expected IS NULL OR sha256(decode(expected,'hex'))<>sha256(decode(p_mac,'hex')) THEN PERFORM public.phase3_fail('unauthenticated'); END IF;
 v:=p_payload::jsonb;
 IF jsonb_typeof(v) IS DISTINCT FROM 'object' OR NOT v ?& ARRAY['v','action','subject','exp','input']
 OR (SELECT count(*) FROM jsonb_object_keys(v))<>5 OR v->'v' IS DISTINCT FROM '1'::jsonb
 OR v->>'action' IS DISTINCT FROM p_action OR v->>'subject' IS DISTINCT FROM actor
 OR jsonb_typeof(v->'input') IS DISTINCT FROM 'object' OR jsonb_typeof(v->'exp') IS DISTINCT FROM 'number'
 OR coalesce(v->>'exp','') !~ '^[0-9]{1,11}$' THEN PERFORM public.phase3_fail('invalid'); END IF;
 IF (v->>'exp')::bigint<extract(epoch FROM clock_timestamp()) OR (v->>'exp')::bigint>extract(epoch FROM clock_timestamp())+65 THEN PERFORM public.phase3_fail('unauthenticated'); END IF;
 RETURN v->'input';
END $$;
REVOKE ALL ON FUNCTION public.panda_agent_native_verify(text,text,text) FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.panda_agent_native_state_json(g public.panda_agent_native_runs) RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path=pg_catalog,public,pg_temp AS $$
 SELECT jsonb_build_object('receipt',g.receipt,'messageID',g.message_id,'promptHash',g.prompt_hash,'runtimeBinding',g.runtime_binding,'scopes',g.scopes,
 'phase',g.phase,'version',g.version,'createClaimed',g.create_claimed,'promptClaimed',g.prompt_claimed,'cancelRequested',g.cancel_requested,
 'terminalReason',g.terminal_reason,'nativeOutcome',g.native_outcome,'responseHash',g.response_hash,'removalClaimed',g.removal_claimed,'runtimeRetired',g.runtime_retired)
$$;
REVOKE ALL ON FUNCTION public.panda_agent_native_state_json(public.panda_agent_native_runs) FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.panda_agent_native_grants_current(g public.panda_agent_native_runs) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE s public.panda_agent_skills; epoch integer;
BEGIN
 -- Admission currently inherits the existing QA capability, including for conversation.
 SELECT * INTO s FROM public.panda_agent_skills WHERE id='product-evidence-qa' FOR SHARE;
 SELECT qa_skill_epoch INTO epoch FROM public.panda_agent_lightweight_turns WHERE thread_id=g.thread_id AND request_id=g.request_id AND owner_subject=g.owner_subject;
 RETURN coalesce(s.enabled AND epoch=s.version,false);
END $$;
REVOKE ALL ON FUNCTION public.panda_agent_native_grants_current(public.panda_agent_native_runs) FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.panda_agent_native_scopes_current(p_scopes jsonb) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE s jsonb;
BEGIN
 IF jsonb_typeof(p_scopes) IS DISTINCT FROM 'array' OR jsonb_array_length(p_scopes)>4 THEN RETURN false; END IF;
 IF (SELECT count(DISTINCT (x->>'productId')::uuid) FROM jsonb_array_elements(p_scopes) x)<>jsonb_array_length(p_scopes) THEN RETURN false; END IF;
 FOR s IN SELECT value FROM jsonb_array_elements(p_scopes) LOOP
  IF jsonb_typeof(s) IS DISTINCT FROM 'object' OR NOT s ?& ARRAY['productId','scopeHash'] OR (SELECT count(*) FROM jsonb_object_keys(s))<>2
  OR jsonb_typeof(s->'productId') IS DISTINCT FROM 'string' OR jsonb_typeof(s->'scopeHash') IS DISTINCT FROM 'string' OR coalesce(s->>'scopeHash','') !~ '^[a-f0-9]{64}$'
  OR (public.panda_agent_lightweight_scope((s->>'productId')::uuid)->>'scopeHash') IS DISTINCT FROM s->>'scopeHash' THEN RETURN false; END IF;
 END LOOP;
 RETURN true;
EXCEPTION WHEN OTHERS THEN RETURN false;
END $$;

REVOKE ALL ON FUNCTION public.panda_agent_native_scopes_current(jsonb) FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.panda_agent_native_answer_current(g public.panda_agent_native_runs,p_answer jsonb) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE c jsonb; s jsonb; matched boolean;
BEGIN
 IF jsonb_typeof(p_answer) IS DISTINCT FROM 'object' OR NOT p_answer ?& ARRAY['outcome','text','citations']
 OR (SELECT count(*) FROM jsonb_object_keys(p_answer))<>3 OR jsonb_typeof(p_answer->'text') IS DISTINCT FROM 'string'
 OR length(btrim(p_answer->>'text')) NOT BETWEEN 1 AND 8000 OR octet_length(p_answer::text)>24000
 OR jsonb_typeof(p_answer->'citations') IS DISTINCT FROM 'array' OR jsonb_array_length(p_answer->'citations')>4 THEN RETURN false; END IF;
 IF public.panda_agent_native_grants_current(g) IS NOT TRUE OR public.panda_agent_native_scopes_current(g.scopes) IS NOT TRUE THEN RETURN false; END IF;
 IF jsonb_array_length(p_answer->'citations')=0 THEN RETURN coalesce(p_answer->>'outcome' IN ('conversation','clarification','insufficient','conflict'),false); END IF;
 IF p_answer->>'outcome' IS DISTINCT FROM 'evidence' THEN RETURN false; END IF;
 IF (SELECT count(DISTINCT x->>'id') FROM jsonb_array_elements(p_answer->'citations') x)<>jsonb_array_length(p_answer->'citations') THEN RETURN false; END IF;
 FOR c IN SELECT value FROM jsonb_array_elements(p_answer->'citations') LOOP
  IF jsonb_typeof(c) IS DISTINCT FROM 'object' OR NOT c ?& ARRAY['id','title','sourceUrl','quote','sectionPath','capturedAt']
  OR (SELECT count(*) FROM jsonb_object_keys(c))<>6 OR jsonb_typeof(c->'id') IS DISTINCT FROM 'string' OR coalesce(c->>'id','') !~ '^S[1-4]$'
  OR jsonb_typeof(c->'quote') IS DISTINCT FROM 'string' OR length(btrim(c->>'quote')) NOT BETWEEN 1 AND 600 THEN RETURN false; END IF;
  matched:=false;
  FOR s IN SELECT value FROM jsonb_array_elements(g.scopes) LOOP
   IF public.panda_agent_lightweight_citations_current(jsonb_build_object('outcome','evidence','text',p_answer->>'text','citations',jsonb_build_array(c)),(s->>'productId')::uuid) THEN matched:=true; EXIT; END IF;
  END LOOP;
  IF NOT matched THEN RETURN false; END IF;
 END LOOP;
 RETURN true;
EXCEPTION WHEN OTHERS THEN RETURN false;
END $$;
REVOKE ALL ON FUNCTION public.panda_agent_native_answer_current(public.panda_agent_native_runs,jsonb) FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.panda_agent_native_admit(p_payload text,p_mac text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE v jsonb; r jsonb; g public.panda_agent_native_runs; old_payload text; old_mac text; result jsonb;
BEGIN
 v:=public.panda_agent_native_verify(p_payload,p_mac,'admit'); r:=v->'receipt';
 IF NOT v ?& ARRAY['thread','request','question','receipt','messageID','promptHash','runtimeBinding','scopes'] OR (SELECT count(*) FROM jsonb_object_keys(v))<>8
 OR jsonb_typeof(v->'question') IS DISTINCT FROM 'string' OR length(btrim(v->>'question')) NOT BETWEEN 1 AND 2000
 OR jsonb_typeof(v->'thread') IS DISTINCT FROM 'string' OR jsonb_typeof(v->'request') IS DISTINCT FROM 'string'
 OR jsonb_typeof(v->'messageID') IS DISTINCT FROM 'string' OR jsonb_typeof(v->'promptHash') IS DISTINCT FROM 'string' OR jsonb_typeof(v->'runtimeBinding') IS DISTINCT FROM 'string'
 OR coalesce(v->>'messageID','') !~ '^msg_[a-f0-9]{12}[A-Za-z0-9]{14}$' OR coalesce(v->>'promptHash','') !~ '^[a-f0-9]{64}$'
 OR coalesce(v->>'runtimeBinding','') !~ '^[a-f0-9]{64}$' THEN PERFORM public.phase3_fail('invalid'); END IF;
 IF jsonb_typeof(r) IS DISTINCT FROM 'object' OR NOT r ?& ARRAY['sessionID','title','nonce','scope','binding'] OR (SELECT count(*) FROM jsonb_object_keys(r))<>5
 OR EXISTS(SELECT 1 FROM jsonb_each(r) x WHERE jsonb_typeof(x.value) IS DISTINCT FROM 'string')
 OR r->>'scope' IS DISTINCT FROM 'customer' OR coalesce(r->>'sessionID','') !~ '^ses_[a-f0-9]{12}[A-Za-z0-9]{14}$'
 OR coalesce(r->>'nonce','') !~ '^[a-f0-9]{32}$' OR coalesce(r->>'binding','') !~ '^[a-f0-9]{64}$'
 OR r->>'title' IS DISTINCT FROM 'panda-agent-customer-'||(r->>'nonce') THEN PERFORM public.phase3_fail('invalid'); END IF;
 PERFORM 1 FROM public.panda_agent_chats WHERE id=(v->>'thread')::uuid AND owner_subject=public.requesting_user_id() AND archived_at IS NULL FOR UPDATE;
 IF NOT FOUND THEN PERFORM public.phase3_fail('not_found'); END IF;
 SELECT * INTO g FROM public.panda_agent_native_runs WHERE thread_id=(v->>'thread')::uuid AND request_id=(v->>'request')::uuid FOR UPDATE;
 IF FOUND THEN
  IF g.owner_subject IS DISTINCT FROM public.requesting_user_id() OR g.receipt IS DISTINCT FROM r OR g.message_id IS DISTINCT FROM v->>'messageID'
  OR g.prompt_hash IS DISTINCT FROM v->>'promptHash' OR g.runtime_binding IS DISTINCT FROM v->>'runtimeBinding' OR g.scopes IS DISTINCT FROM v->'scopes'
  OR NOT EXISTS(SELECT 1 FROM public.panda_agent_chat_turns WHERE thread_id=g.thread_id AND request_id=g.request_id AND question=btrim(v->>'question')) THEN PERFORM public.phase3_fail('conflict'); END IF;
  PERFORM public.panda_agent_native_verify(p_payload,p_mac,'admit');
  RETURN jsonb_build_object('admitted',false,'state',public.panda_agent_native_state_json(g));
 END IF;
 IF public.panda_agent_native_scopes_current(v->'scopes') IS NOT TRUE THEN PERFORM public.phase3_fail('conflict'); END IF;
 -- Preserve all existing cancellation, quota and owner admission guards.
 old_payload:=jsonb_build_object('v',1,'action','begin','subject',public.requesting_user_id(),'exp',(p_payload::jsonb)->'exp','thread',v->>'thread','request',v->>'request','question',v->>'question')::text;
 SELECT encode(public.hmac(convert_to('panda-lightweight-db-v1'||chr(10)||old_payload,'UTF8'),key_bytes,'sha256'),'hex') INTO old_mac FROM public.panda_agent_lightweight_key WHERE singleton;
 result:=public.panda_agent_lightweight_begin(old_payload,old_mac);
 IF result->'admitted' IS DISTINCT FROM 'true'::jsonb THEN PERFORM public.phase3_fail('conflict'); END IF;
 INSERT INTO public.panda_agent_native_runs(thread_id,request_id,owner_subject,receipt,message_id,prompt_hash,runtime_binding,scopes)
 VALUES((v->>'thread')::uuid,(v->>'request')::uuid,public.requesting_user_id(),r,v->>'messageID',v->>'promptHash',v->>'runtimeBinding',v->'scopes') RETURNING * INTO g;
 IF (p_payload::jsonb->>'exp')::bigint<extract(epoch FROM clock_timestamp()) THEN PERFORM public.phase3_fail('unauthenticated'); END IF;
 RETURN jsonb_build_object('admitted',true,'state',public.panda_agent_native_state_json(g));
END $$;

CREATE FUNCTION public.panda_agent_native_state(p_payload text,p_mac text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE v jsonb; g public.panda_agent_native_runs;
BEGIN
 v:=public.panda_agent_native_verify(p_payload,p_mac,'state');
 IF NOT v ?& ARRAY['thread','request'] OR (SELECT count(*) FROM jsonb_object_keys(v))<>2 THEN PERFORM public.phase3_fail('invalid'); END IF;
 PERFORM 1 FROM public.panda_agent_chats WHERE id=(v->>'thread')::uuid AND owner_subject=public.requesting_user_id() FOR SHARE;
 IF NOT FOUND THEN PERFORM public.phase3_fail('not_found'); END IF;
 SELECT * INTO g FROM public.panda_agent_native_runs WHERE thread_id=(v->>'thread')::uuid AND request_id=(v->>'request')::uuid AND owner_subject=public.requesting_user_id();
 PERFORM public.panda_agent_native_verify(p_payload,p_mac,'state');
 IF g.thread_id IS NULL THEN RETURN NULL; END IF;
 RETURN public.panda_agent_native_state_json(g);
END $$;

CREATE FUNCTION public.panda_agent_native_transition(p_payload text,p_mac text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE v jsonb; g public.panda_agent_native_runs; target text;
BEGIN
 v:=public.panda_agent_native_verify(p_payload,p_mac,'transition');
 IF NOT v ?& ARRAY['thread','request','expectedVersion','event'] OR (SELECT count(*) FROM jsonb_object_keys(v))<>4
 OR jsonb_typeof(v->'expectedVersion') IS DISTINCT FROM 'number' OR coalesce(v->>'expectedVersion','') !~ '^[1-9][0-9]{0,8}$'
 OR coalesce(v->>'event','') NOT IN ('claim_create','created','claim_prompt','accepted','cancel_requested','unknown') THEN PERFORM public.phase3_fail('invalid'); END IF;
 PERFORM 1 FROM public.panda_agent_chats WHERE id=(v->>'thread')::uuid AND owner_subject=public.requesting_user_id() AND archived_at IS NULL FOR UPDATE;
 IF NOT FOUND THEN PERFORM public.phase3_fail('not_found'); END IF;
 PERFORM 1 FROM public.panda_agent_chat_turns WHERE thread_id=(v->>'thread')::uuid AND request_id=(v->>'request')::uuid AND status='pending' FOR UPDATE;
 IF NOT FOUND THEN PERFORM public.phase3_fail('conflict'); END IF;
 SELECT * INTO g FROM public.panda_agent_native_runs WHERE thread_id=(v->>'thread')::uuid AND request_id=(v->>'request')::uuid AND owner_subject=public.requesting_user_id() FOR UPDATE;
 IF NOT FOUND THEN PERFORM public.phase3_fail('not_found'); END IF;
 IF g.version<>(v->>'expectedVersion')::integer OR g.phase='terminal' THEN PERFORM public.phase3_fail('conflict'); END IF;
 target:=CASE
  WHEN v->>'event'='claim_create' AND g.phase='admitted' AND NOT g.create_claimed AND NOT g.cancel_requested THEN 'create_claimed'
  WHEN v->>'event'='created' AND g.phase='create_claimed' AND NOT g.cancel_requested THEN 'created'
  WHEN v->>'event'='claim_prompt' AND g.phase='created' AND NOT g.prompt_claimed AND NOT g.cancel_requested THEN 'prompt_claimed'
  WHEN v->>'event'='accepted' AND g.phase='prompt_claimed' AND NOT g.cancel_requested THEN 'accepted'
  WHEN v->>'event'='cancel_requested' THEN 'cancel_requested'
  WHEN v->>'event'='unknown' AND g.phase IN ('create_claimed','prompt_claimed','accepted','cancel_requested') THEN 'unknown'
 END;
 IF target IS NULL THEN PERFORM public.phase3_fail('conflict'); END IF;
 IF target='prompt_claimed' AND (public.panda_agent_native_grants_current(g) IS NOT TRUE OR public.panda_agent_native_scopes_current(g.scopes) IS NOT TRUE) THEN PERFORM public.phase3_fail('conflict'); END IF;
 IF (p_payload::jsonb->>'exp')::bigint<extract(epoch FROM clock_timestamp()) THEN PERFORM public.phase3_fail('unauthenticated'); END IF;
 UPDATE public.panda_agent_native_runs SET phase=target,version=version+1,create_claimed=create_claimed OR target='create_claimed',
 prompt_claimed=prompt_claimed OR target='prompt_claimed',cancel_requested=cancel_requested OR target='cancel_requested',updated_at=clock_timestamp()
 WHERE thread_id=g.thread_id AND request_id=g.request_id RETURNING * INTO g;
 RETURN public.panda_agent_native_state_json(g);
END $$;

CREATE FUNCTION public.panda_agent_native_complete(p_payload text,p_mac text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE v jsonb; g public.panda_agent_native_runs; answer jsonb; digest text;
BEGIN
 v:=public.panda_agent_native_verify(p_payload,p_mac,'complete'); answer:=v->'answer';
 IF NOT v ?& ARRAY['thread','request','expectedVersion','answer','nativeOutcome','terminalReason'] OR (SELECT count(*) FROM jsonb_object_keys(v))<>6
 OR jsonb_typeof(v->'expectedVersion') IS DISTINCT FROM 'number' OR coalesce(v->>'expectedVersion','') !~ '^[1-9][0-9]{0,8}$'
 OR coalesce(v->>'terminalReason','') NOT IN ('answered','cancelled','unavailable') OR NOT (v->'nativeOutcome'='null'::jsonb OR v->>'nativeOutcome' IN ('succeeded','failed','interrupted'))
 OR jsonb_typeof(answer) IS DISTINCT FROM 'object' THEN PERFORM public.phase3_fail('invalid'); END IF;
 PERFORM 1 FROM public.panda_agent_chats WHERE id=(v->>'thread')::uuid AND owner_subject=public.requesting_user_id() AND archived_at IS NULL FOR UPDATE;
 IF NOT FOUND THEN PERFORM public.phase3_fail('not_found'); END IF;
 PERFORM 1 FROM public.panda_agent_chat_turns WHERE thread_id=(v->>'thread')::uuid AND request_id=(v->>'request')::uuid FOR UPDATE;
 IF NOT FOUND THEN PERFORM public.phase3_fail('not_found'); END IF;
 SELECT * INTO g FROM public.panda_agent_native_runs WHERE thread_id=(v->>'thread')::uuid AND request_id=(v->>'request')::uuid AND owner_subject=public.requesting_user_id() FOR UPDATE;
 IF NOT FOUND THEN PERFORM public.phase3_fail('not_found'); END IF;
 digest:=encode(sha256(convert_to(answer::text,'UTF8')),'hex');
 PERFORM public.panda_agent_native_verify(p_payload,p_mac,'complete');
 IF g.phase='terminal' THEN
  IF g.response_hash IS DISTINCT FROM digest OR g.native_outcome IS DISTINCT FROM v->>'nativeOutcome' OR g.terminal_reason IS DISTINCT FROM v->>'terminalReason' THEN PERFORM public.phase3_fail('conflict'); END IF;
  RETURN public.panda_agent_native_state_json(g);
 END IF;
 IF g.version<>(v->>'expectedVersion')::integer THEN PERFORM public.phase3_fail('conflict'); END IF;
 IF v->>'terminalReason'='answered' THEN
  IF NOT g.prompt_claimed OR g.cancel_requested OR v->>'nativeOutcome' IS DISTINCT FROM 'succeeded'
  OR public.panda_agent_native_answer_current(g,answer) IS NOT TRUE THEN PERFORM public.phase3_fail('conflict'); END IF;
 ELSE
  IF answer IS DISTINCT FROM jsonb_build_object('outcome','insufficient','text',CASE WHEN v->>'terminalReason'='cancelled' THEN 'This request was cancelled. Start a new question when ready.' ELSE 'This request ended without a current validated result. No uncertain request was repeated. Start a new question.' END,'citations','[]'::jsonb) THEN PERFORM public.phase3_fail('invalid'); END IF;
  IF v->>'terminalReason'='cancelled' THEN
   IF NOT g.cancel_requested OR (g.prompt_claimed AND v->>'nativeOutcome' IS DISTINCT FROM 'interrupted') OR (NOT g.prompt_claimed AND v->'nativeOutcome' IS DISTINCT FROM 'null'::jsonb) THEN PERFORM public.phase3_fail('conflict'); END IF;
  ELSIF g.prompt_claimed AND v->'nativeOutcome'='null'::jsonb THEN PERFORM public.phase3_fail('conflict'); END IF;
 END IF;
 IF (p_payload::jsonb->>'exp')::bigint<extract(epoch FROM clock_timestamp()) THEN PERFORM public.phase3_fail('unauthenticated'); END IF;
 UPDATE public.panda_agent_native_runs SET phase='terminal',version=version+1,terminal_reason=v->>'terminalReason',native_outcome=v->>'nativeOutcome',response_hash=digest,updated_at=clock_timestamp()
 WHERE thread_id=g.thread_id AND request_id=g.request_id RETURNING * INTO g;
 UPDATE public.panda_agent_lightweight_turns SET approved_response_hash=digest WHERE thread_id=g.thread_id AND request_id=g.request_id AND owner_subject=g.owner_subject;
 UPDATE public.panda_agent_chat_turns SET response=answer,status='complete',completed_at=clock_timestamp() WHERE thread_id=g.thread_id AND request_id=g.request_id AND status='pending';
 IF NOT FOUND THEN PERFORM public.phase3_fail('conflict'); END IF;
 UPDATE public.panda_agent_chats SET updated_at=clock_timestamp() WHERE id=g.thread_id;
 RETURN public.panda_agent_native_state_json(g);
END $$;
REVOKE ALL ON FUNCTION public.panda_agent_native_complete(text,text) FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.panda_agent_native_claim_removal(p_payload text,p_mac text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE v jsonb; g public.panda_agent_native_runs;
BEGIN
 v:=public.panda_agent_native_verify(p_payload,p_mac,'claim_removal');
 IF NOT v ?& ARRAY['thread','request','expectedVersion'] OR (SELECT count(*) FROM jsonb_object_keys(v))<>3
 OR jsonb_typeof(v->'expectedVersion') IS DISTINCT FROM 'number' OR coalesce(v->>'expectedVersion','') !~ '^[1-9][0-9]{0,8}$' THEN PERFORM public.phase3_fail('invalid'); END IF;
 PERFORM 1 FROM public.panda_agent_chats WHERE id=(v->>'thread')::uuid AND owner_subject=public.requesting_user_id() FOR UPDATE;
 IF NOT FOUND THEN PERFORM public.phase3_fail('not_found'); END IF;
 SELECT * INTO g FROM public.panda_agent_native_runs WHERE thread_id=(v->>'thread')::uuid AND request_id=(v->>'request')::uuid AND owner_subject=public.requesting_user_id() FOR UPDATE;
 IF NOT FOUND THEN PERFORM public.phase3_fail('not_found'); END IF;
 IF g.phase<>'terminal' OR g.removal_claimed OR g.runtime_retired OR g.version<>(v->>'expectedVersion')::integer THEN PERFORM public.phase3_fail('conflict'); END IF;
 PERFORM public.panda_agent_native_verify(p_payload,p_mac,'claim_removal');
 UPDATE public.panda_agent_native_runs SET removal_claimed=true,version=version+1,updated_at=clock_timestamp() WHERE thread_id=g.thread_id AND request_id=g.request_id RETURNING * INTO g;
 RETURN public.panda_agent_native_state_json(g);
END $$;
REVOKE ALL ON FUNCTION public.panda_agent_native_claim_removal(text,text) FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.panda_agent_native_retire(p_payload text,p_mac text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE v jsonb; g public.panda_agent_native_runs;
BEGIN
 -- The BFF signs this only after owned, inactive native deletion and verified absence.
 v:=public.panda_agent_native_verify(p_payload,p_mac,'retire');
 IF NOT v ?& ARRAY['thread','request','expectedVersion'] OR (SELECT count(*) FROM jsonb_object_keys(v))<>3
 OR jsonb_typeof(v->'expectedVersion') IS DISTINCT FROM 'number' OR coalesce(v->>'expectedVersion','') !~ '^[1-9][0-9]{0,8}$' THEN PERFORM public.phase3_fail('invalid'); END IF;
 PERFORM 1 FROM public.panda_agent_chats WHERE id=(v->>'thread')::uuid AND owner_subject=public.requesting_user_id() FOR UPDATE;
 IF NOT FOUND THEN PERFORM public.phase3_fail('not_found'); END IF;
 SELECT * INTO g FROM public.panda_agent_native_runs WHERE thread_id=(v->>'thread')::uuid AND request_id=(v->>'request')::uuid AND owner_subject=public.requesting_user_id() FOR UPDATE;
 IF NOT FOUND THEN PERFORM public.phase3_fail('not_found'); END IF;
 PERFORM public.panda_agent_native_verify(p_payload,p_mac,'retire');
 IF g.phase<>'terminal' OR NOT g.removal_claimed THEN PERFORM public.phase3_fail('conflict'); END IF;
 IF g.runtime_retired THEN RETURN public.panda_agent_native_state_json(g); END IF;
 IF g.version<>(v->>'expectedVersion')::integer THEN PERFORM public.phase3_fail('conflict'); END IF;
 IF (p_payload::jsonb->>'exp')::bigint<extract(epoch FROM clock_timestamp()) THEN PERFORM public.phase3_fail('unauthenticated'); END IF;
 UPDATE public.panda_agent_native_runs SET runtime_retired=true,version=version+1,updated_at=clock_timestamp() WHERE thread_id=g.thread_id AND request_id=g.request_id RETURNING * INTO g;
 RETURN public.panda_agent_native_state_json(g);
END $$;
REVOKE ALL ON FUNCTION public.panda_agent_native_retire(text,text) FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.panda_agent_native_write_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE g public.panda_agent_native_runs;
BEGIN
 SELECT * INTO g FROM public.panda_agent_native_runs WHERE thread_id=NEW.thread_id AND request_id=NEW.request_id;
 IF FOUND AND (g.phase<>'terminal' OR g.response_hash IS DISTINCT FROM encode(sha256(convert_to(NEW.response::text,'UTF8')),'hex')) THEN PERFORM public.phase3_fail('conflict'); END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.panda_agent_native_write_guard() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER panda_agent_native_write_guard BEFORE UPDATE OF response,status ON public.panda_agent_chat_turns FOR EACH ROW EXECUTE FUNCTION public.panda_agent_native_write_guard();

CREATE FUNCTION public.panda_agent_native_prepare_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM public.panda_agent_native_runs WHERE thread_id=NEW.thread_id AND request_id=NEW.request_id)
 AND (NEW.request_hash,NEW.product_id,NEW.sku,NEW.scope_hash) IS DISTINCT FROM (OLD.request_hash,OLD.product_id,OLD.sku,OLD.scope_hash) THEN PERFORM public.phase3_fail('conflict'); END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.panda_agent_native_prepare_guard() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER panda_agent_native_prepare_guard BEFORE UPDATE OF request_hash,product_id,sku,scope_hash ON public.panda_agent_lightweight_turns FOR EACH ROW EXECUTE FUNCTION public.panda_agent_native_prepare_guard();

CREATE FUNCTION public.panda_agent_native_delete_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
BEGIN
 IF OLD.phase<>'terminal' OR NOT OLD.runtime_retired THEN PERFORM public.phase3_fail('conflict'); END IF;
 RETURN OLD;
END $$;
REVOKE ALL ON FUNCTION public.panda_agent_native_delete_guard() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER panda_agent_native_delete_guard BEFORE DELETE ON public.panda_agent_native_runs FOR EACH ROW EXECUTE FUNCTION public.panda_agent_native_delete_guard();

CREATE FUNCTION public.panda_agent_native_read(p_thread uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE r jsonb; g public.panda_agent_native_runs; t public.panda_agent_chat_turns; a jsonb; valid boolean; ms jsonb; ts jsonb;
BEGIN
 PERFORM 1 FROM public.panda_agent_chats WHERE id=p_thread AND owner_subject=public.requesting_user_id() FOR SHARE;
 IF NOT FOUND THEN PERFORM public.phase3_fail('not_found'); END IF;
 r:=public.panda_agent_lightweight_read(p_thread); ms:=r->'messages'; ts:=r->'turns';
 FOR g IN SELECT * FROM public.panda_agent_native_runs WHERE thread_id=p_thread AND owner_subject=public.requesting_user_id() AND phase='terminal' LOOP
  SELECT * INTO t FROM public.panda_agent_chat_turns WHERE thread_id=g.thread_id AND request_id=g.request_id AND status='complete';
  IF NOT FOUND THEN CONTINUE; END IF;
  valid:=g.response_hash=encode(sha256(convert_to(t.response::text,'UTF8')),'hex') AND EXISTS(SELECT 1 FROM public.panda_agent_lightweight_turns WHERE thread_id=g.thread_id AND request_id=g.request_id AND owner_subject=g.owner_subject AND approved_response_hash=g.response_hash AND request_hash IS NULL);
  IF g.terminal_reason='answered' THEN valid:=valid AND public.panda_agent_native_answer_current(g,t.response);
  ELSE valid:=valid AND t.response=jsonb_build_object('outcome','insufficient','text',CASE WHEN g.terminal_reason='cancelled' THEN 'This request was cancelled. Start a new question when ready.' ELSE 'This request ended without a current validated result. No uncertain request was repeated. Start a new question.' END,'citations','[]'::jsonb); END IF;
  IF valid IS TRUE THEN a:=t.response;
  ELSE a:=jsonb_build_object('outcome','insufficient','text','This saved answer is unavailable because its source or verification is no longer current.','citations','[]'::jsonb); END IF;
  SELECT coalesce(jsonb_agg(CASE WHEN x->>'id'=t.assistant_message_id::text THEN x||jsonb_build_object('text',a->>'text','citations',a->'citations') ELSE x END ORDER BY ord),'[]') INTO ms FROM jsonb_array_elements(ms) WITH ORDINALITY z(x,ord);
  SELECT coalesce(jsonb_agg(CASE WHEN x->>'requestId'=t.request_id::text THEN x||jsonb_build_object('response',a) ELSE x END ORDER BY ord),'[]') INTO ts FROM jsonb_array_elements(ts) WITH ORDINALITY z(x,ord);
 END LOOP;
 RETURN r||jsonb_build_object('messages',ms,'turns',ts);
END $$;
REVOKE ALL ON FUNCTION public.panda_agent_native_read(uuid) FROM PUBLIC,anon,authenticated;

-- Bounded owner-only cleanup candidates; raw native identifiers and receipts never cross this projection.
CREATE FUNCTION public.panda_agent_native_contexts(p_thread uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE requests jsonb; pending boolean; more boolean;
BEGIN
 PERFORM 1 FROM public.panda_agent_chats WHERE id=p_thread AND owner_subject=public.requesting_user_id() FOR SHARE;
 IF NOT FOUND THEN PERFORM public.phase3_fail('not_found'); END IF;
 SELECT EXISTS(SELECT 1 FROM public.panda_agent_native_runs WHERE thread_id=p_thread AND owner_subject=public.requesting_user_id() AND phase<>'terminal') INTO pending;
 SELECT coalesce(jsonb_agg(request_id ORDER BY created_at,request_id),'[]'::jsonb) INTO requests FROM
  (SELECT request_id,created_at FROM public.panda_agent_native_runs WHERE thread_id=p_thread AND owner_subject=public.requesting_user_id() AND phase='terminal' AND NOT runtime_retired ORDER BY created_at,request_id LIMIT 4) candidates;
 SELECT count(*)>4 INTO more FROM (SELECT 1 FROM public.panda_agent_native_runs WHERE thread_id=p_thread AND owner_subject=public.requesting_user_id() AND phase='terminal' AND NOT runtime_retired LIMIT 5) candidates;
 RETURN jsonb_build_object('pending',pending,'requests',requests,'more',more);
END $$;
REVOKE ALL ON FUNCTION public.panda_agent_native_contexts(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.panda_agent_native_contexts(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.panda_agent_native_admit(text,text),public.panda_agent_native_state(text,text),public.panda_agent_native_transition(text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.panda_agent_native_admit(text,text),public.panda_agent_native_state(text,text),public.panda_agent_native_transition(text,text),public.panda_agent_native_complete(text,text),public.panda_agent_native_claim_removal(text,text),public.panda_agent_native_retire(text,text),public.panda_agent_native_read(uuid) TO authenticated;
