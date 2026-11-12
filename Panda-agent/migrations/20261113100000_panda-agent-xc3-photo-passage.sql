-- Owner-approved on 13 Nov 2026 ("Yes, ingest it"): one passage for PandaByte xC3 (SKU ESPXC3), transcribed from the
-- listing's board-back photo. Step 1 of 2 and inert on its own: it stores the passage as a new approved version under
-- the existing xC3 source and seals a NEW 285-member candidate (the 284 current members plus this one). The runtime
-- still reads the old candidate until 20261113100001 switches the pin, after the application accepts both.
-- Rollback: nothing to undo for readers (no reader references the new rows). The rows are immutable by design.
DO $m$
DECLARE
 src constant uuid := '1632b696-9004-4f85-8aac-24be058c5cc1';
 prod constant uuid := '5638c86c-6817-433a-abf3-1abee8d3eff6';
 parent constant uuid := '9d954070-b054-4d45-af0c-27a2e3aa4f0a';
 old_release constant uuid := '044b6f36-6d0b-4cb0-8154-181e569a7d1e';
 cfg constant text := '47d91adb459d6fcebfe928bbb4e875cb4ab1f5949e11c8b04d708bc503063019';
 parser constant text := 'listing-photo-transcription-v1';
 section constant jsonb := '["PandaByte xC3 ESP32-C3 Development Board","Board photo: header pin labels"]';
 body constant text := $t$Transcribed from the product listing photo of the back of the board (antenna at the top). The labels are copied as printed on the board. This is a photo transcription, not datasheet text and not hardware verification; the photo does not say what each number means.

Printed on the board: "GeekyBoard", "xC3".

Header pad labels, top to bottom, as seen from the back of the board (seen from the component side the two rows are mirrored):

| Position | Left row label | Right row label |
|---|---|---|
| 1 | 0 | 3V3 |
| 2 | 1 | EN |
| 3 | 2 | 4 |
| 4 | 3 | 5 |
| 5 | 19 | 6 |
| 6 | 18 | 7 |
| 7 | TX0 | 8 |
| 8 | RX0 | 9 |
| 9 | 10 | GND |
| 10 | GND | GND |
| 11 | GND | 5V |
| 12 | 3V3 | 5V |
| 13 | 5V | 3V3 |
| 14 | GND | GND |
| 15 | GND | GND |

Each row has 15 pads, 30 in total.$t$;
 h text; logical text; cv text; loc text; vid uuid; gen bigint; items jsonb; manifest text; rid uuid; d text; n bigint;
BEGIN
 SELECT count(*) INTO n FROM public.panda_agent_release_items WHERE release_id=old_release;
 SELECT eligibility_generation INTO STRICT gen FROM public.panda_agent_sources WHERE id=src AND product_id=prod AND review_state='approved' AND rights_status='permitted' AND withdrawn_at IS NULL AND deleted_at IS NULL;
 IF n<>284 OR NOT EXISTS(SELECT 1 FROM public.panda_agent_releases WHERE id=old_release AND config_hash=cfg AND member_count=284 AND state='candidate' AND sealed) THEN RAISE EXCEPTION 'unexpected base release'; END IF;
 h := encode(sha256(convert_to(body,'UTF8')),'hex');
 logical := encode(sha256(convert_to('["xc3-board-back-photo",'||section::text||',1]','UTF8')),'hex');
 cv := encode(sha256(convert_to(logical||':'||parser||':table:'||h,'UTF8')),'hex');
 loc := jsonb_build_object('start_line',1,'end_line',25,'section_path',section,'kind','table','review_status','approved','review_reason',null)::text;
 vid := public.panda_agent_store_version(src,parent,prod,NULL,
  encode(sha256(convert_to('xc3-board-back-photo:'||h,'UTF8')),'hex'),h,octet_length(body),body,h,parser,
  encode(sha256(convert_to('{"parser":"'||parser||'"}','UTF8')),'hex'),'product_listing',NULL,
  jsonb_build_object('captured_at','2026-11-13T00:00:00+00:00','rights','private_not_redistribution',
   'original_url','https://static.wixstatic.com/media/3e946a_39223cc48ebc497ab7c9d79816ede3e8~mv2.jpg',
   'final_url','https://www.pandabyte.in/product-page/pandabyte-xc3-esp32c3-microcontroller-board-arduino-compatible',
   'method','transcribed from the listing photo; owner approved 2026-11-13'));
 PERFORM public.panda_agent_add_chunk(vid,logical,cv,body,h,loc);
 PERFORM public.panda_agent_seal_version(vid,1,1,encode(sha256(convert_to(logical||':'||h||':'||loc,'UTF8')),'hex'));
 PERFORM public.panda_agent_review_version(vid,2,'approve','Owner approved the xC3 board-back photo transcription on 2026-11-13');
 WITH members AS (
  SELECT document_version_id v,logical_chunk_id l,text_hash t,generation g FROM public.panda_agent_release_items WHERE release_id=old_release
  UNION ALL SELECT vid,logical,h,gen)
 SELECT jsonb_agg(jsonb_build_object('version',v,'logical',l,'hash',t,'generation',g)),
  encode(sha256(convert_to(cfg||E'\n'||string_agg(v::text||':'||l||':'||t||':'||g::text,E'\n' ORDER BY v,l),'UTF8')),'hex')
 INTO items,manifest FROM members;
 rid := public.panda_agent_seal_candidate(cfg,manifest,285,items);
 -- The admin read snapshot caps the eligible count at the old member count; allow one more.
 d := pg_get_functiondef('public.panda_agent_runtime_admin_snapshot()'::regprocedure);
 IF position('n>284' IN d)=0 THEN RAISE EXCEPTION 'snapshot cap not found'; END IF;
 EXECUTE replace(d,'n>284','n>285');
 RAISE NOTICE 'release % manifest % version % logical %',rid,manifest,vid,logical;
END $m$;
