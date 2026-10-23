-- Saved customer addresses contain personal delivery information.
-- Rollback: remove address code first. In development, drop the RPCs and table only
-- after verifying the table is empty and no order snapshots reference these IDs.
-- Production rollback must use a separately reviewed forward migration; preserve all
-- populated customer data under the approved retention/export plan.

CREATE TABLE public.customer_addresses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL DEFAULT public.requesting_user_id(),
  label text NOT NULL,
  recipient_name text NOT NULL,
  phone text NOT NULL DEFAULT '',
  line1 text NOT NULL,
  line2 text NOT NULL DEFAULT '',
  city text NOT NULL,
  state text NOT NULL,
  postal_code text NOT NULL,
  country_code text NOT NULL DEFAULT 'IN',
  is_default_shipping boolean NOT NULL DEFAULT false,
  is_default_billing boolean NOT NULL DEFAULT false,
  version bigint NOT NULL DEFAULT 1 CHECK (version >= 1),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT customer_addresses_user_id_id_key UNIQUE (user_id, id),
  CONSTRAINT customer_addresses_user_id_length CHECK (char_length(user_id) BETWEEN 1 AND 256),
  CONSTRAINT customer_addresses_label_length CHECK (char_length(btrim(label)) BETWEEN 1 AND 40),
  CONSTRAINT customer_addresses_recipient_name_length CHECK (char_length(btrim(recipient_name)) BETWEEN 1 AND 120),
  CONSTRAINT customer_addresses_phone_length CHECK (char_length(btrim(phone)) <= 48),
  CONSTRAINT customer_addresses_line1_length CHECK (char_length(btrim(line1)) BETWEEN 1 AND 200),
  CONSTRAINT customer_addresses_line2_length CHECK (char_length(btrim(line2)) <= 200),
  CONSTRAINT customer_addresses_city_length CHECK (char_length(btrim(city)) BETWEEN 1 AND 100),
  CONSTRAINT customer_addresses_state_length CHECK (char_length(btrim(state)) BETWEEN 1 AND 100),
  CONSTRAINT customer_addresses_postal_code_length CHECK (char_length(btrim(postal_code)) BETWEEN 1 AND 24),
  CONSTRAINT customer_addresses_country_code_format CHECK (country_code ~ '^[A-Z]{2}$'),
  CONSTRAINT customer_addresses_control_characters CHECK (
    label !~ '[[:cntrl:]]' AND recipient_name !~ '[[:cntrl:]]' AND phone !~ '[[:cntrl:]]'
    AND line1 !~ '[[:cntrl:]]' AND line2 !~ '[[:cntrl:]]' AND city !~ '[[:cntrl:]]'
    AND state !~ '[[:cntrl:]]' AND postal_code !~ '[[:cntrl:]]'
  )
);

CREATE UNIQUE INDEX customer_addresses_one_default_shipping_idx
  ON public.customer_addresses (user_id) WHERE is_default_shipping;
CREATE UNIQUE INDEX customer_addresses_one_default_billing_idx
  ON public.customer_addresses (user_id) WHERE is_default_billing;

ALTER TABLE public.customer_addresses ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.customer_addresses FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.customer_addresses TO authenticated;
CREATE POLICY customer_addresses_select_own ON public.customer_addresses
  FOR SELECT TO authenticated
  USING (user_id = (SELECT public.requesting_user_id()));

CREATE FUNCTION public.customer_address_values_valid(
  p_label text,
  p_recipient_name text,
  p_phone text,
  p_line1 text,
  p_line2 text,
  p_city text,
  p_state text,
  p_postal_code text,
  p_country text,
  p_is_default_shipping boolean,
  p_is_default_billing boolean
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog
AS $fn$
  SELECT coalesce(
    p_label IS NOT NULL AND char_length(btrim(p_label)) BETWEEN 1 AND 40 AND btrim(p_label) !~ '[[:cntrl:]]'
    AND p_recipient_name IS NOT NULL AND char_length(btrim(p_recipient_name)) BETWEEN 1 AND 120 AND btrim(p_recipient_name) !~ '[[:cntrl:]]'
    AND p_phone IS NOT NULL AND char_length(btrim(p_phone)) <= 48 AND btrim(p_phone) !~ '[[:cntrl:]]'
    AND p_line1 IS NOT NULL AND char_length(btrim(p_line1)) BETWEEN 1 AND 200 AND btrim(p_line1) !~ '[[:cntrl:]]'
    AND p_line2 IS NOT NULL AND char_length(btrim(p_line2)) <= 200 AND btrim(p_line2) !~ '[[:cntrl:]]'
    AND p_city IS NOT NULL AND char_length(btrim(p_city)) BETWEEN 1 AND 100 AND btrim(p_city) !~ '[[:cntrl:]]'
    AND p_state IS NOT NULL AND char_length(btrim(p_state)) BETWEEN 1 AND 100 AND btrim(p_state) !~ '[[:cntrl:]]'
    AND p_postal_code IS NOT NULL AND char_length(btrim(p_postal_code)) BETWEEN 1 AND 24 AND btrim(p_postal_code) !~ '[[:cntrl:]]'
    AND p_country IS NOT NULL AND upper(btrim(p_country)) ~ '^[A-Z]{2}$'
    AND p_is_default_shipping IS NOT NULL AND p_is_default_billing IS NOT NULL,
    false
  )
$fn$;
REVOKE ALL ON FUNCTION public.customer_address_values_valid(text,text,text,text,text,text,text,text,text,boolean,boolean) FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.customer_address_json(p_address public.customer_addresses)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog
AS $fn$
  SELECT jsonb_build_object(
    'id', (p_address).id,
    'label', (p_address).label,
    'recipientName', (p_address).recipient_name,
    'phone', (p_address).phone,
    'line1', (p_address).line1,
    'line2', (p_address).line2,
    'city', (p_address).city,
    'state', (p_address).state,
    'postalCode', (p_address).postal_code,
    'country', (p_address).country_code,
    'isDefaultShipping', (p_address).is_default_shipping,
    'isDefaultBilling', (p_address).is_default_billing,
    'version', (p_address).version
  )
$fn$;
REVOKE ALL ON FUNCTION public.customer_address_json(public.customer_addresses) FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.customer_list_addresses()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $fn$
DECLARE
  v_subject text;
  v_addresses jsonb;
BEGIN
  v_subject := public.requesting_user_id();
  IF v_subject IS NULL THEN PERFORM public.phase3_fail('unauthenticated'); END IF;

  SELECT coalesce(jsonb_agg(public.customer_address_json(a)
    ORDER BY a.is_default_shipping DESC, a.is_default_billing DESC, a.updated_at DESC, a.id), '[]'::jsonb)
    INTO v_addresses
  FROM (
    SELECT address_row.*
    FROM public.customer_addresses AS address_row
    WHERE address_row.user_id = v_subject
    ORDER BY address_row.is_default_shipping DESC, address_row.is_default_billing DESC, address_row.updated_at DESC, address_row.id
    LIMIT 20
  ) AS a;
  RETURN v_addresses;
END
$fn$;

CREATE FUNCTION public.customer_create_address(
  p_label text,
  p_recipient_name text,
  p_phone text,
  p_line1 text,
  p_line2 text,
  p_city text,
  p_state text,
  p_postal_code text,
  p_country text,
  p_is_default_shipping boolean,
  p_is_default_billing boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $fn$
DECLARE
  v_subject text;
  v_count bigint;
  v_address public.customer_addresses;
BEGIN
  v_subject := public.requesting_user_id();
  IF v_subject IS NULL THEN PERFORM public.phase3_fail('unauthenticated'); END IF;
  IF NOT public.customer_address_values_valid(p_label,p_recipient_name,p_phone,p_line1,p_line2,p_city,p_state,p_postal_code,p_country,p_is_default_shipping,p_is_default_billing) THEN
    PERFORM public.phase3_fail('invalid_input');
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('customer_addresses:' || v_subject, 0));
  SELECT count(*) INTO v_count FROM public.customer_addresses WHERE user_id = v_subject;
  IF v_count >= 20 THEN PERFORM public.phase3_fail('too_many_addresses'); END IF;

  UPDATE public.customer_addresses AS other
  SET is_default_shipping = CASE WHEN p_is_default_shipping THEN false ELSE other.is_default_shipping END,
      is_default_billing = CASE WHEN p_is_default_billing THEN false ELSE other.is_default_billing END,
      version = other.version + 1,
      updated_at = clock_timestamp()
  WHERE other.user_id = v_subject
    AND ((p_is_default_shipping AND other.is_default_shipping) OR (p_is_default_billing AND other.is_default_billing));

  INSERT INTO public.customer_addresses (
    user_id, label, recipient_name, phone, line1, line2, city, state, postal_code, country_code,
    is_default_shipping, is_default_billing
  ) VALUES (
    v_subject, btrim(p_label), btrim(p_recipient_name), btrim(p_phone), btrim(p_line1), btrim(p_line2),
    btrim(p_city), btrim(p_state), btrim(p_postal_code), upper(btrim(p_country)),
    p_is_default_shipping, p_is_default_billing
  ) RETURNING * INTO v_address;
  RETURN public.customer_address_json(v_address);
END
$fn$;

CREATE FUNCTION public.customer_update_address(
  p_id uuid,
  p_expected_version bigint,
  p_label text,
  p_recipient_name text,
  p_phone text,
  p_line1 text,
  p_line2 text,
  p_city text,
  p_state text,
  p_postal_code text,
  p_country text,
  p_is_default_shipping boolean,
  p_is_default_billing boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $fn$
DECLARE
  v_subject text;
  v_address public.customer_addresses;
BEGIN
  v_subject := public.requesting_user_id();
  IF v_subject IS NULL THEN PERFORM public.phase3_fail('unauthenticated'); END IF;
  IF p_id IS NULL OR p_expected_version IS NULL OR p_expected_version < 1
    OR NOT public.customer_address_values_valid(p_label,p_recipient_name,p_phone,p_line1,p_line2,p_city,p_state,p_postal_code,p_country,p_is_default_shipping,p_is_default_billing) THEN
    PERFORM public.phase3_fail('invalid_input');
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('customer_addresses:' || v_subject, 0));
  SELECT * INTO v_address
  FROM public.customer_addresses
  WHERE id = p_id AND user_id = v_subject
  FOR UPDATE;
  IF NOT FOUND THEN PERFORM public.phase3_fail('not_found'); END IF;
  IF p_expected_version <> v_address.version THEN PERFORM public.phase3_fail('version_conflict'); END IF;

  UPDATE public.customer_addresses AS other
  SET is_default_shipping = CASE WHEN p_is_default_shipping THEN false ELSE other.is_default_shipping END,
      is_default_billing = CASE WHEN p_is_default_billing THEN false ELSE other.is_default_billing END,
      version = other.version + 1,
      updated_at = clock_timestamp()
  WHERE other.user_id = v_subject AND other.id <> p_id
    AND ((p_is_default_shipping AND other.is_default_shipping) OR (p_is_default_billing AND other.is_default_billing));

  UPDATE public.customer_addresses AS target
  SET label = btrim(p_label), recipient_name = btrim(p_recipient_name), phone = btrim(p_phone),
      line1 = btrim(p_line1), line2 = btrim(p_line2), city = btrim(p_city), state = btrim(p_state),
      postal_code = btrim(p_postal_code), country_code = upper(btrim(p_country)),
      is_default_shipping = p_is_default_shipping, is_default_billing = p_is_default_billing,
      version = target.version + 1, updated_at = clock_timestamp()
  WHERE target.id = p_id AND target.user_id = v_subject
  RETURNING * INTO v_address;
  RETURN public.customer_address_json(v_address);
END
$fn$;

CREATE FUNCTION public.customer_delete_address(p_id uuid, p_expected_version bigint)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $fn$
DECLARE
  v_subject text;
  v_address public.customer_addresses;
BEGIN
  v_subject := public.requesting_user_id();
  IF v_subject IS NULL THEN PERFORM public.phase3_fail('unauthenticated'); END IF;
  IF p_id IS NULL OR p_expected_version IS NULL OR p_expected_version < 1 THEN PERFORM public.phase3_fail('invalid_input'); END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('customer_addresses:' || v_subject, 0));
  SELECT * INTO v_address
  FROM public.customer_addresses
  WHERE id = p_id AND user_id = v_subject
  FOR UPDATE;
  IF NOT FOUND THEN PERFORM public.phase3_fail('not_found'); END IF;
  IF p_expected_version <> v_address.version THEN PERFORM public.phase3_fail('version_conflict'); END IF;

  DELETE FROM public.customer_addresses WHERE id = p_id AND user_id = v_subject;
  RETURN jsonb_build_object('deleted', true);
END
$fn$;

REVOKE ALL ON FUNCTION public.customer_list_addresses() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.customer_create_address(text,text,text,text,text,text,text,text,text,boolean,boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.customer_update_address(uuid,bigint,text,text,text,text,text,text,text,text,text,boolean,boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.customer_delete_address(uuid,bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.customer_list_addresses() TO authenticated;
GRANT EXECUTE ON FUNCTION public.customer_create_address(text,text,text,text,text,text,text,text,text,boolean,boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.customer_update_address(uuid,bigint,text,text,text,text,text,text,text,text,text,boolean,boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.customer_delete_address(uuid,bigint) TO authenticated;
