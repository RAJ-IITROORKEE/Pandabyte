-- Step 2 of 2 (owner-approved 13 Nov 2026): point the runtime at the 290-member candidate sealed by 20261113110000 (manifest
-- a394ce08...). Applied only after the application that accepts all three candidates was live. Only the pinned manifest hash
-- and member count change; the function body is otherwise copied from the live definition.
-- Rollback: run the same replacement in reverse (a394ce08... -> cea39f13..., 290 -> 285); the 285 candidate is intact.
DO $m$
DECLARE d text; r public.panda_agent_releases; products int; total bigint;
BEGIN
 d := pg_get_functiondef('public.panda_agent_runtime_candidate()'::regprocedure);
 IF position('cea39f13bfe41f6279e23b507dd2f01d8145873b7f4b3bde17ddc399987fe03e' IN d)=0 OR position('r.member_count<>285' IN d)=0 THEN RAISE EXCEPTION 'unexpected runtime_candidate body'; END IF;
 EXECUTE replace(replace(d,'cea39f13bfe41f6279e23b507dd2f01d8145873b7f4b3bde17ddc399987fe03e','a394ce0899a29907df6cd3edf0dbb8dfaf2a604bc1c00335e888754d376a3d49'),'r.member_count<>285','r.member_count<>290');
 r := public.panda_agent_runtime_candidate();
 products := jsonb_array_length(public.panda_agent_public_products()->'items');
 SELECT sum(jsonb_array_length(public.panda_agent_public_passages(i->>'sku')->'passages')) INTO total FROM jsonb_array_elements(public.panda_agent_public_products()->'items') i;
 -- 290 members minus the two blocked chunks are readable through the public catalog function.
 IF r.member_count<>290 OR (SELECT count(*) FROM public.panda_agent_runtime_eligible(r.id))<>290 OR products<>42 OR total<>288
  OR jsonb_array_length(public.panda_agent_public_passages('ESPXC3')->'passages')<>9 THEN RAISE EXCEPTION 'switch verification failed'; END IF;
END $m$;
