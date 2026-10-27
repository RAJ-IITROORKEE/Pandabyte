# Admin FAQ follow-up — 27 October 2026

The FAQ list now supports private server-side search, status filters, sorting and pagination. The FAQ editor uses placement checkboxes, explains that Home and Help are connected while other placement values are not, describes position ordering, and makes the existing plain-answer versus formatted-block precedence explicit. Formatted answer blocks can be reordered. Existing public output and saved records were not changed.

FAQ placement validation now matches the existing database contract: at most six distinct choices from home, about, contact, help, product and solutions. The read-only `20261027173004_admin-faq-table.sql` RPC and its API require `content.edit`; responses are private/no-store. Rollback returns the list to the generic route and revokes the new RPC through a forward migration.

The isolated production build, targeted lint and validation tests passed. Development integration tested 11 owned unpublished FAQ drafts, including list queries, placement validation, access denial and public draft privacy. The owned fixtures and temporary identities were removed; no real FAQ was changed or published. The browser showed the six existing published FAQs and the revised editor controls.

Existing public rendering still gives formatted blocks precedence over the plain answer; the editor now explains this rather than changing live content. About, Contact, Product and Solutions placements are stored but are not connected to public FAQ sections. Mobile viewport and real screen-reader checks were not repeated.
