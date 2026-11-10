-- Production Admin RAG has no application spending cap. A request is still dispatched once.
-- Rollback: revoke this RPC, then disable PANDA_AGENT_HOSTED_GROUNDED_ENABLED.
CREATE TABLE public.panda_agent_grounded_claims (
 owner_subject text NOT NULL,
 request_id uuid NOT NULL,
 surface text NOT NULL CHECK(surface IN ('playground','chat')),
 fingerprint text NOT NULL CHECK(fingerprint ~ '^[a-f0-9]{64}$'),
 claimed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(owner_subject,request_id)
);
ALTER TABLE public.panda_agent_grounded_claims ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.panda_agent_grounded_claims FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.panda_agent_grounded_request_claim(p_payload text,p_mac text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE actor text; v jsonb; expected text; inserted integer;
BEGIN
 actor:=public.panda_agent_control_room_admin();
 IF octet_length(coalesce(p_payload,'')) NOT BETWEEN 1 AND 4096 OR coalesce(p_mac,'') !~ '^[a-f0-9]{64}$' THEN PERFORM public.phase3_fail('invalid'); END IF;
 SELECT encode(public.hmac(convert_to('panda-grounded-request-db-v1'||chr(10)||p_payload,'UTF8'),key_bytes,'sha256'),'hex')
  INTO expected FROM public.panda_agent_lightweight_key WHERE singleton;
 IF expected IS NULL OR sha256(decode(expected,'hex'))<>sha256(decode(p_mac,'hex')) THEN PERFORM public.phase3_fail('unauthenticated'); END IF;
 v:=p_payload::jsonb;
 IF jsonb_typeof(v)<>'object' OR NOT v ?& ARRAY['v','subject','exp','request','surface','fingerprint'] OR (SELECT count(*) FROM jsonb_object_keys(v))<>6
  OR v->'v' IS DISTINCT FROM '1'::jsonb OR v->>'subject' IS DISTINCT FROM actor
  OR jsonb_typeof(v->'exp') IS DISTINCT FROM 'number' OR coalesce(v->>'exp','') !~ '^[0-9]{1,11}$'
  OR (v->>'exp')::bigint<extract(epoch FROM clock_timestamp()) OR (v->>'exp')::bigint>extract(epoch FROM clock_timestamp())+65
  OR coalesce(v->>'request','') !~ '^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$'
  OR coalesce(v->>'surface','') NOT IN ('playground','chat') OR coalesce(v->>'fingerprint','') !~ '^[a-f0-9]{64}$'
  OR jsonb_typeof(v->'request') IS DISTINCT FROM 'string' OR jsonb_typeof(v->'surface') IS DISTINCT FROM 'string'
  OR jsonb_typeof(v->'fingerprint') IS DISTINCT FROM 'string' THEN PERFORM public.phase3_fail('invalid'); END IF;
 INSERT INTO public.panda_agent_grounded_claims(owner_subject,request_id,surface,fingerprint)
  VALUES(actor,(v->>'request')::uuid,v->>'surface',v->>'fingerprint') ON CONFLICT DO NOTHING;
 GET DIAGNOSTICS inserted=ROW_COUNT;
 RETURN jsonb_build_object('execute',inserted=1);
END $$;
REVOKE ALL ON FUNCTION public.panda_agent_grounded_request_claim(text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.panda_agent_grounded_request_claim(text,text) TO authenticated;
