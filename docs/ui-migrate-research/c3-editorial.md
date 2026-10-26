# C3 editorial presentation

26 October 2026. Bounded CSS-only implementation after C1 `0b328f6`; root owns integration, browser checks and the checkpoint commit. Owned files: `components/editorial/editorial.module.css` and this note.

Read the UI migration plan, existing theme/global/document styles, Ponytail, UI/UX Pro Max and the saved Superdesign design system and Learn/blog/help HTML. Root verifies the current remote draft versions and fingerprints separately; local file inspection alone is not current remote or rendered verification.

## Gaps addressed

- Dense 16px card gaps and 20px minimum padding become 24px gaps and 24–32px padding, with restrained 12px panels. Existing neutral surfaces and emerald/mint tokens remain authoritative.
- Search controls wrap before squeezing at intermediate widths; their labels retain a 200px flex basis and the existing single-column mobile layout. Search buttons receive the same visible focus treatment as form buttons.
- Disabled contact fields/buttons remain readable with neutral theme tokens, while pending has a progress cursor and successful live status uses the accent. Labels, native validation, disabled conditions, Turnstile, live status and all submission/retry logic are untouched.
- Native FAQ disclosure spacing, open borders, long-word wrapping and table headers improve readability. The document table's existing horizontal overflow and semantic markup remain. Table rules only reach documents inside existing `.stack` or `.faqAnswer` containers; standalone article pages retain their existing global document styling.
- The privacy video placeholder now uses theme surfaces/text rather than a fixed black surface with a light-theme muted note. Its unloaded state has an intrinsic minimum height instead of forcing title/button/disclosure text into a narrow 16:9 crop; the loaded iframe retains 16:9. No iframe is created before the existing user click, and no autoplay is added.
- Team list reset removes native list indentation; existing avatars use `contain` to preserve full source images. Long card, team and FAQ content can wrap without growing the grid.

## Callers reached

| Existing class family | Existing callers/routes |
| --- | --- |
| `stack`, `grid`, `card`, metadata/tags | `EditorialCard`; Learn collections, YouTube list, Blog and Solutions lists; policies/help stacks |
| `filters`, `filterLink`, `searchForm`, `pagination` | Learning collection navigation, blog search/topic/clear controls, editorial pagination |
| `form`, `formRow`, `formStatus` | Existing `ContactForm` inside the dedicated Contact company layout |
| `teamCard`, `avatar` | `TeamGrid` inside About |
| `faqList`, `faqItem`, `faqAnswer` | Shared `FaqList` on Home and Help; populated published answers only |
| `videoFrame`, `videoPoster`, `videoButton`, `videoNote` | Existing `VideoPlayer` on individual Learn YouTube pages |

No TSX, global/company styles, API, data/content, configuration, dependencies or Superdesign files changed. Existing empty datasets remain empty. No decorative motion or new component is introduced; property-specific transitions use 160ms and the existing global reduced-motion rule removes them.

## Verification and limits

- `git diff --check -- components/editorial/editorial.module.css`: passed.
- Parsed the CSS with the installed PostCSS parser: passed (69 top-level nodes at this checkpoint).
- Root owns full build/lint and built-in-browser comparisons at 320/768/1024/1440px in both themes. This note does not claim those checks or populated FAQ/team/video coverage have passed.
- No inquiry submission, remote media playback, CMS publication, seed content, backend/service changes, load tests or deployment performed. CSS uses modern `:has()` only to distinguish the existing unloaded video placeholder; browsers without it keep the prior aspect-ratio fallback.

Root integration update, 26 October 2026: this bounded source slice passed integrated lint/type/build and the applicable browser matrix. Historical worker pending gates above are superseded by [final evidence](../verification/ui-migrate-final.json) and [the handoff](../../ui-migrate-handoff.md); manual gates remain explicit there.
