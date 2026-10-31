-- REFERENCE ONLY for an appropriate operator SQL session after migration review.
-- The selected official CLI gateway rejects SET ROLE/session configuration.
-- Do not disguise this source or bypass that restriction.
-- Every fixture rolls back. SET ROLE/JWT claims are simulation, not real Clerk validation.
BEGIN;
CREATE TEMP TABLE panda_control_room_baseline AS SELECT
 (SELECT count(*) FROM public.cms_records) cms,
 (SELECT count(*) FROM public.panda_agent_sources) sources,
 (SELECT count(*) FROM public.panda_agent_versions) versions,
 (SELECT count(*) FROM public.panda_agent_chunks) chunks,
 (SELECT count(*) FROM public.panda_agent_releases) releases,
 (SELECT count(*) FROM public.panda_agent_jobs) jobs;
SELECT set_config('panda_test.admin','control-room-smoke-admin-'||gen_random_uuid()::text,true);
SELECT set_config('panda_test.staff','control-room-smoke-staff-'||gen_random_uuid()::text,true);
INSERT INTO public.staff_role_memberships(user_id,role,protected,assigned_by) VALUES
 (current_setting('panda_test.admin'),'ADMIN',false,'rollback-only-fixture'),
 (current_setting('panda_test.staff'),'SUPPORT',false,'rollback-only-fixture');
-- Capability-only non-ADMIN must still fail the genuine role boundary.
INSERT INTO public.staff_capabilities(user_id,capability,granted_by) VALUES(current_setting('panda_test.staff'),'staff.manage','rollback-only-fixture');
DO $$ BEGIN
 IF has_table_privilege('authenticated','public.panda_agent_intakes','SELECT') OR has_table_privilege('anon','public.panda_agent_intake_events','SELECT')
    OR has_function_privilege('authenticated','public.panda_agent_control_room_admin()','EXECUTE')
    OR has_function_privilege('anon','public.panda_agent_control_room_overview()','EXECUTE') THEN RAISE EXCEPTION 'unexpected raw/helper/anonymous grant'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.panda_agent_intakes'::regclass AND contype='u' AND pg_get_constraintdef(oid)='UNIQUE (created_by, idempotency_key)') THEN RAISE EXCEPTION 'missing concurrent idempotency uniqueness'; END IF;
END $$;

SELECT set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('panda_test.staff'))::text,true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE statement text; denied boolean; detail text;
BEGIN
 FOREACH statement IN ARRAY ARRAY[
  'SELECT public.panda_agent_control_room_overview()',
  'SELECT public.panda_agent_control_room_list_intakes()',
  'SELECT public.panda_agent_control_room_get_intake(NULL)',
  'SELECT public.panda_agent_control_room_register_link(''fixture-key-0001'',''Fixture'',''https://docs.python.org/3/'','''','''','''')',
  'SELECT public.panda_agent_control_room_reserve_upload(''fixture-key-0002'',''Fixture'',''fixture.txt'',''text/plain'',1,repeat(''a'',64),'''','''','''')',
  'SELECT public.panda_agent_control_room_record_upload_outcome(NULL,1,''pending_review'',''fixture'')',
  'SELECT public.panda_agent_control_room_review(NULL,1,''reject'',''unknown'',''unknown'',''fixture'')'
 ] LOOP
  denied:=false;
  BEGIN EXECUTE statement; EXCEPTION WHEN raise_exception THEN GET STACKED DIAGNOSTICS detail=PG_EXCEPTION_DETAIL; denied:=detail='forbidden'; END;
  IF NOT denied THEN RAISE EXCEPTION 'non-ADMIN reached %',statement; END IF;
 END LOOP;
 denied:=false; BEGIN PERFORM 1 FROM public.panda_agent_intakes; EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'raw intake read allowed'; END IF;
END $$;
RESET ROLE;

SELECT set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('panda_test.admin'))::text,true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE a jsonb; b jsonb; u jsonb; item jsonb; rejected boolean; detail text; url text; ref uuid;
BEGIN
 a:=public.panda_agent_control_room_register_link('fixture-link-0000001','Disposable link','https://docs.python.org/3/library/','Python docs','Fixture only','Permission not reviewed');
 b:=public.panda_agent_control_room_register_link('fixture-link-0000001','Disposable link','https://docs.python.org/3/library/','Python docs','Fixture only','Permission not reviewed');
 IF a IS DISTINCT FROM b OR a->>'status'<>'pending_review' OR a#>>'{sourceSummary,fetched}'<>'false' OR a->>'integrityStatus'<>'integrity_pending' THEN RAISE EXCEPTION 'link idempotency or quarantine failed'; END IF;
 ref:=(a->>'reference')::uuid; PERFORM set_config('panda_test.link_reference',ref::text,true);
 rejected:=false; BEGIN PERFORM public.panda_agent_control_room_register_link('fixture-link-0000001','Changed','https://docs.python.org/3/library/','Python docs','Fixture only','Permission not reviewed'); EXCEPTION WHEN raise_exception THEN GET STACKED DIAGNOSTICS detail=PG_EXCEPTION_DETAIL; rejected:=detail='request_conflict'; END;
 IF NOT rejected THEN RAISE EXCEPTION 'changed idempotent payload accepted'; END IF;
 FOREACH url IN ARRAY ARRAY['http://docs.python.org/','https://127.0.0.1/a','https://[::1]/a','https://localhost/a','https://docs.internal/a','https://docs.lan/a','https://docs.home/a','https://u:p@docs.python.org/a','https://docs.python.org:444/a','https://docs.python.org/a?token=secret'] LOOP
  rejected:=false; BEGIN PERFORM public.panda_agent_control_room_register_link('fixture-bad-url-0001','Bad URL',url,'','',''); EXCEPTION WHEN raise_exception THEN GET STACKED DIAGNOSTICS detail=PG_EXCEPTION_DETAIL; rejected:=detail='invalid_input'; END;
  IF NOT rejected THEN RAISE EXCEPTION 'unsafe URL metadata accepted'; END IF;
 END LOOP;
 u:=public.panda_agent_control_room_reserve_upload('fixture-upload-0001','Disposable file','fixture.pdf','application/pdf',3145728,repeat('a',64),'','Fixture only','Permission unknown');
 IF u->>'created'<>'true' OR u#>>'{intake,status}'<>'upload_pending' OR u#>>'{intake,integrityStatus}'<>'integrity_pending' THEN RAISE EXCEPTION 'upload reservation incorrectly trusted'; END IF;
 b:=public.panda_agent_control_room_reserve_upload('fixture-upload-0001','Disposable file','fixture.pdf','application/pdf',3145728,repeat('a',64),'','Fixture only','Permission unknown');
 IF b->>'created'<>'false' OR b->'intake' IS DISTINCT FROM u->'intake' THEN RAISE EXCEPTION 'upload replay can cause a second write'; END IF;
 item:=u->'intake'; PERFORM set_config('panda_test.upload_reference',item->>'reference',true);
 rejected:=false; BEGIN PERFORM public.panda_agent_control_room_reserve_upload('fixture-too-large-001','Large','fixture.pdf','application/pdf',3145729,repeat('a',64),'','',''); EXCEPTION WHEN raise_exception THEN GET STACKED DIAGNOSTICS detail=PG_EXCEPTION_DETAIL; rejected:=detail='invalid_input'; END;
 IF NOT rejected THEN RAISE EXCEPTION 'oversized reservation accepted'; END IF;
 rejected:=false; BEGIN PERFORM public.panda_agent_control_room_reserve_upload('fixture-mismatch-001','Mismatch','fixture.md','application/pdf',1,repeat('a',64),'','',''); EXCEPTION WHEN raise_exception THEN GET STACKED DIAGNOSTICS detail=PG_EXCEPTION_DETAIL; rejected:=detail='invalid_input'; END;
 IF NOT rejected THEN RAISE EXCEPTION 'extension/MIME mismatch accepted'; END IF;
 rejected:=false; BEGIN PERFORM public.panda_agent_control_room_record_upload_outcome((item->>'reference')::uuid,1,'verified','Client claim'); EXCEPTION WHEN raise_exception THEN GET STACKED DIAGNOSTICS detail=PG_EXCEPTION_DETAIL; rejected:=detail='invalid_input'; END;
 IF NOT rejected THEN RAISE EXCEPTION 'caller marked source bytes verified'; END IF;
 item:=public.panda_agent_control_room_record_upload_outcome((item->>'reference')::uuid,1,'pending_review','HTTP outcome reported, bytes not independently verified');
 IF item->>'integrityStatus'<>'integrity_pending' OR item->>'version'<>'2' THEN RAISE EXCEPTION 'reported outcome became integrity proof'; END IF;
 rejected:=false; BEGIN PERFORM public.panda_agent_control_room_record_upload_outcome((item->>'reference')::uuid,1,'upload_failed','Stale'); EXCEPTION WHEN raise_exception THEN GET STACKED DIAGNOSTICS detail=PG_EXCEPTION_DETAIL; rejected:=detail='version_conflict'; END;
 IF NOT rejected THEN RAISE EXCEPTION 'stale outcome accepted'; END IF;
 rejected:=false; BEGIN PERFORM public.panda_agent_control_room_review(ref,1,'accept_for_preparation','unknown','Unknown rights','Fixture'); EXCEPTION WHEN raise_exception THEN GET STACKED DIAGNOSTICS detail=PG_EXCEPTION_DETAIL; rejected:=detail='invalid_input'; END;
 IF NOT rejected THEN RAISE EXCEPTION 'unknown rights advanced'; END IF;
 a:=public.panda_agent_control_room_review(ref,1,'accept_for_preparation','permitted','Owned disposable fixture metadata','Fixture review');
 IF a->>'status'<>'accepted_for_preparation' OR a->>'integrityStatus'<>'integrity_pending' OR a->>'version'<>'2' THEN RAISE EXCEPTION 'review incorrectly admitted source bytes'; END IF;
 rejected:=false; BEGIN PERFORM public.panda_agent_control_room_review(ref,1,'reject','denied','Fixture','Stale'); EXCEPTION WHEN raise_exception THEN GET STACKED DIAGNOSTICS detail=PG_EXCEPTION_DETAIL; rejected:=detail='version_conflict'; END;
 IF NOT rejected THEN RAISE EXCEPTION 'stale review accepted'; END IF;
 IF public.panda_agent_control_room_get_intake(ref) IS DISTINCT FROM a THEN RAISE EXCEPTION 'safe get differs'; END IF;
 b:=public.panda_agent_control_room_list_intakes(1);
 IF jsonb_array_length(b->'items')<>1 OR b->'nextCursor'='null'::jsonb THEN RAISE EXCEPTION 'bounded pagination failed'; END IF;
 IF public.panda_agent_control_room_overview()#>>'{availability,evaluation}'<>'unavailable' THEN RAISE EXCEPTION 'evaluation runtime fabricated'; END IF;
 IF (a::text||u::text||b::text) ~ '"(object_key|private_key|private_bucket|created_by|reviewed_by|idempotency_key|input_hash)"' THEN RAISE EXCEPTION 'private metadata in DTO'; END IF;
END $$;
RESET ROLE;

DO $$
DECLARE original public.panda_agent_intakes; rejected boolean;
BEGIN
 SELECT * INTO original FROM public.panda_agent_intakes WHERE id=current_setting('panda_test.link_reference')::uuid;
 IF (SELECT count(*) FROM public.panda_agent_intake_events WHERE intake_id=original.id)<>2 THEN RAISE EXCEPTION 'duplicate event or missing audit'; END IF;
 rejected:=false; BEGIN
  INSERT INTO public.panda_agent_intakes(created_by,idempotency_key,input_hash,kind,title,source_url,publisher,purpose,rights_statement,status)
   VALUES(original.created_by,original.idempotency_key,original.input_hash,'link','Duplicate','https://docs.python.org/3/','','','','pending_review');
 EXCEPTION WHEN unique_violation THEN rejected:=true; END;
 IF NOT rejected THEN RAISE EXCEPTION 'database unique race arbiter absent'; END IF;
 rejected:=false; BEGIN UPDATE public.panda_agent_intakes SET created_by='forged',version=version+1 WHERE id=original.id; EXCEPTION WHEN raise_exception THEN rejected:=true; END;
 IF NOT rejected THEN RAISE EXCEPTION 'immutable actor changed'; END IF;
 rejected:=false; BEGIN UPDATE public.panda_agent_intake_events SET reason='rewritten' WHERE intake_id=original.id; EXCEPTION WHEN raise_exception THEN rejected:=true; END;
 IF NOT rejected THEN RAISE EXCEPTION 'audit rewritten'; END IF;
 IF (SELECT object_key FROM public.panda_agent_intakes WHERE id=current_setting('panda_test.upload_reference')::uuid)<>'intakes/'||current_setting('panda_test.upload_reference')||'/source.pdf' THEN RAISE EXCEPTION 'object key not derived internally'; END IF;
 PERFORM public.staff_apply_role(current_setting('panda_test.admin'),'CUSTOMER',false,'Revoke disposable fixture','rollback-only-fixture');
END $$;
SET LOCAL ROLE authenticated;
DO $$ DECLARE denied boolean:=false; detail text; BEGIN
 BEGIN PERFORM public.panda_agent_control_room_get_intake(current_setting('panda_test.link_reference')::uuid); EXCEPTION WHEN raise_exception THEN GET STACKED DIAGNOSTICS detail=PG_EXCEPTION_DETAIL; denied:=detail='forbidden'; END;
 IF NOT denied THEN RAISE EXCEPTION 'revoked ADMIN retained access'; END IF;
END $$;
RESET ROLE;
SELECT set_config('request.jwt.claims','{}',true);
SET LOCAL ROLE authenticated;
DO $$ DECLARE denied boolean:=false; detail text; BEGIN
 BEGIN PERFORM public.panda_agent_control_room_overview(); EXCEPTION WHEN raise_exception THEN GET STACKED DIAGNOSTICS detail=PG_EXCEPTION_DETAIL; denied:=detail='unauthenticated'; END;
 IF NOT denied THEN RAISE EXCEPTION 'missing JWT subject allowed'; END IF;
END $$;
RESET ROLE;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM panda_control_room_baseline b WHERE b.cms<>(SELECT count(*) FROM public.cms_records) OR b.sources<>(SELECT count(*) FROM public.panda_agent_sources)
  OR b.versions<>(SELECT count(*) FROM public.panda_agent_versions) OR b.chunks<>(SELECT count(*) FROM public.panda_agent_chunks) OR b.releases<>(SELECT count(*) FROM public.panda_agent_releases) OR b.jobs<>(SELECT count(*) FROM public.panda_agent_jobs)) THEN RAISE EXCEPTION 'canonical or CMS rows mutated'; END IF;
END $$;
ROLLBACK;
-- Separate root-run two-transaction tests remain required for real concurrency:
-- (1) Same actor/key/payload INSERT in A, then B before A commits: one created=true,
--     one created=false, one row/event. Different payload after A commits: request_conflict.
-- (2) A holds staff-role-memberships EXCLUSIVE and revokes fixture ADMIN; B starts
--     mutation and waits on SHARED; after A commits B must fail forbidden and write nothing.
-- This single rollback script does not claim those races or real Clerk sessions passed.
