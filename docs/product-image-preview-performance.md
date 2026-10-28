# Product image preview performance

On 28 October 2026, a local review compared 69 reviewed image replacements against their earlier stored WebPs. Journaled file sizes totalled 45,131,594 bytes for the lossless originals and 7,453,282 bytes for the earlier lossy originals. These totals do not represent a page payload. A sequential three-image API sample also found larger 96 and 960 pixel lossless previews; this sample is not a production or network benchmark.

Public resized previews now use a process-local LRU cache bounded to 64 entries and 16 MiB. Every request still checks public media status before delivery and checks it again before returning; only validated public resized WebPs enter the cache. Private media and full-sized original reads bypass it, and HTTP responses remain private and no-store. The cache relies on the existing immutable registered-object policy. It is cleared on process restart and is not shared across instances. Simultaneous misses are not coalesced.

In a small sequential localhost test, two warm 960-pixel preview requests took 750 ms and 635 ms respectively, versus 1,214 ms and 1,183 ms on the corresponding earlier warm requests; another warm request took 2,564 ms. Cold requests included development-server compilation. These noisy examples do not establish page-load or production performance. The response bytes remained identical before and after caching.

A disposable authenticated test warmed a public preview, withdrew it, and observed anonymous 404 and authorized staff 200; after archive, anonymous access again returned 404. Unit tests cover cache bounds and lossless resized pixels. A DHT11 gallery was checked in the browser. Original PNGs and lossless source files were not changed.

## Cold-path follow-up

Resized previews now use their required decode-and-encode pass to validate the pixel data instead of performing an additional `stats()` decode first. Full-size and already-small images still receive the full validation pass before original bytes are returned. Concurrent requests for the same published resized preview share in-flight processing within the process; each request still performs its own final publication check. At most 16 keys are tracked, and overflow follows the existing independent path. This does not bound total simultaneous native work or share work across processes.

For one real 2000×2000 PNG-derived lossless sample, an in-memory 960-pixel encode took 337 ms with the extra decode and 227 ms without; the output hash was identical. A 96-pixel encode took 133 ms versus 28 ms. This is a single-machine sample, not an end-to-end guarantee. After the change, two cold 960-pixel requests for different images took 1,504 and 1,437 ms, while their repeat requests took 622 and 634 ms; an earlier cold request included development compilation. Network, storage and publication checks remain in the path.

Regression tests cover truncated lossy and lossless bitstreams with corrected container lengths at both preview sizes, shared work under concurrent withdrawal, failure recovery, and independent private/original paths. A new disposable live fixture confirmed anonymous 404 after withdrawal and archive, with authorized staff 200 after withdrawal. The full malformed-image space and production concurrency were not tested.
