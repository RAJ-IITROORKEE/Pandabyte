# Product content handoff for Panda Agent

Prepared 1 November 2026. This is a review handoff only: no Panda Agent source, corpus file, ingestion manifest, index, embedding, eligibility generation, runtime or provider setting was changed.

The existing Panda Agent corpus is authoritative for its own captured evidence. It already contains 44 normalized listing documents, with 42 mapped runtime products and two source listings without SKUs. Its listing Markdown includes source PRODUCT INFO prose where present. Shop publication is not an instruction to replace that corpus or to approve the same text as engineering truth.

## Existing contracts and evidence

- Local corpus: E:/Web development/PROJECTS-FULL STACK/Pandabyte/Panda-agent/rag-documents/. Raw and normalized captures are local/ignored; this handoff does not copy them into the public repository.
- Listing loader: Panda-agent/src/ingestion/listings.ts. It accepts 44 explicit product Markdown paths and validates raw/normalized/parser hashes; it does not scan arbitrary resources.
- Canonical preparation: Panda-agent/src/ingestion/canonical.ts. It binds source URL/SKU mapping, raw/normalized hashes, capture metadata and private-original receipts before registering versioned sources/chunks.
- Coverage: Panda-agent/docs/phase-2/corpus-coverage.md and Panda-agent/docs/core-corpus-validation.md.
- Storefront source audit: [44 source references and capture hashes](verification/product-resource-source-audit.json), [resource reconciliation](product-resource-reconciliation.md) and [verified source associations](verification/product-resource-verified.json).
- Existing listing manifest SHA-256 at handoff: 35c285f32aa98208fb9a1849aa68ab1cd916f398def921e42bf0f5726e8c5c11. Preserve it as a baseline, not as a replacement candidate.

The resource coverage index currently contains 123 request records: 120 captured files and three failed/unavailable requests. The 120 files comprise 98 images, 16 PDFs, four HTML references and two pinned GitHub Markdown files. They remain outside listing ingestion eligibility. A link or successful download is not extracted document content, and an Espressif component datasheet does not establish PandaByte board wiring, physical revision or connector compatibility.

## Reconciliation record contract

The Panda Agent chat confirmed that the review record should carry the following fields, with archived and live observations kept distinct:

| Field | Required meaning |
| --- | --- |
| canonical_source_url, slug, sku | Exact product URL identity; SKU is null for the two held listings. |
| match_status, alternative_urls, identity_conflicts | Exact match or explicit uncertainty, with evidence; never infer a product from a similar name alone. |
| archived_observation / live_observation | Requested URL, final URL, capture time, HTTP/access status, raw-byte SHA-256 and byte count for each observation. |
| normalized_text_sha256, normalization_method | Record a normalized hash only with its identified parser/method and version. |
| evidence | Exact source section, line/page or link locator, plus the source version/hash to which it refers; indicate whether the resource was actually fetched. |
| scope, applicability, physical_revision | Listing claim versus component reference versus verified board evidence; use null when physical revision is unknown. |
| rights_status, redistribution_status, access_status | Preserve access restrictions and review state. No document ingestion eligibility follows merely from a public link. |
| unresolved_conflicts, holds | Wrong-board text, disputed voltage/pin claims, unlinked wiki labels, unavailable resources and other unresolved evidence stay explicit. |
| recommended_action | unchanged, new_version, new_resource or needs_review. This is advisory and performs no ingestion. |

For a changed capture, propose a new version while retaining the earlier source and citation history. Match shared resources by requested/final URL and byte hash, preserving their product associations. Do not overwrite existing resource captures merely because a storefront display label changed.

## Current readiness and limits

Existing readback documentation reports a sealed canonical candidate of 284 chunks across 42 mapped products; two mixed-board chunks are excluded from dense retrieval, leaving 282 eligible chunks for 190 unique canonical text inputs. These counts describe the earlier validated candidate and must not be incremented from this storefront review. New source versions need the existing review, lifecycle, generation and evaluation gates.

The separate Panda Agent chat owns its runtime and ingestion. This review handoff does not verify or change either, and does not establish that newly reviewed product data is serving chat answers.

The storefront now displays ten reviewed resource associations across seven published products. These links are supplied as review leads only; they do not authorize ingestion of the linked documents.

### ESP32 setup follow-up — 1 November 2026

The official [Arduino ESP32 installation guide](https://docs.espressif.com/projects/arduino-esp32/en/latest/installing.html) is a general software setup reference for x32, xC3, xC3m, xC5, xC6, xLoRa and xS3; it is not a recovered PandaByte product wiki or proof that a particular board selection exists. The upstream repository contains named variant configurations for x32, xC3m, xC5, xC6 and xS3. The [evidence record](verification/product-esp32-source-evidence.json) identifies a specific upstream commit, variant-file URLs and byte hashes, and the observed installation-guide hash. These are review leads, not ingestion authorization or proof of physical board wiring, electrical safety or fitted hardware revision. Do not apply xC3m pin aliases to xC3.

The [BMV080 tutorial](https://www.instructables.com/Ultra-Compact-Air-Quality-Monitor-Using-PandaByte-/) mentions the BMV080 and xS3; its code and wiring have not been independently tested. Searches did not establish equivalent board-specific tutorials for the other products. The 13 missing wiki destinations remain unresolved; general setup links do not replace them. Preserve the earlier source versions and holds.

The root products/ archive and the Agent corpus are distinct captures. Join them by canonical URL and SKU, preserve both capture hashes and timestamps, and resolve changed/conflicting claims before recommending a new version. The two missing-SKU listings remain unmapped, and the missing wiki hrefs plus failed/restricted resource requests remain holds unless independently verified.

The accompanying [review JSON](verification/product-rag-source-reconciliation.json) joins the 44 archive references, live observations, existing listing-manifest hashes, known resource captures, newly researched links and review holds. It is a review artifact, not an ingestion manifest. The [reviewed storefront resource candidates](verification/product-content-approved.json) are links only; their presence does not establish permission to ingest the destination content.

## Forty-four canonical listing references

The rows below reference existing listing-manifest entries. The normalized hash belongs to Panda Agent’s existing product Markdown, not the storefront Summary field or the older archive capture.

| Canonical source listing | Source SKU | Existing normalized Markdown SHA-256 |
| --- | --- | --- |
| [18650 Battery Holder with Switch](https://www.pandabyte.in/product-page/18650-battery-holder-with-switch) | 18650HOLDER | 8192c07a24a10acc9b93e60e834ec8ef5bc80e7358c8f3cbcac8ef59bd20843d |
| [2.4A Type-C Data & Charging USB Cable](https://www.pandabyte.in/product-page/2-4a-type-c-data-charging-usb-cable) | USBTYPEC | ca55806fef8445d6d50a281a4bf9e19e01e284582a273b46a2239de59d13ebd7 |
| [PandaByte Accelerometer ADXL345 Grove Sensor](https://www.pandabyte.in/product-page/accelerometer-adxl345-grove-compatible) | PBADXL345 | 4b93a2522ec3cb811b67435d8c967401cef3659bf35f34c7db7d858d2dbe16ef |
| [PandaByte Active Buzzer Sensor Grove Module](https://www.pandabyte.in/product-page/active-buzzer-sensor-module) | PBABUZZ | 1d01731fbefe8c4baa68a1c36040f3e4ef0aa23c518ce56535a8f29ee34e9d9e |
| [M5Stack AtomS3 Lite ESP32S3 Dev Kit](https://www.pandabyte.in/product-page/atoms3-lite-esp32s3-dev-kit) | null — unmapped | f69dea6178a54c9eb7c249cabde5cbda1b4105062725f7bd150732674a877c38 |
| [PandaByte Barometric Pressure BMP580 Grove Sensor](https://www.pandabyte.in/product-page/barometric-pressure-sensor-bmp580-grove-compatible) | PBBMP580 | 7ef956f8c7cb223a9228e4b5948e95d2dccd1edf9ddd7927ae57331360d539e3 |
| [PandaByte x32 ESP32 Development Board](https://www.pandabyte.in/product-page/esp32-x32-microcontroller-board-arduino-compatible) | ESPX32 | 66acece112f6a2ede3233e46fbd87fad47670209d70b929e4a127744a0535182 |
| [Female to Female Breadboard Jumper Dupont 2.54mm Cable 40 Pcs (10CM)](https://www.pandabyte.in/product-page/female-to-female-breadboard-jumper-dupont-2-54mm-cable-40-pcs-10cm) | DUPONT | a9bb1e7e181fc80969a4935c366a02c96fe7821477f0352428fffdff3b828221 |
| [Grove Female Header SMD 90 Degree (10 units)](https://www.pandabyte.in/product-page/grove-female-header-smd-90-degree-10-units) | GRSMD90D | 1858447b99824667bea6a45b113928a7fc5273fbc0f24a6bafabfa20bc8ae892 |
| [Grove Female Header SMD Regular (10 units)](https://www.pandabyte.in/product-page/grove-female-header-smd-regular-10-units) | GRSMDREG | 85a1f80a0b81a543d9c62ad1d86638852493bb3f3622aa50fa0cbffc4ccf44b5 |
| [Grove Universal 4 Pin 20cm Unbuckled Cable (5 PCs Pack)](https://www.pandabyte.in/product-page/grove-universal-4-pin-20cm-unbuckled-cable-5-pcs-pack) | WIREGROVE | 97afed0760cd41cfb809dd9e797af298af44f38ba069c21d7881cb9260365f87 |
| [PandaByte Grove LED and Switch Module](https://www.pandabyte.in/product-page/led-switch-module) | PBLEDSW | b8e09a9c280eb390e25b238d77c79e65638d32b641076f1e674ec1a95af09e3b |
| [PandaByte Light TEMT6000 Grove Sensor](https://www.pandabyte.in/product-page/light-sensor-temt6000-grove-compatible) | TEMT6000 | 17c58938588ecf8c9dee0f176b8e062fb220f4b3451bc7e4212c4bd708700a93 |
| [M5Stack Mini Scale Weighing Unit (HX711)](https://www.pandabyte.in/product-page/m5stack-mini-scale-weighing-unit-hx711) | SCALEHX711 | 19fef6dbbc4a949bbbedf18e24755dead36bd52377f823b67d9d682de89a480d |
| [M5Stack Single Live Wire Wi-Fi Smart Switch (ESP32-C6)](https://www.pandabyte.in/product-page/m5stack-single-live-wire-wi-fi-smart-switch-esp32-c6) | null — unmapped | 4d4d07e2a6149f080d462ff59a3fd2036c8eb9f6c72ef82fab59301e217ab978 |
| [Maker UNO: Simplifying Arduino for Education](https://www.pandabyte.in/product-page/maker-uno-simplifying-arduino-for-education) | MAKERUNO | 480a33776aabfaca571b9d8ba50c38a685bdfcbda8cd475d3f485f975dd054aa |
| [PandaByte NEO-6M GPS Grove Sensor](https://www.pandabyte.in/product-page/neo-6m-gps-grove-compatible) | PBNEO6M | 005e41595856823a6bbf3394b7bfa64a02c36f857e9d15b576b2423a503854de |
| [NodeMCU Grove Expansion Board Shield HAT](https://www.pandabyte.in/product-page/nodemcu-grove-expansion-board-shield-hat) | NODEMCUHAT | 5e8f082b3dec5183965d13544a57ccc1b75c953e72be9135b2cfe8b9f467ec74 |
| [PandaByte Accelerometer Gyroscope MPU6050 Grove Sensor](https://www.pandabyte.in/product-page/pandabyte-accelerometer-gyroscope-mpu6050-grove-sensor) | MPU6050 | c4e95e2d0659906aa76a72e0d76e00c4aa37ae2cf4af2993d132acbaab6402bb |
| [PandaByte Bosch BMV080 Air Quality PM1/PM2.5/PM10 Sensor](https://www.pandabyte.in/product-page/pandabyte-bmv080-air-quality-pm1-pm2-5-pm10-sensor) | PB-BMV080 | 6a2512d95b4923cbeaec9b46d21f0cbf619975e940788e9a0404fee91c48f25d |
| [PandaPulse ESP32 IoT Kit](https://www.pandabyte.in/product-page/pandabyte-esp32c3-arduino-iot-kit) | xC3KITV2 | 20980fb0a161fd038d7d622adc0794186950fb9b6030d7ddc6f6212b0d497907 |
| [PandaByte GP-02 GPS BDS GNSS Grove Sensor](https://www.pandabyte.in/product-page/pandabyte-gp-02-gps-bds-gnss) | GPSGP02 | 8721f9ccaca9790cd1d1dd850673290e99f8609a9a4705dbf965bf60043302c6 |
| [PandaByte LoRaWAN Kit 868 MHz](https://www.pandabyte.in/product-page/pandabyte-lorawan-kit-868-mhz) | LORAKIT | 42295de4e4b8822fbb808cb50976c099120b57421e1a7b0a4d797d21febb3bd2 |
| [PandaByte MAX485 TTL To RS485 5V 12V](https://www.pandabyte.in/product-page/pandabyte-max485-ttl-to-rs485-5v-12v) | PB-MAX485 | ad6c34349ab2a94d3fca9d5bc13ed32037e326b029b6626d2b2264da0355db57 |
| [PandaByte OLED Screen Display 0.96 Inch Grove](https://www.pandabyte.in/product-page/pandabyte-oled-screen-display-0-96-inch-grove) | PB96OLED | e76a8afaef2bd46fcab008756e2a674871fed7cde388348b835e74545e532407 |
| [PandaByte Potentiometer 10K ohm Grove Sensor](https://www.pandabyte.in/product-page/pandabyte-potentiometerv-10k-ohm) | PB10KPOT | c7c3a062792eaf2cd55a0e4fd4c775c6c23bc2e607538f542351b6758e47387d |
| [PandaByte RGB LED Strip WS2812B XIAO Footprint with Switch](https://www.pandabyte.in/product-page/pandabyte-rgb-led-strip-ws2812b-xiao-footprint-with-switch) | RGB10WS | 21d37c80996816c112f366dd9140e9652fb4d4bb027799c449e754a18610b323 |
| [PandaByte RGB LCD Backlight Grove Module](https://www.pandabyte.in/product-page/pandabyte-rgb-rgb-lcd-backlight-grove-module) | LCDBACKLIT | ed2183b2eef78d269c95c3ad985cb8283923a425554dc0f0968851235682cbb6 |
| [PandaByte NodeMCU x8266 WiFi Development Board](https://www.pandabyte.in/product-page/pandabyte-x8266-wifi-development-board) | ESPX8266 | 44acc9a5539880ec3e135f7b90db60ec23d8ac2d57dc6e59c99f8cbffb827952 |
| [PandaByte xC3 ESP32-C3 Development Board](https://www.pandabyte.in/product-page/pandabyte-xc3-esp32c3-microcontroller-board-arduino-compatible) | ESPXC3 | ccd304cb69cf670371dc9fddb95d9c78c71913187cdd6e0180951a3ecbbf8326 |
| [PandaByte xC3m ESP32-C3 Development Board](https://www.pandabyte.in/product-page/pandabyte-xc3m-esp32-c3-microcontroller-board-arduino-compatible) | ESPXC3M | 4070adb040e8301468adbd3073900a38ce60d3cd39d233dc9e9aa1db9f997a25 |
| [PandaByte xC5 ESP32-C5 Development Board](https://www.pandabyte.in/product-page/pandabyte-xc5-esp32c5-microcontroller-board-arduino-compatible) | ESPXC5 | 088ad7d517c3f5334d9a74b0cb0f41fe281da1988f0ca11f41256382464aca78 |
| [PandaByte xC6 ESP32-C6 Development Board](https://www.pandabyte.in/product-page/pandabyte-xc6-esp32-c6-microcontroller-board-arduino-compatible) | ESPXC6 | 477010938969ff932ee377bdee304fbd44fd15cdb2d0564f2f21e6ddbae5e1bf |
| [PandaByte xLoRa ESP32 LoRaWAN Development Board with Battery and Solar](https://www.pandabyte.in/product-page/pandabyte-xlora-esp32-lora-microcontroller-board-arduino-compatible) | XLORA | 1eed1fa37557078cb64f8f2816ad904aa2c9894c98560fad405e57b320d2e2ea |
| [PandaByte xPM Particulate Matter PM1/PM2.5/PM10 Sensor](https://www.pandabyte.in/product-page/pandabyte-xpm-particulate-matter-pm1-pm2-5-pm10-sensor) | xPBPM | e2e84500f8c86942607df4e612ad2f0c463406348ff1c9036c98a8a41ca2e0c7 |
| [PandaByte xS3 ESP32-S3 Development Board](https://www.pandabyte.in/product-page/pandabyte-xs3-esp32-s3-microcontroller-board-arduino-compatible) | ESPXS3 | fd31ea5b8a97d3596b43f26e1ca90ea6e755e1fee6a59f40fe7377dcc221e3f6 |
| [PandaByte Push Button Switch Grove Sensor](https://www.pandabyte.in/product-page/push-button-switch) | SWITCHGROVE | 13197ee2330b156214519457b784de7ce723201f05980bb37b046ce8b037e403 |
| [RGB LED Circular WS2812B WeMoS D1 Mini](https://www.pandabyte.in/product-page/rgb-led-circular-ws2812b-wemos-d1-mini) | RGBWEMOS | 2397a5fc74cb973ddb0e59c43c434b6b2e81d130edfa47b3d464e922e1077e60 |
| [PandaByte RGB LED Grove Module](https://www.pandabyte.in/product-page/rgb-led-grove-compatible) | RGB5050 | b89faddcd85d36fa30b59a67a99da6ba73b28ce23dba9f7f2f288a13affb16fb |
| [PandaByte RGB LED Matrix WS2812B XIAO Footprint](https://www.pandabyte.in/product-page/rgb-led-matrix-ws2812b-xiao-footprint) | RGB4X4 | 9abbd7f5fb8ba6e5a86cc963f95e6c25aaad47b301849846d91302a70efb9541 |
| [PandaByte Single Color Grove LED Light Emitting Diode](https://www.pandabyte.in/product-page/single-color-led-light-emitting-diode) | PBSLED | 599b797548c8f58d309038c5f24323c7afb06cf20aa99975e9fafae0126e7324 |
| [PandaByte Temperature Humidity DHT11 Grove Sensor](https://www.pandabyte.in/product-page/temperature-humidity-dht11-sensor) | PBDHT11 | 6cdc36ae25c270252184fc7945234f5b775582e6aa223c3e3f222982d13763e3 |
| [x32 xLoRa Grove Expansion Board Shield HAT](https://www.pandabyte.in/product-page/x32-xlora-grove-expansion-board-shield-hat) | X32SHIELD | 48a8e7bcdb6361cf8eaecda22bb1c9a27b820450a8ac1971f4e1d89772547a4b |
| [xC3m Grove Expansion Board Shield HAT](https://www.pandabyte.in/product-page/xc3m-grove-expansion-board-shield-hat) | XC3MHAT | fd03ab2b908490cc51aef41c39208eeadd9c6156237102c64748df816a30ab59 |

No source files were changed or ingested by this handoff. Publication of verified shop information and approval of retrieval evidence are separately reviewable outcomes.
