-- Forward-only bounds and audit projection for the initial fixed vendor catalog.
ALTER FUNCTION public.panda_agent_vendor_capture(text,text) RENAME TO panda_agent_vendor_capture_before_bounds;
REVOKE ALL ON FUNCTION public.panda_agent_vendor_capture_before_bounds(text,text) FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.panda_agent_vendor_capture(p_payload text,p_mac text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE v jsonb;d public.panda_agent_vendor_documents;BEGIN
 v:=public.panda_agent_diagnostic_verify(p_payload,p_mac,'capture');PERFORM public.panda_agent_skill_admin();
 PERFORM pg_advisory_xact_lock(hashtext('panda_agent_vendor_lifecycle'));
 SELECT * INTO d FROM public.panda_agent_vendor_documents WHERE id=v->>'catalogId' FOR UPDATE;IF NOT FOUND THEN PERFORM public.phase3_fail('not_found');END IF;
 IF (v->>'exp')::bigint<extract(epoch FROM clock_timestamp()) THEN PERFORM public.phase3_fail('unauthenticated');END IF;
 IF (SELECT count(*) FROM public.panda_agent_vendor_versions WHERE document_id=d.id)>=20 AND NOT EXISTS(SELECT 1 FROM public.panda_agent_vendor_versions WHERE document_id=d.id AND content_hash=v->>'contentHash') THEN PERFORM public.phase3_fail('quota');END IF;
 RETURN public.panda_agent_vendor_capture_before_bounds(p_payload,p_mac);
END $$;
REVOKE ALL ON FUNCTION public.panda_agent_vendor_capture(text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.panda_agent_vendor_capture(text,text) TO authenticated;
CREATE OR REPLACE FUNCTION public.panda_agent_documentation_read() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE result jsonb;BEGIN
 PERFORM public.panda_agent_skill_admin();
 SELECT jsonb_build_object('documents',coalesce(jsonb_agg(jsonb_build_object(
  'catalogId',d.id,'title',d.title,'sourceUrl',d.canonical_url,'chip',d.chip,'framework',d.framework,'frameworkVersion',d.framework_version,'version',d.version,'currentVersion',d.current_version,
  'versions',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',s.id,'contentHash',s.content_hash,'fragments',s.fragments,'fetchedAt',s.captured_at,'status',s.status,'rights',s.rights_status,'rightsEvidence',s.rights_evidence,'attribution',s.attribution) ORDER BY s.captured_at DESC,s.id),'[]') FROM (SELECT * FROM public.panda_agent_vendor_versions WHERE document_id=d.id ORDER BY captured_at DESC,id LIMIT 20) s),
  'history',(SELECT coalesce(jsonb_agg(jsonb_build_object('versionId',e.version_id,'action',e.action,'reason',e.reason,'at',e.at) ORDER BY e.at DESC,e.id DESC),'[]') FROM (SELECT * FROM public.panda_agent_document_events WHERE document_id=d.id ORDER BY at DESC,id DESC LIMIT 20) e)
 ) ORDER BY d.id),'[]'),
 'tools',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',t.id,'enabled',t.enabled,'version',t.version,'manifest',t.manifest,'hash',t.manifest_hash,
  'history',(SELECT coalesce(jsonb_agg(jsonb_build_object('enabled',e.enabled,'reason',e.reason,'at',e.at) ORDER BY e.at DESC,e.id DESC),'[]') FROM (SELECT * FROM public.panda_agent_tool_events WHERE tool_id=t.id ORDER BY at DESC,id DESC LIMIT 20) e)) ORDER BY t.id),'[]') FROM public.panda_agent_tools t WHERE id='search_vendor_docs')) INTO result
 FROM public.panda_agent_vendor_documents d WHERE id='espressif-esp-idf-5.5.1-esp32-gpio';
 RETURN result;
END $$;
