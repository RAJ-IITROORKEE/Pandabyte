# Admin Team follow-up — 27 October 2026

Team now has a private Mono table with title/slug search, status filtering, sorting and bounded pagination. Its editor distinguishes the internal Admin title from the public profile name, describes existing character limits and position order, and explains that only the first selected image is used as the About portrait. Existing profiles and media references were not changed.

The additive `20261027173005_admin-team-table.sql` development RPC and its no-store API both require `content.edit`. A forward rollback returns the list to the generic route and revokes the new RPC without changing profile records.

An isolated production build, focused parser tests and targeted lint passed. Development integration used 11 owned synthetic unpublished profiles to check search, filters, sorting, pagination, access and public draft privacy; those fixtures and temporary users were removed. The browser checked the empty Team list and editor guidance. No real people were created or published.

Open issue: the current backend allows an empty public Name even when an Admin title is present. A safe required-name change needs matching application/database validation and a review of existing records before enforcement. Mobile viewport and real screen-reader checks were not repeated.
