# Admin backend and frontend synchronization plan

Audit date: 27 October 2026 (Asia/Calcutta). Scope: development Admin UI, its APIs/database, and the public consumers of Admin-managed data. This chat owns Admin/backend; the FRONTENT-UI chat owns storefront implementation. This document is a plan, not authorization to enable deferred commerce, email, recovery or production services.

## Evidence checked now

- Source review traced Admin screens, API handlers, validators, SQL migrations and public readers. Two bounded Luna xhigh reviewers independently checked content synchronization and operational modules.
- The existing preflight verified the linked development InsForge project and development Clerk instance. Remote migration history includes `20261027173009_require-team-name.sql` and `20261027173008_reserve-page-routes.sql`.
- Aggregate development inventory: 42 products published; five categories published and one archived; six FAQs published; three videos published. No other CMS kinds currently have records. Orders and Inquiries each contain zero records. Empty CMS collections are content gaps, not evidence of missing CRUD backends.
- Local public APIs returned 200 with 42 products, five categories and three videos, matching the active published database inventory. Anonymous Admin access, Orders, Inventory and Inquiries endpoints each returned 401 with private/no-store headers.
- Local Contact configuration passes the configuration validator in official test mode and matches `http://localhost:3000`. Inquiry email is disabled. No Razorpay environment variable names are configured locally. Values, recipient identities and secrets are omitted from this report.
- Browser automation is disabled in Work settings. No fresh signed-in browser interaction, mutation, publish/withdraw cycle, provider-delivery check, role mutation or production test was performed in this audit. Earlier tests remain dated evidence in the module documents.

## Module status

| Admin area | Backend and Admin wiring | Public frontend synchronization | Remaining work |
| --- | --- | --- | --- |
| Access and Users/roles | Clerk session + InsForge capabilities; versioned role changes, protected owner and private APIs implemented | Same Clerk identity and private account boundaries | Production identity/security verification; this is a role manager, not a complete customer CRM |
| Dashboard | Real capability-scoped record counts and chart | Admin only | Trend/activity/revenue analytics are not implemented; do not fabricate history |
| Products and pricing | CRUD, draft/publish/archive/version controls; server search/filter/sort/paging; product-integrated price writes; statistics | Published products/prices feed Shop, details and cart review; rich text, media, DOCX and permitted models have consumers | Real stock, tax and purchase eligibility remain separate gates; confirm any remaining imported content/rights |
| Categories | CRUD, hierarchy, images/rich description and server table controls | Published category images/descriptions feed Home/Shop; currently displayed as a flat list | Parent relationship is stored and dependency-checked but not used for public nesting; confirm whether nesting is desired |
| Orders | Private searchable/filterable/sortable/paginated ledger exists; sidebar/search, screen and API require `staff.manage` | No order-placement or customer-history pipeline | Immutable order snapshots, creation, payment/webhook/reconciliation, fulfillment and approved operating flows |
| Inventory | Real variant/balance queries; versioned/idempotent adjustments for eligible managed variants | Source stock is deliberately masked as unknown; cart review stays available under current contract | Owner stock counts and audited initialization workflow for source products; later atomic reservation/release |
| Inquiries | Contact persistence, Admin search/filter/sort/paging, versioned status/notes and notification state | Contact submission endpoint is connected with local test protection | Optional attachment is not in current form/API contract; real protection/notification delivery requires a separate approved setup |
| Pages | CMS CRUD/publication, custom routes and composed Home/About/Help/Policies consumers | Published-only reads; custom compositions consume specific fields | No page content entered; preview represents the record rather than the full composed page. Reserved-route fix is already applied |
| Blog | CRUD/publication and server table controls | Blog index/detail consume published records | No articles entered; Blog author/tag write validation and cover ordering improved; public tag Unicode-length and gallery alt metadata remain frontend coordination items |
| FAQs | CRUD/publication, placements and server table controls | Home and Help consume placement-filtered FAQs | About/Contact/Product/Solutions placements are saved but have no matching public sections; formatted blocks override plain answer |
| Team | CRUD/publication and server table controls; required public-name write/SQL guard applied | About consumes published profiles | No profiles entered. Existing parser remains legacy-readable; no invented team identities |
| Contact settings | Fixed singleton slug; bounded contact/support/footer fields | Contact, Home support and footer consume published settings | No singleton entered; the list now offers Edit when an active singleton exists; contact inbox configuration is independent of public email |
| Navigation settings | Fixed singleton slug and versioned publishing; visibility/label/order overrides resolved by exact destination | Header/footer read resolved data but restrict it through fixed presentation | Header fixed Products/Solutions/Shop/Company labels/order bypass primary controls; footer whitelist omits Admin-supported/default Blog/Learn/product/custom links. Coordinate both with FRONTENT-UI |
| Solutions | CRUD/publication and server table controls | Solutions index/detail read published records | No records entered; future products remain Coming soon |
| Learn resources | CRUD/publication, collection/product associations and server table controls | Collections and resource pages consume published content | No resources entered; Admin collection filtering is implemented; related-product associations are not rendered on product pages |
| Videos | CRUD/publication and private server-backed table with search, status, sort and pagination | Published videos feed YouTube index/detail and embeds | Related-product associations lack a product-page consumer; review existing differences between Admin, database and public YouTube URL parsers |
| Media | Authorized upload/metadata/publication/archive and private/published delivery; image/DOCX/GLB validation | Published media references render across catalog/editorial pages | Least-privilege production credential review; recheck preview consistency when adding new upload surfaces; rights holds remain private |
| Workspaces, Chat, AI Chat, notification bell page | Explicit preview routes | No live services | Future scope, not a baseline backend defect. Inquiry email outbox is distinct from the notification bell page |

## Implementation sequence

### 1. Close Admin-to-storefront contract gaps

0. **Completed:** Orders sidebar/command search now use the authoritative `staff.manage` screen/API guard; role labels clarify Inventory and Orders access. Historical operations documentation points to the current contracts.
1. Agree the current header/footer contract with FRONTENT-UI. Keep Admin destination/label/visibility/order semantics consistent with the new menu grouping and remove or deliberately document the footer destination restriction. That chat implements public rendering; this chat handles schema/API/editor adjustments if needed.
2. **Completed:** Admin Videos reuses the bounded content table with search, status, sort and pagination; existing video publishing and YouTube URL validation remain in place.
3. **Implemented:** Learn collection filtering validates the selected collection and filters in the database before counting and pagination. Older drafts without a collection fall back to Embedded systems.
4. **Implemented:** Contact and Navigation lists offer Edit for an active singleton and New after an unfiltered lookup confirms none exists; database uniqueness/version protections remain authoritative.
5. **Partially completed:** Blog author/tag database write validation now enforces canonical metadata; the Admin editor supports cover image uploads and ordering and limits inline image alt input. Public tag Unicode length and gallery alt metadata need FRONTENT-UI coordination; Blog image-block alt database validation now matches the Admin write contract.

Exit: disposable unpublished drafts test create/edit, filtering, ordering/paging, permissions, stale versions and cleanup. Verify the affected Admin screens in the browser. No real publication is implied.

Learn filter checkpoint, 27 October 2026: migration `20261027173011` applied to development; focused unit tests, TypeScript, scoped lint, and disposable-draft API integration passed. The integration checked collection counts, pagination, invalid filters and customer access, then cleaned up its drafts and identities. Browser verification remains open: the in-app browser reported local browser use disabled. No content was published.

### 2. Complete selected content relationships with FRONTENT-UI

1. Define whether FAQ placements outside Home/Help should appear and where; implement only selected destinations.
2. Define the product-page placement for related Learn resources/videos; public consumers belong to FRONTENT-UI. Keep published-only and product ownership/reference checks.
3. Review/source actual Pages, Blog, Team, Contact, Navigation, Solutions and Learn content. Empty collections should keep honest empty states. Publication requires the owner's content approval.
4. If the optional Contact attachment is still required, agree allowed formats/size, private storage, access/retention and abuse checks before building it; reuse safe upload patterns without exposing inquiry attachments publicly.

Exit: a documented field-to-page map and separately approved content/publication check. Preview/draft tests are not a live publication claim.

### 3. Initialize verified inventory when counts arrive

Owner input: SKU + verified on-hand quantity + count date/source, plus handling of source observations becoming managed purchasable products.

Implement one versioned/idempotent stock-initialization workflow with audit reasons and source provenance preserved. Distinguish unknown from recorded zero. Test stale counts, duplicate submissions, unauthorized access and source guards before recording real counts. Keep stock reservations and orders disabled until commerce is separately resumed.

### 4. Resume commerce only after decisions and authorization

Required: merchant/dispatch state, product HSN/GST rates, inclusive/exclusive pricing, shipping/delivery policy, verified stock and Razorpay test credentials/webhook configuration. Do not assume a uniform GST rate or free shipping. The historical INR 5,000 minimum remains removed under the latest decision.

Sequence: server quote/tax/shipping and immutable snapshots → atomic stock reservation → order creation/idempotency → Razorpay test integration → signature-verified webhooks and reconciliation → Admin fulfillment/status/history/customer linkage → approved cancellation/refund/invoice flows. Replace or deliberately integrate the initial ledger; do not create a second order authority.

Exit: changed-price, stock contention, expiry, duplicate/forged/out-of-order webhooks, failure/cancel/retry, late success, customer isolation and staff access tests. No live charges or production enablement are implied.

### 5. Notification and release gates

- Keep live inquiry email disabled until provider support/entitlement, sender/recipient, retry ownership and an authorized delivery test are settled; preserve uncertain-outcome safeguards.
- Verify production Clerk/InsForge integration, staff protection, least-privilege media access, real Turnstile domains, monitoring/alert ownership and audit retention.
- Establish recovery objectives and authorize an isolated database-plus-file restore rehearsal; recovery remains deferred now.
- Measure the agreed 100 simultaneous mostly-browsing workload with approved scope/budget. Finish manual accessibility checks. Production deployment remains a separate approval.

## Working rules and verification

Root owns shared migrations and integration. Use bounded workers with explicit file ownership and the latest applicable human model selection; this audit used Luna xhigh. Coordinate any public component change with FRONTENT-UI. Do not reset the shared worktree or alter source/CAD/Superdesign artifacts.

For each implementation checkpoint: trace callers → agree API/data contract → implement smallest complete slice → unit/SQL/API/access/version tests → disposable draft cleanup → browser check when enabled → concise evidence and local commit. The repository's earlier successful builds/tests are not a fresh full-system certification.


Blog validation checkpoint, 28 October 2026: development migrations `20261028100000` and `20261028100001` preflight existing Blog drafts and revisions and enforce canonical author, tags and image-block alt values on writes without rewriting content. No Blog records existed at the initial development check. Read-only SQL probes checked representative accepted/rejected values and helper privileges; the full SQL assertion scripts were not executed because the CLI rejected DO blocks. Admin validation/table tests, scoped lint and TypeScript passed. In the signed-in browser the new editor reported missing required fields and allowed unsaved image reordering. No article was saved or published. Public tag length uses UTF-16 where the write contract counts code points, and gallery images use article titles rather than specific media alt: both require coordination with FRONTENT-UI.


Blog rich editor checkpoint, 28 October 2026: owner approved connecting the Blog detail renderer without changing the storefront design. The Admin editor reuses the bounded rich editor and private preview; legacy blocks remain readable and unsupported conversions retain their block editor. Development migration `20261028100002` adds validated optional rich content, retains existing media checks and removes article bodies from list responses. Focused tests, scoped lint, TypeScript and a disposable unpublished draft API round-trip passed; fixtures and identities were cleaned. Browser verification covered the editor controls and unsaved private preview; public rendering of a published rich article and actual image upload were not exercised. No content was published. Public tag Unicode-length and gallery-image alt metadata remain frontend follow-up items.
