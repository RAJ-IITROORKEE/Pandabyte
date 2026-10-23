# Content sources and migration inventory

Snapshot: 23 October 2026. Public-site evidence, not access to the private Wix dashboard. The broader crawl and checkout coverage are recorded in [current-site findings](../current_pandabyte_findings.in).

## Current sources

| Source | Observed content | Migration action |
| --- | --- | --- |
| [Home](https://www.pandabyte.in/) | Logo, hardware imagery, shopping navigation, support links | Preserve identity/assets; rewrite hierarchy only with approved product/company facts |
| [About](https://www.pandabyte.in/about) | Company description and founder-affiliation claims | Owner confirms legal spelling and claims; no invented achievements/partners |
| [Contact](https://www.pandabyte.in/contact) | Public phone/email, office address, weekday hours, inquiry form with upload | Verify details, destination and attachment requirement |
| [Catalog](https://www.pandabyte.in/category/all-products) | Reports 44 products; pagination | Reconcile full export, SKU count, variants, categories and stock |
| [Dev Boards](https://www.pandabyte.in/category/microcontroller) | Category reports 11 products | Preserve source taxonomy; category totals may overlap |
| [Sensors](https://www.pandabyte.in/category/sensors) | Reports 23 products | Normalize measurement/interfaces only from verified specs |
| [Shields](https://www.pandabyte.in/category/shields) | Reports 3 products | Preserve actual board compatibility |
| [Accessories](https://www.pandabyte.in/category/accessories) | Reports 6 products | Preserve pack quantities/connectors |
| [IoT Kits](https://www.pandabyte.in/category/iot-kits) | Reports 2 products | Preserve kit contents and quantities |
| [Courses](https://www.pandabyte.in/category/courses) | Reports 0 products | Do not invent course inventory or an LMS |
| [Help](https://www.pandabyte.in/help-center) | ESP32, getting started, cloud integration and support FAQs | Resolve technical wording and real guide destinations |
| [Shipping/returns](https://www.pandabyte.in/shipping-and-returns) | Current policy destination | Owner confirms before launch; no invented shipping/refund promises |
| [Terms](https://www.pandabyte.in/terms-and-conditions) | Current policy destination | Reconcile changed platform/checkout behavior |
| [Privacy](https://www.pandabyte.in/privacy-policy) | Current policy destination | Reconcile actual data, analytics and processors |

Counts are a public snapshot and can change. An absent discovered page is not proof that the owner has no unpublished or externally hosted content.

## Public company/contact facts for confirmation

The site names Pandabyte Innovations Private Limited. Contact lists `pandabytehelp@gmail.com`, `+91-8380822931`, weekday 10:00–17:00 support, and an Uttarakhand address. Verify address spelling (the source repeats “Hardwar, Haridwar”), support timezone, and publication approval. [Contact source](https://www.pandabyte.in/contact)

The current public header advertises a ₹5,000 minimum. **The new requirement differs:** retain the minimum but display it inside checkout only. Do not migrate the header banner literally.

## Selected asset references

These are observed public URLs, not a downloaded/licensed media archive. Obtain original-resolution owner assets before launch and retain source attribution in the migration manifest.

- Exact current header logo: [Wix logo](https://static.wixstatic.com/media/3e946a_0138368920914ac58cae712631817c05~mv2.png/v1/fill/w_130,h_142,al_c,q_85,usm_0.66_1.00_0.01,enc_avif,quality_auto/Logo_edited_edited.png). Observed via the home header's `pandabyte logo` image element. **Do not redesign/recolor it.**
- [Current hero hardware image](https://static.wixstatic.com/media/3e946a_2372c11b61da418fb88c492c6b861979~mv2.jpg/v1/fill/w_520%2Ch_308%2Cal_c%2Cq_80%2Cusm_0.66_1.00_0.01%2Cenc_avif%2Cquality_auto/3e946a_2372c11b61da418fb88c492c6b861979~mv2.jpg).
- [IoT kit category image](https://static.wixstatic.com/media/3e946a_f6c9f399eeea4c0b984faf8f877be0b8~mv2.jpg/v1/fill/w_485%2Ch_287%2Cal_c%2Cq_80%2Cusm_0.66_1.00_0.01%2Cenc_avif%2Cquality_auto/3e946a_f6c9f399eeea4c0b984faf8f877be0b8~mv2.jpg).
- [xC6 product image](https://static.wixstatic.com/media/3e946a_0ab04075c7b8401792f31ca121d906d3~mv2.jpg/v1/fill/w_767%2Ch_767%2Cal_c%2Cq_85%2Cenc_avif%2Cquality_auto/3e946a_0ab04075c7b8401792f31ca121d906d3~mv2.jpg).

Do not rely permanently on transformed Wix CDN thumbnails. Archive approved originals to InsForge Storage in the migration phase; record object keys, dimensions, alt text, ordering and source URLs. Verify brand/vendor media rights separately.

## Product content model

Preserve title, slug, SKU, product/variant relationships, category links, price/sale price, descriptions, ordered media, actual availability and resource links. Sample sources: [PandaPulse kit](https://www.pandabyte.in/product-page/pandabyte-esp32c3-arduino-iot-kit), [xC6 board](https://www.pandabyte.in/product-page/pandabyte-xc6-esp32-c6-microcontroller-board-arduino-compatible), [x8266 board](https://www.pandabyte.in/product-page/pandabyte-x8266-wifi-development-board).

Normalize only source-supported chip family, CPU/memory, wireless bands, interfaces/protocols, supply/logic voltage, compatible hardware, dimensions and kit contents. Missing values remain unknown; do not infer electrical specifications from a family name. Keep resource URLs and technical revision/date where available.

The sampled kit has SKU `xC3KITV2` and itemized contents. The visible “Product Wiki” label did not establish a working URL in the initial extraction. Resolve this before generating tutorial links or migrating documentation claims.

## New content requiring owners

Blog/tutorials, solution stories, project repositories/licenses, proprietary project descriptions, upcoming product details, and internships/openings need owner-approved material. Propose a content record with title, owner/author, audience, status, related product IDs, source links, reviewed date, SEO fields and publication state.

Suggested editorial pillars: getting started with actual PandaByte boards; sensor/kit walkthroughs; verified integration guides; company engineering updates; actual community/open-source projects. These are proposed topics, not claims that articles exist. No fabricated case studies, testimonials or search-demand metrics.

## Wix migration procedure — later phase

1. Export products/variants/categories using Wix Stores tools, not a generic CMS export. [Wix product export/import](https://support.wix.com/en/article/wix-stores-exporting-and-importing-your-products)
2. Download owner media originals; CSV media references are not an asset backup. Wix's stock/third-party assets can have download restrictions. [Media Manager](https://support.wix.com/en/article/downloading-files-from-the-media-manager)
3. Export orders separately, reconcile line/order totals and UTC timestamps, and decide historical-order access. [Order export](https://support.wix.com/en/article/exporting-orders-3126323)
4. Export contacts only when authorized; contacts and authenticated members are distinct. Do not assume passwords are portable. Plan secure member migration/recovery with the chosen auth provider. [Contact export](https://support.wix.com/en/article/exporting-your-contacts), [Member guidance](https://support.wix.com/en/article/viewing-your-member-list)
5. Keep private exports out of Git. Dry-run import with counts, SKU uniqueness, prices, image checks and category mapping. Preserve Unicode.
6. Build a complete legacy-to-new URL map, preserve paths where practical, and test direct permanent redirects, canonical URLs, structured product/article data and sitemap. [Google site moves](https://developers.google.com/search/docs/crawling-indexing/site-move-with-url-changes)
7. Reconcile stock/orders at a controlled cutover, keep a rollback path and verify real merchant configuration before accepting orders.

No private export or migration has been performed in this research phase.
