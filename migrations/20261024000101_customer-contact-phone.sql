-- Optional customer delivery/contact phone. This is unverified profile data;
-- Clerk identity and verification state remain authoritative and unchanged.
-- Rollback: do not drop populated contact data in production. Remove only with
-- an approved retention/export plan and a separate forward migration.

ALTER TABLE public.customer_profiles
  ADD COLUMN phone text NOT NULL DEFAULT '';

ALTER TABLE public.customer_profiles
  ADD CONSTRAINT customer_profiles_phone_valid
  CHECK (char_length(phone) <= 48 AND phone = btrim(phone) AND phone !~ '[[:cntrl:]]');

GRANT INSERT (phone) ON public.customer_profiles TO authenticated;
GRANT UPDATE (phone) ON public.customer_profiles TO authenticated;
