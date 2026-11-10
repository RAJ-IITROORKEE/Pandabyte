-- Keep historical records. Only the server-signed runner may claim or finalize cases.
-- Rollback disables evaluation RPC grants and retains history and uncertain claims.
REVOKE ALL ON FUNCTION public.panda_agent_evaluation_run(text,uuid,text,text,integer,jsonb) FROM authenticated;

CREATE FUNCTION public.panda_agent_evaluation_release(p_value jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE corpus text; safe_results jsonb;
BEGIN
 PERFORM public.panda_agent_control_room_admin();
 corpus:=public.panda_agent_evaluation_corpus();
 IF p_value->'run' IS DISTINCT FROM 'null'::jsonb AND p_value->'run'->>'corpusFingerprint' IS DISTINCT FROM corpus THEN
  SELECT coalesce(jsonb_agg(item||jsonb_build_object('modelAnswer',NULL,'modelEvidence','[]'::jsonb,'sourceChanged',true)),'[]'::jsonb)
   INTO safe_results FROM jsonb_array_elements(p_value->'run'->'results') item;
  p_value:=jsonb_set(p_value,'{run,results}',safe_results);
 END IF;
 RETURN p_value||jsonb_build_object('corpusFingerprint',corpus);
END $$;

CREATE FUNCTION public.panda_agent_evaluation_read(p_run uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
BEGIN
 RETURN public.panda_agent_evaluation_release(public.panda_agent_evaluation_run('read',p_run));
END $$;

CREATE FUNCTION public.panda_agent_evaluation_write(p_payload text,p_mac text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE v jsonb; args jsonb; actor text; expected text; value jsonb;
BEGIN
 actor:=public.panda_agent_control_room_admin();
 IF p_payload IS NULL OR octet_length(p_payload)>20000 OR coalesce(p_mac,'') !~ '^[a-f0-9]{64}$' THEN PERFORM public.phase3_fail('invalid'); END IF;
 SELECT encode(public.hmac(convert_to('panda-rag-evaluation-db-v1'||chr(10)||p_payload,'UTF8'),key_bytes,'sha256'),'hex')
  INTO expected FROM public.panda_agent_lightweight_key WHERE singleton;
 IF expected IS NULL OR sha256(decode(expected,'hex'))<>sha256(decode(p_mac,'hex')) THEN PERFORM public.phase3_fail('unauthenticated'); END IF;
 v:=p_payload::jsonb;
 IF jsonb_typeof(v)<>'object' OR NOT v ?& ARRAY['v','subject','exp','parameters'] OR (SELECT count(*) FROM jsonb_object_keys(v))<>4
  OR v->'v' IS DISTINCT FROM '1'::jsonb OR v->>'subject' IS DISTINCT FROM actor
  OR jsonb_typeof(v->'exp') IS DISTINCT FROM 'number' OR coalesce(v->>'exp','') !~ '^[0-9]{1,11}$'
  OR (v->>'exp')::bigint<extract(epoch FROM clock_timestamp()) OR (v->>'exp')::bigint>extract(epoch FROM clock_timestamp())+65
  OR jsonb_typeof(v->'parameters') IS DISTINCT FROM 'object' THEN PERFORM public.phase3_fail('invalid'); END IF;
 args:=v->'parameters';
 IF coalesce(args->>'p_action','') NOT IN ('claim','finish') THEN PERFORM public.phase3_fail('invalid'); END IF;
 value:=public.panda_agent_evaluation_run(args->>'p_action',(args->>'p_run')::uuid,args->>'p_mode',args->>'p_corpus',(args->>'p_index')::integer,args->'p_result');
 RETURN public.panda_agent_evaluation_release(value);
END $$;
REVOKE ALL ON FUNCTION public.panda_agent_evaluation_release(jsonb),public.panda_agent_evaluation_read(uuid),public.panda_agent_evaluation_write(text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.panda_agent_evaluation_read(uuid),public.panda_agent_evaluation_write(text,text) TO authenticated;
