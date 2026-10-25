# Non-commerce security checkpoint

24 October 2026. Checkout/payments are explicitly deferred. This checkpoint strengthens the existing development backend; it does not declare a production launch, capacity, incident response or restore guarantee.

**25 October follow-up:** [strict nonce CSP hardening](csp-hardening.md) now passes production-build, HTTP and signed-in account/Admin browser checks. The earlier browser-setting blocker is resolved. Clerk vendor defaults and legacy fallback remain documented; this is not production certification.

## Implemented controls

- Clerk is the sole identity source; InsForge uses verified opaque text subjects. The approved default owner is a protected ADMIN membership after a unique verified Clerk email lookup. No request-time email allowlist, editable metadata role, second identity provider, or public admin bypass.
- [Fixed roles](admin-roles.md) atomically replace capability grants, preserving all existing SQL/API capability checks. No direct runtime role/capability DML, no self-role change or protected-owner demotion, optimistic versions, serialized writes and audit events. Project-admin bootstrap/recovery is a privileged operator boundary; no app runtime uses its key for roles.
- Role APIs authorize before bounded Clerk lookup, require same-origin JSON for changes, validate closed fields and verified target identity, hide backend diagnostics, and return private no-store responses. Client sessions discard old-user role state and ignore/abort stale requests; successful responses are validated before rendering.
- Browser baseline applies to pages/APIs: MIME sniffing protection, DENY framing plus CSP frame-ancestors, restrictive base/object directives, strict-origin referrers and disabled unused camera/microphone/location/payment permissions. The Next identifying header is disabled. The subsequent nonce policy adds modern script execution controls; see the follow-up contract for vendor/legacy limits. Payment permissions must be reviewed when that deferred feature resumes.
- Existing customer profile/address/upload RLS remains owner-only. Staff roles do not grant customer-private data access. Structured CMS content avoids arbitrary executable content, and public projections expose only current published revisions. Existing request/body/query/upload bounds and canonical price rules are retained.

## Review findings and remaining production gates

The Luna read-only review traced public/contact, private account, admin, CMS and storage boundaries and found no new concrete access-control exploit in those paths. Root additionally reviewed role materialization, Clerk identity matching, runtime ACLs, concurrent revocation checks and UI session changes. This is scoped review evidence, not proof that every vulnerability is absent.

**Contact abuse remains a launch gate.** Anonymous `submit_inquiry` has per-email and 100/hour global database caps. A caller can rotate unverified email addresses and fill the shared quota, denying legitimate inquiries for the hour. The global quota limits resource growth but is not trusted-source protection. Because the RPC is directly anon-callable, adding only a Next.js IP limiter would be bypassable. Closing this requires a reviewed trusted edge plus backend abuse gate, or a restricted server-only submission boundary; no configured trusted deployment/source or challenge service exists here. Do not trust arbitrary forwarded headers, add a process-local limiter as a distributed guarantee, or claim this was fixed.

The existing broad **server-only** editorial media credential is still constrained by the public-media route's published projection, key allowlist, size/type validation and client-secret scan. Its least-privilege service scope remains a provider limitation/release concern. The Zod dependency override remains outside the vendor's declared major range and retains its compatibility test. Inquiry email delivery is unconfigured; durable receipt persistence does not imply notification delivery.

Before production launch, separately verify production Clerk/provider settings and staff account protection, production secrets/regions, trusted abuse controls, reviewed script-source CSP with Clerk/Next/media, notification provider/recipients, monitoring/audit retention, data/file backups and isolated restore, workload/cost limits, content accuracy, and the deferred commerce gates if purchases are offered. No production provisioning/deployment or new service/plugin is performed by this checkpoint. Saved customer contact phone remains unverified; Clerk phone configuration remains deferred.

## Operations and recovery

An Admin manages roles at `/admin/users` by exact verified email and a required reason. Existing memberships require selecting the row/current version. Assigning CUSTOMER removes staff capability access while retaining the versioned membership record. Role adoption intentionally replaces manual grants. Never mix a second grant authority into role-managed subjects; the normal project-admin manual setter refuses them. Only a trusted project operator may use `project_admin_set_staff_role` for bootstrap/recovery, after verifying the target Clerk subject. The protected owner cannot be demoted from the app. Keep at least one protected recovery administrator and restrict project-admin keys.

Rollback is a reviewed forward migration: remove callers first, preserve membership/capability/audit data and the verified owner grant, then compensate affected policies/functions. Do not replay applied migrations or erase financial/customer/history data. No destructive rollback or infrastructure restore drill was performed. The optional isolated last-admin test attempted session-claim setup through the CLI; InsForge rejected session configuration before execution. The last-admin branch has source review, while protected-owner, self-change and revocation have real runtime tests. No unsupported SQL-session bypass was attempted.

See [phase progress](phase-progress.md) for the final test, browser, fixture cleanup and local commit evidence.
