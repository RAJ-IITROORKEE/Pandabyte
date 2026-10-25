# Strict script policy checkpoint

25 October 2026, Asia/Calcutta. Landing v26 is committed as `dcce07e`. The owner asked to continue authorized non-commerce work automatically, so the next bounded change adds the existing Clerk SDK's strict nonce CSP. Checkout/payments, Phase 6, deployment and provider configuration remain deferred/outside scope.

## Change

`proxy.ts` enables `clerkMiddleware({contentSecurityPolicy:{strict:true}})` and adds base/object/framing protection, disabled script attributes and the existing privacy-enhanced YouTube frame origin. Server-rendered `ClerkProvider` uses `dynamic`; the app already has request-time `force-dynamic` rendering. The SDK generates and forwards a fresh cryptographic nonce rather than trusting incoming headers. Next applies it to framework and theme scripts. No hand-written key parser, additional identity source or dependency is introduced.

`next.config.ts` retains the smaller base/object/framing CSP as a fallback for static responses and early Clerk handshake redirects. Actual document/API responses were tested to contain one effective strict policy, not conflicting comma-joined headers. Route-level auth and capability checks are unchanged; this CSP does not grant authorization.

Reviewed the pinned Next 16.4.3 CSP guide and installed Clerk 7.9.20 implementation, plus [official Clerk CSP documentation](https://clerk.com/docs/guides/secure/best-practices/csp-headers). Clerk's automatic policy deliberately retains vendor defaults including Stripe/Maps hosts, inline styling and legacy `unsafe-inline` script fallback. In modern CSP browsers the nonce/strict-dynamic combination makes that script fallback ineffective; this is not a strict minimal-origin policy or a removal of Clerk vendor defaults. No payment provider is configured or invoked. Future static/CDN/PPR adoption needs a new nonce/cache design. The current app already renders dynamically.

## Verification

- Lint, typecheck and production build pass. All 56 unit, 7 auth HTTP, 3 shell HTTP and 2 focused security HTTP tests pass. The privileged editorial key is absent from 36 client build files.
- Focused checks cover one CSP, distinct per-response nonces, nonce-bearing framework/theme/Clerk script tags, rejected attacker-supplied nonce/CSP headers, production omission of `unsafe-eval` and broad script schemes, disabled script attributes, YouTube frame allowance, protected page branches and anonymous API denial. These do not prove browser hydration/auth/embed behavior.
- The built-in browser became available on 25 October. The existing owner Google session renders the private contact/address dashboard and Clerk profile settings, including the connected Google identity. Admin dashboard shows seven capabilities; Users & roles loads the single protected ADMIN membership; Pricing loads its genuine empty result through the guarded API. Hero/OLED and theme interactions work. No account, address, grant or credential was changed.
- Signed-out entry/protected-page behavior is covered by HTTP checks; no logout or new OAuth login was performed. There is no approved published video after fixture cleanup, so lazy YouTube playback is not browser-tested; only its policy allowance is asserted.
- A new Luna xhigh worker independently reviewed the installed Clerk/Next nonce flow and found no concrete vulnerability or compatibility blocker. Earlier follow-up workers had hit their usage limit; root completed implementation and tests.

The browser gate for signed-in account/Admin access is complete. Contact abuse, production workload/recovery, notification delivery, least-privilege media service scope and deferred commerce remain separate launch gates in [security readiness](security-readiness.md).
