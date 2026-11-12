-- Owner-approved on 13 Nov 2026 ("Ingest suggested five"): one board-photo passage each for PandaByte x8266, xC5, xC6, xS3
-- and xC3m (header labels only; the pinout diagrams are NOT ingested). Each passage was drafted by a subagent from the
-- listing photo (Panda-agent/docs/visual-ingestion-drafts/) and independently re-read: x8266 and xC5 by me against the
-- full-size photo, xC6, xS3 and xC3m by a second blind reader. Labels no reader could confirm are stated as not legible.
-- Step 1 of 2 and inert on its own: stores each passage as a new approved version under the existing product source and seals
-- a NEW 290-member candidate (the 285 members of the current live candidate plus these five). Readers keep using the old
-- candidate until 20261113110001 switches the pin, after the application accepts all three candidates.
-- Rollback: nothing to undo for readers (no reader references the new rows). The rows are immutable by design.
DO $m$
DECLARE
 cfg constant text := '47d91adb459d6fcebfe928bbb4e875cb4ab1f5949e11c8b04d708bc503063019';
 base constant uuid := '7c09926f-5a80-4956-aa7f-2ed0e844a490';
 parser constant text := 'listing-photo-transcription-v1';
 e record; h text; logical text; cv text; loc text; vid uuid; gen bigint; section jsonb; n bigint; d text;
 new_items jsonb := '[]'::jsonb; items jsonb; manifest text; rid uuid;
BEGIN
 SELECT count(*) INTO n FROM public.panda_agent_release_items WHERE release_id=base;
 IF n<>285 OR NOT EXISTS(SELECT 1 FROM public.panda_agent_releases WHERE id=base AND config_hash=cfg AND member_count=285 AND state='candidate' AND sealed) THEN RAISE EXCEPTION 'unexpected base release'; END IF;
 FOR e IN SELECT * FROM (VALUES
 ('ESPX8266','fd50f513-4051-4689-8b7e-e3e37be05eb4'::uuid,'19b48c34-3668-4fc1-a25d-5635226103c4'::uuid,'77c3a9fb-2acc-4874-8ab7-6eca00fda29c'::uuid,'PandaByte NodeMCU x8266 WiFi Development Board','https://static.wixstatic.com/media/3e946a_cd5d44cf9d2d4394b94573efb0fd1643~mv2.jpg','https://www.pandabyte.in/product-page/pandabyte-x8266-wifi-development-board',$t$Transcribed from the product listing photo of the back of the board (antenna end at the top). The labels are copied as printed on the board. This is a photo transcription, not datasheet text and not hardware verification; the photo does not say what each number means.

Printed on the board: "PandaByte x8266". The 3.3 V pads are printed in lower case, "3v3".

Header pad labels, top to bottom, as seen in the photo (the two rows mirror when the board is turned over). Each row has 15 pads.

| Position | Left row label | Right row label |
|---|---|---|
| 1 | D0 | A0 |
| 2 | D1 | GND |
| 3 | D2 | 5V |
| 4 | D3 | S3 |
| 5 | D4 | S2 |
| 6 | 3v3 | S1 |
| 7 | GND | SC |
| 8 | D5 | SO |
| 9 | D6 | SK |
| 10 | D7 | GND |
| 11 | D8 | 3v3 |
| 12 | RX | EN |
| 13 | TX | RST |
| 14 | GND | GND |
| 15 | 3v3 | VIN |$t$),
 ('ESPXC5','7d3c3265-756c-4462-a062-5528218798a2'::uuid,'f642bf30-2a72-42c0-b268-00c610252328'::uuid,'d0f30193-c808-4c43-8cd9-8a71ea8ed2fb'::uuid,'PandaByte xC5 ESP32-C5 Development Board','https://static.wixstatic.com/media/3e946a_ecfda27888db42ff8bfcc8fe20285a96~mv2.jpg','https://www.pandabyte.in/product-page/pandabyte-xc5-esp32c5-microcontroller-board-arduino-compatible',$t$Transcribed from the product listing photo of the back of the board (wordmark at the top). The labels are copied as printed on the board. This is a photo transcription, not datasheet text and not hardware verification; the photo does not say what each number means.

Printed on the board: "PandaByte", "xC5", and a small "v1.1" at the bottom right (a printed mark, not a verified hardware revision).

Header pad labels, top to bottom, as seen in the photo (the two rows mirror when the board is turned over). Each row has 15 pads.

| Position | Left row label | Right row label |
|---|---|---|
| 1 | GND | GND |
| 2 | 26 | 3V3 |
| 3 | 25 | EN |
| 4 | TX | 2 |
| 5 | RX | 3 |
| 6 | 24 | 0 |
| 7 | 23 | 1 |
| 8 | 15 | 6 |
| 9 | 27 | 7 |
| 10 | 4 | 8 |
| 11 | 5 | 9 |
| 12 | 28 | 10 |
| 13 | 3V3 | 13 |
| 14 | 5V | 14 |
| 15 | GND | 5V |$t$),
 ('ESPXC6','ec4f4c5b-ac7e-4960-bca0-8d28ecd7eca6'::uuid,'833b6026-d946-4379-a070-a07ca17f3cbc'::uuid,'623b8dfe-5241-4551-9917-836c567740c3'::uuid,'PandaByte xC6 ESP32-C6 Development Board','https://static.wixstatic.com/media/3e946a_0ab04075c7b8401792f31ca121d906d3~mv2.jpg','https://www.pandabyte.in/product-page/pandabyte-xc6-esp32-c6-microcontroller-board-arduino-compatible',$t$Transcribed from the product listing photo of the component side of the board, the face with the radio module (antenna at the top). The labels are copied as printed on the board. This is a photo transcription, not datasheet text and not hardware verification; the photo does not say what each number means.

The top pad of each row is square.

Header pad labels, top to bottom, as seen in the photo (the two rows mirror when the board is turned over). Each row has 16 pads.

| Position | Left row label | Right row label |
|---|---|---|
| 1 | 3V3 * | GND |
| 2 | EN | TX |
| 3 | 4 | RX |
| 4 | 5 | 15 |
| 5 | 6 | 23 |
| 6 | 7 | 22 |
| 7 | 0 | 21 |
| 8 | 1 | 20 |
| 9 | 8 | 19 |
| 10 | 10 | 18 |
| 11 | 11 | 9 |
| 12 | 2 | GND |
| 13 | 3 | 13 |
| 14 | VCC | 12 |
| 15 | VCC | GND |
| 16 | GND | GND |

* Read with lower confidence: the label is small, boxed or rotated in the photo.$t$),
 ('ESPXS3','685eed9d-00b8-4e16-b52d-518a47f64b62'::uuid,'bb9fd736-3225-4a78-9051-358a6f8147d8'::uuid,'21a2640d-4c3b-4e5c-90b9-e17ad00112aa'::uuid,'PandaByte xS3 ESP32-S3 Development Board','https://static.wixstatic.com/media/3e946a_ac9a0f579eb84eb49ef01b3d031ca5c3~mv2.jpg','https://www.pandabyte.in/product-page/pandabyte-xs3-esp32-s3-microcontroller-board-arduino-compatible',$t$Transcribed from the product listing photo of the component side of the board, the face with the radio module (antenna at the top). The labels are copied as printed on the board. This is a photo transcription, not datasheet text and not hardware verification; the photo does not say what each number means.

Header pad labels, top to bottom, as seen in the photo (the two rows mirror when the board is turned over). Each row has 22 pads.

| Position | Left row label | Right row label |
|---|---|---|
| 1 | [not legible in the photo] | GND |
| 2 | [not legible in the photo] | TX |
| 3 | EN | RX |
| 4 | 4 | 1 |
| 5 | 5 | 2 |
| 6 | 6 | 42 |
| 7 | 7 | 41 |
| 8 | 15 | 40 |
| 9 | 16 | 39 |
| 10 | 17 | 38 |
| 11 | 18 | 37 |
| 12 | 8 | 36 |
| 13 | 3 | 35 |
| 14 | 46 | 0 |
| 15 | 9 | 45 |
| 16 | 10 | 48 |
| 17 | 11 | 47 |
| 18 | 12 | 21 |
| 19 | 13 | 20 |
| 20 | 14 | 19 |
| 21 | VCC | GND |
| 22 | GND | GND |

"[not legible in the photo]": the label is too small, boxed or rotated to read, so it is not stated here.$t$),
 ('ESPXC3M','a6c2f225-bc0f-4e45-a6a2-6b635ae39b31'::uuid,'087d03ec-8d40-4095-9335-610f696a2ff2'::uuid,'69173645-933f-4b98-a682-cda936dc6f20'::uuid,'PandaByte xC3m ESP32-C3 Development Board','https://static.wixstatic.com/media/3e946a_b796f3587814419d9e0ccda8f3385602~mv2.jpg','https://www.pandabyte.in/product-page/pandabyte-xc3m-esp32-c3-microcontroller-board-arduino-compatible',$t$Transcribed from the product listing photo of the face of the board without the radio module (USB Type-C connector at the bottom). The labels are copied as printed on the board. This is a photo transcription, not datasheet text and not hardware verification; the photo does not say what each number means.

Printed on the board: "Geeky Board", "xC3m". The 3.3 V pad is printed "3V" (not "3V3") and ground is printed "G". Printed names near the buttons and LEDs: RST, BOOT, Power, I07, I05, I06 (the font makes "I" and "1", "O" and "0" hard to tell apart).

Header pad labels, top to bottom, as seen in the photo (the two rows mirror when the board is turned over). Each row has 10 pads.

| Position | Left row label | Right row label |
|---|---|---|
| 1 | 0 | 3V |
| 2 | 1 | EN |
| 3 | 2 | 4 |
| 4 | 3 | 5 |
| 5 | 19 | 6 |
| 6 | 18 | 7 |
| 7 | TX | 8 |
| 8 | RX | 9 |
| 9 | 10 | G |
| 10 | G | 5V |$t$)
 ) AS t(sku,src,prod,parent,title,photo,page,body) LOOP
  SELECT eligibility_generation INTO STRICT gen FROM public.panda_agent_sources WHERE id=e.src AND product_id=e.prod AND canonical_url=e.page AND review_state='approved' AND rights_status='permitted' AND withdrawn_at IS NULL AND deleted_at IS NULL;
  h := encode(sha256(convert_to(e.body,'UTF8')),'hex');
  section := jsonb_build_array(e.title,'Board photo: header pin labels');
  logical := encode(sha256(convert_to('["'||lower(e.sku)||'-board-photo",'||section::text||',1]','UTF8')),'hex');
  cv := encode(sha256(convert_to(logical||':'||parser||':table:'||h,'UTF8')),'hex');
  loc := jsonb_build_object('start_line',1,'end_line',array_length(string_to_array(e.body,E'\n'),1),'section_path',section,'kind','table','review_status','approved','review_reason',null)::text;
  vid := public.panda_agent_store_version(e.src,e.parent,e.prod,NULL,
   encode(sha256(convert_to(lower(e.sku)||'-board-photo:'||h,'UTF8')),'hex'),h,octet_length(e.body),e.body,h,parser,
   encode(sha256(convert_to('{"parser":"'||parser||'"}','UTF8')),'hex'),'product_listing',NULL,
   jsonb_build_object('captured_at','2026-11-13T00:00:00+00:00','rights','private_not_redistribution','original_url',e.photo,'final_url',e.page,
    'method','transcribed from the listing photo; owner approved 2026-11-13'));
  PERFORM public.panda_agent_add_chunk(vid,logical,cv,e.body,h,loc);
  PERFORM public.panda_agent_seal_version(vid,1,1,encode(sha256(convert_to(logical||':'||h||':'||loc,'UTF8')),'hex'));
  PERFORM public.panda_agent_review_version(vid,2,'approve','Owner approved the '||e.sku||' board photo header table on 2026-11-13');
  new_items := new_items || jsonb_build_array(jsonb_build_object('version',vid,'logical',logical,'hash',h,'generation',gen));
 END LOOP;
 WITH members AS (
  SELECT document_version_id v,logical_chunk_id l,text_hash t,generation g FROM public.panda_agent_release_items WHERE release_id=base
  UNION ALL SELECT (x->>'version')::uuid,x->>'logical',x->>'hash',(x->>'generation')::bigint FROM jsonb_array_elements(new_items) x)
 SELECT jsonb_agg(jsonb_build_object('version',v,'logical',l,'hash',t,'generation',g)),
  encode(sha256(convert_to(cfg||E'\n'||string_agg(v::text||':'||l||':'||t||':'||g::text,E'\n' ORDER BY v,l),'UTF8')),'hex')
 INTO items,manifest FROM members;
 rid := public.panda_agent_seal_candidate(cfg,manifest,290,items);
 -- The admin read snapshot caps the eligible count at the old member count; allow five more.
 d := pg_get_functiondef('public.panda_agent_runtime_admin_snapshot()'::regprocedure);
 IF position('n>285' IN d)=0 THEN RAISE EXCEPTION 'snapshot cap not found'; END IF;
 EXECUTE replace(d,'n>285','n>290');
 RAISE NOTICE 'release % manifest %',rid,manifest;
END $m$;
