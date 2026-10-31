-- Permit exact retries after sealing without changing immutable chunks.
CREATE OR REPLACE FUNCTION public.panda_agent_add_chunk(p_version uuid,p_logical text,p_chunk text,p_text text,p_hash text,p_locator text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE v public.panda_agent_versions%ROWTYPE; c public.panda_agent_chunks%ROWTYPE;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtext('panda_agent_lifecycle'));
 SELECT * INTO STRICT v FROM public.panda_agent_versions WHERE id=p_version FOR UPDATE;
 IF v.state NOT IN ('quarantined','validated','approved') OR v.withdrawn_at IS NOT NULL OR v.deleted_at IS NOT NULL OR v.purged_at IS NOT NULL OR NOT EXISTS (SELECT 1 FROM public.panda_agent_sources s WHERE s.id=v.source_id AND s.review_state<>'rejected' AND s.withdrawn_at IS NULL AND s.deleted_at IS NULL) THEN RAISE EXCEPTION 'version ineligible'; END IF;
 SELECT * INTO c FROM public.panda_agent_chunks WHERE document_version_id=p_version AND logical_chunk_id=p_logical;
 IF FOUND THEN
  IF c.purged_at IS NOT NULL OR (c.chunk_version_id,c.chunk_text,c.text_hash,c.locator) IS DISTINCT FROM (p_chunk,p_text,p_hash,p_locator) THEN RAISE EXCEPTION 'chunk identity conflict'; END IF;
  RETURN;
 END IF;
 IF v.state<>'quarantined' THEN RAISE EXCEPTION 'version sealed'; END IF;
 INSERT INTO public.panda_agent_chunks(document_version_id,logical_chunk_id,chunk_version_id,chunk_text,text_hash,locator) VALUES(p_version,p_logical,p_chunk,p_text,p_hash,p_locator) ON CONFLICT DO NOTHING;
 SELECT * INTO STRICT c FROM public.panda_agent_chunks WHERE document_version_id=p_version AND logical_chunk_id=p_logical;
 IF c.purged_at IS NOT NULL OR (c.chunk_version_id,c.chunk_text,c.text_hash,c.locator) IS DISTINCT FROM (p_chunk,p_text,p_hash,p_locator) THEN RAISE EXCEPTION 'chunk identity conflict'; END IF;
END $$;
