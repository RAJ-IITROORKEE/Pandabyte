-- Public FAQ lists expose only live revisions. Forward rollback: drop this RPC in a new migration after routing callers away.
-- Topic options are drawn from all matching live FAQs before topic filtering.
CREATE FUNCTION public.published_list_faqs(
  p_query text,p_topic text,p_placement text,p_limit integer,p_offset integer
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog,public,pg_temp AS $fn$
DECLARE v_query text:=btrim(COALESCE(p_query,'')); v_items jsonb; v_total bigint; v_topics jsonb; v_truncated boolean; v_doc jsonb;
BEGIN
  IF char_length(v_query)>120 OR v_query ~ '[[:cntrl:]]'
    OR p_topic IS NULL OR char_length(p_topic)>120 OR p_topic ~ '[[:cntrl:]]'
    OR p_placement IS NULL OR char_length(p_placement)>120 OR p_placement ~ '[[:cntrl:]]'
    OR p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 100 OR p_offset IS NULL OR p_offset NOT BETWEEN 0 AND 10000
  THEN PERFORM public.phase3_fail('invalid_input'); END IF;
  WITH matching AS (
    SELECT r.id,rev.id revision_id,rev.title,rev.slug,rev.document,rev.published_at,
      COALESCE((rev.document->>'position')::integer,0) position
    FROM public.cms_live_routes route
    JOIN public.cms_records r ON r.id=route.record_id AND r.kind=route.kind AND r.published_revision_id=route.revision_id AND r.archived_at IS NULL
    JOIN public.cms_revisions rev ON rev.id=route.revision_id AND rev.record_id=r.id
    WHERE route.kind='faq'
      AND (v_query='' OR position(lower(v_query) in lower(rev.title||' '||COALESCE(rev.document->>'summary','')||' '||CASE WHEN jsonb_array_length(COALESCE(rev.document->'blocks','[]'::jsonb))=0 THEN COALESCE(rev.document->>'answer','') ELSE '' END||' '||COALESCE(rev.document->>'topic','')))>0
        OR EXISTS (
          SELECT 1 FROM public.phase3_jsonb_array_elements(rev.document->'blocks') AS blocks(block)
          CROSS JOIN LATERAL jsonb_path_query(jsonb_build_array(
            block->'text',block->'code',block->'items',block->'label',block->'alt',block->'headers',block->'rows'
          ), '$.** ? (@.type() == "string")') AS words(word)
          WHERE position(lower(v_query) in lower(word #>> '{}'))>0
        ))
      AND (p_placement='' OR rev.document->'placements' ? p_placement)
  ), filtered AS (
    SELECT * FROM matching WHERE p_topic='' OR document->>'topic'=p_topic
  ), page_rows AS (
    SELECT *,row_number() OVER(ORDER BY position ASC,lower(title),id) row_order FROM filtered
    ORDER BY row_order LIMIT p_limit OFFSET p_offset
  ), topic_rows AS (
    SELECT DISTINCT document->>'topic' topic FROM matching WHERE COALESCE(document->>'topic','')<>''
    ORDER BY topic LIMIT 101
  )
  SELECT (SELECT count(*) FROM filtered),COALESCE((SELECT jsonb_agg(jsonb_build_object(
    'id',id,'kind','faq','title',title,'slug',slug,'summary',document->>'summary',
    'document',public.phase3_public_document('faq',document),'revisionId',revision_id,'publishedAt',published_at
  ) ORDER BY row_order) FROM page_rows),'[]'::jsonb),
    COALESCE((SELECT jsonb_agg(topic ORDER BY topic) FROM (SELECT topic FROM topic_rows ORDER BY topic LIMIT 100) t),'[]'::jsonb),
    (SELECT count(*)>100 FROM topic_rows)
  INTO v_total,v_items,v_topics,v_truncated;
  FOR v_doc IN SELECT item->'document' FROM public.phase3_jsonb_array_elements(v_items) a(item)
  LOOP PERFORM public.phase3_validate_media_refs(v_doc,true); END LOOP;
  RETURN jsonb_build_object('items',v_items,'total',v_total,'topics',v_topics,'topicsTruncated',v_truncated);
END $fn$;
REVOKE ALL ON FUNCTION public.published_list_faqs(text,text,text,integer,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.published_list_faqs(text,text,text,integer,integer) TO anon,authenticated;
