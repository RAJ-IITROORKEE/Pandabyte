# Admin insights and account-table layout — 1 November 2026

The owner selected the authenticated [Unfiltered IITIans Users page](https://www.divyanshudarshna.com/admin/users) and supplied two card references as structural inspiration. The existing PandaByte Supabase preset, Outfit typography, neutral surfaces, green accents, navigation structure and exact logo remain intact. This is an application-source checkpoint, not an Agent release or deployment.

The review found three gaps: flat summary cards lacked supporting context, the user directory lacked sorting/filtering/export tools, and the permanent storefront shortcut crowded the sidebar footer. The implementation shares one compact card component across Users, Dashboard, Products and Categories, with a label, restrained icon marker, prominent value and explanatory line. It does not copy the reference's revenue, subscription counts or growth claims.

## Behavior and data scope

- User summary cards use the existing global account/role statistics. Failed reloads display unavailable values; loading never becomes a fabricated zero. Role badges retain text labels: Admin red, Customer neutral, Catalog blue, Editor green, Support amber, with stable subdued custom-role tones.
- Account search remains server-side across the directory. Role/verification filters, sort headers and CSV apply **only to the loaded page**, clearly stated in the toolbar. Page sizes are 10/25/50. API bounds and global pagination remain unchanged; this is not full-directory sorting or an unlimited export.
- CSV downloads contain the displayed name, email, verification, role, order count and update date. Cells are quoted/escaped and spreadsheet formula prefixes neutralized. Internal identifiers, versions, avatar URLs and protected flags are excluded. Export is disabled while loading, search is pending, errors remain or no rows match. Download object URLs are revoked after the click has had time to complete.
- Dashboard cards show actual permission-filtered record totals from existing endpoints; Products uses the existing non-archived aggregate. Category matching totals follow the current filters, while published/draft/archived cards explicitly say current page. The existing 500-group product aggregate limit is stated. Unknown counts remain unavailable. No database or provider-statistics changes were made.
- The sidebar footer now has an accessible ellipsis disclosure containing Open storefront. It closes on outside pointer/focus and Escape, returns keyboard focus, and supports the narrow rail/mobile drawer. Escape is handled before the mobile drawer shortcut so only the footer closes first. Clerk's account control remains available.

## Verification

Three Terra 6.1 high subagents handled Users UI, shared stats and independent review. Review fixes included UTF-8 labels, stale-stat handling, delayed CSV cleanup and the mobile Escape interaction. Focused unit tests, ESLint and TypeScript passed.

Built-in-browser checks on localhost:3000 verified descending order-count sorting, Admin filtering, an empty verification result with disabled export, and an actual two-row filtered CSV download. The downloaded header/row count and absence of internal identity/version fields were checked locally without publishing its contents. Shared cards render actual Dashboard, Products and Categories data. Light/dark, 390px mobile and 800px rail layouts were reviewed without document overflow; the table scrolls inside its region.

Footer keyboard/pointer opening, outside dismissal and Escape were checked. At the 800px development rail, Next.js's floating dev-tools indicator overlaps the footer trigger's center; a DOM hit-test identified that development overlay. The footer opens by keyboard and its flyout is not clipped; desktop/mobile pointer checks passed. No production pointer-coverage claim is made from that overlapped local coordinate. The viewport and original dark preference were restored.

No account/role/order mutations, publication, Agent inference, payment, invoice or deployment operations were performed by these UI checks. Existing ADMIN-only role administration, protected/self-account guards, typed deletion confirmation, version conflicts and server permissions remain unchanged. The independent final source review found no blockers; it is separate from browser/test evidence.

## Hosted follow-up

The owner subsequently authorized a coordinated deployment preserving the Panda Agent integration. The combined release is now live, with the Admin/menu source through `cde6262`. Live browser checks repeated sorting, filters, CSV download, all four card pages, footer/storefront navigation, the persistent Admin shortcut and mobile keyboard/layout behavior. No role/account/order mutations or model requests were made by this verification. See the [combined manifest, deployment and limits](vercel-preview-deployment.md).
