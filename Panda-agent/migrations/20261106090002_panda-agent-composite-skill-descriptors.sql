-- Customer-scoped descriptors carry no hidden skill body. The BFF loads the selected pinned bundle.
CREATE OR REPLACE FUNCTION public.panda_agent_composite_grants(p_skill text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE s public.panda_agent_skills;b public.panda_agent_skill_versions;BEGIN
 IF public.requesting_user_id() IS NULL THEN PERFORM public.phase3_fail('unauthenticated');END IF;
 IF p_skill NOT IN ('panda-documented-firmware-help','panda-error-triage','panda-project-planner') THEN PERFORM public.phase3_fail('invalid');END IF;
 SELECT * INTO s FROM public.panda_agent_skills WHERE id=p_skill FOR SHARE NOWAIT;
 SELECT * INTO b FROM public.panda_agent_skill_versions WHERE skill_id=s.id AND version=s.active_version FOR SHARE NOWAIT;
 IF s.enabled IS DISTINCT FROM true OR b.reviewed IS DISTINCT FROM true THEN PERFORM public.phase3_fail('conflict');END IF;
 RETURN jsonb_build_object('skill',jsonb_build_object('id',s.id,'bundleVersion',b.version,'hash',b.content_hash,'epoch',s.version,'permissions',b.permissions),'tools',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',t.id,'epoch',t.version,'hash',t.manifest_hash,'enabled',t.enabled) ORDER BY t.id),'[]') FROM public.panda_agent_tools t WHERE b.permissions ? t.id));
END $$;
REVOKE ALL ON FUNCTION public.panda_agent_composite_grants(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.panda_agent_composite_grants(text) TO authenticated;
