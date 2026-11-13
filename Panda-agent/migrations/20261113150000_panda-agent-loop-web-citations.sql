-- Owner-approved and applied 13 Nov 2026 after a rolled-back dry run (web/no-image pass; query URL, http image, extra key, uncited outcome refused; saved answers 7/7 unchanged).
-- Agent-loop web citations (13 Nov 2026): loop answers may cite web_search results (Tavily) next to PandaByte listing
-- quotes, with up to two reference images per web page. Replaces one function; table, ops, grants and reads are unchanged.
-- A web citation is labelled with the fixed section 'Web search excerpt (Tavily)' (src/search/citation-url.ts) and is
-- checked for shape only: the database cannot re-fetch a web page, so the app's signed request vouches for the quote,
-- exactly as for research answers. PandaByte citations keep the existing per-citation source proof.
-- Limits stay: at most 4 citations in total, PandaByte citations from at most 3 products.
-- Rollback: re-run the CREATE FUNCTION panda_agent_loop_citations_current block of 20261113130000 as CREATE OR REPLACE;
-- saved loop answers with web citations then read as unavailable, every other turn is unchanged.

CREATE OR REPLACE FUNCTION public.panda_agent_loop_citations_current(p_answer jsonb) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE c jsonb; product uuid; products uuid[]:='{}';
BEGIN
 IF jsonb_typeof(p_answer->'citations') IS DISTINCT FROM 'array' OR jsonb_array_length(p_answer->'citations')>4 THEN RETURN false; END IF;
 IF jsonb_array_length(p_answer->'citations')=0 THEN RETURN coalesce(p_answer->>'outcome' IN ('conversation','clarification','insufficient'),false); END IF;
 IF p_answer->>'outcome' IS DISTINCT FROM 'evidence' THEN RETURN false; END IF;
 IF (SELECT count(DISTINCT x->>'id') FROM jsonb_array_elements(p_answer->'citations') x)<>jsonb_array_length(p_answer->'citations') THEN RETURN false; END IF;
 FOR c IN SELECT value FROM jsonb_array_elements(p_answer->'citations') LOOP
  IF jsonb_typeof(c) IS DISTINCT FROM 'object' OR NOT c ?& ARRAY['id','title','sourceUrl','quote','sectionPath','capturedAt']
  OR jsonb_typeof(c->'id') IS DISTINCT FROM 'string' OR coalesce(c->>'id','') !~ '^S[1-4]$'
  OR jsonb_typeof(c->'title') IS DISTINCT FROM 'string' OR jsonb_typeof(c->'sourceUrl') IS DISTINCT FROM 'string'
  OR jsonb_typeof(c->'sectionPath') IS DISTINCT FROM 'array' OR jsonb_typeof(c->'capturedAt') IS DISTINCT FROM 'string'
  OR jsonb_typeof(c->'quote') IS DISTINCT FROM 'string' OR length(btrim(c->>'quote')) NOT BETWEEN 1 AND 600 THEN RETURN false; END IF;
  IF c->'sectionPath'='["Web search excerpt (Tavily)"]'::jsonb THEN
   -- Web page (src/agent-loop/tools.ts): public https page without query or fragment, optional 1-2 https images.
   IF (c-ARRAY['id','title','sourceUrl','quote','sectionPath','capturedAt','images'])<>'{}'::jsonb
   OR length(btrim(c->>'title')) NOT BETWEEN 1 AND 300 OR length(c->>'sourceUrl')>500
   OR c->>'sourceUrl' !~ '^https://([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}(/[^?#[:space:]]*)?$'
   OR (c ? 'images' AND (jsonb_typeof(c->'images') IS DISTINCT FROM 'array' OR jsonb_array_length(c->'images') NOT BETWEEN 1 AND 2
    OR EXISTS(SELECT 1 FROM jsonb_array_elements(c->'images') i WHERE jsonb_typeof(i.value) IS DISTINCT FROM 'object'
     OR (i.value-ARRAY['url','description'])<>'{}'::jsonb OR jsonb_typeof(i.value->'url') IS DISTINCT FROM 'string'
     OR jsonb_typeof(i.value->'description') IS DISTINCT FROM 'string' OR length(i.value->>'url')>500 OR length(i.value->>'description')>300
     OR i.value->>'url' !~ '^https://[^/?#@:[:space:]]+\.[^/?#@:[:space:]]+/'))) THEN RETURN false; END IF;
   CONTINUE;
  END IF;
  -- PandaByte listing: the exact shape the loop emits, proven against a current eligible chunk of that product.
  IF (SELECT count(*) FROM jsonb_object_keys(c))<>6 THEN RETURN false; END IF;
  SELECT (p->>'id')::uuid INTO product FROM jsonb_array_elements(public.panda_agent_runtime_products()->'items') p
   WHERE p->>'sourceUrl'=c->>'sourceUrl' AND p->>'title'=c->>'title';
  IF product IS NULL OR public.panda_agent_lightweight_citations_current(jsonb_build_object('outcome','evidence','text','x','citations',jsonb_build_array(c)),product) IS NOT TRUE THEN RETURN false; END IF;
  IF NOT product=ANY(products) THEN products:=products||product; END IF;
  product:=NULL;
 END LOOP;
 RETURN cardinality(products)<=3;
EXCEPTION WHEN OTHERS THEN RETURN false;
END $$;
REVOKE ALL ON FUNCTION public.panda_agent_loop_citations_current(jsonb) FROM PUBLIC,anon,authenticated;
