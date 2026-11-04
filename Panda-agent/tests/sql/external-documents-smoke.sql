-- Disposable local PostgreSQL fixture ONLY. Requires migrations through external-documents.
-- Synthetic identity, bytes and HMAC key. This file never authorizes execution on a live project.
BEGIN;
INSERT INTO public.panda_agent_ingestion_signing_key(singleton,key_bytes) VALUES(true,decode(repeat('ab',32),'hex'));
SELECT set_config('panda_test.external_admin','external-fixture-'||gen_random_uuid()::text,true);
INSERT INTO public.staff_role_memberships(user_id,role,protected,assigned_by) VALUES(current_setting('panda_test.external_admin'),'ADMIN',false,'rollback-fixture');
DO $$ BEGIN
 IF has_table_privilege('authenticated','public.panda_agent_ingestion_signing_key','SELECT') OR has_table_privilege('anon','public.panda_agent_ingestion_signing_key','SELECT') OR has_table_privilege('authenticated','public.panda_agent_external_chunks','SELECT') OR has_function_privilege('anon','public.panda_agent_external_commit(text,text)','EXECUTE') THEN RAISE EXCEPTION 'unsafe grants'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_class WHERE oid='public.panda_agent_ingestion_signing_key'::regclass AND relrowsecurity) THEN RAISE EXCEPTION 'key RLS absent'; END IF;
END $$;
SELECT set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('panda_test.external_admin'))::text,true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE u jsonb; item jsonb; ref uuid; old_nonce uuid:=gen_random_uuid();
BEGIN
 u:=public.panda_agent_control_room_reserve_upload('external-fixture-0001','Fixture','fixture.txt','text/plain',4,repeat('a',64),'','','');
 ref:=(u#>>'{intake,reference}')::uuid;
 item:=public.panda_agent_control_room_record_upload_outcome(ref,1,'pending_review','Fixture readback');
 item:=public.panda_agent_control_room_review(ref,2,'accept_for_preparation','permitted','Fixture rights','Fixture review');
 IF item->>'version'<>'3' THEN RAISE EXCEPTION 'review failed'; END IF;
 PERFORM public.panda_agent_external_source(ref,3,old_nonce);
 PERFORM set_config('panda_test.external_reference',ref::text,true);
 PERFORM set_config('panda_test.external_old_nonce',old_nonce::text,true);
END $$;
RESET ROLE;
-- Simulate the clock/lease crossing only in this disposable transaction.
UPDATE public.panda_agent_ingestion_claims SET lease_expires_at=clock_timestamp()-interval '1 second' WHERE intake_id=current_setting('panda_test.external_reference')::uuid;
SET LOCAL ROLE authenticated;
DO $$
DECLARE ref uuid:=current_setting('panda_test.external_reference')::uuid; old_nonce uuid:=current_setting('panda_test.external_old_nonce')::uuid; new_nonce uuid:=gen_random_uuid(); payload text; mac text; out jsonb; failed boolean:=false;
BEGIN
 PERFORM public.panda_agent_external_source(ref,3,new_nonce);
 payload:=jsonb_build_object('version',1,'actor',current_setting('panda_test.external_admin'),'reference',ref,'sourceVersion',3,'originalSha256',repeat('a',64),'normalizedSha256',repeat('b',64),'parserVersion','private-upload-v1','chunks',jsonb_build_array(jsonb_build_object('text','test','textSha256',encode(sha256(convert_to('test','UTF8')),'hex'),'sectionPath',jsonb_build_array('Document'))),'nonce',old_nonce,'expiresAt',floor(extract(epoch from clock_timestamp()))::bigint+60)::text;
 mac:=encode(public.hmac(convert_to('pandabyte/external-ingestion/v1','UTF8')||decode('00','hex')||convert_to(payload,'UTF8'),decode(repeat('ab',32),'hex'),'sha256'),'hex');
 BEGIN PERFORM public.panda_agent_external_commit(payload,mac); EXCEPTION WHEN raise_exception THEN failed:=true; END;
 IF NOT failed THEN RAISE EXCEPTION 'old worker admitted after lease rotation'; END IF;
 payload:=jsonb_set(payload::jsonb,'{nonce}',to_jsonb(new_nonce))::text;
 failed:=false;BEGIN PERFORM public.panda_agent_external_commit(payload,repeat('0',64)); EXCEPTION WHEN raise_exception THEN failed:=true; END;
 IF NOT failed THEN RAISE EXCEPTION 'invalid HMAC admitted'; END IF;
 mac:=encode(public.hmac(convert_to('pandabyte/external-ingestion/v1','UTF8')||decode('00','hex')||convert_to(payload,'UTF8'),decode(repeat('ab',32),'hex'),'sha256'),'hex');
 out:=public.panda_agent_external_commit(payload,mac);
 IF out->>'status'<>'prepared' OR (public.panda_agent_external_document_read(ref,1)->'chunks'->0->>'text')<>'test' THEN RAISE EXCEPTION 'prepared projection failed'; END IF;
 PERFORM public.panda_agent_external_withdraw(ref,1);
 failed:=false;BEGIN PERFORM public.panda_agent_external_document_read(ref,1);EXCEPTION WHEN raise_exception THEN failed:=true;END;
 IF NOT failed THEN RAISE EXCEPTION 'withdrawn source still readable'; END IF;
END $$;
RESET ROLE;
ROLLBACK;
