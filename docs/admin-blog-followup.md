# Admin Blog follow-up — 27 October 2026

Blog uses the shared Mono content table for title/slug search, status filtering, title/update sorting and bounded pagination. Its article editor labels the body appropriately, supports block reordering and applies the existing author/tag input limits. Drafts, publishing capabilities and public rendering retain their existing behavior.

Development migration `20261027173003_admin-blog-table.sql` adds a read-only, `content.edit`-gated Blog table RPC. Both SQL and the private no-store API check access. Rollback returns Blog to the earlier generic list and revokes the new RPC in a forward migration; no article content need be changed.

The isolated production build and focused contract checks passed. Development integration used 11 owned unpublished Blog drafts to verify private editor reads, search, filters, sorting, pagination, invalid requests and access denial; all fixture drafts and temporary identities were removed. The built-in browser showed the genuine empty Blog list and the article editor. No real content was edited or published.

Open review items include Blog author/tag normalization at the direct database boundary, featured-image ordering and per-image alt descriptions. Mobile viewport and real screen-reader checks were not repeated here.
