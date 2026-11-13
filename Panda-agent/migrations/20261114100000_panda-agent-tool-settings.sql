-- Owner-approved and applied 14 Nov 2026 after a rolled-back dry run (8 settings seeded, 7 on).
-- Admin tool controls and compile caps (14 Nov 2026, plan: Panda-agent/docs/device-tools-admin-controls-plan.md).
-- 1) panda_agent_tool_settings: on/off for each optional agent tool, read every turn. Required tools (search_catalog,
--    read_product, ask_user, final_answer) are not listed here: they cannot be switched off.
-- 2) panda_agent_web_search_month(): Admin view of this month's web searches by signed-in users (Admins are uncapped and not
--    counted in panda_agent_web_search_daily); Tavily's own /usage numbers are read by the app.
-- 3) panda_agent_compile_daily + panda_agent_compile_reserve(): Admins uncapped; other signed-in users at most 10 builds per
--    India day (the compile tool reserves a build before calling the compile service).
-- Rollback: DROP FUNCTION public.panda_agent_compile_reserve(), public.panda_agent_web_search_month(),
--   public.panda_agent_tool_setting_set(text,boolean,integer), public.panda_agent_tool_settings();
--   DROP TABLE public.panda_agent_compile_daily, public.panda_agent_tool_settings. The app treats a missing settings function
--   as "defaults" (every optional tool on except web_helper).

CREATE TABLE public.panda_agent_tool_settings (
 name text PRIMARY KEY CHECK (name IN ('find_pinout','plan','web_search','web_helper','load_skill','mcp_tools','compile_sketch','device_panel')),
 enabled boolean NOT NULL,
 version integer NOT NULL DEFAULT 1 CHECK (version >= 1),
 updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 updated_by text CHECK (updated_by IS NULL OR length(updated_by) <= 200)
);
ALTER TABLE public.panda_agent_tool_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.panda_agent_tool_settings FROM PUBLIC, anon, authenticated;
INSERT INTO public.panda_agent_tool_settings(name, enabled) VALUES
 ('find_pinout',true),('plan',true),('web_search',true),('web_helper',false),('load_skill',true),('mcp_tools',true),('compile_sketch',true),('device_panel',true);

-- Any signed-in user: which optional tools are on (names, flags and versions only; nothing private).
CREATE FUNCTION public.panda_agent_tool_settings() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
BEGIN
 IF public.requesting_user_id() IS NULL THEN PERFORM public.phase3_fail('unauthenticated'); END IF;
 RETURN coalesce((SELECT jsonb_agg(jsonb_build_object('name',name,'enabled',enabled,'version',version,'updatedAt',updated_at) ORDER BY name)
  FROM public.panda_agent_tool_settings), '[]'::jsonb);
END $$;

-- Admin: switch one optional tool on or off, checked against the version the Admin saw.
CREATE FUNCTION public.panda_agent_tool_setting_set(p_name text, p_enabled boolean, p_expected integer) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE actor text; s public.panda_agent_tool_settings;
BEGIN
 actor := public.panda_agent_control_room_admin();
 IF p_name IS NULL OR p_enabled IS NULL OR p_expected IS NULL THEN PERFORM public.phase3_fail('invalid'); END IF;
 SELECT * INTO s FROM public.panda_agent_tool_settings WHERE name = p_name FOR UPDATE;
 IF NOT FOUND THEN PERFORM public.phase3_fail('not_found'); END IF;
 IF s.version <> p_expected THEN PERFORM public.phase3_fail('conflict'); END IF;
 UPDATE public.panda_agent_tool_settings SET enabled = p_enabled, version = version + 1, updated_at = clock_timestamp(), updated_by = actor
  WHERE name = p_name RETURNING * INTO s;
 RETURN jsonb_build_object('name',s.name,'enabled',s.enabled,'version',s.version,'updatedAt',s.updated_at);
END $$;

-- Admin: web searches by signed-in (non-Admin) users this India month.
CREATE FUNCTION public.panda_agent_web_search_month() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE since date := date_trunc('month', clock_timestamp() AT TIME ZONE 'Asia/Kolkata')::date;
BEGIN
 PERFORM public.panda_agent_control_room_admin();
 RETURN (SELECT jsonb_build_object('searches', coalesce(sum(searches),0), 'users', count(DISTINCT owner_subject), 'since', since)
  FROM public.panda_agent_web_search_daily WHERE day >= since);
END $$;

-- Compile builds per India day: Admins uncapped; others at most 10. Returns {allowed}.
CREATE TABLE public.panda_agent_compile_daily (
 owner_subject text NOT NULL, day date NOT NULL, builds integer NOT NULL CHECK (builds BETWEEN 1 AND 10),
 PRIMARY KEY (owner_subject, day)
);
ALTER TABLE public.panda_agent_compile_daily ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.panda_agent_compile_daily FROM PUBLIC, anon, authenticated;
CREATE FUNCTION public.panda_agent_compile_reserve() RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE actor text := public.requesting_user_id(); n integer;
BEGIN
 IF actor IS NULL THEN PERFORM public.phase3_fail('unauthenticated'); END IF;
 IF NOT EXISTS (SELECT 1 FROM public.panda_agent_tool_settings WHERE name = 'compile_sketch' AND enabled) THEN RETURN jsonb_build_object('allowed', false); END IF;
 IF EXISTS (SELECT 1 FROM public.staff_role_memberships WHERE user_id = actor AND role = 'ADMIN') THEN RETURN jsonb_build_object('allowed', true); END IF;
 INSERT INTO public.panda_agent_compile_daily AS c(owner_subject, day, builds) VALUES (actor, (clock_timestamp() AT TIME ZONE 'Asia/Kolkata')::date, 1)
  ON CONFLICT (owner_subject, day) DO UPDATE SET builds = c.builds + 1 WHERE c.builds < 10
  RETURNING builds INTO n;
 RETURN jsonb_build_object('allowed', n IS NOT NULL);
END $$;

REVOKE ALL ON FUNCTION public.panda_agent_tool_settings(), public.panda_agent_tool_setting_set(text,boolean,integer),
 public.panda_agent_web_search_month(), public.panda_agent_compile_reserve() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.panda_agent_tool_settings(), public.panda_agent_tool_setting_set(text,boolean,integer),
 public.panda_agent_web_search_month(), public.panda_agent_compile_reserve() TO authenticated;
