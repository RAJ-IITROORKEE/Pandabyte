-- Bounded development connectivity proof only. No actors are seeded; no live payments enabled.
-- Forward-only: revoke callers before removal, and retain provider history.
CREATE TABLE public.razorpay_test_probes (
 subject text PRIMARY KEY CHECK(char_length(subject) BETWEEN 1 AND 256),
 receipt text UNIQUE NOT NULL CHECK(receipt ~ '^PBTEST[a-f0-9]{32}$'),
 fixture_id uuid NOT NULL,
 amount_paise bigint NOT NULL CHECK(amount_paise=100)
);
ALTER TABLE public.razorpay_test_probes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.razorpay_test_probes FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.is_razorpay_test_probe(p_subject text,p_receipt text,p_amount bigint,p_notes jsonb)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $fn$
 SELECT p_subject=public.requesting_user_id() AND jsonb_typeof(p_notes)='object'
 AND p_notes->>'purpose'='pandabyte-managed-proof'
 AND p_notes->>'insforge_subject_type'='user' AND p_notes->>'insforge_subject_id'=p_subject
 AND EXISTS(SELECT 1 FROM public.razorpay_test_probes p WHERE p.subject=p_subject
 AND p.receipt=p_receipt AND p.amount_paise=p_amount AND p.fixture_id::text=p_notes->>'fixture')
$fn$;
REVOKE ALL ON FUNCTION public.is_razorpay_test_probe(text,text,bigint,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.is_razorpay_test_probe(text,text,bigint,jsonb) TO authenticated;

-- InsForge's documented integration requires caller-scoped INSERT authorization.
ALTER TABLE payments.razorpay_orders ENABLE ROW LEVEL SECURITY;
GRANT INSERT(id,environment,status,subject_type,subject_id,customer_name,customer_email,customer_contact,
 receipt,amount,currency,description,callback_url,notes) ON payments.razorpay_orders TO authenticated;
CREATE POLICY pandabyte_razorpay_test_probe_insert ON payments.razorpay_orders FOR INSERT TO authenticated
WITH CHECK(environment='test' AND status='initialized' AND subject_type='user' AND currency='inr'
 AND public.is_razorpay_test_probe(subject_id,receipt,amount,notes));
