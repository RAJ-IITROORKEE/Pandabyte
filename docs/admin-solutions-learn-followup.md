# Admin Solutions and Learn follow-up — 27 October 2026

Solutions and Learn resources now use the private Mono content table, with title/slug search, status filtering, title/update sorting and bounded pagination. Their editors provide labeled, reorderable content blocks. Learn also explains position ordering, the URL limit and that related-product associations are saved but not currently shown on product pages. No existing content was modified or published.

Development migrations `20261027173006_admin-solutions-table.sql` and `20261027173007_admin-learn-table.sql` add read-only, `content.edit`-gated RPCs; API responses are private/no-store. A forward rollback returns the callers to the generic lists and revokes the new RPCs without modifying content records.

Isolated production builds, focused contract tests and lint passed. Separate development integrations used 11 owned unpublished drafts per module to verify search, filters, sorting, pagination, permissions and public draft privacy; both fixture sets and temporary identities were removed. A Solutions cleanup guard was corrected to compare JSON object values independently of key order, then cleanup and a full rerun passed. The built-in browser checked the actual empty lists and new editors.

Learn does not yet filter the Admin list by collection, and its related-product links are not presented on product pages. Public content was not published or revalidated, and mobile viewport and real screen-reader checks were not repeated.
