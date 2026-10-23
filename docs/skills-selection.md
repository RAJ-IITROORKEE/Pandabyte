# Codex development skills

Reviewed 23 October 2026 by bounded Luna xhigh workers; root selected and integrated. Skills are instructions, not verified connections or application dependencies. Use primary documentation matched to installed versions when examples disagree.

| Skill | Scope and status | Use |
| --- | --- | --- |
| [find-skills](../.agents/skills/find-skills/SKILL.md) | Installed project-local from official [vercel-labs/skills](https://github.com/vercel-labs/skills) using the requested Skills CLI, targeted to Codex. MIT notice retained. | Discover a narrowly useful skill; inspect source, license, adoption and compatibility before adding it. |
| [clerk-nextjs-patterns](../.agents/skills/clerk-nextjs-patterns/SKILL.md) | Installed project-local from official [clerk/skills](https://github.com/clerk/skills). Skill frontmatter declares MIT; retained without claiming a blanket license for unrelated repository content. | Clerk v7 server checks, Next 16 proxy, auth routes, request/cache boundaries and future JWT bridge. |
| API design, security review, database migrations | Existing project-local ECC selection; [pinned source and MIT notice](ecc-skills.md). | Validate public input/session/ownership boundaries and review SQL migrations before execution. |
| InsForge CLI, SDK, integrations, debug | Available in this host's skill catalog. CLI linking installed/generated guidance; no project-local InsForge skill copy is claimed. Apache-2.0 exception retained. | CLI owns backend infrastructure; SDK owns app calls; integrations owns Clerk text-subject tokens/RLS; debug is for actual failures. |
| Vercel React Best Practices and Verification | Available through the existing Vercel plugin; no duplicate repository copy. | Review component/server boundaries and verify actual browser → server → data flows. |
| UI/UX Pro Max and reviewed design workflow | Existing host guidance and separate design chat ownership. | Apply relevant approved UI direction; do not install competing visual systems through discovery. |

The two new installs are recorded in [skills-lock.json](../skills-lock.json); file SHA-256 evidence is in [official-sources.json](../.agents/skills/official-sources.json). Clerk references/templates are reference material, not a second initialized application. Application lint excludes `.agents/` so copied vendor examples and a separately added design skill are not treated as app source.

The requested command was run with project scope and `--agent codex --yes`. No global configuration, hooks, unattended update task or duplicate MCP server was added. New skills are discoverable on the next Codex turn; this session read them directly before using their guidance.

Deferred: `clerk-setup` automatic provisioning (existing app/keys must be preserved), a broad Next skill collection (Next bundles current guidance), another browser MCP/CLI (the built-in browser already works), and optional Context7/DevTools until a concrete gap needs them. Popularity is a discovery signal, not proof of safety. Local CLI credentials and browser sessions do not transfer to cloud workers; verify each executor separately and keep secrets outside the repository.
