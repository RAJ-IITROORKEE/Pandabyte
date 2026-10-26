# C2 homepage lower sections

26 October 2026. Scope: `app/page.tsx` below the unchanged `HomeHero` invocation and lower-section rules in `components/home.module.css`.

Compared against the saved Home v26 `.superdesign/review/homepage.html`, the implementation keeps the logos → categories → two hardware cards → support → FAQs sequence, 64/112px section rhythm and 1.15/.85 desktop hardware columns. The selected theme's neutral surfaces, existing foreground/muted/accent tokens and current data remain authoritative.

- Category links retain real titles/slugs, bounded sorted categories and wrapping chip layout. Small decorative Lucide chevrons, a surface background and balanced inner spacing make the links clearer without assigning speculative category identities.
- Section headings use tighter tracking and balanced wrapping; the catalog chevron is a compact 18px. Hardware continues to use the existing `ProductCard` unchanged, including source-observation/non-offer presentation and the newest-two server query.
- Support retains bounded site copy and conditional published contact fields. Its own CTA has a 20px mail icon and 48px target; contact rows have consistent spacing and label alignment. No prototype contacts, availability or response promises were copied.
- FAQs keep the existing native disclosures or honest unpublished empty state. Their 896px content/768px heading bounds follow v26's readable layout.

No new dependency, data access, client boundary, publication or commerce behavior. Empty states continue to reuse the C1 Card-backed `EmptyState` through its existing caller.

## Source verification

An assert-based Node check passed against HEAD:

1. Exact equality of the page prefix through the complete `</HomeHero>`: imports, server reads, metadata, category ordering and hero markup/props remain unchanged.
2. PostCSS rule comparison preserves every rule containing `homeMain`, `homeInner`, hero, eyebrow/title-accent, shared primary/secondary actions and brand selectors, including their media-query parents. Hero/shared action/brand CSS is unchanged.
3. Latest-two query, unchanged featured `ProductCard` invocation, `HomeBrands` and conditional `FaqList` invocation remain present.
4. `git diff --check` passed for the two implementation files.

Browser, theme/viewport, keyboard and runtime reduced-motion checks, typecheck/build and overall C2 integration belong to root. This source check does not claim rendered coverage or production readiness.

Root integration update, 26 October 2026: this bounded source slice passed integrated lint/type/build and the applicable browser matrix. Historical worker pending gates above are superseded by [final evidence](../verification/ui-migrate-final.json) and [the handoff](../../ui-migrate-handoff.md); manual gates remain explicit there.
