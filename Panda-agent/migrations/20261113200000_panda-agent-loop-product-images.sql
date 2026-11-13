-- Owner-approved and applied 13 Nov 2026 after a rolled-back dry run (saved answers 21 -> 21; web citations unchanged; unknown media refused).
-- Product images on PandaByte citations (phase 4, owner-approved 13 Nov 2026: "show our images").
-- find_pinout attaches up to 2 of the board's own published images (pinout drawing or labelled back photo) to that product's
-- citation. A catalog citation may now carry 'images': 1-2 items {url, description}, url exactly /api/media/<uuid> of a
-- published cms_media row, description <= 300 chars. The quote is still proven against a current eligible chunk (images are
-- removed before that check). Third-party images are not accepted here. Everything else is the 20261113150000 body unchanged.
-- Rollback: re-run the CREATE OR REPLACE block of 20261113150000 and DROP FUNCTION public.panda_agent_media_alts(uuid[]);
-- saved answers with product images then read as unavailable.

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
  -- PandaByte listing: the exact shape the loop emits, proven against a current eligible chunk of that product,
  -- optionally with 1-2 of PandaByte's own published images (served by the app at /api/media/<id>).
  IF (SELECT count(*) FROM jsonb_object_keys(c-'images'))<>6 THEN RETURN false; END IF;
  IF c ? 'images' AND (jsonb_typeof(c->'images') IS DISTINCT FROM 'array' OR jsonb_array_length(c->'images') NOT BETWEEN 1 AND 2
   OR EXISTS(SELECT 1 FROM jsonb_array_elements(c->'images') i WHERE jsonb_typeof(i.value) IS DISTINCT FROM 'object'
    OR (i.value-ARRAY['url','description'])<>'{}'::jsonb OR jsonb_typeof(i.value->'description') IS DISTINCT FROM 'string' OR length(i.value->>'description')>300
    OR coalesce(i.value->>'url','') !~ '^/api/media/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    OR NOT EXISTS(SELECT 1 FROM public.cms_media m WHERE m.id=substr(i.value->>'url',12)::uuid AND m.published))) THEN RETURN false; END IF;
  SELECT (p->>'id')::uuid INTO product FROM jsonb_array_elements(public.panda_agent_runtime_products()->'items') p
   WHERE p->>'sourceUrl'=c->>'sourceUrl' AND p->>'title'=c->>'title';
  IF product IS NULL OR public.panda_agent_lightweight_citations_current(jsonb_build_object('outcome','evidence','text','x','citations',jsonb_build_array(c-'images')),product) IS NOT TRUE THEN RETURN false; END IF;
  IF NOT product=ANY(products) THEN products:=products||product; END IF;
  product:=NULL;
 END LOOP;
 RETURN cardinality(products)<=3;
EXCEPTION WHEN OTHERS THEN RETURN false;
END $$;
REVOKE ALL ON FUNCTION public.panda_agent_loop_citations_current(jsonb) FROM PUBLIC,anon,authenticated;

-- find_pinout picks a board's pinout drawing or labelled photo by its alt text. The product's published record lists its
-- media ids publicly but not the alt text, so this returns the alt text of published media only (<= 12 ids, <= 300 chars).
CREATE FUNCTION public.panda_agent_media_alts(p_ids uuid[]) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $f$
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',m.id,'alt',left(coalesce(m.alt_text,''),300)) ORDER BY array_position(p_ids,m.id)),'[]'::jsonb)
 FROM public.cms_media m WHERE m.id = ANY(p_ids[1:12]) AND m.published
$f$;
REVOKE ALL ON FUNCTION public.panda_agent_media_alts(uuid[]) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.panda_agent_media_alts(uuid[]) TO authenticated;
