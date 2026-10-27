# Admin Contact and Navigation follow-up — 27 October 2026

New Contact and Navigation drafts start with their required singleton slugs (`contact` and `primary`). Contact explains that its public email does not configure inquiry notifications, and describes how blank support and footer copy falls back or is omitted. Existing field length limits are exposed in the editor. Navigation also exposes existing link length limits and retains the current exact-destination override behavior.

The isolated production build, focused Admin validation/site copy/navigation tests, lint and typecheck passed. The built-in browser checked both new-record editors and their prefilled slugs. No Contact or Navigation record was created, edited or published, and no notification settings were changed.

The generic lists still offer New even if a singleton already exists; the database continues to enforce uniqueness. Navigation core destinations remain manually entered, so staff must use exact reviewed paths. Mobile viewport and screen-reader speech were not repeated.
