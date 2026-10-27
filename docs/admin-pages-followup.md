# Admin Pages follow-up — 27 October 2026

Pages now has a Mono table with database-backed title/slug search, draft/published/archived filtering, title/update sorting, bounded pagination and page-size controls. The existing versioned editor and publication permissions remain authoritative. Pages content blocks can be moved up and down, and the editor explains that its private draft preview covers the page record rather than the full custom Home, About, Help or Policies composition.

Development migration `20261027173002_admin-pages-table.sql` adds a read-only `content.edit`-gated RPC. The endpoint checks the same capability and uses private/no-store responses. No actual content was changed or published. Rollback removes the new route/caller and revokes the unused RPC through a forward migration.

The isolated production build, targeted lint, parser tests and existing admin validation tests passed. The development integration created and removed 11 owned unpublished draft pages, verifying privacy, authorization, search, filters, both sort directions and pagination. In the built-in browser, the owner saw the actual empty list and tested reordering two unsaved blocks without saving. No fixture publication occurred.

Known follow-up: some built-in route slugs including `cart`, `checkout`, `help-center` and `admin-login` are not reserved by the current CMS validator. Built-in routes take precedence, so a page using one may not render at its proposed URL. Correcting this requires reviewing existing records and updating both application and database validation without stranding existing content. Mobile viewport and screen-reader speech were not tested in this checkpoint.
