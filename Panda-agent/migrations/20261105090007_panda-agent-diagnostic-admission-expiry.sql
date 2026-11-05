-- Forward-only correction for attachment expiry while diagnostic admission waits.
CREATE OR REPLACE FUNCTION public.panda_agent_diagnostic_begin(p_payload text,p_mac text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
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
  SELECT * INTO a FROM public.panda_agent_diagnostic_assets WHERE id=(v->'diagnostic'->>'screenshotId')::uuid AND thread_id=(v->>'thread')::uuid AND owner_subject=public.requesting_user_id() AND status='ready' AND expires_at>clock_timestamp() FOR SHARE;
  -- A row-lock wait can outlive the predicate's clock evaluation.
  IF NOT FOUND OR a.status IS DISTINCT FROM 'ready' OR a.expires_at<=clock_timestamp() THEN PERFORM public.phase3_fail('not_found');END IF;
 END IF;
 payload:=jsonb_build_object('v',1,'action','begin','subject',public.requesting_user_id(),'exp',(v->>'exp')::bigint,'thread',v->>'thread','request',v->>'request','question','Diagnostic ('||(v->'diagnostic'->>'chip')||', esp-idf 5.5.1): '||(v->'diagnostic'->>'errorText'))::text;
 SELECT encode(public.hmac(convert_to('panda-lightweight-db-v1'||chr(10)||payload,'UTF8'),key_bytes,'sha256'),'hex') INTO mac FROM public.panda_agent_lightweight_key WHERE singleton;
 r:=public.panda_agent_lightweight_begin_before_guides(payload,mac);
 INSERT INTO public.panda_agent_diagnostic_turns(thread_id,request_id,owner_subject,input,qa_skill_epoch) VALUES((v->>'thread')::uuid,(v->>'request')::uuid,public.requesting_user_id(),v->'diagnostic',s.version);
 IF v->'diagnostic'?'screenshotId' AND (a.status IS DISTINCT FROM 'ready' OR a.expires_at<=clock_timestamp()) THEN PERFORM public.phase3_fail('not_found');END IF;
 IF (v->>'exp')::bigint<extract(epoch FROM clock_timestamp()) THEN PERFORM public.phase3_fail('unauthenticated');END IF;RETURN r;
END $$;
REVOKE ALL ON FUNCTION public.panda_agent_diagnostic_begin(text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.panda_agent_diagnostic_begin(text,text) TO authenticated;
