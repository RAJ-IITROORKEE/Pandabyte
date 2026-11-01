# Sign-in and account creation checkpoint

1 November 2026. The owner requested a responsive, themed Chakra authentication entry and confirmed successful new-account signup and login in the browser. The source checkpoint was integrated to `main` as `da9b57b`. The owner subsequently authorized its hosted deployment; see [deployment and hosted checks](vercel-preview-deployment.md). No provider login method or role membership was changed by either checkpoint.

## Behavior

- `/sign-in` uses Clerk's combined sign-in/sign-up flow (`withSignUp`, OAuth transfer). A new identity continues into account creation and verification within the flow, then activates its session without a second login. Existing identities sign in normally. Clerk retains password, verification, recovery, legal and pending-session requirements; signup is not silently bypassed.
- `/sign-up` remains available with the same themed shell. A protected destination displays “Please sign in to continue.” Already active sessions return directly to the validated destination.
- `/auth/complete` revalidates the destination and requires a real active Clerk session. It returns to that destination, or home by default. Duplicate/external/malformed destinations cannot become open redirects.
- A short-lived, destination-bound browser marker enables a one-time Chakra success toast bound to the active session and user. It is presentation only, never an authorization signal. Storage failure suppresses the notification without blocking authentication. The wording is “You're signed in”; it does not infer that an account was newly created. A recent abandoned entry visit can still qualify for this generic notification after a later valid login.
- Chakra is scoped to the auth shell and its lazy-loaded, dismissible toast. Global preflight/reset is disabled; existing frontend/Admin tokens and the exact logo are retained. Emotion receives the server nonce for streaming styles. The existing Clerk CSP permits inline styles and retains strict script nonces; no CSP relaxation was introduced.
- New users remain customers until an authorized ADMIN assigns a role. This work changes neither role memberships nor workspace permissions. The owner will perform additional role-assignment/workspace-access acceptance tests separately.

## Verification and limits

- Production build passed; TypeScript and focused ESLint checks passed.
- Seven completion/return-path unit checks passed, including expiry, destination/session binding, single consumption and unsafe returns.
- Eight real signed-out HTTP route checks passed against localhost:3013 after warm-up. A further completion-route check passed for no-session rejection and external/duplicate return rejection. Initial cold compilation exceeded two 15-second request budgets; the unchanged checks passed once warm.
- Browser review observed the real new-email transition into Clerk account creation with the email carried forward. The owner entered credentials and completed verification, then explicitly confirmed successful signup/login. The built-in browser subsequently showed the active account and a direct sign-in-to-account return, with no captured console errors on that check. The owner's new account is retained for their access testing.
- Desktop auth styling was visually reviewed; mobile layout is implemented at 720px but final mobile/light-dark and actual success-toast speech/visual coverage are not claimed. No screen-reader, load or hosted-production auth acceptance is implied.
- `npm audit` reported 16 pre-existing moderate development-tool findings, also present in the baseline lockfile; no high/critical findings. No broad dependency remediation was performed.

Chakra/Emotion versions are pinned; MIT notices are retained in [the license record](licenses/chakra-emotion.txt). Clerk remains the sole identity provider; InsForge remains the private data authority.

## Provider references

- [Clerk SignIn component](https://clerk.com/docs/react/reference/components/authentication/sign-in)
- [Clerk session tasks](https://clerk.com/docs/guides/configure/session-tasks)
- [Chakra Next.js App Router integration](https://chakra-ui.com/docs/get-started/frameworks/next-app)
- [Chakra toast](https://chakra-ui.com/docs/components/toast)

Provider passwordless methods, stricter user-enumeration configuration and phone authentication remain separate decisions. No test success constitutes a role grant or production-readiness certification.
