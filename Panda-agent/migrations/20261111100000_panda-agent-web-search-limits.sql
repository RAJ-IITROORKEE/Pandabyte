-- Per-user daily web-search budget. Counters are written only by the RPC below, keyed by the caller's Clerk subject.
-- Rollback: DROP both functions, then the table.
CREATE TABLE public.panda_agent_web_search_usage (
 subject text NOT NULL CHECK(length(subject) BETWEEN 1 AND 200),
 day date NOT NULL,
 used integer NOT NULL DEFAULT 0 CHECK(used>=0),
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(subject,day)
);
ALTER TABLE public.panda_agent_web_search_usage ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.panda_agent_web_search_usage FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.panda_agent_web_search_consume(p_limit integer) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE actor text:=public.requesting_user_id(); today date:=(now() AT TIME ZONE 'UTC')::date; n integer; ok boolean:=true;
BEGIN
 IF actor IS NULL THEN PERFORM public.phase3_fail('unauthenticated'); END IF;
 IF p_limit IS NULL OR p_limit<1 OR p_limit>100 THEN PERFORM public.phase3_fail('invalid'); END IF;
 -- Single atomic statement: once the budget is spent the conflict branch updates nothing and returns no row.
 INSERT INTO public.panda_agent_web_search_usage AS u(subject,day,used) VALUES(actor,today,1)
 ON CONFLICT(subject,day) DO UPDATE SET used=u.used+1,updated_at=now() WHERE u.used<p_limit
 RETURNING u.used INTO n;
 IF n IS NULL THEN
  ok:=false;
  SELECT used INTO n FROM public.panda_agent_web_search_usage WHERE subject=actor AND day=today;
 END IF;
 RETURN jsonb_build_object('allowed',ok,'used',n,'limit',p_limit,
  'resetsAt',to_char((today+1)::timestamp,'YYYY-MM-DD"T"HH24:MI:SS"Z"'));
END $$;
REVOKE ALL ON FUNCTION public.panda_agent_web_search_consume(integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.panda_agent_web_search_consume(integer) TO authenticated;

CREATE FUNCTION public.panda_agent_web_search_usage_today() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE actor text:=public.requesting_user_id(); today date:=(now() AT TIME ZONE 'UTC')::date;
BEGIN
 IF actor IS NULL THEN PERFORM public.phase3_fail('unauthenticated'); END IF;
 RETURN jsonb_build_object('used',coalesce((SELECT used FROM public.panda_agent_web_search_usage WHERE subject=actor AND day=today),0),
  'resetsAt',to_char((today+1)::timestamp,'YYYY-MM-DD"T"HH24:MI:SS"Z"'));
END $$;
REVOKE ALL ON FUNCTION public.panda_agent_web_search_usage_today() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.panda_agent_web_search_usage_today() TO authenticated;
