# Content-gap checklist

Reviewed 26 October 2026 against application commit `4a71e23`, with two bounded Luna xhigh reviewers and root verification of the development site. This is a review and handoff, not permission to publish, import more products or implement the code backlog. Checkbox items below remain open until explicitly completed and approved.

Subsequent owner authorization after `c84ea71` implemented the three code fixes; see [site controls and verification](site-content-controls.md). The factual/company-content checklist below remains open. No company/catalog content was published or product notes backfilled.

## Current published state

Anonymous localhost API reads report **42 products, five categories, and zero published records** in each of: company pages, FAQs, team, navigation, contact, solutions, blog, learning resources and videos. The built-in browser confirms the corresponding empty states. Zero published records does **not** prove that no private drafts, source-site material or owner-authored content exists; this pass did not read private drafts.

The catalog checkpoint integrated 96 images and one verified product resource link. All 42 products remain explicitly non-purchasable source observations. The source evidence records **0/44 owner factual/publication approvals**; development integration approval did not waive that gate. AtomS3 Lite and M5Stack Single Live Wire Smart Switch remain outside CMS for missing source SKUs. See [catalog evidence](verification/catalog-44-integration.json) and [integration rules](catalog-source-integration.md).

## What the owner needs to provide or approve

| Priority / area | Supply or decide | Existing entry path / completion condition |
| --- | --- | --- |
| P1 — Catalog facts and rights | Review each product's identity, actual SKU/variant label, concise summary, specifications, compatibility, kit quantities, ordered photos/alt text, documentation relevance and permission to use text/images. Mark approved, corrections needed, or hold. | `/admin/products`, `/admin/categories`, `/admin/media`. Review all 42 development records; retain dated source caveats and purchase disablement. Technical/source review is not engineering or rights approval. |
| P1 — Two held products | Real source SKUs for AtomS3 Lite and M5Stack Single Live Wire Smart Switch, or confirm continued exclusion. | Keep outside CMS until genuine SKUs and mappings are reviewed. Preserve the switch's cross-category source membership; do not invent identifiers. |
| P1 — About and team | Approved company/legal display name, short description, founder/cofounder names and roles, bios, approved photos/links and confirmation of affiliation/achievement claims. | `/admin/pages` with slug `about`; `/admin/team`. No invented team or partner claims. Neutral draft avatars are not approved production identities. |
| P1 — Contact | Approved public help email, phone, complete office address, hours and timezone, social links, and the actual scope of engineering support. | `/admin/contact` with slug `contact`. Historical email/phone/address/hours in [source inventory](content-inventory.md) are candidates for reconfirmation, not current approved app content. Office addresses stay on Contact. |
| P1 — Privacy and company terms | Owner-approved text consistent with actual Clerk/InsForge processing, inquiry/account data, intended retention and contact/escalation process. Obtain appropriate review of policy text. | `/admin/pages`: `privacy-policy`, `terms-and-conditions`; optional `policies` introduction. This is a content requirement, not legal advice or a legal-compliance assertion. |
| P2 — Help and FAQs | Reviewed answers for supported boards, getting started, downloads/documentation, support requests and troubleshooting; identify which answers appear on Home versus Help. | `/admin/pages` slug `help`, `/admin/faqs` with placements `home` / `help` as appropriate. Do not invent support response guarantees. |
| P2 — Learn / YouTube / blog | Approved guide/spec/video URLs, titles, descriptions, related products, authors, reviewed article bodies, media rights and SEO text. | `/admin/learn` uses `embedded-systems`, `product-specs`, `kit-guides`; `/admin/videos`; `/admin/blog`. Existing collections and article types need content, not a new CMS. |
| P2 — Solutions and public tools | Actual solution descriptions, supported capabilities, approved links, and a decision on which upcoming offerings remain Coming soon. Public Skills/CLI material must be selected product content, not local developer credentials/configuration. | `/admin/solutions`; `/solutions/skills-cli` reads published solution content and otherwise shows Coming soon. Approved content can use the existing route without code changes. |
| P2 — Home / brand / navigation | Approve homepage headline/summary, support wording, footer tagline/copyright attribution, logo-strip usage and intended menu labels/order/visibility. Decide whether empty Projects/Careers destinations should remain visible. | `/admin/pages` slug `home` already controls headline/summary/body. Logo strip is a visual reference, not a partnership claim. Core navigation and some brand/support text have code gaps below. |
| P2 — Projects / Careers / upcoming | Approved real project descriptions and repository licenses; actual openings, if any; factual upcoming-product descriptions or retain honest placeholders. | Simple `pages` records for `projects`, `careers`, `upcoming`. Named future hardware destinations remain Coming soon; do not invent dates, vacancies or downloads. |
| Deferred — commerce policy | Shipping/returns/cancellation, tax/HSN, operating prices, stock and current offers still need business decisions later. | Record as a deferred gate only. No checkout/payment work, inferred tax/shipping policy or current-offer conversion in this checkpoint. |

## Product questions requiring a factual answer

The following are recorded source conflicts/questions, not assertions of the correct technical values. Private source notes and [structured-field review](../products/reports/structured-field-review.json) retain the underlying evidence; disputed clauses remain withheld or flagged by the [source map](../scripts/catalog-source-map.mjs).

- [ ] **PandaPulse ESP32 IoT Kit:** reconcile the claimed 21 units with 17 itemized rows, the 40-cable pack and other cable counts; confirm the free LED-SWITCH item and quantities. Do not equate row count with physical unit count.
- [ ] **TEMT6000:** confirm removal/correction of unrelated RGB-control copy.
- [ ] **M5Stack Mini Scale:** determine whether the appended two-data-pin/Red-and-Green/full-RGB paragraph applies.
- [ ] **BMV080:** confirm whether the free xS3-board offer is current and its actual quantity/fulfillment. No offer is enabled by this review.
- [ ] **RGB LCD Backlight:** resolve Blue/Green wording versus later full-RGB wording.
- [ ] **RGB LED module:** resolve 3.2–3.4 V specification versus 3.3 V and 5 V input statements using authoritative board-specific information.
- [ ] **NodeMCU HAT and x32/xLoRa HAT:** resolve their intended boards versus conflicting xC3m-shield copy.
- [ ] **xC3m board and other long descriptions:** approve short card/PDP summaries and distinguish interfaces from genuine board compatibility. Existing summary/specification/compatibility fields can hold corrected copy.
- [ ] **Documentation:** supply exact approved destinations for 13 Product Wiki labels without URLs; review 13 unverified resource candidates for reachability and product relevance. These are separate issue counts and may overlap products; they are not 26 missing products. Only one verified link was integrated. See [resource checks](../products/reports/resource-checks.json) and [follow-up](../products/reports/resource-followup.json).

`not_present` kit contents means a separate claim was not captured, not an empty package. Long claims held by current field bounds, including xC5 compatibility material, need deliberate editorial restructuring; do not silently truncate or increase limits to force them through.

## What can be fixed in code

These were the three gaps at review time. The later authorized code checkpoint implements them as described below; the checklist itself did not approve content or change data.

| Item | Evidence / actual limitation | Smallest complete follow-up and verification |
| --- | --- | --- |
| C1 — Core menu editability | Previously additive-only. Matching exact destinations now override core labels/position/visibility within existing header/footer groups; safe hidden-core markers survive projection. | Defaults and auth/menu structure remain. Draft persistence, resolution/projection and keyboard/mobile checks pass; live publication/withdraw testing remains deferred. |
| C2 — Support/brand copy editability | Four optional bounded Contact fields now supply Home support and footer text; Contact renders only supplied support copy. | Development function migration, Admin drafts, defaults, partial preview and validation checked. Existing company copy/production approvals remain open. |
| C3 — Useful private source review notes | Formatter now carries bounded allowlisted `detail` and held-item explanations, with recognizable private references omitted. | Bounds, malformed input and public exclusion checked. No existing notes were overwritten/backfilled, and no importer apply/rerun occurred. |

Routine approved copy, teams, FAQs, articles, resource links, category descriptions and product summaries use existing editors. They do not justify another CMS, AI-generated company facts, arbitrary HTML or a new page builder. Additional collection types/layout blocks would be separate development work only if requested.

## Suggested completion order and owner response format

1. Confirm company/contact details and resolve the named product issues; leave unanswered claims on hold.
2. Supply About/team and Help/FAQ copy; provide approved documentation and initial editorial content if available.
3. Approve navigation/support wording and dispatch the bounded code fixes independently of unanswered factual questions.
4. Enter approved drafts through existing Admin, review previews, then obtain explicit publication scope. This checklist does not publish anything.

For each product or page, provide: **name/slug · approved / corrections / hold · replacement text or exact source link · allowed photos/usage · reviewer/date**. For a team member add name, role, short bio and approved photo/link; for Contact add email, phone, address, hours and timezone. No API keys or private customer exports are needed.

## Evidence and limits

Root reviewed 15 completed live routes in the built-in browser: Home, About, Contact, Help, Policies, Solutions, Blog, Learn, its three resource collections, YouTube, Careers, QR Logger Coming soon, and the xC3m product detail. Loading placeholders were rechecked after completion. Eleven bounded anonymous API reads established published totals; no private drafts, inquiries, accounts or credentials were read for this inventory. Two Luna xhigh workers separately reviewed company render/schema contracts and source catalog conflicts. [Review evidence](verification/content-gap-checklist.json).

Only documentation is changed. No new external crawl, engineering/rights/legal certification, source/archive edit, CMS mutation/publication, code fix, build, load test or deployment is claimed. The previous application build/tests remain the evidence for `4a71e23`; they were not rerun for this documentation-only checkpoint. Checkout/payments, live email/billing, load tests, recovery operations and deployment remain deferred.
