-- Additive development evaluation history. Rollback disables the endpoint and revokes
-- these RPC grants. Retain completed and uncertain outcomes for accounting review.
CREATE TABLE public.panda_agent_evaluation_runs (
 id uuid PRIMARY KEY,
 owner_subject text NOT NULL,
 mode text NOT NULL CHECK (mode IN ('retrieval','model')),
 corpus_fingerprint text NOT NULL CHECK (corpus_fingerprint ~ '^[a-f0-9]{64}$'),
 case_set_hash text NOT NULL CHECK (case_set_hash='9f33d626e2f82390291c1601808ef11c000f517f98d1339a142141114df4fd43'),
 results jsonb NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(results)='array' AND jsonb_array_length(results)<=20),
 claimed_index integer CHECK (claimed_index BETWEEN 0 AND 19),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON public.panda_agent_evaluation_runs(owner_subject,created_at DESC);
ALTER TABLE public.panda_agent_evaluation_runs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.panda_agent_evaluation_runs FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.panda_agent_evaluation_corpus() RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE r public.panda_agent_releases; fingerprint text;
BEGIN
 PERFORM public.panda_agent_control_room_admin();
 r:=public.panda_agent_runtime_candidate();
 SELECT encode(sha256(convert_to(jsonb_build_object('release',r.id,'manifest',r.manifest_hash,'config',r.config_hash,
  'eligible',coalesce(jsonb_agg(to_jsonb(e) ORDER BY e.product_id,e.document_version_id,e.logical_chunk_id),'[]'::jsonb))::text,'UTF8')),'hex')
 INTO fingerprint FROM public.panda_agent_runtime_eligible(r.id) e;
 RETURN fingerprint;
END $$;

CREATE FUNCTION public.panda_agent_evaluation_run(p_action text,p_run uuid,p_mode text DEFAULT NULL,p_corpus text DEFAULT NULL,p_index integer DEFAULT NULL,p_result jsonb DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE actor text; r public.panda_agent_evaluation_runs; claimed boolean:=false;
BEGIN
 actor:=public.panda_agent_control_room_admin();
 IF p_action NOT IN ('read','claim','finish') OR p_action IS NULL THEN PERFORM public.phase3_fail('invalid'); END IF;
 IF p_action='read' THEN
  SELECT * INTO r FROM public.panda_agent_evaluation_runs WHERE owner_subject=actor AND (p_run IS NULL OR id=p_run) ORDER BY created_at DESC LIMIT 1;
  IF NOT FOUND THEN RETURN jsonb_build_object('run',NULL); END IF;
 ELSE
  IF p_run IS NULL OR p_mode IS NULL OR p_mode NOT IN ('retrieval','model') OR p_corpus IS NULL OR p_corpus !~ '^[a-f0-9]{64}$'
   OR p_index IS NULL OR p_index NOT BETWEEN 0 AND 19 THEN PERFORM public.phase3_fail('invalid'); END IF;
  IF p_action='claim' THEN
   IF p_index=0 THEN
    INSERT INTO public.panda_agent_evaluation_runs(id,owner_subject,mode,corpus_fingerprint,case_set_hash)
     VALUES(p_run,actor,p_mode,p_corpus,'9f33d626e2f82390291c1601808ef11c000f517f98d1339a142141114df4fd43') ON CONFLICT DO NOTHING;
   END IF;
  END IF;
  SELECT * INTO r FROM public.panda_agent_evaluation_runs WHERE id=p_run AND owner_subject=actor FOR UPDATE;
  IF NOT FOUND THEN PERFORM public.phase3_fail('not_found'); END IF;
  IF r.mode<>p_mode OR r.corpus_fingerprint<>p_corpus THEN PERFORM public.phase3_fail('conflict'); END IF;
  IF p_action='claim' THEN
   IF r.claimed_index IS NULL AND jsonb_array_length(r.results)=p_index THEN
    IF public.panda_agent_evaluation_corpus()<>p_corpus THEN PERFORM public.phase3_fail('conflict'); END IF;
    UPDATE public.panda_agent_evaluation_runs SET claimed_index=p_index,updated_at=now() WHERE id=p_run RETURNING * INTO r;
    claimed:=true;
   END IF;
  ELSE
   IF r.claimed_index IS DISTINCT FROM p_index OR jsonb_array_length(r.results)<>p_index THEN PERFORM public.phase3_fail('conflict'); END IF;
   IF p_result IS NULL OR jsonb_typeof(p_result)<>'object' OR octet_length(p_result::text)>16384
    OR (p_result->>'caseIndex') IS DISTINCT FROM p_index::text
    OR coalesce(p_result->>'status','') NOT IN ('passed','failed','unavailable','outcome_unknown') THEN PERFORM public.phase3_fail('invalid'); END IF;
   UPDATE public.panda_agent_evaluation_runs SET results=results||jsonb_build_array(p_result),claimed_index=NULL,updated_at=now() WHERE id=p_run RETURNING * INTO r;
  END IF;
 END IF;
 RETURN jsonb_build_object('claimed',claimed,'run',jsonb_build_object('requestId',r.id,'mode',r.mode,'corpusFingerprint',r.corpus_fingerprint,
  'caseSetHash',r.case_set_hash,'results',r.results,'claimedIndex',r.claimed_index,'createdAt',r.created_at,'updatedAt',r.updated_at));
END $$;
REVOKE ALL ON FUNCTION public.panda_agent_evaluation_corpus(),public.panda_agent_evaluation_run(text,uuid,text,text,integer,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.panda_agent_evaluation_corpus(),public.panda_agent_evaluation_run(text,uuid,text,text,integer,jsonb) TO authenticated;
