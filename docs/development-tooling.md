# Development tooling shortlist

**Research date:** 23 October 2026. **Status:** planning only. PandaByte is still in phase zero with no application/package manifest. This document recommends tools for later authorized work; no package, MCP server, skill pack, provider project or credential was installed, linked or changed here.

## Recommended toolkit

| Use | Recommendation | When it fits PandaByte | Current status |
| --- | --- | --- | --- |
| InsForge backend work | Official [`@insforge/cli`](https://github.com/InsForge/CLI) and its Skills pack. Use the CLI for a selected staging project's schema, storage, migrations, logs and configuration; use the relevant Skills for SDK/RLS patterns. | Phase 2, after the owner selects staging and authorizes project linking. `cli link` also installs per-agent skills, so review the generated files and ignore rules. | `insforge` and `insforge-cli` skills are available in this Codex environment. No InsForge MCP connection is exposed in this task, and this research did not link a project. The hosted MCP is an optional remote interface at `https://mcp.insforge.dev/mcp`, using OAuth and project-scoped access. Do not use it to provision or mutate a backend during planning. |
| GitHub source and review | Reuse the existing GitHub connector in this Codex task. The official [GitHub MCP Server](https://github.com/github/github-mcp-server) is a good option for a different MCP client, with hosted HTTP/OAuth and local deployment options. | Read repositories, code, issues and PRs through the connector already exposed here. Avoid a duplicate server unless another agent host needs its own connection. Its tools can also write to GitHub, so apply the task's authorization boundary. | GitHub tools are exposed in this task. The connector's repository response omits stars, forks, license and push time; this research used the public REST API to fill those metadata fields. |
| Vercel hosting | Reuse this task's Vercel connector for supported account/project/deployment work. Keep the official [Vercel CLI](https://vercel.com/docs/cli) as a later local workflow for `vercel dev`, previews, logs and environment handling. | Use only after an authorized Vercel project and environment are selected. A CLI session can deploy, manage domains and change environment values, so production actions remain behind the explicit release gate. | Vercel tools are exposed in this task. CLI installation and login were not checked. |
| React and Next.js guidance | Use the already available `vercel:react-best-practices` and `vercel:verification` skills selectively. `next-best-practices` is no longer a separate skill; Next.js now provides that guidance through bundled docs and generated agent rules (Next.js 16.3+). | Apply React guidance when implementation begins and verification guidance when there is a running app/API/data flow. Do not add the whole skills collection. | These skills appear in the current skill catalog. The Vercel Agent Skills repo has no `LICENSE` file or `package.json` license field; leave any additional upstream skill copy/install pending until terms are documented. |
| Live Next.js diagnostics | Consider official [`next-devtools-mcp`](https://github.com/vercel/next-devtools-mcp) after the app is on Next.js 16 or later. It exposes runtime errors, routes and development logs from a running local Next server. | Useful during active local development; it cannot inspect an app that is not running in the same executor. Keep it optional if the regular Next/React output and browser checks are enough. | Not configured. The repo's [`package.json`](https://github.com/vercel/next-devtools-mcp/blob/main/package.json) declares MIT for package version 0.4.1; the GitHub repo has no root `LICENSE` file and GitHub does not detect a repo license. |
| Browser verification | Prefer [Playwright Test](https://github.com/microsoft/playwright) for repeatable browser tests and the official [Playwright CLI](https://github.com/microsoft/playwright-cli) plus its skill for an agent exploring a running app. | Add the test runner when meaningful application flows exist. The CLI is useful for interactive checks and screenshots; it does not replace assertions that run in CI. | Neither is installed or configured in the project. The Codex desktop browser tool is available in this task; it is not a project Playwright installation. |

## Aceternity UI registry — selected visual direction

The user now prefers Aceternity for reusable typography/text effects, animation, buttons, cards and presentation components. It integrates through the existing shadcn CLI; this is one component workflow rather than a new application stack. Candidate selection and accessibility/performance rules live in [design.md](../design.md). The UI chat receives this direction; individual components remain subject to its visual review.

When application setup is authorized, add the following registry to the existing components.json, preserving its other settings:

```json
{
  "registries": {
    "@aceternity": "https://ui.aceternity.com/registry/{name}.json"
  }
}
```

Planning examples only; these commands have **not** been run:

```sh
npx shadcn@latest search @aceternity -q "card"
npx shadcn@latest add @aceternity/bento-grid
```

Inspect the generated files and dependency changes, retain reviewed tokens and use only selected components. Resolve compatible React/Next/Tailwind/Motion versions at foundation time. The shadcn MCP can use this registry if later configured; no separate Aceternity MCP server is required or claimed connected here. Public component availability does not establish a blanket MIT grant. Verify the selected source's terms; paid Pro blocks/templates require appropriate access, and this request does not purchase them. No Pro key is needed for this planning work.

Sources checked 23 October: [official CLI](https://ui.aceternity.com/docs/cli), [installation](https://ui.aceternity.com/installation), [Pro license](https://ui.aceternity.com/licence). No package, registry config or MCP was installed/modified during this step.

## Optional tools and choices to defer

- **Playwright MCP versus CLI:** Microsoft's own repositories recommend CLI plus Skills for coding-agent work when concise calls and lower context use matter. MCP remains useful for a persistent browser session, rich iterative inspection or a client that cannot run a CLI. Choose one interactive control path for a workflow; use Playwright Test for committed regression checks. Do not add both CLI and MCP by default.
- **shadcn CLI/MCP:** Aceternity is the selected visual component source, integrated through shadcn CLI alongside needed accessible primitives. Use the official CLI to add only selected components once the application and visual handoff are ready. Its local stdio MCP can search, inspect and install registry items, but adds little before `components.json` and the app exist. Treat third-party registry components as source code to review. The current Codex docs say shadcn's CLI cannot edit Codex's global MCP config automatically.
- **Context7:** the open-source Upstash MCP/CLI can retrieve version-oriented library documentation. Keep it optional: consult the primary Next.js, Clerk and InsForge docs first, and use Context7 only when repeated cross-library lookup justifies another remote service/API. Its MCP source is open, while its parsing/crawling backend is not part of that repository.
- **Design tooling:** Superdesign's CLI setup is preserved in project records, but visual design is handled separately by the user. No Superdesign MCP tool is exposed in this task. Do not launch it from this planning work.

Skip generic skill bundles, a second browser-control server, additional component kits beyond the selected Aceternity/shadcn workflow, and speculative services; none fills a confirmed gap in the selected stack.

The current Codex skill inventory already includes `find-skills`, `insforge`, `insforge-cli`, `vercel:react-best-practices`, `vercel:verification`, and `ui-ux-pro-max`. They are available to this chat; that does not mean project-local files were installed. The skills.sh snapshot listed 832.0K installs for Vercel React Best Practices and 775.1K for Web Design Guidelines on the research date. These registry counters are adoption signals, not unique users or quality proof; the registry says its counts derive from aggregated CLI telemetry. No skill search/install command was run.

## Codex local and cloud fit

Current Codex MCP documentation supports local stdio servers and remote Streamable HTTP servers with OAuth or bearer authentication ([Codex MCP](https://learn.chatgpt.com/docs/extend/mcp?surface=cli)). Local MCP configuration, browser processes and authentication state do not automatically transfer to a cloud executor; test the connection separately in each environment. A hosted InsForge MCP can be reachable remotely after an explicit OAuth grant and project binding, while Next.js DevTools and Playwright CLI need their server/browser available in the same executor. The GitHub and Vercel connectors are already exposed in this task, so adding their servers again would be redundant. The optional [OpenAI Docs MCP](https://developers.openai.com/mcp) is a read-only documentation source, not a customer-facing AI feature or access to PandaByte data. The linked [cloud environment page](https://learn.chatgpt.com/docs/environments/cloud-environment) is labelled legacy; do not use it to infer every current cloud execution behavior.

## GitHub adoption and activity snapshot

Counts below came from GitHub's public repository REST endpoint on 23 October 2026 UTC. The connected GitHub `get_repo` tool supplied repository identity and archived status but not these count/license/push fields, so public GitHub REST was used as a read-only fallback. `—` means GitHub returned no detected SPDX license for the repository. Every listed repository was reported unarchived at capture; stars/forks and push dates can change and do not establish quality or compatibility.

| Repository | Stars / forks | SPDX | Last pushed (UTC) |
| --- | ---: | --- | --- |
| [InsForge/CLI](https://github.com/InsForge/CLI) | 22 / 21 | Apache-2.0 | 2026-10-22 |
| [InsForge/insforge-mcp](https://github.com/InsForge/insforge-mcp) | 38 / 14 | Apache-2.0 | 2026-10-23 |
| [vercel/next-devtools-mcp](https://github.com/vercel/next-devtools-mcp) | 832 / 66 | — | 2026-09-15 |
| [vercel/next.js](https://github.com/vercel/next.js) | 143,205 / 34,886 | MIT | 2026-10-23 |
| [vercel-labs/agent-skills](https://github.com/vercel-labs/agent-skills) | 32,877 / 2,874 | — | 2026-10-14 |
| [github/github-mcp-server](https://github.com/github/github-mcp-server) | 33,890 / 5,220 | MIT | 2026-10-23 |
| [microsoft/playwright-mcp](https://github.com/microsoft/playwright-mcp) | 38,543 / 3,302 | Apache-2.0 | 2026-10-22 |
| [microsoft/playwright-cli](https://github.com/microsoft/playwright-cli) | 14,542 / 848 | Apache-2.0 | 2026-10-19 |
| [microsoft/playwright](https://github.com/microsoft/playwright) | 98,362 / 6,676 | Apache-2.0 | 2026-10-22 |
| [upstash/context7](https://github.com/upstash/context7) | 63,543 / 3,128 | MIT | 2026-10-23 |
| [shadcn-ui/ui](https://github.com/shadcn-ui/ui) | 126,320 / 13,297 | MIT | 2026-10-23 |
| [vercel/vercel](https://github.com/vercel/vercel) | 16,429 / 3,868 | Apache-2.0 | 2026-10-22 |

I fetched GitHub's global [daily Trending](https://github.com/trending?since=daily) and [weekly Trending](https://github.com/trending?since=weekly) pages on 23 October 2026. None of the 12 repositories above appeared on the returned pages (8 daily entries and 15 weekly entries); no language filter was applied. This is a dated membership check, not a trend score.

## Primary references

- InsForge [CLI repository](https://github.com/InsForge/CLI), [MCP setup](https://github.com/InsForge/InsForge/blob/main/docs/mcp-setup.mdx), [agent directory](https://insforge.dev/agents), and [Clerk integration](https://insforge.dev/integrations/clerk). The official Clerk bridge still needs validation against the chosen staging project and pinned SDK before implementation.
- Next.js [MCP guide](https://nextjs.org/docs/app/guides/mcp), Vercel [Agent Skills](https://vercel.com/docs/agent-resources/skills), and the [`next-skills` migration notice](https://github.com/vercel-labs/next-skills/blob/main/README.md). Vercel's directory still lists the older entry, but that README says `next-best-practices` is no longer a separate skill; current workflow skills moved to [`vercel/next.js/tree/canary/skills`](https://github.com/vercel/next.js/tree/canary/skills), while reference knowledge is delivered by bundled docs and generated `AGENTS.md` / `CLAUDE.md` on Next.js 16.3+.
- License evidence: [`next-devtools-mcp/package.json`](https://github.com/vercel/next-devtools-mcp/blob/main/package.json) declares MIT; the GitHub repo has no root `LICENSE`. The [`agent-skills` tree](https://github.com/vercel-labs/agent-skills/tree/main) and [`package.json`](https://github.com/vercel-labs/agent-skills/blob/main/package.json) expose no repo license file or `license` field, so copying/installing additional content remains pending terms confirmation.
- GitHub [MCP Server repository](https://github.com/github/github-mcp-server) and [repository REST endpoint](https://docs.github.com/en/rest/repos/repos#get-a-repository).
- Playwright [CLI and MCP comparison](https://github.com/microsoft/playwright-cli#playwright-cli-vs-playwright-mcp) and [Playwright Test docs](https://playwright.dev/docs/intro).
- shadcn [official source/CLI page](https://ui.shadcn.com/docs/official) and [MCP guide](https://ui.shadcn.com/docs/mcp); Context7 [MCP source](https://github.com/upstash/context7).
- skills.sh [registry documentation](https://www.skills.sh/docs), [React Best Practices listing](https://www.skills.sh/vercel-labs/agent-skills/vercel-react-best-practices), and [Web Design Guidelines listing](https://www.skills.sh/vercel-labs/agent-skills/web-design-guidelines).
