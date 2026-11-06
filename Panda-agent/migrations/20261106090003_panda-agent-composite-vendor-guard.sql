-- Forward-only fix: distinguish the SQL need alias from the PL/pgSQL loop variable.
-- Preserve source/grant/coverage/quote checks and existing function ACL/owner.
CREATE OR REPLACE FUNCTION public.panda_agent_composite_answer_current(g public.panda_agent_composite_turns,a jsonb) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
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
   IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(g.plan->'needs') plan_need WHERE plan_need->>'id'=c.need_id AND plan_need->>'kind'='vendor-gpio') THEN RETURN false;END IF;
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
