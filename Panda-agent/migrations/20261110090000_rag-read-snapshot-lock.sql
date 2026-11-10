-- Keep the candidate valid across source aggregation without another network call.
-- One consistent source projection for document-only requests. No model or private-upload data.
-- Rollback revokes this read RPC and selects the existing live-read path.
CREATE OR REPLACE FUNCTION public.panda_agent_runtime_admin_snapshot() RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE actor text; r public.panda_agent_releases; result jsonb; n integer;
BEGIN
 actor:=public.panda_agent_control_room_admin();
 r:=public.panda_agent_runtime_candidate();
 -- A source withdrawal invalidates this same release row in its transaction.
 SELECT * INTO r FROM public.panda_agent_releases p WHERE p.id=r.id AND p.state='candidate' AND p.sealed
  AND p.config_hash=r.config_hash AND p.manifest_hash=r.manifest_hash AND p.member_count=r.member_count FOR SHARE;
 IF NOT FOUND THEN PERFORM public.phase3_fail('not_found'); END IF;
 WITH eligible AS MATERIALIZED (SELECT * FROM public.panda_agent_runtime_eligible(r.id)),
 catalog AS (
  SELECT product_id,sku,title,source_url,count(*) approved_count FROM eligible GROUP BY product_id,sku,title,source_url
 ), scopes AS (
  SELECT product_id,jsonb_build_object(
   'candidate',jsonb_build_object('configHash',r.config_hash,'manifestHash',r.manifest_hash,'memberCount',r.member_count,'membershipHash',r.manifest_hash,'state',r.state,'sealed',r.sealed),
   'product',jsonb_build_object('id',product_id,'sku',min(sku),'title',min(title),'sourceUrl',min(source_url)),
   'chunks',jsonb_agg(jsonb_build_object('documentVersionId',document_version_id,'logicalChunkId',logical_chunk_id,'chunkVersionId',chunk_version_id,
    'text',chunk_text,'textHash',text_hash,'generation',generation,'physicalRevision',physical_revision,'capturedAt',captured_at,'sectionPath',section_path) ORDER BY document_version_id,logical_chunk_id)) value
  FROM eligible GROUP BY product_id HAVING count(*)>0 AND count(DISTINCT sku)=1 AND count(DISTINCT source_url)=1
 )
 SELECT jsonb_build_object('subject',actor,
  'catalog',jsonb_build_object('items',coalesce((SELECT jsonb_agg(jsonb_build_object('id',product_id,'sku',sku,'title',title,'sourceUrl',source_url,'approvedChunksCount',approved_count) ORDER BY title,product_id) FROM catalog),'[]'::jsonb)),
  'scopes',coalesce((SELECT jsonb_object_agg(product_id::text,value) FROM scopes),'{}'::jsonb)),
  (SELECT count(*) FROM eligible) INTO result,n;
 IF n>284 OR jsonb_array_length(result->'catalog'->'items')>42 OR octet_length(result::text)>4194304 THEN PERFORM public.phase3_fail('unavailable'); END IF;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.panda_agent_runtime_admin_snapshot() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.panda_agent_runtime_admin_snapshot() TO authenticated;
