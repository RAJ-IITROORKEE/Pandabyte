# FAQ reference follow-up — 27 October 2026

The owner requested that the FAQ section, full FAQ page and FAQ Admin CRUD in `unfiltered_iitians` be reviewed and integrated. Its category filters, search and homepage link informed this adaptation. No other project's data, API, dependencies or destructive deletion semantics were imported.

The homepage links to Help. Help searches published FAQ titles, summaries, plain answers and topics using the existing bounded server query. Topic filtering applies only to the current page and is clearly labeled; changing pages clears the topic filter while retaining the search query. Empty filters and unpublished content have honest states. FAQ disclosures retain native keyboard behavior. In the existing FAQ editor, the title and topic labels now read Question and Topic / category; the underlying versioned draft, publication, archive, authorization and placement controls are unchanged.

Verification: seven focused FAQ/query/access tests, targeted ESLint and TypeScript passed. Local HTTP responses confirmed the Help search form, an empty search state, and homepage FAQ link. The in-app browser reported local browser use disabled again, so rendered interaction, mobile, and keyboard verification were not repeated. Existing generic list projections omit formatted blocks, and the search does not inspect formatted answer blocks; this is a pre-existing limitation that needs a separate solution before claiming rich-answer search or display. No CMS records were changed for this review.

## Formatted answers and global topics

The subsequent owner request replaces the Help page's page-local topic filter with a bounded published FAQ query that filters before pagination and preserves both search and topic across page links. Search covers the visible formatted block text when present, otherwise the plain answer. The homepage uses the same full FAQ projection. Topic choices are limited to 100; the interface says when choices are truncated.

Development migration `20261027173012_public-faq-blocks.sql` adds a dedicated read-only RPC using live-route, published-revision, archive and media checks. It was applied to the linked development project. Rollback uses a forward migration after routing callers back to the previous query. Existing records were not changed.

Nine focused tests, targeted lint and TypeScript passed. Live anonymous RPC checks verified the existing six FAQs, pagination bounds, topic selection and empty search; local HTTP checks returned the homepage and Help search results. Dedicated formatted-answer, draft and withdrawal fixture assertions were added to the Phase 4 integration harness but not executed because they publish disposable fixtures. The Brave extension was not exposed in this chat and local browser use reported disabled, so visual and keyboard browser checks remain outstanding.
