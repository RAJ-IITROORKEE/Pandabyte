# Phase 2 shared frontend

24 October 2026, Asia/Calcutta. Scope: shared navbar, footer, theme and route boundaries. The existing Clerk/InsForge access foundation is retained; this does not implement publishing, catalog operations or checkout.

## Selected reference and implementation

The authenticated official Superdesign CLI retrieved [homepage v17](https://p.superdesign.dev/draft/011e75c8-d90c-40ed-aac8-bc39b8e2f1ba) again for this implementation. Its compact two-column Solutions menu, unchanged logo, neutral/emerald themes and footer groups guide the shared shell. No new design generation or credits were used. The design chat's artifacts remain untouched.

Three Luna xhigh workers owned separate navbar, footer and theme files. Root integrated the shell and route states, reviewed the connected code and tested in the built-in browser. The shell uses semantic Next.js/React components and Lucide 1.61.0 named imports; no paid Aceternity assets or animation dependency was needed. Original ISC and applicable Feather MIT notices are retained in [the license file](licenses/lucide-react.txt).

- Solutions, Learn and About have separate destination links and disclosure buttons. Solutions contains nested hardware and upcoming-product links. Keyboard, click/touch and fine-pointer hover are supported; Escape returns focus, outside focus/click dismisses, and link/history or desktop/mobile breakpoint changes close navigation.
- Mobile navigation is an inline scrollable disclosure. The narrowest layout has separate brand and action rows to preserve 44-pixel controls. There is no focus trap because it is not a modal.
- The footer retains the logo, tagline, link groups, dynamic year and a truthful development notice. It has no office address, large decorative wordmark, minimum-order banner or design-preview links.
- The theme follows the OS until a light/dark choice is saved. A before-interactive script applies the choice, and the toggle synchronizes across tabs. Storage failure falls back safely. Namespaced root aliases prevent collisions with Clerk's theme tokens.
- Public, auth and customer-account routes share the shell. Staff/admin paths exclude storefront chrome; this presentation rule does not replace server authorization. Staff sign-in accepts only the explicit account/staff return paths, and the capability is checked again after login.

## Route and phase boundaries

`lib/site-navigation.ts` is the temporary code-owned navigation contract. Ordinary admin editing of these records belongs to Phase 3. Known unfinished destinations render an explicit development state through a finite allowlist; they do not pretend that catalog, cart, enquiries, policies or Agent operations are connected. Unknown paths return 404. These placeholders are not implementations of all selected screen bodies.

The route-level loading boundary is restricted to the public placeholder route. Signed-in account data streams through a local Suspense boundary after the session check, so a slow InsForge connection shows progress without delaying the whole account page. A root loading boundary caused auth redirects/404s to stream as HTTP 200; scoping it restored the existing status-code contracts. This follows the documented [streaming redirect behavior](https://nextjs.org/docs/app/api-reference/functions/redirect) and [loading/Suspense model](https://nextjs.org/docs/app/api-reference/file-conventions/loading). Loading, error/retry and not-found components have semantic main/skip targets. No public fault-injection route was added to trigger the error boundary.

Verification results, fixes and limits are in [the evidence record](verification/phase-2-frontend.json). Phase 3 is not started by this checkpoint. Production storage quotas/restore drills and the business-policy gates remain in the plan; no deployment or production capacity claim is made.
