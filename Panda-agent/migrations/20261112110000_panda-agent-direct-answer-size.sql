-- Allow richer direct answers (diagrams, step lists): output up to 1600 tokens and cost up to 5,000,000 nano-USD per answer
-- (owner request, 12 Nov 2026). Body otherwise identical to the live definition. Rollback: re-run with 700 and 1492312.
CREATE OR REPLACE FUNCTION public.panda_agent_direct_chat(p_payload text, p_mac text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
DECLARE v jsonb; op text; tid uuid; rid uuid; d public.panda_agent_direct_turns; t public.panda_agent_chat_turns; u jsonb; a jsonb; answer_digest text;
BEGIN
 v:=public.panda_agent_llm_verify(p_payload,p_mac,'direct_chat');op:=v->>'op';
 IF op IS NULL THEN PERFORM public.phase3_fail('invalid'); END IF;
 IF op NOT IN ('claim_unmetered','receipt_unmetered') THEN
  -- An uncapped answer also needs the Admin permission at final publication.
  IF op='finish' AND EXISTS(SELECT 1 FROM public.panda_agent_direct_turns WHERE thread_id=(v->>'thread')::uuid
   AND request_id=(v->>'request')::uuid AND owner_subject=public.requesting_user_id() AND unmetered) THEN
   PERFORM public.panda_agent_control_room_admin();
  END IF;
  RETURN public.panda_agent_direct_chat_capped(p_payload,p_mac);
 END IF;
 PERFORM public.panda_agent_control_room_admin();
 IF NOT v?&ARRAY['op','thread','request','bodyHash'] OR (op='claim_unmetered' AND (v-ARRAY['op','thread','request','bodyHash'])<>'{}'::jsonb)
  OR (op='receipt_unmetered' AND (NOT v?&ARRAY['answer','usage'] OR (v-ARRAY['op','thread','request','bodyHash','answer','usage'])<>'{}'::jsonb))
  OR EXISTS(SELECT 1 FROM unnest(ARRAY['thread','request','bodyHash']) k WHERE jsonb_typeof(v->k) IS DISTINCT FROM 'string')
  OR coalesce(v->>'bodyHash','') !~ '^[a-f0-9]{64}$' THEN PERFORM public.phase3_fail('invalid'); END IF;
 tid:=(v->>'thread')::uuid;rid:=(v->>'request')::uuid;
 PERFORM 1 FROM public.panda_agent_chats WHERE id=tid AND owner_subject=public.requesting_user_id() AND archived_at IS NULL FOR UPDATE;
 IF NOT FOUND THEN PERFORM public.phase3_fail('not_found'); END IF;
 SELECT * INTO d FROM public.panda_agent_direct_turns WHERE thread_id=tid AND request_id=rid AND owner_subject=public.requesting_user_id() FOR UPDATE;
 IF NOT FOUND THEN PERFORM public.phase3_fail('not_found'); END IF;
 SELECT * INTO t FROM public.panda_agent_chat_turns WHERE thread_id=tid AND request_id=rid FOR UPDATE;
 IF NOT FOUND THEN PERFORM public.phase3_fail('not_found'); END IF;
 IF d.terminal OR t.status<>'pending' OR (p_payload::jsonb->>'exp')::bigint<extract(epoch FROM clock_timestamp()) THEN PERFORM public.phase3_fail('conflict'); END IF;
 IF op='claim_unmetered' THEN
  IF d.claimed THEN RETURN jsonb_build_object('execute',false); END IF;
  IF d.budget_id IS NOT NULL OR d.body_hash IS NOT NULL THEN PERFORM public.phase3_fail('conflict'); END IF;
  UPDATE public.panda_agent_direct_turns SET claimed=true,unmetered=true,body_hash=v->>'bodyHash'
   WHERE thread_id=tid AND request_id=rid;
  RETURN jsonb_build_object('execute',true);
 END IF;
 u:=v->'usage';a:=v->'answer';
 IF NOT d.claimed OR NOT d.unmetered OR d.budget_id IS NOT NULL OR d.body_hash IS DISTINCT FROM v->>'bodyHash'
  OR jsonb_typeof(a) IS DISTINCT FROM 'object' OR NOT a?&ARRAY['outcome','text','citations'] OR (a-ARRAY['outcome','text','citations'])<>'{}'::jsonb
  OR a->>'outcome' IS DISTINCT FROM 'conversation' OR a->'citations' IS DISTINCT FROM '[]'::jsonb
  OR jsonb_typeof(a->'text') IS DISTINCT FROM 'string' OR length(btrim(a->>'text')) NOT BETWEEN 1 AND 8000 OR octet_length(a::text)>24000
  OR jsonb_typeof(u) IS DISTINCT FROM 'object' OR NOT u?&ARRAY['inputTokens','outputTokens','costNanoUsd'] OR (u-ARRAY['inputTokens','outputTokens','costNanoUsd'])<>'{}'::jsonb
  OR EXISTS(SELECT 1 FROM jsonb_each(u) x WHERE jsonb_typeof(x.value) IS DISTINCT FROM 'number' OR x.value::text !~ '^[0-9]{1,7}$')
  OR (u->>'inputTokens')::bigint>8024 OR (u->>'outputTokens')::bigint>1600 OR (u->>'costNanoUsd')::bigint>5000000
  THEN PERFORM public.phase3_fail('conflict'); END IF;
 answer_digest:=encode(sha256(convert_to(a::text,'UTF8')),'hex');
 IF d.usage IS NOT NULL THEN
  IF d.usage IS DISTINCT FROM u OR d.answer_hash IS DISTINCT FROM answer_digest THEN PERFORM public.phase3_fail('conflict'); END IF;
  RETURN jsonb_build_object('recorded',false);
 END IF;
 UPDATE public.panda_agent_direct_turns SET usage=u,answer_hash=answer_digest WHERE thread_id=tid AND request_id=rid;
 RETURN jsonb_build_object('recorded',true);
END $function$;
