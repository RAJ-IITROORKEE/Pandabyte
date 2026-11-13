-- Research answers may carry up to two reference images per web citation (https URL plus a short description).
-- Same-site and non-SVG checks run on the host before saving and again when an answer is read (search/citation-image.ts).
-- Answers without images keep exactly the earlier shape, so every saved answer stays valid.
CREATE OR REPLACE FUNCTION public.panda_agent_research_answer_valid(a jsonb) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog AS $$
DECLARE c jsonb; g jsonb; n integer; i integer:=0; keys text[]:=ARRAY['id','title','sourceUrl','capturedAt','quote','sectionPath'];
BEGIN
 IF jsonb_typeof(a) IS DISTINCT FROM 'object' OR NOT a?&ARRAY['outcome','text','citations'] OR (a-ARRAY['outcome','text','citations'])<>'{}'::jsonb
 OR jsonb_typeof(a->'outcome') IS DISTINCT FROM 'string'
 OR jsonb_typeof(a->'text') IS DISTINCT FROM 'string' OR length(btrim(a->>'text')) NOT BETWEEN 1 AND 8000 OR octet_length(a::text)>24000
 OR jsonb_typeof(a->'citations') IS DISTINCT FROM 'array' THEN RETURN false; END IF;
 n:=jsonb_array_length(a->'citations');
 IF NOT coalesce((a->>'outcome'='evidence' AND n BETWEEN 1 AND 2) OR (a->>'outcome'='insufficient' AND n=0),false) THEN RETURN false; END IF;
 FOR c IN SELECT value FROM jsonb_array_elements(a->'citations') LOOP
  i:=i+1;
  IF jsonb_typeof(c) IS DISTINCT FROM 'object' OR NOT c?&keys
  OR (c-keys-'images')<>'{}'::jsonb
  OR c->>'id' IS DISTINCT FROM 'S'||i
  OR jsonb_typeof(c->'title') IS DISTINCT FROM 'string' OR length(btrim(c->>'title')) NOT BETWEEN 1 AND 300
  OR jsonb_typeof(c->'sourceUrl') IS DISTINCT FROM 'string' OR length(c->>'sourceUrl')>2048 OR c->>'sourceUrl' !~ '^https?://[^[:space:]]+$'
  OR jsonb_typeof(c->'capturedAt') IS DISTINCT FROM 'string' OR c->>'capturedAt' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]{1,9})?(Z|[+-][0-9]{2}:[0-9]{2})$'
  OR jsonb_typeof(c->'quote') IS DISTINCT FROM 'string' OR length(btrim(c->>'quote')) NOT BETWEEN 1 AND 180
  OR c->'sectionPath' IS DISTINCT FROM '[]'::jsonb THEN RETURN false; END IF;
  IF c?'images' THEN
   IF jsonb_typeof(c->'images') IS DISTINCT FROM 'array' OR jsonb_array_length(c->'images') NOT BETWEEN 1 AND 2 THEN RETURN false; END IF;
   FOR g IN SELECT value FROM jsonb_array_elements(c->'images') LOOP
    IF jsonb_typeof(g) IS DISTINCT FROM 'object' OR NOT g?&ARRAY['url','description'] OR (g-ARRAY['url','description'])<>'{}'::jsonb
    OR jsonb_typeof(g->'url') IS DISTINCT FROM 'string' OR length(g->>'url')>500 OR g->>'url' !~ '^https://[^[:space:]]+$'
    OR jsonb_typeof(g->'description') IS DISTINCT FROM 'string' OR length(g->>'description')>300 THEN RETURN false; END IF;
   END LOOP;
  END IF;
 END LOOP;
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.panda_agent_research_answer_valid(jsonb) FROM PUBLIC,anon,authenticated;
