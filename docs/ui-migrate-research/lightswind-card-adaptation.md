# Lightswind Card pilot adaptation

26 October 2026. C1 source review and bounded local adaptation; rendered acceptance belongs to root's integrated checkpoint.

## Pinned source and attribution

- Project: Lightswind UI Library, author `codewithmuhilan <https://lightswind.com>`.
- Commit: `53ef2ee0cf211a794a3bb4b2ed1e62d3f0f2544a`.
- [Card registry record](https://raw.githubusercontent.com/codewithMUHILAN/Lightswind-UI-Library/53ef2ee0cf211a794a3bb4b2ed1e62d3f0f2544a/registry/card.json), SHA-256 of downloaded bytes: `eae7bc7fd1a26457e7e40ddd17e5d9890b408ab2eb4dbdfd39e210c2e97493e8`.
- Registry `files[0].content` (`r/card.tsx`), SHA-256 after JSON decoding and UTF-8 encoding with original embedded CRLF preserved: `3615475009333e520b4fef7bd96f087ddc2fc9b4301a93c6582d28bb79a73996`.
- [MIT license at the same commit](https://raw.githubusercontent.com/codewithMUHILAN/Lightswind-UI-Library/53ef2ee0cf211a794a3bb4b2ed1e62d3f0f2544a/LICENSE), SHA-256 of downloaded bytes: `d8c8591649194222fe903275f10094a21e5ea04a4405d11afbefd7e61e9119c3`.

Fetched and read as source data without executing registry code or its installer. These fingerprints identify public source, not the separate npm package or hosted Pro assets. No license claim extends to Pro.

## Reviewed changes and API

The upstream record exports Card, CardHeader, CardFooter, CardTitle, CardDescription and CardContent. Its only imports are React and a shared `cn` helper; the registry requests `clsx` and `tailwind-merge`. The three accepted primitives need no state, effect, external request or client directive. Only Card, CardTitle and CardDescription are retained locally, in `components/ui/card.tsx` with colocated CSS Modules.

- `Card`: native `ComponentProps<"div">`, plus optional `as="div" | "section"` (default `div`). The pilot must use `section` to preserve existing EmptyState semantics. Its native ref is an HTMLElement-compatible div/section ref; no forwardRef wrapper or client conversion is needed on React 19.
- `CardTitle`: native `ComponentProps<"h3">`, plus optional heading `as` from `h1` through `h6` (default `h3`). EmptyState must retain `as="h2"`. This also corrects the upstream title ref's paragraph-element typing.
- `CardDescription`: native `ComponentProps<"div">`; renders a div rather than the upstream p because existing EmptyState children may themselves contain paragraphs, links or other blocks. No content or messages are changed.
- All three preserve supplied native attributes, children and className. No class-merging dependency is required for controlled CSS Module class composition.

`Card` owns surface/foreground, border, 12px corners and minimum width. `CardTitle` owns title typography; `CardDescription` owns muted text and line height. The consumer owns padding, surrounding margin, title/body spacing and action layout. The existing `--surface`, `--foreground`, `--muted` and `--divider` variables retain the current data-theme/system fallback without new tokens or global selectors.

The upstream Card shape/title/description composition is retained while unused hoverable/bordered/compact/size/spacing/alignment/padding options and unused slots are removed. Vendor translucent colors, shadow and Tailwind utility classes are replaced with the existing PandaByte surface treatment. No vendor utils, root side effects, icon pack, theme controller, plugin, animation or dependency is added.

Scope inspected: existing EmptyState and its public/error-route callers, page-frame CSS, theme variables and installed Next CSS/server-component guidance. Root owns the sole initial caller migration, shared spacing and license-ledger entry. The card module does not change hero, logo, data, routes, auth or backend files.

Scoped TypeScript compiler API review passed with strict/noEmit, the installed React types and a virtual CSS Module declaration; it wrote no generated files. Full project lint/type/build and browser checks are root's integration gates. CSS import order, rendered wrapping and both-theme appearance must be checked there; source inspection alone does not prove those checks.

## Retained MIT notice

```text
MIT License

Copyright (c) 2025 Muhilan (codewithMUHILAN) — Lightswind UI

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```
