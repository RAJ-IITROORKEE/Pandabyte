-- Agent skills registry (phase 2, owner request 13 Nov 2026; plan: Panda-agent/docs/agent-skills-mcp-plan.md).
-- Admin-managed SKILL.md skills (Agent Skills format: name + description frontmatter, Markdown body) that the agent loop lists by
-- name and description and loads on demand. Separate from the older fixed guide bundles (panda_agent_skills), which stay unchanged.
-- Limits keep the model request small: description <= 500 chars, SKILL.md <= 6,000 chars, <= 12 enabled, <= 30 active skills.
-- Every change bumps the version (optimistic concurrency) and appends a history row. Built-in skills can be edited and disabled,
-- not removed; custom skills can be removed (archived, history kept).
-- Rollback: DROP FUNCTION the six panda_agent_agent_skill* functions below; DROP TABLE public.panda_agent_agent_skill_versions;
-- DROP TABLE public.panda_agent_agent_skills. The agent loop treats a missing catalog as "no skills".

CREATE TABLE public.panda_agent_agent_skills (
 name text PRIMARY KEY CHECK (name ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND length(name) <= 64),
 source text NOT NULL CHECK (source IN ('built-in','custom')),
 version integer NOT NULL CHECK (version >= 1),
 description text NOT NULL CHECK (length(btrim(description)) BETWEEN 1 AND 500 AND description !~ '[\r\n]'),
 content text NOT NULL CHECK (length(content) BETWEEN 1 AND 6000),
 content_sha256 text NOT NULL CHECK (content_sha256 ~ '^[a-f0-9]{64}$'),
 enabled boolean NOT NULL DEFAULT false,
 uses integer NOT NULL DEFAULT 0 CHECK (uses >= 0),
 last_used_at timestamptz,
 updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 updated_by text NOT NULL,
 archived_at timestamptz,
 CHECK (NOT (enabled AND archived_at IS NOT NULL)),
 CHECK (archived_at IS NULL OR source = 'custom')
);
CREATE TABLE public.panda_agent_agent_skill_versions (
 name text NOT NULL REFERENCES public.panda_agent_agent_skills(name),
 version integer NOT NULL CHECK (version >= 1),
 action text NOT NULL CHECK (action IN ('create','update','enable','disable','remove')),
 description text NOT NULL,
 content_sha256 text NOT NULL CHECK (content_sha256 ~ '^[a-f0-9]{64}$'),
 content text NOT NULL,
 enabled boolean NOT NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 created_by text NOT NULL,
 PRIMARY KEY (name, version)
);
ALTER TABLE public.panda_agent_agent_skills ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.panda_agent_agent_skill_versions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.panda_agent_agent_skills, public.panda_agent_agent_skill_versions FROM PUBLIC, anon, authenticated;

-- Admin projection of one skill.
CREATE FUNCTION public.panda_agent_agent_skill_json(s public.panda_agent_agent_skills) RETURNS jsonb
LANGUAGE sql STABLE SET search_path=pg_catalog,public,pg_temp AS $$
 SELECT jsonb_build_object('name',s.name,'source',s.source,'version',s.version,'description',s.description,'content',s.content,
  'enabled',s.enabled,'uses',s.uses,'lastUsedAt',s.last_used_at,'updatedAt',s.updated_at)
$$;
REVOKE ALL ON FUNCTION public.panda_agent_agent_skill_json(public.panda_agent_agent_skills) FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.panda_agent_agent_skills_admin() RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
BEGIN
 PERFORM public.panda_agent_control_room_admin();
 RETURN coalesce((SELECT jsonb_agg(public.panda_agent_agent_skill_json(s) ORDER BY s.source, s.name) FROM public.panda_agent_agent_skills s WHERE s.archived_at IS NULL), '[]'::jsonb);
END $$;

-- Create (p_expected = 0, custom) or update (p_expected = current version). Enabled state is unchanged by an edit.
CREATE FUNCTION public.panda_agent_agent_skill_save(p_name text, p_description text, p_content text, p_expected integer) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE actor text; s public.panda_agent_agent_skills; digest text;
BEGIN
 actor := public.panda_agent_control_room_admin();
 IF p_name IS NULL OR p_description IS NULL OR p_content IS NULL OR p_expected IS NULL OR p_expected < 0 THEN PERFORM public.phase3_fail('invalid'); END IF;
 digest := encode(sha256(convert_to(p_content,'UTF8')),'hex');
 IF p_expected = 0 THEN
  IF EXISTS(SELECT 1 FROM public.panda_agent_agent_skills WHERE name = p_name) THEN PERFORM public.phase3_fail('conflict'); END IF;
  IF (SELECT count(*) FROM public.panda_agent_agent_skills WHERE archived_at IS NULL) >= 30 THEN PERFORM public.phase3_fail('quota'); END IF;
  INSERT INTO public.panda_agent_agent_skills(name,source,version,description,content,content_sha256,enabled,updated_by)
   VALUES(p_name,'custom',1,p_description,p_content,digest,false,actor) RETURNING * INTO s;
 ELSE
  UPDATE public.panda_agent_agent_skills SET version = version + 1, description = p_description, content = p_content, content_sha256 = digest,
   updated_at = clock_timestamp(), updated_by = actor
   WHERE name = p_name AND version = p_expected AND archived_at IS NULL RETURNING * INTO s;
  IF NOT FOUND THEN PERFORM public.phase3_fail(CASE WHEN EXISTS(SELECT 1 FROM public.panda_agent_agent_skills WHERE name = p_name AND archived_at IS NULL) THEN 'conflict' ELSE 'not_found' END); END IF;
 END IF;
 INSERT INTO public.panda_agent_agent_skill_versions(name,version,action,description,content_sha256,content,enabled,created_by)
  VALUES(s.name,s.version,CASE WHEN p_expected = 0 THEN 'create' ELSE 'update' END,s.description,s.content_sha256,s.content,s.enabled,actor);
 RETURN public.panda_agent_agent_skill_json(s);
END $$;

-- Enable, disable, or remove (custom only).
CREATE FUNCTION public.panda_agent_agent_skill_set(p_name text, p_action text, p_expected integer) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE actor text; s public.panda_agent_agent_skills;
BEGIN
 actor := public.panda_agent_control_room_admin();
 IF p_name IS NULL OR p_expected IS NULL OR p_action IS NULL OR p_action NOT IN ('enable','disable','remove') THEN PERFORM public.phase3_fail('invalid'); END IF;
 SELECT * INTO s FROM public.panda_agent_agent_skills WHERE name = p_name AND archived_at IS NULL FOR UPDATE;
 IF NOT FOUND THEN PERFORM public.phase3_fail('not_found'); END IF;
 IF s.version <> p_expected THEN PERFORM public.phase3_fail('conflict'); END IF;
 IF p_action = 'remove' AND s.source <> 'custom' THEN PERFORM public.phase3_fail('invalid'); END IF;
 IF p_action = 'enable' AND NOT s.enabled AND (SELECT count(*) FROM public.panda_agent_agent_skills WHERE enabled) >= 12 THEN PERFORM public.phase3_fail('quota'); END IF;
 UPDATE public.panda_agent_agent_skills SET version = version + 1, enabled = (p_action = 'enable'),
  archived_at = CASE WHEN p_action = 'remove' THEN clock_timestamp() ELSE NULL END, updated_at = clock_timestamp(), updated_by = actor
  WHERE name = p_name RETURNING * INTO s;
 INSERT INTO public.panda_agent_agent_skill_versions(name,version,action,description,content_sha256,content,enabled,created_by)
  VALUES(s.name,s.version,p_action,s.description,s.content_sha256,s.content,s.enabled,actor);
 RETURN CASE WHEN p_action = 'remove' THEN jsonb_build_object('name',s.name,'removed',true) ELSE public.panda_agent_agent_skill_json(s) END;
END $$;

-- Agent side (any signed-in user's chat): enabled skills by name and description only.
CREATE FUNCTION public.panda_agent_agent_skill_catalog() RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
BEGIN
 IF public.requesting_user_id() IS NULL THEN PERFORM public.phase3_fail('unauthenticated'); END IF;
 RETURN coalesce((SELECT jsonb_agg(jsonb_build_object('name',s.name,'description',s.description) ORDER BY s.name)
  FROM (SELECT name, description FROM public.panda_agent_agent_skills WHERE enabled ORDER BY name LIMIT 12) s), '[]'::jsonb);
END $$;

-- Agent side: one enabled skill's SKILL.md, counted as a use.
CREATE FUNCTION public.panda_agent_agent_skill_load(p_name text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE s public.panda_agent_agent_skills;
BEGIN
 IF public.requesting_user_id() IS NULL THEN PERFORM public.phase3_fail('unauthenticated'); END IF;
 UPDATE public.panda_agent_agent_skills SET uses = least(uses + 1, 2000000000), last_used_at = clock_timestamp()
  WHERE name = p_name AND enabled RETURNING * INTO s;
 IF NOT FOUND THEN RETURN 'null'::jsonb; END IF;
 RETURN jsonb_build_object('name',s.name,'version',s.version,'content',s.content);
END $$;

REVOKE ALL ON FUNCTION public.panda_agent_agent_skills_admin(), public.panda_agent_agent_skill_save(text,text,text,integer),
 public.panda_agent_agent_skill_set(text,text,integer), public.panda_agent_agent_skill_catalog(), public.panda_agent_agent_skill_load(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.panda_agent_agent_skills_admin(), public.panda_agent_agent_skill_save(text,text,text,integer),
 public.panda_agent_agent_skill_set(text,text,integer), public.panda_agent_agent_skill_catalog(), public.panda_agent_agent_skill_load(text) TO authenticated;
