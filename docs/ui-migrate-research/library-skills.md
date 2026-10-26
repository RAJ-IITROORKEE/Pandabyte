# UI migration: library and skill research

Reviewed **26 October 2026**. Planning evidence only: no package or skill installation, upstream code execution, application/configuration/lockfile change, backend access, or `.superdesign/` change was performed. The current hero remains a protected migration constraint.

## Project baseline inspected

`package.json` pins Next **16.4.3**, React/React DOM **19.3.0**, Tailwind **4.3.3**, Lucide React **1.61.0**, TypeScript **5.9.3**, npm **11.16.0**, and Node **24.x**. There is no Lightswind, Motion, GSAP, Three.js, `clsx`, or `tailwind-merge` direct dependency. Existing components already use Lucide.

`app/theme.css` owns charcoal/white/emerald colors using complete CSS colors such as `--background: #fafafa` and `--accent: #146c43`, and switches themes with `data-theme`. Its protected `--pb-*` aliases already address collisions with generic vendor tokens. `app/globals.css` imports Tailwind and supplies shared focus and reduced-motion rules. Preserve those contracts and the existing theme controller.

Existing research and installation records were read: [development tooling](../development-tooling.md), [ECC selection](../ecc-skills.md), [ECC source manifest](../../.agents/skills/ecc-sources.json), [official skill selection](../skills-selection.md), and the project-local Find Skills instructions. Existing installations and new recommendations below are separate.

## Exact source identities

| Source | Immutable checkpoint / version | Evidence and terms |
| --- | --- | --- |
| Owner-requested [Lightswind repository](https://github.com/codewithMUHILAN/Lightswind-UI-Library) | Default branch `Master`, commit **53ef2ee0cf211a794a3bb4b2ed1e62d3f0f2544a**, committed **24 July 2026**; root package **3.2.2** | [Pinned package](https://github.com/codewithMUHILAN/Lightswind-UI-Library/blob/53ef2ee0cf211a794a3bb4b2ed1e62d3f0f2544a/package.json), [README](https://github.com/codewithMUHILAN/Lightswind-UI-Library/blob/53ef2ee0cf211a794a3bb4b2ed1e62d3f0f2544a/README.md), [MIT license](https://github.com/codewithMUHILAN/Lightswind-UI-Library/blob/53ef2ee0cf211a794a3bb4b2ed1e62d3f0f2544a/LICENSE). Copyright 2025 Muhilan; retain its copyright and permission notice with copied substantial source. |
| Published [Lightswind npm package](https://www.npmjs.com/package/lightswind/v/3.2.5) | Registry `latest` is **3.2.5**, published **8 September 2026** | [Version metadata](https://registry.npmjs.org/lightswind/3.2.5). Tarball manifest and CLI were read as data in memory; package code was not executed. Manifest declares MIT; the 19-file tarball omits a `LICENSE` file. |
| Owner-requested [ECC repository](https://github.com/affaan-m/ecc), canonical name `affaan-m/ECC` | Default branch `main`, commit **25278e7d7b6cf6e6a4e7a6c8e10f14ff22f0eb5b**, committed **26 October 2026**; package **2.2.3** | [Pinned source](https://github.com/affaan-m/ECC/tree/25278e7d7b6cf6e6a4e7a6c8e10f14ff22f0eb5b), [package](https://github.com/affaan-m/ECC/blob/25278e7d7b6cf6e6a4e7a6c8e10f14ff22f0eb5b/package.json), [MIT license](https://github.com/affaan-m/ECC/blob/25278e7d7b6cf6e6a4e7a6c8e10f14ff22f0eb5b/LICENSE). Copyright 2026 Affaan Mustafa; preserve its notice for any later selected copies. |
| Already installed project-local ECC subset | **90606c8315ee09cafc303515c5f33024db6b9882**, installed **23 October 2026** | `api-design`, `security-review`, `database-migrations` only, with retained MIT notice and hashes in the existing manifest. This review did not refresh them. |

Public GitHub metadata at review time reported Lightswind **1,214 stars / 126 forks** and ECC **289,253 stars / 42,858 forks**; neither was archived. These are dated discovery signals, not security or compatibility proof. Source: each repository's public REST metadata endpoint.

### Published artifact provenance

The `3.2.5` tarball's computed SHA-512 matched its npm registry integrity:

```text
sha512-APvRXg4zrHYprp0tPMYv8ufUPF77PjL73fFIIwTFn9gleCZSxTTcODHG9JtyXedGCBkFhQvDIzBtOX0JvtpenA==
```

Its CLI SHA-256 was `5d9a21d10af1d11496f3434d8ee310e60c57aae47bb46669c090afe8d079226d`. The registry's `gitHead` was `b37ab79ac7fcaa9a0aab23d9dbc1aa3ba517520a`; querying that commit in the requested public repository returned GitHub **422, no commit found**. Therefore the current public `Master` checkout must not be described as the exact `3.2.5` release source. Integrity confirms artifact identity against npm metadata; it is not a malware audit or a reproducible-build proof.

## Lightswind fit and installation constraints

The [official introduction](https://lightswind.com/components/introduction) and pinned README describe a source-copy library: application components should import reviewed local files, rather than importing component exports from `lightswind` or adding an invented provider. The npm package can supply CLI/build tooling; it does not itself migrate any page.

The published `3.2.5` manifest has one direct dependency, `fs-extra ^11.3.0`. React and React DOM peers accept versions 18 and 19. Other peers are explicitly optional, including `clsx`, `tailwind-merge`, class-variance-authority, Lucide, Framer Motion, AI SDK/OpenAI, GSAP and Three.js. This UI migration needs no AI SDK, AI service, WebGL or GSAP installation. Optional peers are not approval to add them.

| Concern | Observed evidence | Migration consequence |
| --- | --- | --- |
| React / Next | React 19 matches the declared peer range; official docs name Next App Router and Tailwind 4 support. Upstream development types still target React 18 in the public package. | Peer compatibility is plausible, but Next 16/React 19 runtime, type and hydration checks remain future work. Follow the installed Next documentation when implementing. |
| Tailwind class merging | `3.2.5` requests optional `tailwind-merge ^2.6.1`; public `3.2.2` declares `^2.2.0`. The official [tailwind-merge 3.7.0 README](https://github.com/dcastil/tailwind-merge/blob/tailwind-merge@3.7.0/README.md) supports Tailwind 4.0–4.3 and directs Tailwind 3 users to 2.6.0. | Block accepting the stock `cn` integration until the Tailwind-4-compatible utility/peer contract is resolved. Do not downgrade PandaByte or use peer-validation bypasses. A selected component may be adapted to existing controlled CSS instead, with its upstream notice retained. |
| Theme collision | [Public plugin](https://github.com/codewithMUHILAN/Lightswind-UI-Library/blob/53ef2ee0cf211a794a3bb4b2ed1e62d3f0f2544a/plugin.js) emits generic root tokens, HSL channel values, `.dark` selectors, default blue/cyan values and body styling. PandaByte uses full color values and `data-theme`. | Do not globally accept vendor token resets or choose a vendor theme. Review only the CSS needed by selected components and bind it to the existing PandaByte tokens. A global plugin import requires a separately reviewed diff proving no theme/hero regression. |
| Source utilities | [Shared utils](https://github.com/codewithMUHILAN/Lightswind-UI-Library/blob/53ef2ee0cf211a794a3bb4b2ed1e62d3f0f2544a/src/components/lib/utils.ts) include `cn`, a root `lightswind` side-effect import, USD/en-US formatting, random IDs and other helpers. | Copy/adapt only required utility behavior. Retain existing INR, ID, validation and business helpers. No root package side-effect import is justified by a presentational component. |
| Component dependencies | [Dependency map](https://github.com/codewithMUHILAN/Lightswind-UI-Library/blob/53ef2ee0cf211a794a3bb4b2ed1e62d3f0f2544a/bin/component-deps.json) and selected registry records vary: card/button use class utilities; input adds Motion and BorderBeam; dialog adds Motion; 3D surfaces add Three/OGL-related packages. | Select records one by one and review imports, internal dependencies, CSS, accessibility and entitlement. Do not add Motion to ordinary forms merely because the vendor input does. |
| Accessibility | The [dialog source](https://github.com/codewithMUHILAN/Lightswind-UI-Library/blob/53ef2ee0cf211a794a3bb4b2ed1e62d3f0f2544a/registry/dialog.tsx) declares dialog semantics and locks scrolling; the inspected source does not implement focus containment/restoration or an Escape handler. | Do not treat vendor accessibility claims as a passed audit. Keep current working interaction behavior and test any replacement. Prefer existing/native accessible behavior over importing a custom dialog just for appearance. |
| Client boundaries | Several registry files use hooks/context without an explicit client directive. | Add a client boundary only where required and keep server-rendered content/data loading intact. No site-wide client conversion. |

### CLI behavior that the implementation must avoid

Both the pinned [public CLI](https://github.com/codewithMUHILAN/Lightswind-UI-Library/blob/53ef2ee0cf211a794a3bb4b2ed1e62d3f0f2544a/bin/lightswind.js) and the inspected published CLI require review as executable tooling:

- `init` calls `installAll`: it enumerates and copies all free components, or whole professional/animated categories when filtered. It is not a harmless configuration-only initializer.
- The CLI fetches mutable hosted registry data from `/api/registry` and `/r/<name>.json`; pinning the npm CLI does not pin downloaded component bytes. Record and review each accepted component's source URL and hash.
- `add` writes component source and recursively resolves internal dependencies. The installer can invoke the package manager using dependency strings assembled from remote registry metadata and detected imports. The inspected shell command construction does not provide a sufficient trust boundary for unattended remote dependency installation.
- Published `3.2.5` retries a failed npm installation with `--legacy-peer-deps`. Do not accept that fallback for this project.
- Full/category installation copies utilities, configures the Tailwind plugin and sends a hosted analytics POST containing component names, operation type and timestamp. Review these effects before any CLI use; do not assume it is an offline source copier.
- `init-cursor` overwrites `.cursorrules` and `.windsurfrules`; `mcp init` changes editor MCP configuration. Neither is needed for PandaByte. No new MCP, browser extension, credentials or Pro login is required by the migration.

### Future package installation, after implementation is authorized

This exact npm version and command form are verified; the command was **not run**:

```powershell
npm install --save-dev --save-exact --ignore-scripts lightswind@3.2.5
```

This proposes a pinned tooling dependency because components are copied locally and the package plugin is build tooling. Before running it, recheck release/advisory metadata and the reviewed artifact identity, and review the resulting dependency/lockfile diff. `--ignore-scripts` suppresses install lifecycle execution; it does not audit dependencies or authorize later CLI execution. Stop on dependency conflicts; do not append `--legacy-peer-deps` or `--force`. If a newer version solves the verified blockers, review and pin it explicitly instead of silently switching to `latest`.

Then integrate only reviewed, selected source. A minimal pilot is a simple **card or badge** on a non-hero surface, mapped to the existing tokens and Lucide family; shared buttons can follow after link/button semantics and pending/disabled behavior pass. [Card record](https://github.com/codewithMUHILAN/Lightswind-UI-Library/blob/53ef2ee0cf211a794a3bb4b2ed1e62d3f0f2544a/registry/card.json), [badge record](https://github.com/codewithMUHILAN/Lightswind-UI-Library/blob/53ef2ee0cf211a794a3bb4b2ed1e62d3f0f2544a/registry/badge.json), [button record](https://github.com/codewithMUHILAN/Lightswind-UI-Library/blob/53ef2ee0cf211a794a3bb4b2ed1e62d3f0f2544a/registry/button.json). These are candidates, not accepted rendered designs. Defer animated inputs, dialogs, full navigation replacements, backgrounds, cursors, 3D, full templates and new hero effects until there is a concrete need and bounded review.

The repository MIT grant covers its licensed source. The [hosted pricing page](https://lightswind.com/pricing) separately describes Pro components, blocks, decrypted files, CLI keys and individual/team entitlements. Its retrieved price cards and FAQ were inconsistent; no purchase price, Pro entitlement or blanket team-key permission is inferred. Use the reviewed public MIT subset. Any hosted Pro asset requires its own verified terms and owner authorization; no purchase, key collection or hosted configuration is part of this plan.

## Selective skill adoption

The existing project-local Find Skills guidance was used for discovery: inspect the directory first, then actual source/terms; do not install a result on popularity alone. The [skills.sh directory](https://skills.sh/) currently lists Vercel React Best Practices, Web Design Guidelines and UI/UX Pro Max. Individual ECC frontend skill install counts could not be verified: the two attempted exact directory pages were inaccessible through the web tool. No count is invented and no Skills CLI command was run.

Keep the already available **UI/UX Pro Max**, **Impeccable**, **Vercel React Best Practices**, **Vercel Verification**, **Ponytail**, and the reviewed design workflow as the primary migration guidance. Preserve the separate chat's existing untracked `.agents/skills/impeccable/`; this review neither installed nor changed it. Keep the three installed ECC backend/security skills pinned; a UI request does not justify updating the entire ECC collection.

For an additional ECC UI skill, the minimum useful selection is **one documentation-only skill**, recommended for a later authorized targeted install:

| Skill | Pinned file / review | Use and limits |
| --- | --- | --- |
| **frontend-a11y** | [Source at reviewed commit](https://github.com/affaan-m/ECC/blob/25278e7d7b6cf6e6a4e7a6c8e10f14ff22f0eb5b/skills/frontend-a11y/SKILL.md), Git blob `a39419935900b1ac1003827d83c896610350b619`; one `SKILL.md`, no bundled scripts | Focused review of labels/errors, semantic controls, icon names, keyboard behavior, live regions, focus and reduced motion. Examples are guidance: the modal example explicitly does not implement a full focus trap; its Clerk-like login form is not a reason to replace Clerk. Use the current project controls and official WAI patterns when examples are incomplete. Not installed by this review. |
| **make-interfaces-feel-better** | [Reviewed source](https://github.com/affaan-m/ECC/blob/25278e7d7b6cf6e6a4e7a6c8e10f14ff22f0eb5b/skills/make-interfaces-feel-better/SKILL.md), Git blob `e589f3f30312ac4e522dfbdd3e592862f69fd008`; one `SKILL.md`, no bundled scripts | Useful optional finishing checklist for icon alignment, text wrapping, hit areas and explicit transitions. Defer installation: existing UI guidance already covers most of this. No generic image outline or animation recipe should override real product photography or reduced motion. |
| **design-system** | [Reviewed source](https://github.com/affaan-m/ECC/blob/25278e7d7b6cf6e6a4e7a6c8e10f14ff22f0eb5b/skills/design-system/SKILL.md) | Its audit dimensions are useful reference. Do not run its generation workflow, create competing token files or research competitors automatically; PandaByte's approved tokens and hero are already defined. No install needed. |
| **frontend-patterns** / **frontend-design-direction** | [Patterns](https://github.com/affaan-m/ECC/blob/25278e7d7b6cf6e6a4e7a6c8e10f14ff22f0eb5b/.agents/skills/frontend-patterns/SKILL.md), [direction](https://github.com/affaan-m/ECC/blob/25278e7d7b6cf6e6a4e7a6c8e10f14ff22f0eb5b/skills/frontend-design-direction/SKILL.md) | Broad overlap with installed guidance. The direction skill includes an executable evidence checker and optional external reference service. Do not add either for this migration. Reuse existing evidence records and built-in-browser checks. |

A targeted future install can use the existing Codex skill installer with its verified `--ref`, `--path` and `--dest` options. Example only; **not run**:

```powershell
python "C:/Users/rajra/.codex/skills/.system/skill-installer/scripts/install-skill-from-github.py" --repo affaan-m/ECC --ref 25278e7d7b6cf6e6a4e7a6c8e10f14ff22f0eb5b --path skills/frontend-a11y --dest "E:/Web development/PROJECTS-FULL STACK/Pandabyte/.agents/skills"
```

If later adopted, retain the applicable upstream MIT notice, record the new commit/path/hash in a manifest without rewriting the historical pin for the three existing copies, and report next-turn discoverability truthfully. Installing this Markdown must not install ECC's npm package, hooks, global config, learning runtime, MCP setup, executable scripts, auto-updates or broader rules. Source skill text does not authorize any of those actions.

## Integration gates for the root plan

1. Accept the owner's library choice, preserve the exact logo/current hero and make the adoption bounded. Source-copy integration must preserve current routes, content props, validation, ownership/access controls and publication behavior.
2. Resolve class-merging/peer compatibility and theme collisions before integrating shared utilities or global plugin CSS. Do not relax dependency checks to meet an installation checkbox.
3. Keep existing Lucide **1.61.0** named imports, one icon family and its retained ISC notice. Replacing the icon family or upgrading it is unnecessary.
4. Review local source and accepted dependency/license deltas before executing any installer. Install no Pro assets or additional services.
5. During later implementation, run the project's applicable lint/typecheck/build and focused logic checks, then actual built-in-browser desktop/mobile, both-theme, keyboard/focus and runtime reduced-motion checks. Report actual zoom and screen-reader coverage separately from DOM/source/viewport observations.

Not checked here: app installation/build/runtime compatibility, vulnerability scan of the resulting dependency graph, rendered Lightswind components, actual zoom or screen-reader speech, a Pro contract, or a production service. The remaining library integration risks are the verified peer/token conflicts, mutable hosted registry input and unproven runtime accessibility; they are implementation gates, not reasons to change backend scope.
