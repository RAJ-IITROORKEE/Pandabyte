# Private document ingestion checkpoint — 4 November 2026

The Control Room accepts one PDF, Markdown or text file up to 3 MiB through the picker or drop area. Saving reserves and stores private original bytes; an Admin then records permitted rights and accepts the current intake version. Only a successful review starts preparation. Links remain metadata and are not fetched.

Preparation downloads the reserved private object, verifies its byte count and SHA-256, extracts bounded text and deterministically chunks it. The application signs the exact actor/source-version/hash/chunk payload using a server-only ingestion key. Database functions independently check genuine ADMIN access, the current source and rights decision, a durable claim/nonce and the HMAC. This prevents a direct caller from submitting arbitrary prepared chunks. Original files and existing sealed product releases are preserved.

The Documents view has a scrollable searchable table, source-type/status tags, per-document chunk counts and separate product/upload totals. A prepared upload has a version-bound private passage viewer and an explicit lexical query input. Every result includes its title, version, section and passage number. Access and source fingerprint are checked again before text is released. A no-match query returns no matching passages. These uploads are not yet part of the paid product-model context contract.

## Applied schema and configuration

Migration 20261104170000_panda-agent-external-documents.sql (SHA-256 f78a608b304aabe8f47debbe15970d84d89d0d53ae61793f755089a8b21b4019) compiled in a rollback-only check and was then applied to the selected development InsForge project. All five new private tables have RLS and no direct anon/authenticated SELECT grant. The private intake bucket remains private.

Required server configuration: PANDA_AGENT_DOCUMENT_INGESTION_ENABLED=true, PANDA_AGENT_CONTROL_ROOM_UPLOADS_ENABLED=true and PANDA_AGENT_INGESTION_SIGNING_SECRET. Values must be exact, without a trailing newline. The one-shot signing-key operator pins the official CLI/target and keeps generated key material out of SQL arguments, process arguments and result output. Credential files and operator artifacts are excluded from Git and deployment.

## Verified behavior

An actual signed-in owner browser, using an isolated production build on localhost:3007, uploaded a disposable 1,505-byte PDF, accepted permitted rights, and completed private preparation. The table showed 42 product documents / 282 eligible chunks and 1 uploaded document / 1 chunk. The stored passage contained fictional marker ORCHID-47 and calibration interval 17 days. A matching query returned that passage with the correct title/version/page/ordinal; an unrelated query returned no matches. Privileged read-only aggregate inspection independently confirmed prepared version 1, one stored chunk, the marker and the accepted/permitted intake state. No real product fact was invented by this fixture.

The isolated production build and route TypeScript passed. The documents function trace includes the PDF worker, parser/worker modules, package metadata and 16 standard font assets, with no private credential trace. The source release suite passed 55 checks, initially skipping the optional installed-CLI check. That check subsequently passed against the actual pinned CLI, and both independent hosted-profile tests passed (58 distinct checks in total). Scoped ESLint passed. The role-simulation SQL smoke test was rejected by the provider's SQL session-setting policy and was not bypassed. Browser customer/non-ADMIN role matrices, forced unknown outcomes and native drag gestures were not covered by this checkpoint.

## Paid playground gate

The new product-playground-v1 source accepts bounded product questions and resolves a product automatically. Hosted activation additionally requires PANDA_AGENT_PRODUCT_PLAYGROUND_HOST_READY=true and the existing exact gateway/profile/protocol flags. It remains off until the research-owned host/Lambda/controller/context-digest path is reviewed and the human approves the separate eight-call allocation. Old consumed mini operations must never be replayed. The original cumulative US$2 cap and three native-test reservations remain intact. Model comparison execution is still unconfigured.

Deployment and hosted browser results are recorded separately in verification/rag-upload-live-20261104.json.

## Hosted release

Primary pandabyte-iot.vercel.app now points to dpl_4MnbKTDQAcSLNuovVN2i4EZogLRQ. The actual hosted owner PDF upload, rights review, PDF extraction, signed private commit and cited document search passed before promotion. The main site shows 42 product documents / 282 chunks and two retained synthetic private documents / two chunks. The table has a verified 478px scroll viewport for 3005px of rows. Four main-site product queries resolved DHT11, xS3, BMP580 and xC3 to the correct source and supporting listing evidence; these were retrieval-only calls. Anonymous documents/overview/playground requests return 401 with private/no-store. No new paid model admission was used.
