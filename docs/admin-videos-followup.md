# Admin Videos table — 27 October 2026

Videos uses the existing Mono content table, with title/slug search, draft/published/archived filters, update/title sorting and bounded 10/20/50-row pagination. Existing editor, versioned publishing and YouTube validation remain in place.

Development migration `20261027173010_admin-videos-table.sql` adds a read-only `content.edit`-gated RPC. The API checks the same capability, validates query parameters and returns private/no-store responses. A forward rollback returns Videos to the generic list and revokes the RPC after removing callers; preserve all video records.

Focused validation and table tests, targeted lint, TypeScript and an isolated production build passed. Development integration created 11 uniquely identified unpublished video drafts, verified search, status, sorting, pagination, input validation, non-admin denial and public draft privacy, then removed the fixtures and temporary identities. Anonymous HTTP returned 401 and the public list returned the three previously published videos. No real content was changed or published.

Existing Admin, SQL and public YouTube URL parsers differ on some forms; this table change does not alter them. Related-product associations remain absent from product pages. Browser automation was unavailable for the built-in browser; the user is using the Brave window, so no fresh interactive browser validation is claimed unless recorded subsequently. Screen-reader speech, runtime reduced motion and mobile viewport checks were not repeated.
