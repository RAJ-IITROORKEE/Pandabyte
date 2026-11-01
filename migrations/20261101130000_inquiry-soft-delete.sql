-- Reversible inbox removal. Preserve receipts, inquiry data, notes and storage objects.
-- Apply after 20261101120000_inquiry-attachments.sql. Recovery is a reviewed forward
-- change to deletion markers/version with a staff note; retain suppressed email state.
ALTER TABLE public.inquiries ADD COLUMN deleted_at timestamptz;
ALTER TABLE public.inquiries ADD COLUMN deleted_by text;
ALTER TABLE public.inquiries ADD CONSTRAINT inquiries_deletion_actor_check
 CHECK ((deleted_at IS NULL) = (deleted_by IS NULL));

CREATE FUNCTION public.admin_delete_inquiry(p_id uuid,p_expected_version bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $f$
DECLARE actor text; i public.inquiries;
BEGIN
 actor:=public.admin_assert_capability('inquiries.manage');
 SELECT * INTO i FROM public.inquiries WHERE id=p_id AND deleted_at IS NULL FOR UPDATE;
 IF NOT FOUND THEN PERFORM public.phase3_fail('inquiry_not_found'); END IF;
 IF p_expected_version IS NULL OR p_expected_version<1 OR p_expected_version<>i.version THEN PERFORM public.phase3_fail('version_conflict'); END IF;
 UPDATE public.inquiries SET deleted_at=now(),deleted_by=actor,version=version+1,updated_at=now() WHERE id=p_id;
 INSERT INTO public.inquiry_notes(inquiry_id,text,actor) VALUES(p_id,'Removed from inbox. Inquiry and attachments retained.',actor);
 -- Do not relabel a send that has already started: its external result may be unknown.
 UPDATE public.inquiry_notifications SET status='suppressed',version=version+1,lease_until=NULL
 WHERE inquiry_id=p_id AND status IN('unconfigured','leased','failed');
 RETURN jsonb_build_object('deleted',true);
END $f$;
REVOKE ALL ON FUNCTION public.admin_delete_inquiry(uuid,bigint) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.admin_delete_inquiry(uuid,bigint) TO authenticated;


CREATE OR REPLACE FUNCTION public.admin_query_inquiries(
  p_query text DEFAULT '', p_status text DEFAULT NULL, p_sort text DEFAULT 'created_desc',
  p_limit integer DEFAULT 25, p_offset integer DEFAULT 0
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp AS $fn$
DECLARE
  v_query text := btrim(COALESCE(p_query, ''));
  result jsonb;
BEGIN
  PERFORM public.admin_assert_capability('inquiries.manage');
  IF p_query IS NULL OR char_length(p_query) > 100 OR p_query ~ '[[:cntrl:]]'
    OR (p_status IS NOT NULL AND p_status NOT IN ('new','in_progress','resolved','spam'))
    OR p_sort IS NULL OR p_sort NOT IN ('created_desc','created_asc','name_asc','name_desc')
    OR p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 50
    OR p_offset IS NULL OR p_offset NOT BETWEEN 0 AND 1000000 THEN
    PERFORM public.phase3_fail('invalid_input');
  END IF;

  WITH matching AS (
    SELECT i.id, i.created_at, lower(i.name) AS name_sort
    FROM public.inquiries i
    WHERE i.deleted_at IS NULL AND (p_status IS NULL OR i.status = p_status)
      AND (v_query = '' OR position(lower(v_query) in lower(i.name)) > 0
        OR position(lower(v_query) in lower(i.email)) > 0
        OR position(lower(v_query) in lower(i.subject)) > 0)
  ), ranked AS (
    SELECT matching.id,
      row_number() OVER (ORDER BY
        CASE WHEN p_sort = 'created_desc' THEN matching.created_at END DESC,
        CASE WHEN p_sort = 'created_asc' THEN matching.created_at END ASC,
        CASE WHEN p_sort = 'name_asc' THEN matching.name_sort END ASC,
        CASE WHEN p_sort = 'name_desc' THEN matching.name_sort END DESC,
        matching.id ASC) AS row_order
    FROM matching
  ), page_rows AS (
    SELECT id, row_order FROM ranked WHERE row_order > p_offset AND row_order <= p_offset + p_limit
  )
  SELECT jsonb_build_object(
    'items', COALESCE((
      SELECT jsonb_agg(public.inquiry_dto(i) ORDER BY page_rows.row_order)
      FROM page_rows JOIN public.inquiries i USING (id)
    ), '[]'::jsonb),
    'total', (SELECT count(*) FROM matching)
  ) INTO result;

  RETURN result;
END
$fn$;

CREATE OR REPLACE FUNCTION public.admin_list_inquiries(p_query text DEFAULT '',p_status text DEFAULT NULL,p_limit integer DEFAULT 25,p_offset integer DEFAULT 0)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $f$
DECLARE items jsonb; total bigint;
BEGIN
 PERFORM public.admin_assert_capability('inquiries.manage');
 IF p_query IS NULL OR char_length(p_query)>100 OR p_limit IS NULL OR p_offset IS NULL OR p_limit NOT BETWEEN 1 AND 50 OR p_offset NOT BETWEEN 0 AND 1000000 OR (p_status IS NOT NULL AND p_status NOT IN('new','in_progress','resolved','spam')) THEN PERFORM public.phase3_fail('invalid_input'); END IF;
 SELECT count(*) INTO total FROM public.inquiries WHERE deleted_at IS NULL AND (p_status IS NULL OR status=p_status) AND (subject ILIKE '%'||p_query||'%' OR email ILIKE '%'||p_query||'%');
 SELECT COALESCE(jsonb_agg(public.inquiry_dto(i::public.inquiries) ORDER BY i.created_at DESC,i.id),'[]'::jsonb) INTO items FROM(SELECT * FROM public.inquiries WHERE deleted_at IS NULL AND (p_status IS NULL OR status=p_status) AND (subject ILIKE '%'||p_query||'%' OR email ILIKE '%'||p_query||'%') ORDER BY created_at DESC,id LIMIT p_limit OFFSET p_offset) i;
 RETURN jsonb_build_object('items',items,'total',total);
END $f$;

CREATE OR REPLACE FUNCTION public.admin_get_inquiry(p_id uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $f$
DECLARE i public.inquiries; notes jsonb;
BEGIN
 PERFORM public.admin_assert_capability('inquiries.manage');
 SELECT * INTO i FROM public.inquiries WHERE id=p_id AND deleted_at IS NULL;
 IF NOT FOUND THEN PERFORM public.phase3_fail('inquiry_not_found'); END IF;
 SELECT COALESCE(jsonb_agg(jsonb_build_object('id',n.id,'text',n.text,'actor',n.actor,'createdAt',n.created_at) ORDER BY n.id),'[]'::jsonb) INTO notes FROM public.inquiry_notes n WHERE n.inquiry_id=p_id;
 RETURN jsonb_build_object('inquiry',public.inquiry_dto(i)||jsonb_build_object('notes',notes));
END $f$;

CREATE OR REPLACE FUNCTION public.admin_update_inquiry(p_id uuid,p_expected_version bigint,p_status text,p_note text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $f$
DECLARE actor text; i public.inquiries;
BEGIN
 actor:=public.admin_assert_capability('inquiries.manage');
 IF p_status IS NULL OR p_status NOT IN('new','in_progress','resolved','spam') OR p_note IS NULL OR char_length(p_note)>2000 THEN PERFORM public.phase3_fail('invalid_input'); END IF;
 SELECT * INTO i FROM public.inquiries WHERE id=p_id AND deleted_at IS NULL FOR UPDATE;
 IF NOT FOUND THEN PERFORM public.phase3_fail('inquiry_not_found'); END IF;
 IF p_expected_version IS NULL OR p_expected_version<>i.version THEN PERFORM public.phase3_fail('version_conflict'); END IF;
 INSERT INTO public.inquiry_notes(inquiry_id,text,actor) VALUES(p_id,'Status: '||p_status||CASE WHEN btrim(p_note)<>'' THEN E'\n'||btrim(p_note) ELSE '' END,actor);
 UPDATE public.inquiries SET status=p_status,version=version+1,updated_at=now() WHERE id=p_id;
 IF p_status='spam' THEN
  UPDATE public.inquiry_notifications SET status='suppressed',version=version+1,lease_until=NULL
  WHERE inquiry_id=p_id AND status IN('unconfigured','leased','failed');
 END IF;
 RETURN public.admin_get_inquiry(p_id);
END $f$;

CREATE OR REPLACE FUNCTION public.admin_claim_inquiry_notification(p_id uuid,p_expected_version bigint,p_dispatch_key text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $f$
DECLARE actor text; i public.inquiries; n public.inquiry_notifications; token uuid;
BEGIN
 PERFORM public.assert_inquiry_dispatch_key(p_dispatch_key);
 actor:=public.admin_assert_capability('inquiries.manage');
 SELECT * INTO i FROM public.inquiries WHERE id=p_id AND deleted_at IS NULL FOR UPDATE;
 IF NOT FOUND THEN PERFORM public.phase3_fail('inquiry_not_found'); END IF;
 SELECT * INTO n FROM public.inquiry_notifications WHERE inquiry_id=p_id FOR UPDATE;
 IF NOT FOUND THEN PERFORM public.phase3_fail('inquiry_not_found'); END IF;
 IF p_expected_version IS NULL OR p_expected_version<>n.version THEN PERFORM public.phase3_fail('version_conflict'); END IF;
 IF i.status='spam' OR n.attempt_count>=5 OR NOT(n.status IN('unconfigured','failed') OR (n.status='leased' AND n.lease_until<now()))
 THEN PERFORM public.phase3_fail('invalid_state'); END IF;
 token:=gen_random_uuid();
 UPDATE public.inquiry_notifications SET status='leased',lease_token=token,lease_until=now()+interval '2 minutes',version=version+1 WHERE inquiry_id=p_id;
 INSERT INTO public.inquiry_notes(inquiry_id,text,actor) VALUES(p_id,CASE WHEN n.attempt_count>0 THEN 'Email notification retry requested.' ELSE 'Email notification requested.' END,actor);
 RETURN jsonb_build_object('token',token);
END $f$;

CREATE OR REPLACE FUNCTION public.begin_inquiry_notification(p_id uuid,p_token uuid,p_dispatch_key text) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $f$
DECLARE i public.inquiries; n public.inquiry_notifications;
BEGIN
 PERFORM public.assert_inquiry_dispatch_key(p_dispatch_key);
 PERFORM public.admin_assert_capability('inquiries.manage');
 SELECT * INTO i FROM public.inquiries WHERE id=p_id FOR UPDATE;
 IF NOT FOUND THEN PERFORM public.phase3_fail('inquiry_not_found'); END IF;
 IF i.deleted_at IS NOT NULL THEN RETURN false; END IF;
 SELECT * INTO n FROM public.inquiry_notifications WHERE inquiry_id=p_id FOR UPDATE;
 IF NOT FOUND THEN PERFORM public.phase3_fail('inquiry_not_found'); END IF;
 IF p_token IS NULL OR n.lease_token IS DISTINCT FROM p_token THEN PERFORM public.phase3_fail('version_conflict'); END IF;
 IF n.status='suppressed' THEN RETURN false; END IF;
 IF n.status<>'leased' OR n.lease_until IS NULL OR n.lease_until<=now() OR n.attempt_count>=5 THEN PERFORM public.phase3_fail('invalid_state'); END IF;
 IF i.status='spam' THEN
  UPDATE public.inquiry_notifications SET status='suppressed',version=version+1,lease_until=NULL WHERE inquiry_id=p_id;
  RETURN false;
 END IF;
 UPDATE public.inquiry_notifications SET status='sending',attempt_count=attempt_count+1,last_attempt_at=now(),lease_until=now()+interval '2 minutes',version=version+1 WHERE inquiry_id=p_id;
 RETURN true;
END $f$;

CREATE OR REPLACE FUNCTION public.admin_inquiry_attachments(p_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $f$
BEGIN
 PERFORM public.admin_assert_capability('inquiries.manage');
 IF NOT EXISTS(SELECT 1 FROM public.inquiries WHERE id=p_id AND deleted_at IS NULL) THEN PERFORM public.phase3_fail('inquiry_not_found'); END IF;
 RETURN jsonb_build_object('attachments',coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'filename',filename,'mimeType',mime_type,'size',byte_size,'ready',ready) ORDER BY position) FROM public.inquiry_attachments WHERE inquiry_id=p_id),'[]'::jsonb));
END $f$;

CREATE OR REPLACE FUNCTION public.admin_inquiry_attachment(p_inquiry_id uuid,p_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $f$
DECLARE a public.inquiry_attachments;
BEGIN
 PERFORM public.admin_assert_capability('inquiries.manage');
 IF NOT EXISTS(SELECT 1 FROM public.inquiries WHERE id=p_inquiry_id AND deleted_at IS NULL) THEN PERFORM public.phase3_fail('inquiry_not_found'); END IF;
 SELECT * INTO a FROM public.inquiry_attachments WHERE inquiry_id=p_inquiry_id AND id=p_id AND ready;
 IF NOT FOUND THEN PERFORM public.phase3_fail('inquiry_not_found'); END IF;
 RETURN jsonb_build_object('key',a.object_key,'size',a.byte_size,'sha256',a.sha256,'filename',a.filename);
END $f$;

-- Replacements preserve their existing ACLs; restate the intended runtime boundary.
REVOKE ALL ON FUNCTION public.admin_query_inquiries(text,text,text,integer,integer),public.admin_list_inquiries(text,text,integer,integer),public.admin_get_inquiry(uuid),public.admin_update_inquiry(uuid,bigint,text,text),public.admin_claim_inquiry_notification(uuid,bigint,text),public.begin_inquiry_notification(uuid,uuid,text),public.admin_inquiry_attachments(uuid),public.admin_inquiry_attachment(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.admin_query_inquiries(text,text,text,integer,integer),public.admin_list_inquiries(text,text,integer,integer),public.admin_get_inquiry(uuid),public.admin_update_inquiry(uuid,bigint,text,text),public.admin_claim_inquiry_notification(uuid,bigint,text),public.begin_inquiry_notification(uuid,uuid,text),public.admin_inquiry_attachments(uuid),public.admin_inquiry_attachment(uuid,uuid) TO authenticated;
