-- Owner-approved and applied 14 Nov 2026 after a rolled-back dry run (5 built-in models seeded).
-- Model registry for the Panda Agent (14 Nov 2026): Admin adds, enables, hides or removes OpenRouter models and orders the
-- free pool; the chat reads the enabled models every request. Built-in models keep their reviewed profiles in code
-- (src/server/hosted-model-openrouter.ts) and are listed here with builtin = true and an empty profile; Admin can switch them
-- on or off but not change or remove them. Added models carry their endpoint profile (validated by the app before use and
-- re-checked against the live OpenRouter endpoint every turn). privacy in a profile: 'zdr' (zero data retention) or 'logged'
-- (free endpoints that may keep prompts; free tier only, shown as such in the chat).
-- Usage: one row per model per India day, written after each turn (turns, failovers, failures, tokens, cost).
-- Rollback: DROP FUNCTION public.panda_agent_model_usage_record(text,bigint,bigint,bigint,boolean,boolean),
--   public.panda_agent_model_remove(text,integer), public.panda_agent_model_set(text,boolean,boolean,integer,integer),
--   public.panda_agent_model_save(text,text,text,jsonb,integer,text,integer), public.panda_agent_models_admin(),
--   public.panda_agent_models_catalog(); DROP TABLE public.panda_agent_model_usage_daily, public.panda_agent_models.
--   The app falls back to the built-in models when the catalog function is missing.

CREATE TABLE public.panda_agent_models (
 id text PRIMARY KEY CHECK (id ~ '^[a-z0-9][a-z0-9._-]*/[a-z0-9][a-z0-9._:-]*$' AND length(id) <= 120),
 label text NOT NULL CHECK (length(btrim(label)) BETWEEN 2 AND 60),
 tier text NOT NULL CHECK (tier IN ('paid','free')),
 enabled boolean NOT NULL DEFAULT false,
 members boolean NOT NULL DEFAULT true,
 pool_order integer CHECK (pool_order IS NULL OR pool_order BETWEEN 1 AND 50),
 builtin boolean NOT NULL DEFAULT false,
 profile jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(profile) = 'object' AND octet_length(profile::text) <= 8000),
 context_window integer CHECK (context_window IS NULL OR context_window BETWEEN 1000 AND 10000000),
 note text CHECK (note IS NULL OR length(note) <= 300),
 version integer NOT NULL DEFAULT 1 CHECK (version >= 1),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 updated_by text CHECK (updated_by IS NULL OR length(updated_by) <= 200),
 CHECK (tier = 'free' OR pool_order IS NULL),
 CHECK (builtin = (profile = '{}'::jsonb))
);
ALTER TABLE public.panda_agent_models ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.panda_agent_models FROM PUBLIC, anon, authenticated;
INSERT INTO public.panda_agent_models(id, label, tier, enabled, members, builtin, context_window) VALUES
 ('anthropic/claude-haiku-5.5','Claude Haiku 5.5','paid',true,true,true,1000000),
 ('openai/gpt-6-luna','GPT-6 Luna','paid',true,true,true,1050000),
 ('deepseek/deepseek-v4-flash','DeepSeek V4 Flash','paid',true,true,true,1048576),
 ('qwen/qwen3.8-27b','Qwen 3.8 27B','paid',true,true,true,1048575),
 ('openai/gpt-oss-20b','GPT-OSS 20B','paid',true,false,true,131072);

CREATE TABLE public.panda_agent_model_usage_daily (
 model text NOT NULL, day date NOT NULL,
 turns integer NOT NULL DEFAULT 0 CHECK (turns >= 0), failovers integer NOT NULL DEFAULT 0 CHECK (failovers >= 0), failures integer NOT NULL DEFAULT 0 CHECK (failures >= 0),
 input_tokens bigint NOT NULL DEFAULT 0 CHECK (input_tokens >= 0), output_tokens bigint NOT NULL DEFAULT 0 CHECK (output_tokens >= 0), cost_nano bigint NOT NULL DEFAULT 0 CHECK (cost_nano >= 0),
 PRIMARY KEY (model, day)
);
ALTER TABLE public.panda_agent_model_usage_daily ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.panda_agent_model_usage_daily FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.panda_agent_model_json(m public.panda_agent_models) RETURNS jsonb
LANGUAGE sql STABLE SET search_path=pg_catalog,public,pg_temp AS $f$
 SELECT jsonb_build_object('id',m.id,'label',m.label,'tier',m.tier,'enabled',m.enabled,'members',m.members,'poolOrder',m.pool_order,'builtin',m.builtin,
  'profile',m.profile,'contextWindow',m.context_window,'note',m.note,'version',m.version,'updatedAt',m.updated_at)
$f$;
REVOKE ALL ON FUNCTION public.panda_agent_model_json(public.panda_agent_models) FROM PUBLIC, anon, authenticated;

-- Signed-in users: the enabled models they may use (members = false rows only for Admins). Profiles hold endpoint facts
-- and prices, nothing private.
CREATE FUNCTION public.panda_agent_models_catalog() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE actor text := public.requesting_user_id(); admin boolean;
BEGIN
 IF actor IS NULL THEN PERFORM public.phase3_fail('unauthenticated'); END IF;
 admin := EXISTS (SELECT 1 FROM public.staff_role_memberships WHERE user_id = actor AND role = 'ADMIN');
 RETURN coalesce((SELECT jsonb_agg(public.panda_agent_model_json(m) ORDER BY m.tier, m.pool_order NULLS LAST, m.label)
  FROM public.panda_agent_models m WHERE m.enabled AND (m.members OR admin)), '[]'::jsonb);
END $$;

-- Admin: every model with its last 30 days of usage.
CREATE FUNCTION public.panda_agent_models_admin() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE since date := (clock_timestamp() AT TIME ZONE 'Asia/Kolkata')::date - 29;
BEGIN
 PERFORM public.panda_agent_control_room_admin();
 RETURN coalesce((SELECT jsonb_agg(public.panda_agent_model_json(m) || jsonb_build_object('usage30d', (
   SELECT jsonb_build_object('turns',coalesce(sum(u.turns),0),'failovers',coalesce(sum(u.failovers),0),'failures',coalesce(sum(u.failures),0),
    'inputTokens',coalesce(sum(u.input_tokens),0),'outputTokens',coalesce(sum(u.output_tokens),0),'costNano',coalesce(sum(u.cost_nano),0),
    'lastDay',max(u.day)) FROM public.panda_agent_model_usage_daily u WHERE u.model = m.id AND u.day >= since))
  ORDER BY m.tier, m.pool_order NULLS LAST, m.label) FROM public.panda_agent_models m), '[]'::jsonb);
END $$;

-- Admin: add a model (p_expected = 0) or update an added model's label, tier, profile, context and note.
-- Built-in models: only label and note change.
CREATE FUNCTION public.panda_agent_model_save(p_id text, p_label text, p_tier text, p_profile jsonb, p_context integer, p_note text, p_expected integer) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE actor text; m public.panda_agent_models;
BEGIN
 actor := public.panda_agent_control_room_admin();
 IF p_id IS NULL OR p_label IS NULL OR p_tier IS NULL OR p_profile IS NULL OR p_expected IS NULL THEN PERFORM public.phase3_fail('invalid'); END IF;
 IF p_expected = 0 THEN
  IF p_profile = '{}'::jsonb THEN PERFORM public.phase3_fail('invalid'); END IF;
  INSERT INTO public.panda_agent_models(id, label, tier, enabled, members, profile, context_window, note, updated_by)
   VALUES (p_id, btrim(p_label), p_tier, false, true, p_profile, p_context, nullif(btrim(coalesce(p_note,'')),''), actor)
   ON CONFLICT (id) DO NOTHING RETURNING * INTO m;
  IF m.id IS NULL THEN PERFORM public.phase3_fail('conflict'); END IF;
  RETURN public.panda_agent_model_json(m);
 END IF;
 SELECT * INTO m FROM public.panda_agent_models WHERE id = p_id FOR UPDATE;
 IF NOT FOUND THEN PERFORM public.phase3_fail('not_found'); END IF;
 IF m.version <> p_expected THEN PERFORM public.phase3_fail('conflict'); END IF;
 IF m.builtin AND (p_tier <> m.tier OR p_profile <> '{}'::jsonb) THEN PERFORM public.phase3_fail('invalid'); END IF;
 UPDATE public.panda_agent_models SET label = btrim(p_label), tier = p_tier, profile = p_profile, context_window = coalesce(p_context, context_window),
  note = nullif(btrim(coalesce(p_note,'')),''), pool_order = CASE WHEN p_tier = 'free' THEN pool_order END,
  version = version + 1, updated_at = clock_timestamp(), updated_by = actor WHERE id = p_id RETURNING * INTO m;
 RETURN public.panda_agent_model_json(m);
END $$;

-- Admin: switch a model on/off, show it to signed-in users or Admins only, and place a free model in the pool order.
CREATE FUNCTION public.panda_agent_model_set(p_id text, p_enabled boolean, p_members boolean, p_pool_order integer, p_expected integer) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE actor text; m public.panda_agent_models;
BEGIN
 actor := public.panda_agent_control_room_admin();
 IF p_id IS NULL OR p_enabled IS NULL OR p_members IS NULL OR p_expected IS NULL THEN PERFORM public.phase3_fail('invalid'); END IF;
 SELECT * INTO m FROM public.panda_agent_models WHERE id = p_id FOR UPDATE;
 IF NOT FOUND THEN PERFORM public.phase3_fail('not_found'); END IF;
 IF m.version <> p_expected THEN PERFORM public.phase3_fail('conflict'); END IF;
 IF p_pool_order IS NOT NULL AND m.tier <> 'free' THEN PERFORM public.phase3_fail('invalid'); END IF;
 UPDATE public.panda_agent_models SET enabled = p_enabled, members = p_members, pool_order = p_pool_order,
  version = version + 1, updated_at = clock_timestamp(), updated_by = actor WHERE id = p_id RETURNING * INTO m;
 RETURN public.panda_agent_model_json(m);
END $$;

-- Admin: remove an added model (built-in models can only be switched off). Usage history stays.
CREATE FUNCTION public.panda_agent_model_remove(p_id text, p_expected integer) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE m public.panda_agent_models;
BEGIN
 PERFORM public.panda_agent_control_room_admin();
 SELECT * INTO m FROM public.panda_agent_models WHERE id = p_id FOR UPDATE;
 IF NOT FOUND THEN PERFORM public.phase3_fail('not_found'); END IF;
 IF m.builtin THEN PERFORM public.phase3_fail('invalid'); END IF;
 IF m.version <> p_expected THEN PERFORM public.phase3_fail('conflict'); END IF;
 DELETE FROM public.panda_agent_models WHERE id = p_id;
 RETURN jsonb_build_object('id', p_id, 'removed', true);
END $$;

-- Any signed-in user's turn: add one turn's usage to today's row of a known model (bounded per call).
CREATE FUNCTION public.panda_agent_model_usage_record(p_model text, p_input bigint, p_output bigint, p_cost bigint, p_failed boolean, p_failover boolean) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
BEGIN
 IF public.requesting_user_id() IS NULL THEN PERFORM public.phase3_fail('unauthenticated'); END IF;
 IF p_model IS NULL OR NOT EXISTS (SELECT 1 FROM public.panda_agent_models WHERE id = p_model) OR p_input IS NULL OR p_output IS NULL OR p_cost IS NULL
  OR p_failed IS NULL OR p_failover IS NULL OR p_input NOT BETWEEN 0 AND 600000 OR p_output NOT BETWEEN 0 AND 60000 OR p_cost NOT BETWEEN 0 AND 200000000 THEN
  PERFORM public.phase3_fail('invalid'); END IF;
 INSERT INTO public.panda_agent_model_usage_daily AS u(model, day, turns, failovers, failures, input_tokens, output_tokens, cost_nano)
  VALUES (p_model, (clock_timestamp() AT TIME ZONE 'Asia/Kolkata')::date, 1, CASE WHEN p_failover THEN 1 ELSE 0 END, CASE WHEN p_failed THEN 1 ELSE 0 END, p_input, p_output, p_cost)
  ON CONFLICT (model, day) DO UPDATE SET turns = u.turns + 1, failovers = u.failovers + EXCLUDED.failovers, failures = u.failures + EXCLUDED.failures,
   input_tokens = u.input_tokens + EXCLUDED.input_tokens, output_tokens = u.output_tokens + EXCLUDED.output_tokens, cost_nano = u.cost_nano + EXCLUDED.cost_nano;
END $$;

REVOKE ALL ON FUNCTION public.panda_agent_models_catalog(), public.panda_agent_models_admin(),
 public.panda_agent_model_save(text,text,text,jsonb,integer,text,integer), public.panda_agent_model_set(text,boolean,boolean,integer,integer),
 public.panda_agent_model_remove(text,integer), public.panda_agent_model_usage_record(text,bigint,bigint,bigint,boolean,boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.panda_agent_models_catalog(), public.panda_agent_models_admin(),
 public.panda_agent_model_save(text,text,text,jsonb,integer,text,integer), public.panda_agent_model_set(text,boolean,boolean,integer,integer),
 public.panda_agent_model_remove(text,integer), public.panda_agent_model_usage_record(text,bigint,bigint,bigint,boolean,boolean) TO authenticated;
