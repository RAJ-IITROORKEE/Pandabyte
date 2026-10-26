# Phase 6 — operational-readiness documentation

26 October 2026, after application commit `1ed5c23`. Three bounded Luna xhigh reviewers checked environment consumers, incident handling and outstanding owner decisions; root reconciled their findings against source and existing evidence.

**This checkpoint prepares and verifies documentation only.** No credentials/private environment values, cloud state or billing were inspected. No services, alerts, jobs, production resources, data, roles or configuration were changed. Content publication, checkout/payments, load tests, deployment, backup/export/copy/restore and recovery-target provisioning remain deferred. Live email/billing changes remain deferred under the earlier decisions. A runbook is not permission to execute its actions.

## Readiness status

| Area | Established development evidence | Remaining production gate |
| --- | --- | --- |
| Identity and permissions | Clerk is the sole identity provider; InsForge uses verified text subjects and owner/staff access controls. Protected owner ADMIN is established in prior checks. | Separate intended production identities/project, token bridge, staff protection and emergency access must be verified. Do not rebind by email or editable metadata. |
| Public/private content and files | Published-only/no-store projections, withdrawal guards, private buckets and bounded file validation exist. Source observations are non-purchasable. | Content/rights approvals and production credential scope/configuration are open. Broad editorial storage credential remains a material risk. |
| Diagnostics | Closed server error events and response-only correlation references are implemented and tested. | No central monitoring, alert destination, guaranteed retention or uptime coverage is configured by this app. Framework/provider logs need independent access/redaction review. |
| Contact and notification operations | Local Turnstile test mode and durable inquiry persistence/outbox preparation are tested. | Real domain protection and inquiry-review ownership are open. Email remains disabled; preparation/fake-sender tests do not prove acceptance or delivery. |
| Capacity and recovery | A 100-simultaneous-visitor, mostly-browsing planning target and preparatory recovery runbook exist. | Capacity is unmeasured. Recovery targets, retention/custody and isolated database-plus-files rehearsal are unapproved/unproven and deferred. |
| Accessibility | Bounded keyboard/form/reflow fixes and development checks are recorded. | Actual zoom/text resizing, runtime reduced-motion switching and real screen-reader speech remain manual gates. |

The latest application verification is [accessibility follow-up](verification/phase-6-accessibility-followup.json), with [site controls](verification/site-content-controls.json), [catalog integration](verification/catalog-44-integration.json), [diagnostics](verification/operational-diagnostics.json) and [notification preparation](verification/inquiry-notifications.json) covering their respective scopes. These records are dated development evidence, not current production guarantees. Full Phase 6 exit and Phase 7 release remain open.

## Environment and secret-custody checklist

The following **13 template variables** are verified against `.env.example` and current consumers. Empty examples establish names, not configured values. The custodian, authorized readers, rotation approver and incident contact for each environment are **unassigned** pending owner decision. Do not supply secrets in Markdown, chat, screenshots, process arguments or browser code.

| Variable | Intended exposure / consumer | Requirement or held state |
| --- | --- | --- |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Public; Clerk SDK integration through `proxy.ts` / `app/layout.tsx` | Correct environment's Clerk application; missing configuration must never create a fake session. |
| `CLERK_SECRET_KEY` | Server-only; Clerk SDK-managed configuration | Separate protected development/production values and access. No value or live instance checked here. |
| `NEXT_PUBLIC_INSFORGE_BASE_URL` | Public configuration URL; server clients/media route consume it | Must identify the intended environment; a project label alone is insufficient. |
| `INSFORGE_ANON_KEY` | Server-only public projections and scoped public RPC client in `lib/insforge/public.ts`, including verified Contact submission | Actual anon credential, never a project-admin key; review effective grants/RLS and scoped Contact proof. This client is not exclusively read-only. |
| `INSFORGE_EDITORIAL_STORAGE_READ_KEY` | Broad privileged server-only credential; `app/api/media/[id]/route.ts` | Required for the current published-file fallback after authorization/canonical validation. No app writes use it. Least privilege, access, isolation and rotation remain production gates. |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | Public; `lib/contact/turnstile.ts` → Contact widget | Paired with the correct environment/allowed domains; local test key is not production protection. |
| `TURNSTILE_SECRET_KEY` | Server-only Siteverify credential | Required with valid Contact configuration; never sent to the widget. |
| `CONTACT_SUBMISSION_KEY` | Server-only scoped submission proof | 64 lowercase hexadecimal characters; must match its private database hash. It is separate from project-admin and notification keys. |
| `CONTACT_SITE_ORIGIN` | Server configuration; exact Contact origin boundary | Required canonical origin without credentials/path/query/fragment. Live mode requires non-loopback HTTPS. |
| `CONTACT_TURNSTILE_MODE` | Server configuration; `contactProtection()` | Explicit `local-test` or `live`; loopback HTTP plus official test keys only for local test. Live excludes test keys. Invalid/missing combinations fail closed. |
| `INQUIRY_EMAIL_ENABLED` | Server configuration; `notificationSettings()` | Example is `false`; keep disabled. Exact `true` alone does not establish provider entitlement or approve sending. |
| `INQUIRY_EMAIL_TO` | Private server recipient configuration | One bounded address for future approved delivery; no recipient value is recorded here. Sender/recipient ownership and acceptance remain gates. |
| `INQUIRY_NOTIFICATION_KEY` | Server-only scoped dispatch proof | 64 lowercase hexadecimal characters plus matching private database hash; separate from the Contact proof. Missing/invalid settings disable claim/send. |

`VERCEL` is platform-provided rather than a template credential; its presence blocks local-test Contact mode. It does not select production settings automatically. Clerk's two keys are SDK-managed, so absence of direct `process.env` reads in app code does not make them unused. [Public client](../lib/insforge/public.ts), [user-scoped client](../lib/insforge/server.ts), [Contact gate](../lib/contact/turnstile.ts), [notification gate](../lib/contact/notifications.ts).

For future environment provisioning, separately approve and record:

- [ ] Exact development/preview/production app and backend pairing, region, domain/origin and approved key-store access. Preserve the existing development project; no copy/provisioning is performed here.
- [ ] Clerk token-template trust, text-subject continuity, expiry/revocation behavior and protected ADMIN recovery procedure in that environment. A CLI login/user API key is not browser authentication.
- [ ] Distinct secret custody and a coordinated rotation plan. Contact/notification proofs and their database hashes must change together; do not fix mismatches by opening the legacy public RPC or weakening grants.
- [ ] Published-media fallback credential access and rotation/isolation design. Neither editorial nor customer-private buckets may be made public to resolve an error.
- [ ] Real Contact domain/key verification and nonce CSP checks. Preserve existing noindex/robots restrictions and fixed canonical-origin assumptions until a separately authorized release review; `lib/editorial/seo.ts` currently fixes the canonical origin and `app/robots.ts` disallows crawling.
- [ ] Email entitlement, trusted sender/recipient, ordinary-customer access restrictions on any direct vendor endpoint, identity-token compatibility and ambiguous-outcome reconciliation **before** considering enablement. The Free-plan observation was recorded on 25 October, not rechecked now; no send or billing probe is permitted by this document.

`.gitignore` excludes private env files, `.insforge/`, `.bootstrap/` and build artifacts while permitting the empty `.env.example`. Do not import CLI linkage into runtime code. A `NEXT_PUBLIC_` prefix is a public interface, not a way to protect a secret. Review actual client output before any future release; a prefix check alone cannot prove no leakage.

## Owner decision register

All items below are **open** unless explicitly labelled as an existing decision. No people, vendors, periods, budgets or deadlines are assigned by this document.

| ID | Owner decision needed | Evidence needed to close it |
| --- | --- | --- |
| OPS-01 | Name incident lead, technical operator, deputy, escalation/approval path and supported hours. Assign manual inquiry review while email is disabled. | Named contacts and acknowledgement/escalation responsibilities; no implied 24/7 support promise. |
| OPS-02 | Select protected environment/key custody, access approvers, rotation and emergency access ownership. | Restricted access inventory and verified environment pairing without exposing values; protected Admin continuity. |
| OPS-03 | Choose monitoring/alert destination, recipient ownership, access, cost ceiling and response process. | Separately approved implementation and synthetic non-customer test proving receipt/acknowledgement. No provider/channel is selected or connected now. |
| OPS-04 | Approve log fields, readers, retention, volume limits and framework/provider redaction policy. | Source-to-host output review, allowed-event tests and access review; policy must cover outputs beyond the app formatter. |
| OPS-05 | Approve each data family's retention/deletion/legal-hold treatment below and accountable owner. | Written policy and separately reviewed, ownership/reference-safe implementation; no purge schedule or deletion now. |
| OPS-06 | Select acceptable data-loss window (RPO), recovery duration (RTO), recovery operator/approver, protected location, retention and isolated target. | Approved objectives and, only after separate authorization, measured database-plus-files recovery/access evidence. Historical 24-hour/8-hour figures remain proposals, **not accepted targets**. |
| OPS-07 | Confirm workload mix, target environment/provider limits and capacity/cost budget. | Existing decision: target 100 simultaneous mostly-browsing visitors. Measurement and detailed exercise remain deferred; this is not proven capacity. |
| OPS-08 | Confirm official inquiry/support owner, public Contact details and production abuse configuration. | Approved company content and a future domain-specific validation check; no publication now. |
| OPS-09 | Decide whether/when to revisit live notifications and provider restrictions. | Existing decision: keep Free and prepare only. No enablement, scheduler or live delivery. |
| OPS-10 | Arrange actual zoom/reduced-motion/reader validation and content/rights approval. | [Manual accessibility gates](phase-6-accessibility-followup.md) and [content checklist](content-gap-checklist.md) signed off within their own scope. |

### Retention worksheet — no periods selected

| Data family | Dependency to preserve | Owner must specify |
| --- | --- | --- |
| Customer profile and addresses | Verified Clerk subject, private ownership and account lifecycle | Purpose, retention trigger/period, permitted readers and request-handling process; never rebind ownership by email. |
| Customer text files | Private storage object **and** metadata/owner key | Retention/deletion coordination and orphan handling; database recovery alone does not recover file bytes. |
| Inquiries, internal notes and outbox | Receipt/idempotency, staff history, attempt/outcome integrity | Review cadence, retention and restricted access; never erase unknown delivery evidence merely to resend. |
| Roles, capabilities and audit | Protected owner, revocation/version history and accountable access | Audit readers/retention/legal holds and recovery custody; no blanket audit purge. |
| CMS drafts/revisions/routes and editorial media | Publication pointers, redirects, referenced files and provenance | Revision/media retention and rights-withdrawal process; archive/reference checks precede any authorized removal. |
| Application/framework/provider logs | Incident context with minimized data and protected access | Distinct retention/volume/access policies; app event bounds do not scrub third-party logs. |
| Future recovery artifacts | Database, both buckets, migration history and original subject bindings | Location, encryption/access, retention, operator and tested recoverability; no artifact is created/exported here. |

Retention is an owner/policy decision requiring appropriate review; this table does not choose legal periods or authorize deletion. Commerce history is outside the current work and requires separate operating/retention contracts when resumed.

## Monitoring specification to approve later

Current `lib/observability/events.ts` emits only `schemaVersion`, allowlisted `event`/`area`, 5xx `status`, a generated `reference` and `timestamp`. Unexpected handled 5xx receives the matching `X-Error-Reference` response header. Normal success/4xx and expected disabled Contact/notification setup failures are intentionally quiet. The uncaught hook emits an independent reference; there is no promised response match or underlying-cause trace. See [diagnostic contract](operational-diagnostics.md).

Candidate signals for a future approved design:

| Signal | Current observation path | Missing implementation/decision |
| --- | --- | --- |
| Unexpected 5xx / cleanup failures by area | Closed application console events | Protected collection, alert destination, baseline, aggregation window, numeric thresholds and owner. |
| Contact challenge failures / quota exhaustion | Bounded request outcome or manual authorized inspection; ordinary 4xx is absent from the app error stream | Separately designed privacy-preserving metrics; do not log email, form bodies, tokens, IPs or raw URLs to manufacture a counter. |
| Inquiry backlog / uncertain notifications | Staff inquiry/outbox controls; sending remains disabled | Review cadence, named owner and any later alert processor. No scheduler exists. |
| Public page/media availability and withdrawal | Authorized finite read-only checks in a defined target | Approved route set, interval/request budget and alert delivery; no dedicated health/uptime endpoint is implemented. An empty 200 page is not proof of complete content. |

The Contact limits (five per email and 100 globally per hour) are existing enforcement limits, not alert thresholds or an availability SLA. Numeric alert/error/latency budgets require owner approval and representative observations. Do not install monitoring, add a heartbeat/cron, generate test incidents or send notifications as an incidental documentation step.

## Preparatory incident playbook — not dispatched

1. **Scope and record safely:** authorized responder records environment, UTC time, static feature/area, status, user-visible symptom without customer content, and an internal response reference when present. Do not collect raw request bodies, tokens, subjects/session IDs, object keys, provider payloads or complete customer URLs. Framework/provider logs require their own protected-access/redaction procedure.
2. **Classify before changing state:** correlate an unexpected handled 5xx with its closed local event. Absence of a reference on expected setup failures/4xx is normal. An uncaught-event reference is independent; the formatter is not a root-cause diagnostic or a global log scrubber. Do not create a runtime error endpoint or suppress errors to produce a green check.
3. **Use the applicable branch below:** inspect only the authorized environment and smallest relevant evidence. This checkpoint executes none of these incident actions. Any configuration, role, publication, data, credential or infrastructure change requires its own approved scope.
4. **Validate and close:** after a separately authorized repair, record commit/configuration/migration identity without secret values, bounded no-private-data checks, operator approval, remaining gaps and a reviewed recovery/rollback path. Do not declare readiness from a successful build or HTTP 200 alone.

| Symptom | Safe distinction / future authorized response | Do not do |
| --- | --- | --- |
| Account/Admin 401/403/503 | Distinguish denied/inactive session, capability or request-boundary rejection, and unavailable access verification using the safe error code. Verify trusted subject continuity and actual role through authorized controls. | No email/metadata bypass, fake session, protected-owner demotion, blanket grant or secret/token dump. |
| Media 404/503 or withdrawal blocked | Withdrawn/unpublished content should not resolve publicly. For unexpected failures inspect canonical metadata, credential/configuration and reference/publication state through authorized access. A still-referenced asset needs an explicitly approved reference/publication repair. | Do not make buckets public, delete referenced objects, expose the broad read key or publish/unpublish content under this documentation authorization. |
| Contact 403/429/503 | Separate challenge rejection, quota and configuration/provider unavailability. Preserve entered data and avoid retry bursts; local test keys prove no production behavior. | No disabling Turnstile/quotas, opening the legacy RPC, dumping messages, or repeated submissions to diagnose quota. |
| Notification disabled / failed / uncertain | Disabled setup is expected and performs no send. Acceptance is not delivery. Preserve uncertain outcomes; an expired in-flight send is not a safe retry. Reconciliation needs the provider contract and separate entitlement/identity/access approval. | Never clear uncertainty, blindly resend, flip enablement, create a scheduler, upgrade billing or use a real send as an entitlement probe. |
| Draft differs from public content | The current published revision is intentionally independent from the draft. Investigate version/pointer/no-store behavior through authorized reads; obtain publication authority before correcting exposure. | No forced overwrite, blind importer rerun or publication as a “health check.” |
| Suspected credential exposure | Escalate privately to the assigned custodian; coordinate containment/rotation and dependent proof/hash/trust changes under explicit incident authority. | No secret in an issue, log, client field or report; no unapproved rotation/reset or disabling security to restore access. |
| Suspected data loss | Stop and obtain explicit recovery scope, original subject/target verification and approved objectives. Follow the guarded recovery runbook only when resumed. | No backup/export/copy/restore, recovery provisioning, `reset`, applied-migration replay, hard reset or destructive repair now. |

There is no implemented global maintenance/read-only switch or automatic rollback. Do not claim writes are frozen merely because a runbook says to stop them. Recovery is separately governed by [the preparatory recovery runbook](phase-6-recovery.md); preserve the database **and** both private buckets, migration history and Clerk subject bindings when that work is eventually authorized. No RPO/RTO success is claimed.

## Verification of this document

Verified offline against the 13-name environment template, source consumers/guards, closed event schema, credential ignore rules and linked decision/evidence records. Checked local references, staged scope and secret/identity patterns. Reviewers accessed no private configuration, service dashboard, browser or provider API. No runtime, build, browser, mutation, load or recovery test was rerun for this documentation-only change; application tests remain attributed to `1ed5c23` and their original checkpoints.

[Documentation verification](verification/phase-6-operational-readiness.json) records that boundary. The next work is owner decisions/private draft preparation and separately arranged manual accessibility checks; blocked production/recovery/commerce gates do not authorize executing them automatically.
