-- Owner-approved and applied 14 Nov 2026 after a rolled-back dry run (grants unchanged; still Admin-only).
-- Approval cards for MCP tools (phase 5, 14 Nov 2026): a tool's Admin mode may now be 'ask' as well as 'allow' or 'never'.
-- The agent catalog returns 'allow' and 'ask' tools (each keeps its 'mode'); for an 'ask' tool the agent ends the turn with an
-- approval card and runs exactly that call only after the user's "Allow once" (src/agent-loop/tools.ts). 'never' tools are
-- still never returned. Only the filter changes from the 20261113190000 body; the function stays Admin-only.
-- Rollback: re-run the CREATE FUNCTION body of 20261113190000 as CREATE OR REPLACE; 'ask' tools then disappear from chats.

CREATE OR REPLACE FUNCTION public.panda_agent_mcp_agent_catalog() RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
BEGIN
 PERFORM public.panda_agent_control_room_admin();
 RETURN coalesce((SELECT jsonb_agg(jsonb_build_object('name',s.name,'url',s.url,'authHeader',s.auth_header,'secret',s.secret_ciphertext,
   'tools',(SELECT coalesce(jsonb_agg(t),'[]'::jsonb) FROM jsonb_array_elements(s.tools) t WHERE t->>'mode' IN ('allow','ask'))) ORDER BY s.name)
  FROM public.panda_agent_mcp_servers s WHERE s.enabled), '[]'::jsonb);
END $$;
