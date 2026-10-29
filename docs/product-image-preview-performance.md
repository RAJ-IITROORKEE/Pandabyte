# Product image preview performance

On 28 October 2026, a local review compared 69 reviewed image replacements against their earlier stored WebPs. Journaled file sizes totalled 45,131,594 bytes for the lossless originals and 7,453,282 bytes for the earlier lossy originals. These totals do not represent a page payload. A sequential three-image API sample also found larger 96 and 960 pixel lossless previews; this sample is not a production or network benchmark.

Public resized previews now use a process-local LRU cache bounded to 64 entries and 16 MiB. Every request still checks public media status before delivery and checks it again before returning; only validated public resized WebPs enter the cache. Private media and full-sized original reads bypass it, and HTTP responses remain private and no-store. The cache relies on the existing immutable registered-object policy. It is cleared on process restart and is not shared across instances. Simultaneous misses are not coalesced.

In a small sequential localhost test, two warm 960-pixel preview requests took 750 ms and 635 ms respectively, versus 1,214 ms and 1,183 ms on the corresponding earlier warm requests; another warm request took 2,564 ms. Cold requests included development-server compilation. These noisy examples do not establish page-load or production performance. The response bytes remained identical before and after caching.

A disposable authenticated test warmed a public preview, withdrew it, and observed anonymous 404 and authorized staff 200; after archive, anonymous access again returned 404. Unit tests cover cache bounds and lossless resized pixels. A DHT11 gallery was checked in the browser. Original PNGs and lossless source files were not changed.

## Cold-path follow-up

Resized previews now use their required decode-and-encode pass to validate the pixel data instead of performing an additional `stats()` decode first. Full-size and already-small images still receive the full validation pass before original bytes are returned. Concurrent requests for the same published resized preview share in-flight processing within the process; each request still performs its own final publication check. At most 16 keys are tracked, and overflow follows the existing independent path. This does not bound total simultaneous native work or share work across processes.

For one real 2000×2000 PNG-derived lossless sample, an in-memory 960-pixel encode took 337 ms with the extra decode and 227 ms without; the output hash was identical. A 96-pixel encode took 133 ms versus 28 ms. This is a single-machine sample, not an end-to-end guarantee. After the change, two cold 960-pixel requests for different images took 1,504 and 1,437 ms, while their repeat requests took 622 and 634 ms; an earlier cold request included development compilation. Network, storage and publication checks remain in the path.

Regression tests cover truncated lossy and lossless bitstreams with corrected container lengths at both preview sizes, shared work under concurrent withdrawal, failure recovery, and independent private/original paths. A new disposable live fixture confirmed anonymous 404 after withdrawal and archive, with authorized staff 200 after withdrawal. The full malformed-image space and production concurrency were not tested.

## Responsive product cards — 30 October 2026

The owner requested a hosted image and page-speed investigation while preserving original PNGs, lossless quality and media access controls. The Cloudflare `web-perf` skill was reviewed and installed project-locally at pinned commit `49a31e0b3229ccdffe4944be9c61bc7481d1d432`; its Snyk warning concerns untrusted third-party page content, and its Apache-2.0 license is retained with the skill. Browser trace tooling was not available; the following are limited direct HTTP samples, not Core Web Vitals or a load test.

On the existing hosted preview one product's 960-pixel WebP was 575,396 bytes and took 2,491 ms and 2,227 ms in two sequential requests; its 96-pixel preview was 11,678 bytes and took 696 ms. The homepage, catalog and sample product returned 200 in 3,767, 605 and 617 ms respectively in a single sequential pass. Times include network and are not a reliable before/after benchmark.

The media endpoint now accepts a bounded 480-pixel preview alongside 96 and 960, with its existing publication rechecks, private/no-store policy, validation and source-sensitive lossless encoding intact. Product cards offer 480 and 960 via `srcset`, allowing browsers to select according to viewport and pixel density; quick view and full-size image delivery retain their larger paths. In a localhost sample of the same image, the 480-pixel lossless variant was 176,920 bytes versus 575,396 bytes at 960 pixels (69% smaller). Resizing changes pixel dimensions; the resize output remains losslessly encoded, and source PNGs and original stored WebPs remain untouched.

Tests cover allowed sizes, pixel-exact lossless encoding of resized results, cache isolation and publication withdrawal during shared work. Local desktop and mobile browser checks showed product cards and quick view. These checks do not establish fleet-wide latency, actual Core Web Vitals, or a complete audit of all product images.

The reviewed source commit `32fd906` was promoted to the existing Vercel development preview as `dpl_FEKWXZ1rNi5xXSJVQdFbxS1Awgce` after its build passed. The hosted browser selected a 480-pixel source and showed the product cards. The same hosted sample returned 176,920 bytes at 480 pixels and 575,396 bytes at 960 pixels; sequential 480 requests took 1,603 and 1,437 ms, and a 960 request took 2,901 ms. Individual timings vary with network and server instances. Home, Shop and the sample product returned 200; simulation and Razorpay test capabilities remained false. No live payment or account/cart mutation was performed.

## Homepage category images — 30 October 2026

The hosted homepage requested 960-pixel category previews for cards displayed about 184 pixels wide. For one published category image, the 960-pixel response was 185,946 bytes and the 480-pixel response 65,212 bytes, approximately 65% smaller. The homepage now supplies both sizes using responsive sources and defers these below-hero images; larger displays can still select the 960-pixel preview. Both variants use the same publication and private-media checks; original files and encoding policy are unchanged. In local desktop and 390-pixel viewport checks all five category images loaded using the 480-pixel source.

Anonymous single-request measurements also showed homepage TTFB around 1.0 seconds and shop TTFB around 0.8 seconds, including network effects. These are not browser paint measurements. The homepage currently waits for several parallel public data reads before rendering its body; the benefit of streaming individual sections has not been measured. No CDN caching or changes to withdrawal checks were introduced.

## Homepage read profiling — 30 October 2026

The five homepage reads start concurrently; duplicate record reads are request-deduplicated. In two bounded local SDK samples, FAQ took about 2.9 s cold and 2.3 s warm, while product listing took about 3.2 s cold and 0.65 s warm. These are noisy local-to-backend samples, not hosted percentiles. Home and contact RPC calls returned non-success in this direct probe and were not attributed. The FAQ read now starts concurrently but renders under Suspense; a 550px minimum region reserves space on both sides of resolution. Failures still surface as errors, not fabricated empty results. The other reads and publication/withdrawal behavior are unchanged.

A local streamed HTML check saw the hero before the FAQ in two requests, but only by a few milliseconds in these samples; no user-visible timing gain is claimed. LCP, CLS and INP were unavailable from the browser tool; PageSpeed Insights returned quota 429. A hosted anonymous homepage sample recorded 894 ms TTFB and 1,080 ms total (one sample only). Production-build, FAQ interaction, circuit selection and media-delivery tests were checked locally. Hero raster URLs currently use the existing Next image optimizer at quality 75. Lossless 480px board re-encoding was 311,526 bytes, larger than the 301,876-byte source; the circuit artwork and its optimization were not changed.

## Circuit interaction trace — 30 October 2026

Chromium DevTools in Brave recorded the hosted development preview in a 761px responsive viewport, without CPU/network throttling. One sensor drag trace showed INP 203 ms (16 ms input delay, 39 ms processing, 147 ms presentation). A separate warm reload in the live metrics view showed LCP 1.57 s, CLS 0; this is one browser/device sample, not field data or a baseline for general users. One initial reload trace did not capture LCP. These data do not isolate the presentation delay to a particular CSS effect.

Pointer-move updates now coalesce to one animation frame, while a pending last position is flushed on release, cancel, capture loss and resize; Home and unmount cancel queued updates. The artwork, image files, CSS effects, geometry and media authorization were not changed. The frame-queue and projection tests, typecheck, lint and local drag/keyboard/reset checks passed. No measured INP improvement is claimed until a comparable production trace is recorded.
