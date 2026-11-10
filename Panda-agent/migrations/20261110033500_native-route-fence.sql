-- Fence existing plain/native journal turns against legacy retrieval preparation.
-- Forward-only: rollback requires a separately reviewed migration.
CREATE FUNCTION public.panda_agent_llm_prepare_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
BEGIN
 IF (NEW.request_hash IS NOT NULL OR NEW.product_id IS NOT NULL OR NEW.sku IS NOT NULL OR NEW.scope_hash IS NOT NULL)
 AND EXISTS(SELECT 1 FROM public.panda_agent_llm_turns g WHERE g.thread_id=NEW.thread_id AND g.request_id=NEW.request_id)
 THEN PERFORM public.phase3_fail('conflict'); END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.panda_agent_llm_prepare_guard() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER panda_agent_llm_prepare_guard BEFORE UPDATE OF request_hash,product_id,sku,scope_hash ON public.panda_agent_lightweight_turns
FOR EACH ROW EXECUTE FUNCTION public.panda_agent_llm_prepare_guard();
