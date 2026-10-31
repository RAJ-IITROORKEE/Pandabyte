-- SOURCE ONLY. Root runs after 0003/0004 review/apply and private bucket creation.
-- Metadata rows only: no object bytes, SDK, signed URLs or real private-download proof.
-- SET ROLE/JWT claims simulate callers; every fixture/policy/grant rolls back.
BEGIN;
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM storage.buckets WHERE name='panda-agent-intake-private' AND "public"=false) THEN RAISE EXCEPTION 'root must create/verify the private intake bucket first'; END IF;
 IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid='storage.objects'::regclass) THEN RAISE EXCEPTION 'storage RLS disabled'; END IF;
END $$;
-- Deliberately permissive owner/public-equivalent policies must NOT bypass the boundary.
CREATE POLICY panda_agent_intake_smoke_allow_all ON storage.objects FOR ALL TO authenticated,anon USING(true) WITH CHECK(true);
GRANT USAGE ON SCHEMA storage TO authenticated,anon;
GRANT SELECT,INSERT,UPDATE,DELETE ON storage.objects TO authenticated,anon;
SELECT set_config('panda_test.storage_admin_a','intake-storage-admin-a-'||gen_random_uuid()::text,true);
SELECT set_config('panda_test.storage_admin_b','intake-storage-admin-b-'||gen_random_uuid()::text,true);
SELECT set_config('panda_test.storage_customer','intake-storage-customer-'||gen_random_uuid()::text,true);
SELECT set_config('panda_test.storage_staff','intake-storage-staff-'||gen_random_uuid()::text,true);
INSERT INTO public.staff_role_memberships(user_id,role,protected,assigned_by) VALUES
 (current_setting('panda_test.storage_admin_a'),'ADMIN',false,'rollback-only-storage-fixture'),
 (current_setting('panda_test.storage_admin_b'),'ADMIN',false,'rollback-only-storage-fixture'),
 (current_setting('panda_test.storage_customer'),'CUSTOMER',false,'rollback-only-storage-fixture'),
 (current_setting('panda_test.storage_staff'),'SUPPORT',false,'rollback-only-storage-fixture');
INSERT INTO public.staff_capabilities(user_id,capability,granted_by) VALUES(current_setting('panda_test.storage_staff'),'staff.manage','rollback-only-storage-fixture');

SELECT set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('panda_test.storage_admin_a'))::text,true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE item jsonb; n integer;
BEGIN
 FOR n IN 1..4 LOOP
  item:=public.panda_agent_control_room_reserve_upload('storage-smoke-a-key-'||n,'Synthetic metadata only','fixture.txt','text/plain',12,repeat('a',64),'','Fixture only','Not source evidence');
  IF item->>'created'<>'true' THEN RAISE EXCEPTION 'fixture was not a fresh reservation'; END IF;
  PERFORM set_config('panda_test.storage_key_'||n,'intakes/'||(item#>>'{intake,reference}')||'/source.txt',true);
  IF n=2 THEN PERFORM public.panda_agent_control_room_record_upload_outcome((item#>>'{intake,reference}')::uuid,1,'upload_outcome_unknown','Synthetic unknown write'); END IF;
 END LOOP;
END $$;
RESET ROLE;
SELECT set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('panda_test.storage_admin_b'))::text,true);
SET LOCAL ROLE authenticated;
DO $$ DECLARE item jsonb; BEGIN
 item:=public.panda_agent_control_room_reserve_upload('storage-smoke-b-key-1','Other Admin reservation','fixture.txt','text/plain',12,repeat('b',64),'','Fixture only','Not source evidence');
 PERFORM set_config('panda_test.storage_other_admin_key','intakes/'||(item#>>'{intake,reference}')||'/source.txt',true);
END $$;
RESET ROLE;
-- Privileged fixture metadata intentionally attributes a known intake to a non-ADMIN owner.
-- A legacy permissive owner policy must not expose it to that owner.
INSERT INTO storage.objects(bucket,key,size,mime_type,uploaded_by) VALUES
 ('panda-agent-intake-private',current_setting('panda_test.storage_key_4'),12,'text/plain',current_setting('panda_test.storage_customer'));

SELECT set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('panda_test.storage_admin_a'))::text,true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE key_to_test text; denied boolean; affected bigint; owner_to_test text; size_to_test integer; mime_to_test text;
BEGIN
 -- Own reserved key/size/MIME succeeds, despite the source bytes remaining unverified.
 INSERT INTO storage.objects(bucket,key,size,mime_type,uploaded_by) VALUES
  ('panda-agent-intake-private',current_setting('panda_test.storage_key_1'),12,'text/plain',current_setting('panda_test.storage_admin_a'));
 IF (SELECT count(*) FROM storage.objects WHERE bucket='panda-agent-intake-private' AND key=current_setting('panda_test.storage_key_1'))<>1 THEN RAISE EXCEPTION 'Admin cannot read known reservation'; END IF;
 -- Cross-creator and no-longer-pending reservations, and a wholly unknown key, fail.
 FOREACH key_to_test IN ARRAY ARRAY[current_setting('panda_test.storage_other_admin_key'),current_setting('panda_test.storage_key_2'),'intakes/'||gen_random_uuid()::text||'/source.txt'] LOOP
  denied:=false; BEGIN INSERT INTO storage.objects(bucket,key,size,mime_type,uploaded_by) VALUES('panda-agent-intake-private',key_to_test,12,'text/plain',current_setting('panda_test.storage_admin_a')); EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
  IF NOT denied THEN RAISE EXCEPTION 'cross/closed/unknown reservation inserted'; END IF;
 END LOOP;
 FOR size_to_test,mime_to_test,owner_to_test IN SELECT * FROM (VALUES
  (13,'text/plain',current_setting('panda_test.storage_admin_a')),
  (3145729,'text/plain',current_setting('panda_test.storage_admin_a')),
  (12,'application/pdf',current_setting('panda_test.storage_admin_a')),
  (12,'text/plain',current_setting('panda_test.storage_admin_b')),
  (12,'text/plain',NULL::text)) q LOOP
  denied:=false; BEGIN INSERT INTO storage.objects(bucket,key,size,mime_type,uploaded_by) VALUES('panda-agent-intake-private',current_setting('panda_test.storage_key_3'),size_to_test,mime_to_test,owner_to_test); EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
  IF NOT denied THEN RAISE EXCEPTION 'size/MIME/uploader mismatch inserted'; END IF;
 END LOOP;
 UPDATE storage.objects SET size=13 WHERE bucket='panda-agent-intake-private' AND key=current_setting('panda_test.storage_key_1');
 GET DIAGNOSTICS affected=ROW_COUNT; IF affected<>0 THEN RAISE EXCEPTION 'owner policy bypassed target UPDATE denial'; END IF;
 DELETE FROM storage.objects WHERE bucket='panda-agent-intake-private' AND key=current_setting('panda_test.storage_key_1');
 GET DIAGNOSTICS affected=ROW_COUNT; IF affected<>0 THEN RAISE EXCEPTION 'owner policy bypassed target DELETE denial'; END IF;
 -- Querying unrelated buckets must not produce helper EXECUTE errors; old restrictions remain.
 PERFORM count(*) FROM storage.objects WHERE bucket<>'panda-agent-intake-private';
END $$;
RESET ROLE;

-- Another genuine ADMIN can read all known intake objects but cannot write A's reservation.
SELECT set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('panda_test.storage_admin_b'))::text,true);
SET LOCAL ROLE authenticated;
DO $$ DECLARE denied boolean:=false; BEGIN
 IF (SELECT count(*) FROM storage.objects WHERE bucket='panda-agent-intake-private' AND key IN (current_setting('panda_test.storage_key_1'),current_setting('panda_test.storage_key_4')))<>2 THEN RAISE EXCEPTION 'genuine Admin review read denied'; END IF;
 BEGIN INSERT INTO storage.objects(bucket,key,size,mime_type,uploaded_by) VALUES('panda-agent-intake-private',current_setting('panda_test.storage_key_3'),12,'text/plain',current_setting('panda_test.storage_admin_b')); EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'other Admin wrote creator reservation'; END IF;
END $$;
RESET ROLE;

SELECT set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('panda_test.storage_customer'))::text,true);
SET LOCAL ROLE authenticated;
DO $$ DECLARE denied boolean:=false; affected bigint; BEGIN
 IF EXISTS(SELECT 1 FROM storage.objects WHERE bucket='panda-agent-intake-private') OR public.panda_agent_intake_storage_allowed(current_setting('panda_test.storage_key_4'),'read') THEN RAISE EXCEPTION 'customer/legacy owner read bypass'; END IF;
 BEGIN INSERT INTO storage.objects(bucket,key,size,mime_type,uploaded_by) VALUES('panda-agent-intake-private',current_setting('panda_test.storage_key_3'),12,'text/plain',current_setting('panda_test.storage_customer')); EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'customer write bypass'; END IF;
 UPDATE storage.objects SET size=13 WHERE bucket='panda-agent-intake-private'; GET DIAGNOSTICS affected=ROW_COUNT;
 IF affected<>0 THEN RAISE EXCEPTION 'customer UPDATE bypass'; END IF;
 DELETE FROM storage.objects WHERE bucket='panda-agent-intake-private'; GET DIAGNOSTICS affected=ROW_COUNT;
 IF affected<>0 THEN RAISE EXCEPTION 'customer DELETE bypass'; END IF;
END $$;
RESET ROLE;
SELECT set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('panda_test.storage_staff'))::text,true);
SET LOCAL ROLE authenticated;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM storage.objects WHERE bucket='panda-agent-intake-private') OR public.panda_agent_intake_storage_allowed(current_setting('panda_test.storage_key_1'),'read') THEN RAISE EXCEPTION 'capability-only staff bypass'; END IF;
END $$;
RESET ROLE;

-- Even a simulated ADMIN sub must not turn the anon SQL role into authenticated.
SELECT set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('panda_test.storage_admin_a'))::text,true);
SET LOCAL ROLE anon;
DO $$ DECLARE denied boolean:=false; affected bigint; BEGIN
 IF public.panda_agent_intake_storage_allowed(current_setting('panda_test.storage_key_1'),'read') OR EXISTS(SELECT 1 FROM storage.objects WHERE bucket='panda-agent-intake-private') THEN RAISE EXCEPTION 'anon read/helper bypass'; END IF;
 BEGIN INSERT INTO storage.objects(bucket,key,size,mime_type,uploaded_by) VALUES('panda-agent-intake-private',current_setting('panda_test.storage_key_3'),12,'text/plain',current_setting('panda_test.storage_admin_a')); EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'anon write bypass'; END IF;
 UPDATE storage.objects SET size=13 WHERE bucket='panda-agent-intake-private'; GET DIAGNOSTICS affected=ROW_COUNT;
 IF affected<>0 THEN RAISE EXCEPTION 'anon UPDATE bypass'; END IF;
 DELETE FROM storage.objects WHERE bucket='panda-agent-intake-private'; GET DIAGNOSTICS affected=ROW_COUNT;
 IF affected<>0 THEN RAISE EXCEPTION 'anon DELETE bypass'; END IF;
 PERFORM count(*) FROM storage.objects WHERE bucket<>'panda-agent-intake-private';
END $$;
RESET ROLE;

SELECT public.staff_apply_role(current_setting('panda_test.storage_admin_a'),'CUSTOMER',false,'Revoke disposable storage fixture','rollback-only-storage-fixture');
SET LOCAL ROLE authenticated;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM storage.objects WHERE bucket='panda-agent-intake-private') OR public.panda_agent_intake_storage_allowed(current_setting('panda_test.storage_key_1'),'read') THEN RAISE EXCEPTION 'revoked Admin/owner retained read'; END IF;
END $$;
RESET ROLE;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM public.panda_agent_intakes WHERE created_by IN (current_setting('panda_test.storage_admin_a'),current_setting('panda_test.storage_admin_b')) AND integrity_status<>'integrity_pending') THEN RAISE EXCEPTION 'metadata row verified source bytes'; END IF;
END $$;
ROLLBACK;
-- Not executed by this author. Real JWT SDK upload/download/list, private bucket GET,
-- overwrite semantics, transaction concurrency and role revocation remain root-run checks.
-- Fixture metadata rows never imply a physical object was stored or validated.
