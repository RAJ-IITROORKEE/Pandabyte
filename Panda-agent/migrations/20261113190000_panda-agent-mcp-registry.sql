-- MCP registry (phase 3, owner request 13 Nov 2026; plan: Panda-agent/docs/agent-skills-mcp-plan.md).
-- Admin-registered remote MCP servers (Streamable HTTP over https only; no commands run on our servers). The app encrypts any
-- API key with AES-256-GCM (key in PANDA_AGENT_MCP_SECRET_KEY, never in the database) and stores only the ciphertext here.
-- Tools are recorded after a connection test with a definition hash and a per-tool mode (allow | never); the agent gets only
-- 'allow' tools of enabled servers, and only on Admin chats (every function below requires Admin).
-- Rollback: DROP FUNCTION the panda_agent_mcp_* functions below; DROP TABLE public.panda_agent_mcp_server_events;
-- DROP TABLE public.panda_agent_mcp_servers. The agent treats a missing catalog as "no MCP tools".

CREATE TABLE public.panda_agent_mcp_servers (
 name text PRIMARY KEY CHECK (name ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND length(name) <= 20),
 url text NOT NULL CHECK (length(url) <= 300 AND url ~ '^https://[^\s]+$'),
 auth_header text CHECK (auth_header IS NULL OR auth_header ~ '^[A-Za-z][A-Za-z0-9-]{0,39}$'),
 secret_ciphertext text CHECK (secret_ciphertext IS NULL OR (length(secret_ciphertext) <= 2000 AND secret_ciphertext ~ '^v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$')),
 tools jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(tools) = 'array' AND jsonb_array_length(tools) <= 40 AND octet_length(tools::text) <= 120000),
 enabled boolean NOT NULL DEFAULT false,
 version integer NOT NULL CHECK (version >= 1),
 last_test_at timestamptz,
 last_test_ok boolean,
 last_error text CHECK (last_error IS NULL OR length(last_error) <= 300),
 calls integer NOT NULL DEFAULT 0 CHECK (calls >= 0),
 last_called_at timestamptz,
 updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 updated_by text NOT NULL,
 archived_at timestamptz,
 CHECK (NOT (enabled AND archived_at IS NOT NULL)),
 CHECK (NOT enabled OR last_test_ok IS TRUE)
);
CREATE TABLE public.panda_agent_mcp_server_events (
 name text NOT NULL REFERENCES public.panda_agent_mcp_servers(name),
 version integer NOT NULL,
 action text NOT NULL CHECK (action IN ('create','update','test','tools','enable','disable','remove')),
 detail jsonb,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 created_by text NOT NULL,
 PRIMARY KEY (name, version)
);
ALTER TABLE public.panda_agent_mcp_servers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.panda_agent_mcp_server_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.panda_agent_mcp_servers, public.panda_agent_mcp_server_events FROM PUBLIC, anon, authenticated;

-- Admin projection: never the ciphertext, only whether a key is set.
CREATE FUNCTION public.panda_agent_mcp_server_json(s public.panda_agent_mcp_servers) RETURNS jsonb
LANGUAGE sql STABLE SET search_path=pg_catalog,public,pg_temp AS $$
 SELECT jsonb_build_object('name',s.name,'url',s.url,'authHeader',s.auth_header,'hasSecret',s.secret_ciphertext IS NOT NULL,'tools',s.tools,
  'enabled',s.enabled,'version',s.version,'lastTestAt',s.last_test_at,'lastTestOk',s.last_test_ok,'lastError',s.last_error,
  'calls',s.calls,'lastCalledAt',s.last_called_at,'updatedAt',s.updated_at)
$$;
REVOKE ALL ON FUNCTION public.panda_agent_mcp_server_json(public.panda_agent_mcp_servers) FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.panda_agent_mcp_servers_admin() RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
BEGIN
 PERFORM public.panda_agent_control_room_admin();
 RETURN coalesce((SELECT jsonb_agg(public.panda_agent_mcp_server_json(s) ORDER BY s.name) FROM public.panda_agent_mcp_servers s WHERE s.archived_at IS NULL), '[]'::jsonb);
END $$;

-- Create (p_expected = 0) or update. A changed URL or auth header clears the tested tools and disables the server.
-- p_keep_secret keeps the stored ciphertext; otherwise p_secret (NULL = no key) replaces it.
CREATE FUNCTION public.panda_agent_mcp_server_save(p_name text, p_url text, p_auth_header text, p_secret text, p_keep_secret boolean, p_expected integer) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE actor text; s public.panda_agent_mcp_servers; changed boolean;
BEGIN
 actor := public.panda_agent_control_room_admin();
 IF p_name IS NULL OR p_url IS NULL OR p_keep_secret IS NULL OR p_expected IS NULL OR p_expected < 0 OR (p_expected = 0 AND p_keep_secret) THEN PERFORM public.phase3_fail('invalid'); END IF;
 IF p_expected = 0 THEN
  IF EXISTS(SELECT 1 FROM public.panda_agent_mcp_servers WHERE name = p_name) THEN PERFORM public.phase3_fail('conflict'); END IF;
  IF (SELECT count(*) FROM public.panda_agent_mcp_servers WHERE archived_at IS NULL) >= 10 THEN PERFORM public.phase3_fail('quota'); END IF;
  INSERT INTO public.panda_agent_mcp_servers(name,url,auth_header,secret_ciphertext,version,updated_by)
   VALUES(p_name,p_url,p_auth_header,p_secret,1,actor) RETURNING * INTO s;
  INSERT INTO public.panda_agent_mcp_server_events(name,version,action,detail,created_by) VALUES(s.name,1,'create',jsonb_build_object('url',s.url),actor);
 ELSE
  SELECT * INTO s FROM public.panda_agent_mcp_servers WHERE name = p_name AND archived_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN PERFORM public.phase3_fail('not_found'); END IF;
  IF s.version <> p_expected THEN PERFORM public.phase3_fail('conflict'); END IF;
  changed := s.url IS DISTINCT FROM p_url OR s.auth_header IS DISTINCT FROM p_auth_header OR NOT p_keep_secret;
  UPDATE public.panda_agent_mcp_servers SET url = p_url, auth_header = p_auth_header,
   secret_ciphertext = CASE WHEN p_keep_secret THEN secret_ciphertext ELSE p_secret END,
   tools = CASE WHEN changed THEN '[]'::jsonb ELSE tools END, enabled = enabled AND NOT changed,
   last_test_ok = CASE WHEN changed THEN NULL ELSE last_test_ok END,
   version = version + 1, updated_at = clock_timestamp(), updated_by = actor
   WHERE name = p_name RETURNING * INTO s;
  INSERT INTO public.panda_agent_mcp_server_events(name,version,action,detail,created_by) VALUES(s.name,s.version,'update',jsonb_build_object('url',s.url,'connectionChanged',changed),actor);
 END IF;
 RETURN public.panda_agent_mcp_server_json(s);
END $$;

-- Server-side connection details for a test (Admin only; the ciphertext is useless without the app's key).
CREATE FUNCTION public.panda_agent_mcp_server_connection(p_name text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE s public.panda_agent_mcp_servers;
BEGIN
 PERFORM public.panda_agent_control_room_admin();
 SELECT * INTO s FROM public.panda_agent_mcp_servers WHERE name = p_name AND archived_at IS NULL;
 IF NOT FOUND THEN PERFORM public.phase3_fail('not_found'); END IF;
 RETURN jsonb_build_object('name',s.name,'url',s.url,'authHeader',s.auth_header,'secret',s.secret_ciphertext,'tools',s.tools,'version',s.version);
END $$;

-- Records a connection test (p_action 'test') or an Admin tool-mode change (p_action 'tools'). A failed test disables the server.
CREATE FUNCTION public.panda_agent_mcp_server_tools(p_name text, p_action text, p_tools jsonb, p_ok boolean, p_error text, p_expected integer) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE actor text; s public.panda_agent_mcp_servers;
BEGIN
 actor := public.panda_agent_control_room_admin();
 IF p_name IS NULL OR p_action IS NULL OR p_action NOT IN ('test','tools') OR p_tools IS NULL OR p_ok IS NULL OR p_expected IS NULL THEN PERFORM public.phase3_fail('invalid'); END IF;
 SELECT * INTO s FROM public.panda_agent_mcp_servers WHERE name = p_name AND archived_at IS NULL FOR UPDATE;
 IF NOT FOUND THEN PERFORM public.phase3_fail('not_found'); END IF;
 IF s.version <> p_expected THEN PERFORM public.phase3_fail('conflict'); END IF;
 IF p_action = 'tools' AND s.last_test_ok IS NOT TRUE THEN PERFORM public.phase3_fail('invalid'); END IF;
 UPDATE public.panda_agent_mcp_servers SET tools = p_tools,
  last_test_at = CASE WHEN p_action = 'test' THEN clock_timestamp() ELSE last_test_at END,
  last_test_ok = CASE WHEN p_action = 'test' THEN p_ok ELSE last_test_ok END,
  last_error = CASE WHEN p_action = 'test' THEN CASE WHEN p_ok THEN NULL ELSE left(p_error, 300) END ELSE last_error END,
  enabled = enabled AND (p_action = 'tools' OR p_ok),
  version = version + 1, updated_at = clock_timestamp(), updated_by = actor
  WHERE name = p_name RETURNING * INTO s;
 INSERT INTO public.panda_agent_mcp_server_events(name,version,action,detail,created_by)
  VALUES(s.name,s.version,p_action,jsonb_build_object('ok',p_ok,'tools',jsonb_array_length(p_tools)),actor);
 RETURN public.panda_agent_mcp_server_json(s);
END $$;

-- Enable (needs a passed test), disable, or remove.
CREATE FUNCTION public.panda_agent_mcp_server_set(p_name text, p_action text, p_expected integer) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE actor text; s public.panda_agent_mcp_servers;
BEGIN
 actor := public.panda_agent_control_room_admin();
 IF p_name IS NULL OR p_expected IS NULL OR p_action IS NULL OR p_action NOT IN ('enable','disable','remove') THEN PERFORM public.phase3_fail('invalid'); END IF;
 SELECT * INTO s FROM public.panda_agent_mcp_servers WHERE name = p_name AND archived_at IS NULL FOR UPDATE;
 IF NOT FOUND THEN PERFORM public.phase3_fail('not_found'); END IF;
 IF s.version <> p_expected THEN PERFORM public.phase3_fail('conflict'); END IF;
 IF p_action = 'enable' AND s.last_test_ok IS NOT TRUE THEN PERFORM public.phase3_fail('invalid'); END IF;
 UPDATE public.panda_agent_mcp_servers SET enabled = (p_action = 'enable'), archived_at = CASE WHEN p_action = 'remove' THEN clock_timestamp() ELSE NULL END,
  secret_ciphertext = CASE WHEN p_action = 'remove' THEN NULL ELSE secret_ciphertext END,
  version = version + 1, updated_at = clock_timestamp(), updated_by = actor
  WHERE name = p_name RETURNING * INTO s;
 INSERT INTO public.panda_agent_mcp_server_events(name,version,action,created_by) VALUES(s.name,s.version,p_action,actor);
 RETURN CASE WHEN p_action = 'remove' THEN jsonb_build_object('name',s.name,'removed',true) ELSE public.panda_agent_mcp_server_json(s) END;
END $$;

-- Agent side (Admin chats only): enabled servers with their allowed tools and connection details.
CREATE FUNCTION public.panda_agent_mcp_agent_catalog() RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
BEGIN
 PERFORM public.panda_agent_control_room_admin();
 RETURN coalesce((SELECT jsonb_agg(jsonb_build_object('name',s.name,'url',s.url,'authHeader',s.auth_header,'secret',s.secret_ciphertext,
   'tools',(SELECT coalesce(jsonb_agg(t),'[]'::jsonb) FROM jsonb_array_elements(s.tools) t WHERE t->>'mode' = 'allow')) ORDER BY s.name)
  FROM public.panda_agent_mcp_servers s WHERE s.enabled), '[]'::jsonb);
END $$;

-- Counts one agent call to a server.
CREATE FUNCTION public.panda_agent_mcp_record_call(p_name text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
BEGIN
 PERFORM public.panda_agent_control_room_admin();
 UPDATE public.panda_agent_mcp_servers SET calls = least(calls + 1, 2000000000), last_called_at = clock_timestamp() WHERE name = p_name AND enabled;
END $$;

REVOKE ALL ON FUNCTION public.panda_agent_mcp_servers_admin(), public.panda_agent_mcp_server_save(text,text,text,text,boolean,integer),
 public.panda_agent_mcp_server_connection(text), public.panda_agent_mcp_server_tools(text,text,jsonb,boolean,text,integer),
 public.panda_agent_mcp_server_set(text,text,integer), public.panda_agent_mcp_agent_catalog(), public.panda_agent_mcp_record_call(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.panda_agent_mcp_servers_admin(), public.panda_agent_mcp_server_save(text,text,text,text,boolean,integer),
 public.panda_agent_mcp_server_connection(text), public.panda_agent_mcp_server_tools(text,text,jsonb,boolean,text,integer),
 public.panda_agent_mcp_server_set(text,text,integer), public.panda_agent_mcp_agent_catalog(), public.panda_agent_mcp_record_call(text) TO authenticated;
