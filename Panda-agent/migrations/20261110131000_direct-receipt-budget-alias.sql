-- Replace the receipt budget alias only; retain the installed signed RPC and all guards.
DO $migration$
DECLARE def text; old_fragment text := $old$JOIN public.panda_agent_rag_budgets b ON b.id=r.budget_id WHERE r.budget_id=d.budget_id AND b.owner_subject=d.owner_subject AND b.enabled$old$;
 new_fragment text := $new$JOIN public.panda_agent_rag_budgets budget_row ON budget_row.id=r.budget_id WHERE r.budget_id=d.budget_id AND budget_row.owner_subject=d.owner_subject AND budget_row.enabled$new$;
BEGIN
 SELECT pg_get_functiondef('public.panda_agent_direct_chat(text,text)'::regprocedure) INTO def;
 IF def IS NULL OR (length(def)-length(replace(def,old_fragment,'')))<>length(old_fragment) THEN PERFORM public.phase3_fail('conflict'); END IF;
 EXECUTE replace(def,old_fragment,new_fragment);
END $migration$;
