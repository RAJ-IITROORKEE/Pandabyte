-- Owner-approved and applied 14 Nov 2026 after a rolled-back dry run.
-- MCP tools for every signed-in chat user (14 Nov 2026, owner: "make this for every signed user ... same as the admin
-- experience" after the Admin live test). Skills were already open to signed-in users; the MCP agent catalog and its call
-- counter required Admin. Only that check changes (Admin -> any signed-in user); the bodies are otherwise the live ones.
-- The catalog still returns only enabled servers' 'allow'/'ask' tools. An MCP key leaves the database only as AES-256-GCM
-- ciphertext whose key lives in the app's environment, never in the database. Admin can switch MCP tools off for everyone
-- (panda_agent_tool_settings 'mcp_tools'). Management functions (create, test, modes) stay Admin-only.
-- Rollback: re-run both bodies with PERFORM public.panda_agent_control_room_admin(); in place of the signed-in check.

CREATE OR REPLACE FUNCTION public.panda_agent_mcp_agent_catalog() RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
BEGIN
 IF public.requesting_user_id() IS NULL THEN PERFORM public.phase3_fail('unauthenticated'); END IF;
 RETURN coalesce((SELECT jsonb_agg(jsonb_build_object('name',s.name,'url',s.url,'authHeader',s.auth_header,'secret',s.secret_ciphertext,
   'tools',(SELECT coalesce(jsonb_agg(t),'[]'::jsonb) FROM jsonb_array_elements(s.tools) t WHERE t->>'mode' IN ('allow','ask'))) ORDER BY s.name)
  FROM public.panda_agent_mcp_servers s WHERE s.enabled), '[]'::jsonb);
END $$;

CREATE OR REPLACE FUNCTION public.panda_agent_mcp_record_call(p_name text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
BEGIN
 IF public.requesting_user_id() IS NULL THEN PERFORM public.phase3_fail('unauthenticated'); END IF;
 UPDATE public.panda_agent_mcp_servers SET calls = least(calls + 1, 2000000000), last_called_at = clock_timestamp() WHERE name = p_name AND enabled;
END $$;
