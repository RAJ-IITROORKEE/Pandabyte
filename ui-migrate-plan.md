# PandaByte UI migration plan

Execution update, 26 October 2026: the owner resumed implementation. C1–C5 are complete for the bounded UI scope; actual evidence, adaptations, local commits and remaining manual/content gates are recorded in [ui-migrate-handoff.md](ui-migrate-handoff.md). The implementation sequence below is retained as the approved plan, not a new instruction to restart C1.

> **Execution resumed, 26 October 2026:** the owner explicitly instructed implementation. C1–C5 UI work is now authorized under this plan's guards. The planning-only wording below records the earlier checkpoint; it is no longer a hold on UI implementation. Backend, publication, commerce and deployment exclusions remain active.

**26 October 2026 · planning checkpoint · implementation not started.**

This is the execution plan requested in the latest human brief. Its companion [ui-migrate-handoff.md](ui-migrate-handoff.md) records actual progress and evidence. The current request explicitly says “without actual migration and implementation”; therefore this checkpoint researches, compares the existing localhost UI and prepares the two documents. It does **not** install dependencies/skills, change application code, regenerate Superdesign drafts or alter the backend. A later instruction to execute this plan resumes the UI work described below; the roadmap alone does not dispatch it.

“Admin panel backend” is interpreted here as the **administrative frontend/workspace**, because the same brief explicitly excludes backend changes. Keep all existing server behavior and security contracts. Do not resume catalog imports, content publication, checkout/payments, live email, billing, capacity/load tests, recovery operations or deployment.

## 1. Outcome and source of truth

Apply the selected PandaPulse design's visual language consistently to the current working site: precise typography, generous spacing, neutral surfaces, restrained emerald/mint actions, real product images, compact Lucide controls and useful feedback. Preserve the **entire current homepage hero**, including its circuit, label spacing, wording, buttons, responsive order, motion and accessible help. The existing homepage is already based on v26; this is not another hero redesign.

“Exact design” means matching approved layout/hierarchy/tokens/assets and responsive behavior. It does not mean copying prototype prices, stock, fake users, static arrays or cart behavior into the real app. Current validated published data, Clerk identity, permissions and non-purchasable source-observation states remain authoritative. Document necessary content/state differences in each comparison.

### Verified visual references

The authenticated official Superdesign CLI was read on 26 October. All six current documents match their saved local HTML. Versions and SHA-256 fingerprints are recorded in [reference-inventory.json](docs/ui-migrate-research/reference-inventory.json). Do not infer current versions from older Phase 4 evidence.

| Use | Current reference | Version | Local visual source |
| --- | --- | --- | --- |
| Primary visual anchor / product detail | [PandaPulse](https://p.superdesign.dev/draft/e5d5055d-1779-4480-bc8f-f94e5c9e5897) — the owner's newly supplied link | 9 | `.superdesign/review/screens/pandapulse.html` |
| Preserve implemented hero; align remaining landing sections | [Home](https://p.superdesign.dev/draft/011e75c8-d90c-40ed-aac8-bc39b8e2f1ba) | 26 | `.superdesign/review/homepage.html`; [implementation contract](docs/landing-v26.md) |
| Search/filter/product listing composition | [Catalog](https://p.superdesign.dev/draft/3e6f0e8f-4075-4527-8140-1a969c87ea67) | 9 | `.superdesign/review/screens/catalog.html` |
| About composition | [About](https://p.superdesign.dev/draft/7338e138-5c6c-442e-8c24-71f89d06c05d) | 8 | `.superdesign/review/screens/about.html` |
| Contact composition | [Contact](https://p.superdesign.dev/draft/67fead89-2de5-435a-9872-bba495f82742) | 9 | `.superdesign/review/screens/contact.html` |
| Admin shell/dashboard language | [Admin](https://p.superdesign.dev/draft/e9fb785b-89be-46d3-9ce8-62c31fb08caa) | 7 | `.superdesign/review/refined/admin-dashboard.html` |

Other existing page-family drafts are indexed in `.superdesign/screens.json` and [design delivery](docs/design-delivery.md). Fetch only the relevant current drafts before their implementation slice, record version/hash, and stop for narrow reconciliation if they differ. Reuse the existing project/canvas. No new generation, replacement imports, draft creation or credit spending is needed to implement this plan. Preserve `.superdesign/`, CAD/source archives and other-chat artifacts.

### Baseline actually observed

Baseline source: local HEAD `8178ce0`. The built-in Codex browser visited localhost Home, Catalog, exact-SKU search, the actual PandaPulse detail, Contact, About and the guarded Admin dashboard. The selected Superdesign product was also viewed. [Browser evidence](docs/ui-migrate-research/browser-baseline.md) separates these observations from future migration tests.

Three concrete gaps drive the work:

1. The live product page puts its H1 above the two columns; the selected draft puts the title/SKU/summary in the right column beside a contained image and breadcrumb. Keep its archived-source/non-offer panel when adopting that composition.
2. Contact/About currently use generic page-heading/document stacks. Contact/company records are unpublished in the observed baseline, so the redesign needs a deliberate empty layout as well as the future populated composition. It cannot fill these with facts from a prototype.
3. Admin has an existing 280px desktop rail and a working mobile drawer, but no desktop collapse/resize behavior. Improve its organization and interactions while retaining current capabilities, validation and data workflows.

## 2. Protected boundaries

| Preserve | Implementation rule |
| --- | --- |
| Current hero | Treat `HomeHero`, `HomeCircuit`, circuit geometry/CSS and `public/hero/` as protected. Inspect actual paths before dispatch. No library hero, replacement background, new text effect or circuit rewrite. Shared styling must leave its pixels/behavior unchanged; check it after any global/shell change. |
| Exact logo | Reuse `/brand/pandabyte-logo.png` through existing header/footer markup; preserve bytes, aspect, color and light backing. Never generate/redraw/filter it. |
| Data and content | Keep current published projections and conditional fields, actual source photos/alt text, real categories and explicit empty/error/unavailable states. No seed/import/backfill/publication or hardcoded parallel CMS. Preserve source archives and prepared media. |
| Commerce holds | The observed catalog has 42 SKU-bearing source observations, not current purchasable offers. Preserve non-offer wording/capture caveats and disabled purchasing; keep the two missing-SKU holds out of CMS. No price/stock/GST/shipping inference. No checkout/payment activation or historical ₹5,000 minimum. Counts are a dated baseline, not a permanent cap. |
| Identity and permissions | Clerk remains sole identity/session provider. Preserve real navbar identity, safe auth returns, red Logout, account/Agent/checkout gates, protected owner Admin access and server capability checks. A sidebar is not an authorization boundary. No mock session or role bypass. |
| Media and privacy | Keep canonical full-gallery/original delivery and the existing allowed 96/960 previews through `/api/media`. Preserve private/no-store and withdrawal/publication checks. No direct storage/Superdesign runtime URLs, new optimizer/CDN/shared cache or private source-review disclosure. |
| Forms and editorial | Preserve structured safe content, native labels/validation, live status/focus, API payloads, field bounds, concurrency/version guards, unsaved edits and retry semantics. Do not replace working forms with static draft markup. |
| Backend/configuration | No edits to `app/api/**`, migrations/RPC/RLS/storage, `lib/insforge/**`, auth/business validators, provider settings, `.env*`, `.insforge`, nonce/CSP/proxy/security policy, publishing logic or server data contracts. If a UI requirement needs one of these, record the dependency and stop that requirement. |

Page JSX may be rearranged around its existing typed props/server results. An API payload or server action contract must not change as an incidental presentation edit. New sidebar preferences may be local UI state only. No backend dependency is justified by the requested layout.

## 3. One visual system, both themes

Use existing `app/theme.css`, `app/globals.css` and CSS-module patterns. The runtime contract is **`data-theme`**, storage key `pandabyte-theme`, system preference fallback and existing listeners. Keep the current color values and protected `--pb-*` aliases. Do not introduce a parallel `.dark` controller, vendor theme provider or global token reset.

| Semantic value | Light | Dark |
| --- | --- | --- |
| Background | `#fafafa` | `#141414` |
| Surface | `#ffffff` | `#1c1c1c` |
| Foreground | `#171717` | `#fafafa` |
| Accent | `#146c43` | `#72e3ad` |
| Control border | `#737373` | `#737373` |
| Divider | `#e4e4e7` | `#303030` |

Reuse existing muted/action-text/status colors for their real contexts. Add a semantic alias only when necessary; do not change hero-affecting values to fit a vendor component. Verify rendered error, disabled, pending, hover, selected and focus contrast in both themes.

Proposed implementation defaults, adjusted to the frozen page reference during comparison:

- Keep system sans and existing monospace for SKU/code. Public H1 outside the protected hero generally scales around 32–40px; section titles 24–32px; body 16px with readable line length. Avoid turning every page into a giant hero. Preserve complete model/SKU information rather than clipping it to fit a card.
- Shared content max width 1280px; reading text about 65–75 characters. Start with 16px mobile gutters and existing desktop container spacing. Use the existing 4/8/12/16/24/32/48/64/112 spacing family, 8px controls and 12–16px panels. Content density differs between reading pages and Admin tables.
- Real product media uses `contain`, predictable framing and descriptive main-image alternatives. White-backed source photography is acceptable on dark surfaces. Preserve source pixels/transparency and never crop board pins or poster information.
- Use the existing named imports from **Lucide React 1.61.0 (ISC)**, normally 16–20px in controls, with one coherent stroke/size. Decorative icons are hidden from AT; icon-only controls have an accessible name. Do not add a second icon pack through Lightswind.
- Primary/secondary actions follow existing semantic button/link behavior. Loading/disabled states remain readable and stable in size. One primary action per region; source-only products do not acquire an active purchase CTA.

### Motion contract

Use CSS for ordinary color/border/opacity transitions, about 120–180ms; short open/close transitions may use 180–220ms. Scope properties explicitly instead of `transition: all`. Preserve focus indication and avoid layout movement under a pointer. Any entrance motion must leave content visible if JS fails and must not delay access to controls.

Do not add Motion/GSAP/Three/WebGL for simple cards, fields or navigation. Add a dependency only when a selected component demonstrably requires it and existing CSS cannot deliver the requested behavior. Existing hero motion is frozen. Reduced motion gets immediate/static states, not hidden panels or a broken transformed circuit. Existing animated logo pause remains keyboard-operable; never remove an accessibility control merely to imitate an older screenshot.

## 4. Tools, skills and selective library adoption

Use **UI/UX Pro Max** for hierarchy/reflow/contrast, **Ponytail** for smallest complete changes, **Impeccable** for a finishing pass, **Superdesign's official CLI** for exact reference retrieval, **Vercel React Best Practices** after multiple TSX edits, and **Vercel Verification** for the real browser/API/data journey. Read the installed Next 16 guides in `node_modules/next/dist/docs/` relevant to each change before coding. Source code and current project constraints override generic skill examples.

Use the built-in **Codex app browser** for localhost and reference comparisons; root owns the browser session. Reuse existing Node test scripts and current package manager. No new browser runner, MCP server, paid tool, hosted monitoring or plugin is needed. Discover current tool capabilities rather than claiming a nonexistent Superdesign MCP. Do not use OpenDesign for this migration.

### Lightswind: selected, not installed yet

The owner requested [Lightswind UI Library](https://github.com/codewithMUHILAN/Lightswind-UI-Library). The review pins public source **53ef2ee0cf211a794a3bb4b2ed1e62d3f0f2544a** (root package 3.2.2, MIT), while npm currently publishes **lightswind 3.2.5**. The exact published artifact and source are not interchangeable. Full source/install/license findings and immutable links are in [library-skills.md](docs/ui-migrate-research/library-skills.md).

Later installation candidate, **not executed in this planning checkpoint**:

```powershell
npm install --save-dev --save-exact --ignore-scripts lightswind@3.2.5
```

Root must recheck artifact/advisory metadata, dependency compatibility and the resulting manifest/lockfile diff at execution time. Stop on a conflict; no `--force`, `--legacy-peer-deps`, stack downgrade or unrelated dependency refresh. Do not present a package install as rendered integration.

Do **not** run blanket `lightswind init`, category/full installation, `init-cursor`, `mcp init` or hosted Pro setup. Reviewed `init` installs the entire free collection; its CLI can fetch mutable registry data, run remote-derived dependency shell commands and bypass peer errors. Vendor global CSS also conflicts with PandaByte's full-color tokens and `data-theme`. These are specific reasons for a selective path, not permission to substitute an unrelated theme.

Pilot one reviewed **public MIT Card or Badge** on a non-hero surface. Freeze component source URL/hash and retain notices; copy only required local source under a small existing-compatible UI location. Adapt to the current CSS/token/Lucide patterns. Resolve or avoid the optional `tailwind-merge ^2.6.1`/Tailwind 4 mismatch without adding an incompatible utility. Do not import upstream USD helpers, random-ID utilities, a root side-effect package import or vendor global theme styling. Keep server rendering; add a client boundary only where the selected interaction needs one.

After the pilot passes type/build/browser checks, reuse it for genuinely repeated surfaces. Prefer existing forms, disclosures and focus-managed drawers; the reviewed vendor dialog lacks a complete focus/Escape contract. Animated inputs, 3D effects, custom cursors, AI SDKs and replacement hero/nav templates are not selected. Public repository MIT source is separate from hosted **Pro** entitlement; no paid asset or purchase is approved. Retain the current Lucide ISC notice and MIT notices for any copied source.

### ECC and other frontend skills

The owner supplied [affaan-m/ECC](https://github.com/affaan-m/ecc). Current reviewed commit: **25278e7d7b6cf6e6a4e7a6c8e10f14ff22f0eb5b**, MIT. Keep the existing three ECC copies and their historical pin intact; do not install/update the whole collection.

Recommend only **`frontend-a11y`** as an additional documentation-only skill after execution is resumed. Its pinned file/hash and targeted installer command are in the research note. Preserve its MIT notice and add a new manifest entry without rewriting old provenance. Existing UI/UX Pro Max, Impeccable, React and Ponytail guidance already cover most of `make-interfaces-feel-better`, `design-system` and `frontend-patterns`; these can remain reviewed references. No ECC npm package, hooks, global rules, learning runtime, external reference checker, auto-update or MCP is needed.

Skill text never authorizes installation, backend changes, access grants or a replacement Clerk flow. Report what is actually installed/discoverable versus merely proposed. No skill/library installation was performed while writing this plan.

## 5. Page-by-page migration contract

The full route/source/caller map is [frontend-inventory.md](docs/ui-migrate-research/frontend-inventory.md). Preserve useful URLs, redirect/404 distinctions, metadata, one main H1, loading/errors and published-only content.

| Priority | Pages / existing source family | Planned UI result and essential checks |
| --- | --- | --- |
| P1 | Home `/`: `app/page.tsx`, `components/home.module.css`, shared ProductCard/FAQ | Preserve hero exactly. Match the v26 section sequence and selected theme for logos → categories → hardware → support → FAQs. Improve lower-section spacing/card rhythm using real current data. Keep latest-two semantics, honest empty FAQs/support and pause behavior. |
| P1 | Contact `/contact`: existing page + `ContactForm`/challenge | Use the matching reference's balanced information/form composition, with actual published details on one side and the existing form on the other where space permits. Stack at small widths. Preserve name/email/optional phone/subject/message, labels, required-field focus, Turnstile loading/error/pending and unknown-outcome wording. Offices only here. No new attachment upload or delivery promise: if the current submission contract lacks attachments, that feature is a separate backend dependency, not a decorative working field. No inquiry submission in a read-only UI comparison. |
| P1 | About `/about`: page, `PublishedDocument`, `TeamGrid` | Company/mission/body, actual team, verified brand/source content, contact action and eligible published FAQs using existing fields only. Existing missing-content state gets intentional typography/spacing; do not invent mission/team/sponsors or expose drafts to fill the design. If a requested section has no supported data field, omit it or record the contract gap. |
| P1 | Product detail `/products/[slug]`: `ProductGallery`, `ProductVariantPanel`, `ProductDetails` | Adopt selected PandaPulse gallery/right-summary/title/SKU/breadcrumb composition. Keep original gallery bytes and keyboard thumbnails. Specifications/compatibility/contents/resources appear only when present. Source observations retain explicit non-offer/date/source wording and no purchase controls; operational state remains conditional on the existing authoritative props. No reviews invented to fill the prototype's empty review block. |
| P1 | Catalog `/shop`, existing category aliases | Compact search row, URL-driven facets, active state/reset, count and responsive product grid. Proposed desktop rail 192–224px; 2–3 result columns depending available width, with 1 column at 320 and 2 at tablet where readable. Filters become an accessible disclosure/drawer on narrow layouts. Preserve current GET/server search, exact SKU/model, sort/paging, back/forward and invalid/no-result states. Do not client-fetch the whole catalog or change query semantics. |
| P2 | Solutions, Learn collections/resource detail, YouTube, Blog | Reuse one editorial/list/detail family and actual published fields. Keep search/topics/pagination, Coming soon/404 distinctions and source links. Preserve click-to-load privacy-enhanced YouTube behavior; no autoplay, invented entries or external thumbnail dependency. Styling applies to current resources, not automatic publication of the old three-video prototype. |
| P2 | Help, policies, projects/upcoming/careers and valid published generic pages | Consistent reading/FAQ/support/empty-state treatment. Native disclosures, anchor/redirect destinations and real policy copy remain. No legal/commerce terms or hiring claims are approved by a visual migration. |
| P3 | Account, Clerk sign-in/sign-up/settings, Cart, protected Agent/checkout | Theme existing working surfaces and unavailable states. Preserve real identity, optional unverified contact phone, address/file privacy, focus recovery, cart quotes/merge/conflicts and safe auth returns. No new order/history/payment UI or functional Agent. No owner profile/address/file mutation or logout merely for screenshots. |
| P3 / independent after shared shell | Admin dashboard, products/categories/content/media/inquiries/pricing/inventory/users | Apply the same theme with denser operational spacing. Preserve real counts, status, filtering/search/pagination, forms, draft previews, permission/version guards and error focus. No fabricated revenue charts, fake rows, published fixtures, stock/price changes, notification send or membership edits. See sidebar and ownership contracts below. |
| Every slice | Error, loading, empty, unavailable, not-found and permission states | Style the actual states with readable messages and useful current actions. Safe errors stay generic; do not expose provider errors, digests, database IDs or session/Clerk subjects. Skeletons do not conceal a permanent failure. |

## 6. Admin workspace and sidebar

Current source already has a guarded shell, 280px desktop rail and focus-trapped drawer below 768px. Reuse its behavior, capability filtering and actual destinations. The migration must not replace it with a static template or copy old nonexistent `/admin/content`/`/admin/login` routes from design labels.

Proposed sidebar behavior:

- At **1024px+**, dock the expanded rail (default about 256–280px). Add collapse/expand and an explicit horizontal resize handle. Proposed expanded bounds 224–360px; clamp to available viewport so main content remains usable. Keep content independently scrollable without hiding the last navigation items.
- At **768–1023px**, default to a compact labeled-on-focus icon rail or the existing drawer when content cannot fit. Use one deterministic breakpoint rule agreed in C1; no hover-only navigation. Do not squeeze wide editor/table content into a narrow remainder.
- Below **768px**, retain the existing modal drawer's trigger, initial focus, trap, Escape, backdrop dismissal, scroll lock and focus return. Disable desktop resizing; no offscreen persistent rail or drag-only control.
- Interpret “draggable” as **width resizing of the docked rail**, not arbitrary floating panels or reorderable permissions/navigation. Pointer capture and cancellation must clean up; keyboard users get a named vertical separator with current/min/max width, Left/Right steps and reset control. Provide collapse/reset buttons without requiring dragging. Avoid layout animation during drag; honor reduced motion.
- Expanded/collapsed groups have real buttons, `aria-expanded`, active route indication and stable accessible link names. In a collapsed rail, tooltip text is available on focus as well as hover. A hidden group must not hide the only route to a permitted module.
- Store only allowlisted/clamped layout preferences locally, with a versioned key and storage-failure fallback. No role/content/session information in preferences and no backend persistence. Keep state isolated from `pandabyte-theme`. One focused test covers corrupted/stale widths plus narrow-screen fallback if persistence logic is introduced.

Keep Admin list/editor behavior: unsaved-change guards, validation summaries/focus, human names, draft/publication status, concurrency conflicts, separate lifecycle controls and private preview. Existing API guards remain authoritative. Tables may scroll in a named region; only introduce mobile record cards where a real table becomes unusable. Do not hide important status/actions behind motion or hover.

## 7. Subagent routing and bounded parallel execution

The orchestrator is **GPT-6.1 Sol** as configured in this chat. Workers follow the human's routing policy; record actual model/effort with each task rather than claiming a switch that the API did not perform.

| Work | Requested configuration | Ownership / output |
| --- | --- | --- |
| Research, plan critique, compatibility/security assessment, test design, final verification review | `gpt-6.1-sol`, **xhigh** | Evidence/report or bounded test/review task; one browser operator (root), not three independent sessions fighting the same account. |
| Medium UI implementation / component integration | `gpt-6.1-sol`, **medium** | One explicit component/page-family file set; preserve current contracts. |
| Light repetitive polish, icon/label/empty-state adjustments, document/link checks | `gpt-6-luna`, **xhigh**, Fast scheduling when supported | Small deterministic file set/checklist. This tool exposes model/effort but no Fast/service-tier parameter; report Fast as unverified unless the app actually configures it. Do not claim it from the model name. |

Use `fork_turns: none` with an explicit brief when assigning a requested override. Each brief includes goal, exact owned files, existing props/contracts, protected files, completion evidence and forbidden actions. Available concurrency is **root + three workers**. Keep root available to integrate and communicate; queue tasks when slots are full. No duplicate audits/tests or splitting the app architecture just to fill slots.

### Dependency order and checkpoint gates

| Checkpoint | Work and parallel lanes | Required exit |
| --- | --- | --- |
| **C0 — plan/reference/baseline** | Root browser/reference retrieval; three Sol xhigh workers independently inspect library/skills, frontend routes and validation. | This plan + handoff; pinned references, current source inventory, real baseline observations and explicit open gates. No implementation pass claimed. |
| **C1 — shared contract and library pilot** | Root owns `package.json`, lockfile, global/theme/frame changes and license ledger. One medium worker can implement the reviewed local non-hero pilot in separately owned files after root fixes its props/style contract. | Successful bounded dependency/source adoption, no peer bypass/global theme reset, lint/type/build/focused checks and both-theme browser review of pilot + protected hero. Freeze shared primitives/tokens before page workers dispatch. |
| **C2 — priority public pages** | Three independent medium lanes: **A** landing below hero; **B** Contact + About together because they share editorial CSS; **C** Catalog + product detail together because they share catalog CSS and ProductCard. | Each lane matches its reference with actual data, carries unique/empty/error states and passes its focused + browser gates. Root integrates serially and checks shared callers before marking the slice complete. |
| **C3 — remaining families / Admin shell** | As slots free: editorial/Learn/Help/policies; account/auth/cart/unavailable states; Admin shell/sidebar. Separate files only; root handles shared-frame/style requests. | Actual routes and guards preserved, no new functional/backend scope, sidebar keyboard/pointer/mobile behavior verified. |
| **C4 — Admin workflows** | After shell/styles freeze, bounded workers can handle `record-screens.tsx`, `operations.tsx`, and roles separately. One owner/root integrates shared Admin CSS; workers must not edit the same stylesheet concurrently. | Real existing list/editor/media/permission/error states remain usable; no data/publication/owner-access changes. Sidebar must not conceal working actions. |
| **C5 — integrated verification and handoff** | Root runs the browser/build sequence; Sol xhigh reviews failures/evidence; Luna xhigh checks document/route/asset links. | Available required checks pass; unresolved manual/provider/data gates explicit; handoff names exact changed files, reference versions, actual commands/results and local commit if the resumed scope includes it. No full release/Phase 6/production claim. |

Root alone owns shared tokens, `app/layout.tsx`, SiteFrame/header/footer, package/config/lockfile, reference selection, integration, browser, evidence and checkpoint commits. Give `catalog.module.css`, `editorial.module.css`, `home.module.css` and shared Admin CSS exactly one writer each. Account/roles-specific CSS can have their own owners. Do not concurrently edit one shared file under line-range “ownership.” Re-read status/diff before integrating because another chat may be changing backend files; never overwrite or stage its work.

## 8. Verification: compare the actual app, then fix owned UI causes

The detailed [validation contract](docs/ui-migrate-research/validation-contract.md) is part of this plan. A future UI slice is unfinished without rendered checks; reading draft/source HTML does not prove a match.

1. Root uses the built-in browser against `http://localhost:3000` and the pinned Superdesign reference. Start/reuse one local server; do not run production build and a competing dev process against the same `.next` output. Record source commit, process mode and actual CSS viewport/theme.
2. For each genuinely changed layout family, compare **320, 768, 1024 and 1440px × light/dark**. Record requested and observed sizes. Check opened/error states, containment, image decoding, wrapping, no overlap/document overflow, action visibility and one main H1. Other routes sharing the family get targeted content/link checks; expand only when they differ or fail.
3. Actually exercise keyboard navigation/disclosures/drawers/resize/gallery/filter/reset. Verify focus visibility/restoration, labels, loading/error/status and all affected API/UI journeys without changing their business contract. Verify theme across navigation/reload and keep owner session intact. Browser interaction, DOM/AX and source review are distinct evidence methods.
4. Record a visual-difference list per comparison: geometry/tokens/spacing, genuine UI defects, and intentional differences for real data/auth/empty/source-only states. Fix the owned UI cause and retest the affected case before continuing. Never “fix” protected backend behavior to make a screenshot match.
5. Run relevant focused checks while editing; reuse existing tests. After the final code change run `npm run check` and `npm run test:unit`, plus applicable read-only localhost auth/shell/security/diagnostics checks in the correct server mode. No new snapshot tests that merely repeat class names. New sidebar preference/geometry logic needs one focused behavioral test/assertion.
6. Do not bulk-run `test:*`. Publishing/storefront/access/role/contact/cart/notification/source-observation harnesses can mutate users, grants, content/media or publication. UI authorization does not authorize those reruns, importer/backfill, new fixtures or direct provider probes. No-write UI checks are the default; a disposable draft/upload budget must be explicitly included before any such operation, with never-published provenance and cleanup.
7. Actual browser zoom/text resizing, OS reduced-motion runtime and screen-reader speech remain separate manual gates. A 320px viewport, CSS `@media` inspection, ARIA presence or shortcut with no observed zoom change cannot be marked as those passes. Re-discover tool support; record blocked/not-run honestly and restore preferences when a supported controlled check is performed.
8. No load tests. If needed for an authorized performance slice, use one fixed existing **sequential** before/after readiness probe in equivalent production mode, preserving no-store and original-media contracts. Do not infer LCP/CLS/INP, p95, 100-visitor capacity, certification or production speed from sparse localhost timing.

### Failure and completion policy

Use `not-started`, `in-progress`, `blocked`, `failed`, `passed` or `accepted-deviation` in the handoff. An unavailable check is not passed. A known available-check regression blocks that slice. Save sanitized evidence and stop the dependent work; report backend/provider issues to their owner without editing backend/configuration in this UI scope.

The planning baseline surfaced a **development hydration warning about script nonce attributes**. Record/reproduce it before code migration and distinguish it from a new regression; do not weaken CSP, suppress warnings broadly or change security configuration under this plan. Current dev compilation latency is not a production benchmark.

Future evidence should use `docs/verification/ui-migrate-<checkpoint>.json` plus bounded screenshots/logs, with route/state, reference version/hash, source/tested commit, viewport/theme, actions, outcome, observed warnings and evidence method. Exclude credentials/raw customer/provider bodies/database/session IDs and private source-review records. Prefer public-page screenshots; keep any identity-bearing local captures private unless redacted safely for sharing.

If a slice fails, revert only its owned UI diff after inspecting current work; no hard reset, blanket checkout, force push, data restore or content republish. Root stages/commits only its verified files when execution/commit is resumed, leaving other-chat design/CAD/backend artifacts alone. A local UI checkpoint is not release approval.

## 9. Definition of done for the later migration

- All existing page families in the inventory use the coherent selected visual language; priority pages and Admin are rendered/interactive with current data, both themes and responsive states.
- Current hero/logo, real content/identity, route semantics, auth/permissions, forms, media privacy/original-byte behavior and non-purchasable observations remain intact.
- Lightswind adoption is a real reviewed local component integration with retained terms and a passing dependency/browser gate, or an explicitly unresolved blocker; no false “installed/applied” claim. Added skill provenance is recorded.
- Root has fixed all available required UI-check failures, recorded actual command/browser evidence and listed manual/unavailable gates. No backend/configuration/data changes are hidden in a style commit.
- `ui-migrate-handoff.md` is updated at every checkpoint, including file ownership, changed surfaces, tests, fixes, evidence, next dependency and exact commit when applicable. The owner’s normal session/access is retained. No deployment or full production-readiness claim follows.

For the current planning checkpoint, only C0 is eligible to close. C1–C5 stay **not started**.
