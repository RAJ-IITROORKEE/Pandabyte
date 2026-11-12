-- Step 2 of 2 (owner-approved 13 Nov 2026): point the runtime at the 285-member candidate sealed by 20261113100000.
-- Apply only after the application that accepts both candidates is live. Only the pinned manifest hash and member
-- count change; the function body is otherwise copied from the live definition.
-- Rollback: run the same replacement in reverse (cea39f13... -> 0ebfec34..., 285 -> 284); the old candidate is intact.
DO $m$
DECLARE d text; r public.panda_agent_releases;
BEGIN
 d := pg_get_functiondef('public.panda_agent_runtime_candidate()'::regprocedure);
 IF position('0ebfec3480bffa6c53304bb0f3d6333b2b81eb466e8cadb488a869cf3aff6ffa' IN d)=0 OR position('r.member_count<>284' IN d)=0 THEN RAISE EXCEPTION 'unexpected runtime_candidate body'; END IF;
 EXECUTE replace(replace(d,'0ebfec3480bffa6c53304bb0f3d6333b2b81eb466e8cadb488a869cf3aff6ffa','cea39f13bfe41f6279e23b507dd2f01d8145873b7f4b3bde17ddc399987fe03e'),'r.member_count<>284','r.member_count<>285');
 r := public.panda_agent_runtime_candidate();
 IF r.member_count<>285 OR (SELECT count(*) FROM public.panda_agent_runtime_eligible(r.id))<>285
  OR jsonb_array_length(public.panda_agent_public_products()->'items')<>42
  OR jsonb_array_length(public.panda_agent_public_passages('ESPXC3')->'passages')<>9 THEN RAISE EXCEPTION 'switch verification failed'; END IF;
END $m$;
