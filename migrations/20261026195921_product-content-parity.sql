-- Shared closed URL subset prevents direct RPC content from breaking application parsing.
CREATE FUNCTION public.product_rich_href_valid(href text)
RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,public AS $f$
DECLARE port text;
BEGIN
 IF href IS NULL OR char_length(href)>2048 OR href ~ '[^!-~]' OR position(chr(92) in href)>0 THEN RETURN false; END IF;
 IF left(href,1)='/' THEN RETURN left(href,2)<>'//'; END IF;
 IF href !~ '^https://[a-zA-Z0-9](?:[a-zA-Z0-9.-]*[a-zA-Z0-9])?(?::([0-9]{1,5}))?(?:[/?#][^[:space:]]*)?$' THEN RETURN false; END IF;
 port:=substring(href from '^https://[^/:?#]+:([0-9]{1,5})(?:[/?#]|$)');
 RETURN port IS NULL OR port::integer<=65535;
END $f$;
REVOKE ALL ON FUNCTION public.product_rich_href_valid(text) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.product_rich_node_valid(n jsonb,parent text,depth integer,lists integer)
RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,public,pg_temp AS $f$
DECLARE t text:=n->>'type'; a jsonb:=COALESCE(n->'attrs','{}'::jsonb); child jsonb; mark jsonb; ma jsonb; children text[]; allowed text[]; next_lists integer;
BEGIN
 IF depth>12 OR jsonb_typeof(n) IS DISTINCT FROM 'object' OR EXISTS(SELECT 1 FROM jsonb_object_keys(n) k WHERE k NOT IN ('type','attrs','text','marks','content')) OR jsonb_typeof(n->'type') IS DISTINCT FROM 'string' OR jsonb_typeof(a) IS DISTINCT FROM 'object' THEN RETURN false; END IF;
 IF t='doc' AND jsonb_typeof(n->'content') IS DISTINCT FROM 'array' THEN RETURN false; END IF;
 children:=CASE parent WHEN 'root' THEN ARRAY['doc'] WHEN 'doc' THEN ARRAY['paragraph','heading','bulletList','orderedList','blockquote','codeBlock','horizontalRule','table','image'] WHEN 'paragraph' THEN ARRAY['text','hardBreak'] WHEN 'heading' THEN ARRAY['text','hardBreak'] WHEN 'codeBlock' THEN ARRAY['text'] WHEN 'bulletList' THEN ARRAY['listItem'] WHEN 'orderedList' THEN ARRAY['listItem'] WHEN 'listItem' THEN ARRAY['paragraph','bulletList','orderedList','blockquote','codeBlock'] WHEN 'blockquote' THEN ARRAY['paragraph','heading','bulletList','orderedList'] WHEN 'table' THEN ARRAY['tableRow'] WHEN 'tableRow' THEN ARRAY['tableHeader','tableCell'] WHEN 'tableHeader' THEN ARRAY['paragraph','bulletList','orderedList'] WHEN 'tableCell' THEN ARRAY['paragraph','bulletList','orderedList'] ELSE ARRAY[]::text[] END;
 IF NOT(t=ANY(children)) THEN RETURN false; END IF;
 allowed:=CASE t WHEN 'paragraph' THEN ARRAY['textAlign'] WHEN 'heading' THEN ARRAY['level','textAlign'] WHEN 'orderedList' THEN ARRAY['start'] WHEN 'codeBlock' THEN ARRAY['language'] WHEN 'image' THEN ARRAY['mediaId','alt','caption'] WHEN 'tableHeader' THEN ARRAY['colspan','rowspan','colwidth'] WHEN 'tableCell' THEN ARRAY['colspan','rowspan','colwidth'] ELSE ARRAY[]::text[] END;
 IF EXISTS(SELECT 1 FROM jsonb_object_keys(a) k WHERE NOT(k=ANY(allowed))) THEN RETURN false; END IF;
 IF a ? 'textAlign' AND a->'textAlign'<>'null'::jsonb AND (a->>'textAlign') NOT IN ('left','center','right') THEN RETURN false; END IF;
 IF t='heading' AND (jsonb_typeof(a->'level') IS DISTINCT FROM 'number' OR a->>'level' NOT IN ('2','3','4')) THEN RETURN false; END IF;
 IF a ? 'start' AND (jsonb_typeof(a->'start') IS DISTINCT FROM 'number' OR (a->>'start') !~ '^[0-9]+$' OR (a->>'start')::numeric NOT BETWEEN 1 AND 10000) THEN RETURN false; END IF;
 IF a ? 'language' AND a->'language'<>'null'::jsonb AND (jsonb_typeof(a->'language') IS DISTINCT FROM 'string' OR char_length(a->>'language')>40 OR a->>'language' ~ '[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]') THEN RETURN false; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_each(a) e WHERE e.key IN ('colspan','rowspan') AND (jsonb_typeof(e.value)<>'number' OR e.value::text !~ '^[0-9]+$' OR e.value::text::numeric NOT BETWEEN 1 AND 10)) THEN RETURN false; END IF;
 IF a ? 'colwidth' AND a->'colwidth'<>'null'::jsonb THEN
  IF jsonb_typeof(a->'colwidth')<>'array' OR jsonb_array_length(a->'colwidth')>10 THEN RETURN false; END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(a->'colwidth') w WHERE jsonb_typeof(w)<>'number' OR w::text !~ '^[0-9]+$' OR w::text::numeric NOT BETWEEN 20 AND 2000) THEN RETURN false; END IF;
 END IF;
 IF t='image' AND (jsonb_typeof(a->'mediaId') IS DISTINCT FROM 'string' OR a->>'mediaId' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' OR jsonb_typeof(a->'alt') IS DISTINCT FROM 'string' OR char_length(btrim(a->>'alt')) NOT BETWEEN 1 AND 300 OR a->>'alt' ~ '[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]' OR (a ? 'caption' AND a->'caption'<>'null'::jsonb AND (jsonb_typeof(a->'caption')<>'string' OR char_length(a->>'caption')>500 OR a->>'caption' ~ '[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]'))) THEN RETURN false; END IF;
 IF t='text' THEN
  IF jsonb_typeof(n->'text') IS DISTINCT FROM 'string' OR char_length(n->>'text')<1 OR n->>'text' ~ '[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]' OR n ? 'content' OR a<>'{}'::jsonb THEN RETURN false; END IF;
  IF n ? 'marks' THEN
   IF jsonb_typeof(n->'marks')<>'array' OR jsonb_array_length(n->'marks')>8 THEN RETURN false; END IF;
   IF EXISTS(SELECT 1 FROM jsonb_array_elements(n->'marks') m GROUP BY m->>'type' HAVING count(*)>1) THEN RETURN false; END IF;
   FOR mark IN SELECT value FROM jsonb_array_elements(n->'marks') LOOP
    ma:=COALESCE(mark->'attrs','{}'::jsonb);
    IF jsonb_typeof(mark)<>'object' OR EXISTS(SELECT 1 FROM jsonb_object_keys(mark) k WHERE k NOT IN ('type','attrs')) OR jsonb_typeof(ma)<>'object' OR jsonb_typeof(mark->'type') IS DISTINCT FROM 'string' THEN RETURN false; END IF;
    IF mark->>'type' IN ('bold','italic','underline','strike','code') THEN IF ma<>'{}'::jsonb THEN RETURN false; END IF;
    ELSIF mark->>'type'='link' THEN
     IF EXISTS(SELECT 1 FROM jsonb_object_keys(ma) k WHERE k NOT IN ('href','target','rel','class')) OR NOT public.product_rich_href_valid(ma->>'href') OR (ma ? 'target' AND ma->'target'<>'null'::jsonb AND ma->>'target'<>'_blank') OR (ma ? 'rel' AND ma->'rel'<>'null'::jsonb AND ma->>'rel'<>'noopener noreferrer nofollow') OR (ma ? 'class' AND ma->'class'<>'null'::jsonb) THEN RETURN false; END IF;
    ELSIF mark->>'type'='highlight' THEN IF EXISTS(SELECT 1 FROM jsonb_object_keys(ma) k WHERE k<>'color') OR COALESCE(ma->>'color','') NOT IN ('#fef08a','#bbf7d0','#bfdbfe','#fbcfe8') THEN RETURN false; END IF;
    ELSIF mark->>'type'='textStyle' THEN
     IF EXISTS(SELECT 1 FROM jsonb_object_keys(ma) k WHERE k NOT IN ('color','fontSize')) OR (ma ? 'color' AND ma->'color'<>'null'::jsonb AND ma->>'color' NOT IN ('#111827','#374151','#6b7280','#b91c1c','#c2410c','#a16207','#15803d','#0369a1','#1d4ed8','#7e22ce')) OR (ma ? 'fontSize' AND ma->'fontSize'<>'null'::jsonb AND ma->>'fontSize' NOT IN ('12px','14px','16px','18px','20px','24px','32px')) THEN RETURN false; END IF;
    ELSE RETURN false; END IF;
   END LOOP;
  END IF;
  RETURN true;
 END IF;
 IF n ? 'text' OR n ? 'marks' THEN RETURN false; END IF;
 IF t IN ('image','horizontalRule','hardBreak') THEN RETURN NOT(n ? 'content') OR n->'content'='[]'::jsonb; END IF;
 IF n ? 'content' AND jsonb_typeof(n->'content')<>'array' THEN RETURN false; END IF;
 IF jsonb_array_length(COALESCE(n->'content','[]'::jsonb))>(CASE WHEN t='doc' THEN 200 ELSE 500 END) OR (t IN ('bulletList','orderedList','table','tableRow','tableCell','tableHeader','listItem') AND jsonb_array_length(COALESCE(n->'content','[]'::jsonb))=0) THEN RETURN false; END IF;
 next_lists:=lists+CASE WHEN t IN ('bulletList','orderedList') THEN 1 ELSE 0 END;
 IF next_lists>3 THEN RETURN false; END IF;
 FOR child IN SELECT value FROM jsonb_array_elements(COALESCE(n->'content','[]'::jsonb)) LOOP IF NOT public.product_rich_node_valid(child,t,depth+1,next_lists) THEN RETURN false; END IF; END LOOP;
 RETURN true;
END $f$;
