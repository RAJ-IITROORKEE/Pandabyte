# Phase 6 — remaining accessibility follow-up

26 October 2026, after `91109c5`. The owner authorized bounded Luna xhigh reviews, browser checks, fixes and a local commit. The checked journey is keyboard/assistive-technology semantics → public product/hero and account/Admin forms → validation or private preview → readable feedback and focus recovery. Content publication, checkout/payments, load tests, deployment, live email/billing and recovery remain deferred.

## Fixes

- Contact submission and challenge error regions no longer override `role="alert"` with a polite live setting. Status regions retain their implicit polite behavior; Turnstile nonce, token/reset callbacks and submission validation are unchanged.
- Hero circuit focus now takes priority over pointer hover. The live region tracks focus/selection instead of transient hover and calls the inspected item “highlighted,” preserving sample/proposed-hardware caveats. Initial render stays silent. Existing keyboard selection, movement, Escape/reset and CSS reduced-motion rules remain.
- Account profile/address errors and file-upload failures have focus targets and form descriptions. File help/error text is linked to the upload control; busy/loading/success states retain announcements. Successful file deletion returns focus to a remaining Delete control or file chooser instead of a removed button.
- Admin editor API errors receive focus, and forms describe their validation/error summaries. The private draft preview has an H2 title under the editor's single H1 and describes its staff-only boundary. Pricing/inventory/inquiry/media error descriptions and focus targets, busy states and polite result counts were improved. Table selection now uses the existing real buttons instead of mouse-only row handlers.
- Opening private account files at 320px exposed a real overflow in both themes. The file input and its wrapper now shrink to their container. Final browser checks confirm no overflow with the panel open and an upload error visible.

No backend schema, authorization, API validation, dependency, lockfile, content record or publication behavior changed. Native Archive/confirmation flows were not redesigned. The prior site-control/publication gates remain intact.

## Actual verification

Final lint, typecheck and production build pass; all **125 unit tests**, seven auth HTTP, three shell HTTP and two security HTTP checks pass. These existing suites are regressions, not a screen-reader certification. Focus/motion behavior was asserted in the built-in browser rather than adding tests that merely mirror markup.

Forty final reflow cases cover Account (private files open with an error), Contact, unsaved Admin preview, Home and product gallery at **320/768/1024/1440 CSS pixels in light/dark**. Each has no document overflow and one main H1. The initial Account 320px failures are retained separately from passing results.

Browser interactions verify:

- Empty Contact submission is stopped by native required-field validation and focuses Name; no inquiry is sent and no CAPTCHA is manually completed.
- Missing account file focuses the required chooser. A synthetic zero-byte `.txt` is rejected by the existing endpoint **before storage access**, focuses the error and links it to the chooser. Two such rejected requests exercised the first and final builds; no file was stored, and the account still has no uploaded files.
- Empty new-address submission focuses Address label; Cancel returns to Add address. No address was created/edited/deleted.
- Empty Admin draft validation focuses a human Title/Slug summary, now associated with the form. An unsaved preview exposes one H1 plus its document H2 and private notice. Test text was cleared without saving/publishing a record.
- Media-row Enter selection exposes pressed state and focuses the existing detail heading; results have a polite count region. No metadata was saved or asset archived.
- Circuit initial live silence, keyboard priority over the pointer's previous target, sample caveats, Space selection and Escape clearing pass. The existing logo-animation pause control pauses the running animation.
- Gallery image selection works with Enter, exposes the selected state and retains nonempty main-image alt text. Owner session is retained, no observed application console errors, viewport override reset, original product route left open.

Profile requests were **not** submitted to force an error: the browser sanitized the control-character fixture and enforced the 48-character input limit, so the submission guard stopped the attempted fixtures and the original UI value was restored. Save/delete failures for profiles/addresses/files and operational mutations were source-reviewed where a live check would require unnecessary real-data changes. No fake session, request interception or test-only application mode was introduced.

## Remaining manual gates — not passed

| Gate | What happened here | Still needed |
| --- | --- | --- |
| Genuine browser zoom / text resizing | The supported browser capability exposes viewport size only. A native zoom shortcut left both CSS viewport and device-pixel ratio unchanged. Native app controls were in use; no app/OS preferences were changed. | Verify actual 200% text/zoom and 400% reflow in a controlled browser session. Viewport checks are useful layout evidence, not a claim that native zoom was exercised. |
| Runtime reduced-motion preference | The actual runtime reported `prefers-reduced-motion: false`. No media-emulation control is exposed. Existing global/Home/circuit CSS disables animations/transitions under reduction; runtime pause was tested. | Run with the user's actual reduced-motion preference enabled and verify the fallback across pages. Source review and a pause button are not that test. |
| Real screen reader | DOM/AX names, headings, descriptions, roles and live-region behavior were inspected; the native product accessibility tree exposed its labels. No supported reader-speech capture was available. | Human-assisted Narrator/NVDA or equivalent checks for navigation, forms, errors, preview and circuit announcements. No reader was installed/enabled and no speech-output pass is claimed. |

The first file-chooser attempt ran while the private-files disclosure was closed and timed out. Opening the disclosure allowed the documented chooser flow to pass; no upload occurred during the failed attempt. This is distinct from the remaining zoom/motion/reader limits above.

[Machine-readable evidence](verification/phase-6-accessibility-followup.json) records passing cases, the initial overflow and limitations. This checkpoint does not complete the full Phase 6 accessibility/release exit. Owner content/rights approval, production settings, capacity and recovery gates also remain open. Full publishing or account-mutation suites were not run under the current hold.
