# Public pages and form recovery — 27 October 2026

The owner requested continuation of remaining public frontend work after `01e55c7`. This checkpoint reviews company/learning pages and fixes Contact recovery and address-editor keyboard focus. Admin, the homepage hero, real customer data, CMS content and the disabled payment/order boundary are preserved.

## Changes

Contact submissions use a 30-second browser request deadline. A timeout or network failure restores the form controls without clearing the entries or the request ID. An unchanged retry therefore retains the existing idempotency behavior; editing the message or receiving a confirmed success starts a new request. Error copy describes an unconfirmed outcome rather than claiming a previous message was not sent. Spam verification, receipt validation and server-side submission guards are unchanged. No inquiry or email was sent during this checkpoint.

The account address editor focuses its Address label field when a new or existing address is opened, or a different saved address is selected. Typing and validation renders do not refocus the field. Error focus and Cancel's return to the trigger remain intact. Saved-address Edit controls include the address label in their accessible names.

About, Contact, Help, Policies, Solutions and Learn now have distinct default document titles when authored CMS titles are absent. Explicit SEO/page titles retain priority. Canonical URLs, development noindex/follow settings and unknown/detail/private route fallbacks are unchanged.

## Verification

Fifteen focused tests, targeted lint, TypeScript and the isolated production build passed. Tests cover Contact timeout/retry identity, address validation/focus behavior and metadata priority. The browser confirms all six new default page titles, new-address opening, first-field focus and Cancel restoration without saving data. Existing-address switching and error behavior use isolated component tests because the owner's account has no saved addresses.

Contact, About, Help, Policies and Solutions each had one main H1 and no horizontal page overflow at 320/768/1024/1440 CSS pixels. A separate bounded review checked Learn, the three titled YouTube players, explicit development Blog examples, labeled search/filter controls and Company menu Enter/Tab/Escape focus restoration. Empty states remain honest; no company, policy, contact or editorial claims were invented.

Current [verification](verification/public-page-readiness.json) records build/lint and testing limits. Actual screen-reader speech, runtime reduced-motion switching, a real inquiry delivery and an existing-address browser save were not performed. [Owner content inputs](owner-frontend-content.md) list the remaining factual content needed to finish those pages.
