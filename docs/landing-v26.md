# Selected homepage implementation

The owner selected [Superdesign Home v26](https://p.superdesign.dev/draft/011e75c8-d90c-40ed-aac8-bc39b8e2f1ba) on 24 October 2026, superseding the Phase 4 frozen v24 homepage reference for this landing update. The authenticated official CLI returned draft `011e75c8-d90c-40ed-aac8-bc39b8e2f1ba`, version 26. No dedicated Superdesign MCP is connected. The separate design chat's `.superdesign/` and delivery records are preserved; no draft regeneration/import or generation credits were used here.

## Layout and behavior

- Retain the exact PandaByte logo, current neutral/emerald tokens and live Clerk account/Agent controls. Content has a 1280px maximum with 16px side padding, increasing to 48px from 1024px. Main vertical padding is 48/64/112px.
- Desktop hero uses 40:60 columns, a 24–40px gap, copy padding of `clamp(40px,5vw,72px)`, and a 40–54px heading at 1.04 line height. Below 1024px the illustration comes first. Narrow-screen actions fit side by side where space allows.
- The 900×620 circuit has the selected xC6/shield composition, four sensors and cable paths, with spaced board labels. Pointer drag uses inverse perspective coordinates; keyboard users can move devices, rotate, inspect cables, reset with Home and clear with Escape. Selected devices animate signal/effect/OLED feedback. All readings remain samples; shield/pins/routes are unverified illustrations. Screen-reader help and provenance remain available without the removed visible instruction/inspector/legend panel.
- Preserve the reference sequence: hero, source logo strip, categories, two asymmetrical product cards, engineering support, FAQ and shared footer. The strip pauses on hover/focus and has a persistent keyboard-operable pause control. Reduced-motion CSS replaces the strip with a static grid and disables illustrative effects/entrance motion.
- Public records remain server-rendered, with a small pointer spotlight island and the existing interactive circuit. Independent reads run in parallel. React review used the [Vercel upstream guidance](https://github.com/vercel-labs/agent-skills/blob/main/skills/react-best-practices/SKILL.md); no new runtime dependency was installed.

## Published data remains authoritative

The layout does not publish the prototype's products, prices, stock or contact details. Homepage title/summary/blocks, category links, product media/current prices, FAQs and contact facts use existing published InsForge projections. The two product positions use the newest published records and say “Latest products”; no staff-curation field is implied. Actual availability remains visible. Empty states are intentional until the owner publishes approved records.

This creates deliberate differences from the mock-filled preview: Clerk's active identity replaces Login; the latest requested themed Agent button remains; factual catalog/contact content and missing content follow the backend. Shared navigation keeps its existing keyboard/mobile behavior. No purchase/checkout/payment work is resumed by this update.

## Asset provenance

The six exact selected-draft transparent PNGs are local under `public/brand/industry/`: Seeed/M5Stack light and dark variants, Waveshare and Espressif. They were downloaded from the draft's existing `content-assets/` URLs with bounded size, PNG magic-byte checks and SHA-256 records in the verification evidence. These are marks shown on the source PandaByte site, not a partnership, endorsement or licensing claim. Runtime markup uses local assets, not a Superdesign service/CDN dependency. The existing unchanged `/hero/` images and original logo are reused.

See [verification](verification/landing-v26.json) for actual checks and remaining limits. This is a local frontend checkpoint; production deployment, accessibility certification and capacity claims remain outside it.
