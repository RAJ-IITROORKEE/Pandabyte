-- Step 2 of 2 for the Espressif datasheet excerpts (owner request, 13 Nov 2026): point the runtime at the 395-member candidate
-- sealed by 20261113120000 (manifest 02d39754...). Applied only after the application that accepts it was live.
-- Rollback: the inverse replace (02d39754... -> a394ce08..., 395 -> 290); the 290 candidate is intact.
DO $m$
DECLARE d text; r public.panda_agent_releases; products int; total bigint;
BEGIN
 d := pg_get_functiondef('public.panda_agent_runtime_candidate()'::regprocedure);
 IF position('a394ce0899a29907df6cd3edf0dbb8dfaf2a604bc1c00335e888754d376a3d49' IN d)=0 OR position('r.member_count<>290' IN d)=0 THEN RAISE EXCEPTION 'unexpected runtime_candidate body'; END IF;
 EXECUTE replace(replace(d,'a394ce0899a29907df6cd3edf0dbb8dfaf2a604bc1c00335e888754d376a3d49','02d397543fa324baa1d3940c21b2edcd062b2f1de395e62397bcf349092a75ed'),'r.member_count<>290','r.member_count<>395');
 r := public.panda_agent_runtime_candidate();
 products := jsonb_array_length(public.panda_agent_public_products()->'items');
 SELECT sum(jsonb_array_length(public.panda_agent_public_passages(i->>'sku')->'passages')) INTO total FROM jsonb_array_elements(public.panda_agent_public_products()->'items') i;
 -- The anonymous catalog read must stay listing-only: still 288 passages, datasheet text excluded.
 IF r.member_count<>395 OR (SELECT count(*) FROM public.panda_agent_runtime_eligible(r.id))<>395 OR products<>42 OR total<>288 THEN RAISE EXCEPTION 'switch verification failed'; END IF;
END $m$;
