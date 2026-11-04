-- Additive, source-only local engineering reads. No candidate promotion or writes.
-- This pinned URL/SKU mapping is the reviewed 42-source import, not private provenance.
CREATE FUNCTION public.panda_agent_runtime_mapping() RETURNS TABLE(source_url text,sku text)
LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $$
 VALUES
  ('https://www.pandabyte.in/product-page/18650-battery-holder-with-switch','18650HOLDER'),
  ('https://www.pandabyte.in/product-page/2-4a-type-c-data-charging-usb-cable','USBTYPEC'),
  ('https://www.pandabyte.in/product-page/accelerometer-adxl345-grove-compatible','PBADXL345'),
  ('https://www.pandabyte.in/product-page/active-buzzer-sensor-module','PBABUZZ'),
  ('https://www.pandabyte.in/product-page/barometric-pressure-sensor-bmp580-grove-compatible','PBBMP580'),
  ('https://www.pandabyte.in/product-page/esp32-x32-microcontroller-board-arduino-compatible','ESPX32'),
  ('https://www.pandabyte.in/product-page/female-to-female-breadboard-jumper-dupont-2-54mm-cable-40-pcs-10cm','DUPONT'),
  ('https://www.pandabyte.in/product-page/grove-female-header-smd-90-degree-10-units','GRSMD90D'),
  ('https://www.pandabyte.in/product-page/grove-female-header-smd-regular-10-units','GRSMDREG'),
  ('https://www.pandabyte.in/product-page/grove-universal-4-pin-20cm-unbuckled-cable-5-pcs-pack','WIREGROVE'),
  ('https://www.pandabyte.in/product-page/led-switch-module','PBLEDSW'),
  ('https://www.pandabyte.in/product-page/light-sensor-temt6000-grove-compatible','TEMT6000'),
  ('https://www.pandabyte.in/product-page/m5stack-mini-scale-weighing-unit-hx711','SCALEHX711'),
  ('https://www.pandabyte.in/product-page/maker-uno-simplifying-arduino-for-education','MAKERUNO'),
  ('https://www.pandabyte.in/product-page/neo-6m-gps-grove-compatible','PBNEO6M'),
  ('https://www.pandabyte.in/product-page/nodemcu-grove-expansion-board-shield-hat','NODEMCUHAT'),
  ('https://www.pandabyte.in/product-page/pandabyte-accelerometer-gyroscope-mpu6050-grove-sensor','MPU6050'),
  ('https://www.pandabyte.in/product-page/pandabyte-bmv080-air-quality-pm1-pm2-5-pm10-sensor','PB-BMV080'),
  ('https://www.pandabyte.in/product-page/pandabyte-esp32c3-arduino-iot-kit','xC3KITV2'),
  ('https://www.pandabyte.in/product-page/pandabyte-gp-02-gps-bds-gnss','GPSGP02'),
  ('https://www.pandabyte.in/product-page/pandabyte-lorawan-kit-868-mhz','LORAKIT'),
  ('https://www.pandabyte.in/product-page/pandabyte-max485-ttl-to-rs485-5v-12v','PB-MAX485'),
  ('https://www.pandabyte.in/product-page/pandabyte-oled-screen-display-0-96-inch-grove','PB96OLED'),
  ('https://www.pandabyte.in/product-page/pandabyte-potentiometerv-10k-ohm','PB10KPOT'),
  ('https://www.pandabyte.in/product-page/pandabyte-rgb-led-strip-ws2812b-xiao-footprint-with-switch','RGB10WS'),
  ('https://www.pandabyte.in/product-page/pandabyte-rgb-rgb-lcd-backlight-grove-module','LCDBACKLIT'),
  ('https://www.pandabyte.in/product-page/pandabyte-x8266-wifi-development-board','ESPX8266'),
  ('https://www.pandabyte.in/product-page/pandabyte-xc3-esp32c3-microcontroller-board-arduino-compatible','ESPXC3'),
  ('https://www.pandabyte.in/product-page/pandabyte-xc3m-esp32-c3-microcontroller-board-arduino-compatible','ESPXC3M'),
  ('https://www.pandabyte.in/product-page/pandabyte-xc5-esp32c5-microcontroller-board-arduino-compatible','ESPXC5'),
  ('https://www.pandabyte.in/product-page/pandabyte-xc6-esp32-c6-microcontroller-board-arduino-compatible','ESPXC6'),
  ('https://www.pandabyte.in/product-page/pandabyte-xlora-esp32-lora-microcontroller-board-arduino-compatible','XLORA'),
  ('https://www.pandabyte.in/product-page/pandabyte-xpm-particulate-matter-pm1-pm2-5-pm10-sensor','xPBPM'),
  ('https://www.pandabyte.in/product-page/pandabyte-xs3-esp32-s3-microcontroller-board-arduino-compatible','ESPXS3'),
  ('https://www.pandabyte.in/product-page/push-button-switch','SWITCHGROVE'),
  ('https://www.pandabyte.in/product-page/rgb-led-circular-ws2812b-wemos-d1-mini','RGBWEMOS'),
  ('https://www.pandabyte.in/product-page/rgb-led-grove-compatible','RGB5050'),
  ('https://www.pandabyte.in/product-page/rgb-led-matrix-ws2812b-xiao-footprint','RGB4X4'),
  ('https://www.pandabyte.in/product-page/single-color-led-light-emitting-diode','PBSLED'),
  ('https://www.pandabyte.in/product-page/temperature-humidity-dht11-sensor','PBDHT11'),
  ('https://www.pandabyte.in/product-page/x32-xlora-grove-expansion-board-shield-hat','X32SHIELD'),
  ('https://www.pandabyte.in/product-page/xc3m-grove-expansion-board-shield-hat','XC3MHAT')
$$;

-- Private helper checks the complete immutable membership, not only the selected product.
CREATE FUNCTION public.panda_agent_runtime_candidate() RETURNS public.panda_agent_releases
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE r public.panda_agent_releases; n bigint; h text;
BEGIN
 SELECT * INTO r FROM public.panda_agent_releases WHERE config_hash='47d91adb459d6fcebfe928bbb4e875cb4ab1f5949e11c8b04d708bc503063019'
 AND manifest_hash='0ebfec3480bffa6c53304bb0f3d6333b2b81eb466e8cadb488a869cf3aff6ffa' AND state='candidate' AND sealed;
 IF NOT FOUND OR r.member_count<>284 THEN PERFORM public.phase3_fail('not_found'); END IF;
 SELECT count(*),encode(sha256(convert_to(r.config_hash||E'\n'||coalesce(string_agg(i.document_version_id::text||':'||i.logical_chunk_id||':'||i.text_hash||':'||i.generation::text,E'\n' ORDER BY i.document_version_id,i.logical_chunk_id),''),'UTF8')),'hex') INTO n,h
 FROM public.panda_agent_release_items i WHERE i.release_id=r.id;
 IF n<>r.member_count OR h<>r.manifest_hash THEN PERFORM public.phase3_fail('not_found'); END IF;
 RETURN r;
END $$;

-- Internal projection; callers must independently check authorization and candidate membership.
CREATE FUNCTION public.panda_agent_runtime_eligible(p_release uuid)
RETURNS TABLE(product_id uuid,sku text,title text,source_url text,document_version_id uuid,logical_chunk_id text,chunk_version_id text,chunk_text text,text_hash text,generation bigint,physical_revision text,captured_at text,section_path jsonb)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
 SELECT s.product_id,m.sku,rev.title,s.canonical_url,v.id,c.logical_chunk_id,c.chunk_version_id,c.chunk_text,c.text_hash,i.generation,v.physical_revision,v.provenance->>'captured_at',c.locator::jsonb->'section_path'
 FROM public.panda_agent_release_items i
 JOIN public.panda_agent_versions v ON v.id=i.document_version_id
 JOIN public.panda_agent_sources s ON s.id=v.source_id AND s.product_id=v.product_id
 JOIN public.panda_agent_runtime_mapping() m ON m.source_url=s.canonical_url
 JOIN public.panda_agent_chunks c ON c.document_version_id=i.document_version_id AND c.logical_chunk_id=i.logical_chunk_id
 JOIN public.cms_records cr ON cr.id=s.product_id AND cr.kind='product' AND cr.archived_at IS NULL
 JOIN public.cms_revisions rev ON rev.record_id=cr.id AND rev.id=cr.published_revision_id
 WHERE i.release_id=p_release AND s.review_state='approved' AND s.rights_status='permitted' AND s.withdrawn_at IS NULL AND s.deleted_at IS NULL
 AND v.state='approved' AND v.scope='product_listing' AND v.withdrawn_at IS NULL AND v.deleted_at IS NULL
 AND c.purged_at IS NULL AND c.chunk_text IS NOT NULL AND i.text_hash=c.text_hash AND i.generation=s.eligibility_generation
 AND EXISTS (SELECT 1 FROM jsonb_array_elements(CASE WHEN jsonb_typeof(rev.document->'variants')='array' THEN rev.document->'variants' ELSE '[]'::jsonb END) x WHERE x->>'sku'=m.sku)
$$;

CREATE FUNCTION public.panda_agent_runtime_products() RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE r public.panda_agent_releases; result jsonb;
BEGIN
 IF public.requesting_user_id() IS NULL THEN PERFORM public.phase3_fail('unauthenticated'); END IF;
 r:=public.panda_agent_runtime_candidate();
 SELECT jsonb_build_object('items',coalesce(jsonb_agg(jsonb_build_object('id',product_id,'sku',sku,'title',title,'sourceUrl',source_url,'approvedChunksCount',n) ORDER BY title,product_id),'[]'::jsonb)) INTO result
 FROM (SELECT product_id,sku,title,source_url,count(*) n FROM public.panda_agent_runtime_eligible(r.id) GROUP BY product_id,sku,title,source_url) q;
 RETURN result;
END $$;

CREATE FUNCTION public.panda_agent_runtime_scope(p_product uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE r public.panda_agent_releases; result jsonb;
BEGIN
 IF public.requesting_user_id() IS NULL THEN PERFORM public.phase3_fail('unauthenticated'); END IF;
 IF p_product IS NULL THEN PERFORM public.phase3_fail('invalid_input'); END IF;
 r:=public.panda_agent_runtime_candidate();
 SELECT jsonb_build_object('candidate',jsonb_build_object('configHash',r.config_hash,'manifestHash',r.manifest_hash,'memberCount',r.member_count,'membershipHash',r.manifest_hash,'state',r.state,'sealed',r.sealed),
 'product',jsonb_build_object('id',p_product,'sku',min(sku),'title',min(title),'sourceUrl',min(source_url)),
 'chunks',jsonb_agg(jsonb_build_object('documentVersionId',document_version_id,'logicalChunkId',logical_chunk_id,'chunkVersionId',chunk_version_id,'text',chunk_text,'textHash',text_hash,'generation',generation,'physicalRevision',physical_revision,'capturedAt',captured_at,'sectionPath',section_path) ORDER BY document_version_id,logical_chunk_id)) INTO result
 FROM public.panda_agent_runtime_eligible(r.id) WHERE product_id=p_product HAVING count(*)>0 AND count(DISTINCT sku)=1 AND count(DISTINCT source_url)=1;
 IF result IS NULL THEN PERFORM public.phase3_fail('not_found'); END IF;
 RETURN result;
END $$;

CREATE FUNCTION public.panda_agent_runtime_admin_products(p_limit integer DEFAULT 10,p_offset integer DEFAULT 0) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE r public.panda_agent_releases; result jsonb;
BEGIN
 PERFORM public.panda_agent_control_room_admin();
 IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 50 OR p_offset IS NULL OR p_offset NOT BETWEEN 0 AND 10000 THEN PERFORM public.phase3_fail('invalid_input'); END IF;
 r:=public.panda_agent_runtime_candidate();
 WITH catalog_rows AS (
 SELECT s.product_id id,m.sku,coalesce(rev.title,cr.title) title,s.canonical_url source_url,
 (SELECT count(*) FROM public.panda_agent_runtime_eligible(r.id) e WHERE e.product_id=s.product_id) n,
 CASE WHEN s.deleted_at IS NOT NULL OR s.withdrawn_at IS NOT NULL THEN 'withdrawn'
 WHEN s.review_state<>'approved' OR s.rights_status<>'permitted' THEN 'source_not_approved'
 WHEN cr.archived_at IS NOT NULL OR rev.id IS NULL THEN 'unpublished'
 WHEN NOT EXISTS (SELECT 1 FROM jsonb_array_elements(CASE WHEN jsonb_typeof(rev.document->'variants')='array' THEN rev.document->'variants' ELSE '[]'::jsonb END) x WHERE x->>'sku'=m.sku) THEN 'sku_mismatch'
 WHEN NOT EXISTS (SELECT 1 FROM public.panda_agent_runtime_eligible(r.id) e WHERE e.product_id=s.product_id) THEN 'no_current_eligible_chunks' ELSE 'eligible' END status
 FROM public.panda_agent_sources s JOIN public.panda_agent_runtime_mapping() m ON m.source_url=s.canonical_url
 JOIN public.cms_records cr ON cr.id=s.product_id AND cr.kind='product'
 LEFT JOIN public.cms_revisions rev ON rev.record_id=cr.id AND rev.id=cr.published_revision_id
 ), page AS (SELECT * FROM catalog_rows ORDER BY title,id LIMIT p_limit+1 OFFSET p_offset), visible AS (SELECT * FROM page ORDER BY title,id LIMIT p_limit)
 SELECT jsonb_build_object('items',coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'sku',sku,'title',title,'sourceUrl',source_url,'approvedChunksCount',n,'status',status) ORDER BY title,id) FROM visible),'[]'::jsonb),
 'nextOffset',CASE WHEN (SELECT count(*) FROM page)>p_limit THEN p_offset+p_limit ELSE NULL END) INTO result;
 RETURN result;
END $$;

REVOKE ALL ON FUNCTION public.panda_agent_runtime_mapping(),public.panda_agent_runtime_candidate(),public.panda_agent_runtime_eligible(uuid),public.panda_agent_runtime_products(),public.panda_agent_runtime_scope(uuid),public.panda_agent_runtime_admin_products(integer,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.panda_agent_runtime_products(),public.panda_agent_runtime_scope(uuid),public.panda_agent_runtime_admin_products(integer,integer) TO authenticated;

