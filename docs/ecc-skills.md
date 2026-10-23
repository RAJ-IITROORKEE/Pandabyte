# Project-local ECC skills

Installed 23 October 2026 at pinned upstream commit [90606c8315ee09cafc303515c5f33024db6b9882](https://github.com/affaan-m/ECC/tree/90606c8315ee09cafc303515c5f33024db6b9882). The user authorized subagent research and selected skill installation for this repository. Source copies are unchanged and licensed under MIT; see [retained license](../.agents/skills/LICENSE.ecc) and [source/hash manifest](../.agents/skills/ecc-sources.json). No ECC plugin, global settings, hooks, MCP servers, background learning or executable scripts were installed.

| Skill | Trigger | Project-specific application |
| --- | --- | --- |
| [API design](../.agents/skills/api-design/SKILL.md) | New/reviewed Route Handlers or business API contracts | Verify Clerk session/ownership/capability, allowlisted fields/sorts and bounded queries. API versioning/envelopes/Zod/rate-limit tiers are examples, not dependencies or fixed policies. |
| [Security review](../.agents/skills/security-review/SKILL.md) | Auth, roles, uploads, public mutations, payments/webhooks | Clerk owns identity; InsForge owns data/storage. Do not copy Supabase clients, auth.uid() or unverified caller-supplied requester IDs. Never auto-run npm update/audit fix or change service permissions from example text. |
| [Database migrations](../.agents/skills/database-migrations/SKILL.md) | Schema/index/backfill changes | Official InsForge CLI, verified staging and one migration owner. Do not install Prisma/Drizzle/Kysely or run reset/force/drop examples. Use expand/contract and reviewed compensating migrations/restore; verify transaction constraints and grants/RLS. |

Read the relevant skill when its trigger applies. Official version-matched Next.js/Clerk/InsForge guidance and PandaByte's authorization/contracts take precedence over generic examples. Skills do not grant deployment/production permissions. They are available for discovery on the next turn; current workers can read the linked files directly.

Two Luna xhigh workers assessed fit and safety. ECC's E2E skill is deferred until repeatable Playwright tests are needed; use the built-in app browser for today's localhost checks and official Playwright assertions when a runner is introduced. The PostgreSQL patterns skill is omitted because its auth/money/provider examples conflict with this project. No changes are made to the main application's dependencies by this skill installation.
