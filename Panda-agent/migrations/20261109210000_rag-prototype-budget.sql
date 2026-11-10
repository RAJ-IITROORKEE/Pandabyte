-- Additive development prototype budget. Existing chat/source/role records are unchanged.
-- Rollback: disable the budget row and stop admission; retain all monetary reservations.
CREATE TABLE public.panda_agent_rag_budgets (
 id uuid PRIMARY KEY,
 authorization_ref text NOT NULL UNIQUE CHECK (length(authorization_ref) BETWEEN 1 AND 160),
 owner_subject text NOT NULL CHECK (length(owner_subject) BETWEEN 1 AND 512),
 key_sha256 text NOT NULL CHECK (key_sha256 ~ '^[a-f0-9]{64}$'),
 workspace_sha256 text NOT NULL CHECK (workspace_sha256 ~ '^[a-f0-9]{64}$'),
 model text NOT NULL DEFAULT 'openai/gpt-6-luna' CHECK (model='openai/gpt-6-luna'),
 provider text NOT NULL DEFAULT 'azure/us' CHECK (provider='azure/us'),
 limit_nano_usd bigint NOT NULL DEFAULT 1000000000 CHECK (limit_nano_usd=1000000000),
 carry_in_nano_usd bigint NOT NULL DEFAULT 10000000 CHECK (carry_in_nano_usd=10000000),
 reserved_nano_usd bigint NOT NULL DEFAULT 10000000 CHECK (reserved_nano_usd BETWEEN carry_in_nano_usd AND limit_nano_usd),
 enabled boolean NOT NULL DEFAULT false,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.panda_agent_rag_budget_reservations (
 budget_id uuid NOT NULL REFERENCES public.panda_agent_rag_budgets(id) ON DELETE RESTRICT,
 surface text NOT NULL CHECK (surface IN ('chat','playground','diagnostic')),
 request_id uuid NOT NULL,
 fingerprint text NOT NULL CHECK (fingerprint ~ '^[a-f0-9]{64}$'),
 reserved_nano_usd bigint NOT NULL DEFAULT 1597640 CHECK (reserved_nano_usd=1597640),
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY (budget_id,surface,request_id)
);
ALTER TABLE public.panda_agent_rag_budgets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.panda_agent_rag_budget_reservations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.panda_agent_rag_budgets,public.panda_agent_rag_budget_reservations FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.panda_agent_rag_budget_verify(p_payload text,p_mac text,p_action text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE v jsonb; expected text; fields text[]; a text:=public.requesting_user_id();
BEGIN
 IF a IS NULL THEN PERFORM public.phase3_fail('unauthenticated'); END IF;
 IF p_payload IS NULL OR octet_length(p_payload)>4096 OR coalesce(p_mac,'') !~ '^[a-f0-9]{64}$' THEN PERFORM public.phase3_fail('invalid'); END IF;
 SELECT encode(public.hmac(convert_to('panda-rag-budget-db-v1'||chr(10)||p_payload,'UTF8'),key_bytes,'sha256'),'hex') INTO expected
 FROM public.panda_agent_lightweight_key WHERE singleton;
 IF expected IS NULL OR sha256(decode(expected,'hex'))<>sha256(decode(p_mac,'hex')) THEN PERFORM public.phase3_fail('unauthenticated'); END IF;
 v:=p_payload::jsonb;
 fields:=CASE p_action
  WHEN 'status' THEN ARRAY['v','action','subject','exp','budget','keySha256','workspaceSha256']
  WHEN 'reserve' THEN ARRAY['v','action','subject','exp','budget','keySha256','workspaceSha256','surface','request','fingerprint'] END;
 IF fields IS NULL OR jsonb_typeof(v) IS DISTINCT FROM 'object' OR NOT v ?& fields
  OR (SELECT count(*) FROM jsonb_object_keys(v))<>cardinality(fields)
  OR v->'v' IS DISTINCT FROM '1'::jsonb OR v->>'action' IS DISTINCT FROM p_action
  OR v->>'subject' IS DISTINCT FROM a OR jsonb_typeof(v->'subject') IS DISTINCT FROM 'string'
  OR jsonb_typeof(v->'exp') IS DISTINCT FROM 'number' OR coalesce(v->>'exp','') !~ '^[0-9]{1,11}$'
  OR jsonb_typeof(v->'budget') IS DISTINCT FROM 'string'
  OR coalesce(v->>'budget','') !~ '^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$'
  OR jsonb_typeof(v->'keySha256') IS DISTINCT FROM 'string' OR coalesce(v->>'keySha256','') !~ '^[a-f0-9]{64}$'
  OR jsonb_typeof(v->'workspaceSha256') IS DISTINCT FROM 'string' OR coalesce(v->>'workspaceSha256','') !~ '^[a-f0-9]{64}$'
 THEN PERFORM public.phase3_fail('invalid'); END IF;
 IF (v->>'exp')::bigint<extract(epoch FROM clock_timestamp()) OR (v->>'exp')::bigint>extract(epoch FROM clock_timestamp())+65
 THEN PERFORM public.phase3_fail('unauthenticated'); END IF;
 IF p_action='reserve' AND (
  jsonb_typeof(v->'surface') IS DISTINCT FROM 'string' OR v->>'surface' NOT IN ('chat','playground','diagnostic')
  OR jsonb_typeof(v->'request') IS DISTINCT FROM 'string'
  OR coalesce(v->>'request','') !~ '^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$'
  OR jsonb_typeof(v->'fingerprint') IS DISTINCT FROM 'string' OR coalesce(v->>'fingerprint','') !~ '^[a-f0-9]{64}$')
 THEN PERFORM public.phase3_fail('invalid'); END IF;
 RETURN v;
END $$;

CREATE FUNCTION public.panda_agent_rag_budget_status(p_payload text,p_mac text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE v jsonb; b public.panda_agent_rag_budgets;
BEGIN
 v:=public.panda_agent_rag_budget_verify(p_payload,p_mac,'status');
 SELECT * INTO b FROM public.panda_agent_rag_budgets WHERE id=(v->>'budget')::uuid FOR SHARE;
 IF NOT FOUND OR b.owner_subject IS DISTINCT FROM public.requesting_user_id() THEN PERFORM public.phase3_fail('not_found'); END IF;
 IF b.key_sha256 IS DISTINCT FROM v->>'keySha256' OR b.workspace_sha256 IS DISTINCT FROM v->>'workspaceSha256'
 THEN PERFORM public.phase3_fail('conflict'); END IF;
 RETURN jsonb_build_object('enabled',b.enabled,'limitNanoUsd',b.limit_nano_usd,'reservedNanoUsd',b.reserved_nano_usd,
  'remainingNanoUsd',b.limit_nano_usd-b.reserved_nano_usd,'reservationNanoUsd',1597640,'model',b.model,'provider',b.provider);
END $$;

CREATE FUNCTION public.panda_agent_rag_budget_reserve(p_payload text,p_mac text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE v jsonb; b public.panda_agent_rag_budgets; prior public.panda_agent_rag_budget_reservations;
BEGIN
 v:=public.panda_agent_rag_budget_verify(p_payload,p_mac,'reserve');
 -- The only lock here is the budget row; no chat/source lock is acquired in this RPC.
 SELECT * INTO b FROM public.panda_agent_rag_budgets WHERE id=(v->>'budget')::uuid FOR UPDATE;
 IF NOT FOUND OR b.owner_subject IS DISTINCT FROM public.requesting_user_id() THEN PERFORM public.phase3_fail('not_found'); END IF;
 IF b.key_sha256 IS DISTINCT FROM v->>'keySha256' OR b.workspace_sha256 IS DISTINCT FROM v->>'workspaceSha256'
 THEN PERFORM public.phase3_fail('conflict'); END IF;
 SELECT * INTO prior FROM public.panda_agent_rag_budget_reservations
 WHERE budget_id=b.id AND surface=v->>'surface' AND request_id=(v->>'request')::uuid;
 IF FOUND THEN
  IF prior.fingerprint IS DISTINCT FROM v->>'fingerprint' THEN PERFORM public.phase3_fail('conflict'); END IF;
  RETURN jsonb_build_object('execute',false);
 END IF;
 IF NOT b.enabled OR b.reserved_nano_usd+1597640>b.limit_nano_usd THEN RETURN jsonb_build_object('execute',false); END IF;
 INSERT INTO public.panda_agent_rag_budget_reservations(budget_id,surface,request_id,fingerprint)
 VALUES(b.id,v->>'surface',(v->>'request')::uuid,v->>'fingerprint');
 UPDATE public.panda_agent_rag_budgets SET reserved_nano_usd=reserved_nano_usd+1597640 WHERE id=b.id;
 RETURN jsonb_build_object('execute',true);
END $$;

REVOKE ALL ON FUNCTION public.panda_agent_rag_budget_verify(text,text,text),public.panda_agent_rag_budget_status(text,text),public.panda_agent_rag_budget_reserve(text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.panda_agent_rag_budget_status(text,text),public.panda_agent_rag_budget_reserve(text,text) TO authenticated;
