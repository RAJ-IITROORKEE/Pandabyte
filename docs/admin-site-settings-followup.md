# Admin Contact and Navigation follow-up — 27 October 2026

New Contact and Navigation drafts start with their required singleton slugs (`contact` and `primary`). Contact explains that its public email does not configure inquiry notifications, and describes how blank support and footer copy falls back or is omitted. Existing field length limits are exposed in the editor. Navigation also exposes existing link length limits and retains the current exact-destination override behavior.

The isolated production build, focused Admin validation/site copy/navigation tests, lint and typecheck passed. The built-in browser checked both new-record editors and their prefilled slugs. No Contact or Navigation record was created, edited or published, and no notification settings were changed.

The Contact and Navigation lists now offer Edit for an active singleton and New only after an unfiltered lookup confirms none exists. The lookup includes archived history, fails closed on errors or its scan limit, and the database continues to enforce uniqueness. Direct New URLs remain available; duplicate saves are rejected by the database. Navigation core destinations remain manually entered, so staff must use exact reviewed paths. Mobile viewport and screen-reader speech were not repeated.


Singleton list checkpoint: focused lookup, Admin validation, navigation and copy tests, scoped lint and TypeScript passed. The signed-in in-app browser displayed the empty Contact and Navigation states; the active-record UI was not browser-tested because neither singleton exists in development. No records were created or published.
