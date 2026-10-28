# Product image preview performance

On 28 October 2026, a local review compared 69 reviewed image replacements against their earlier stored WebPs. Journaled file sizes totalled 45,131,594 bytes for the lossless originals and 7,453,282 bytes for the earlier lossy originals. These totals do not represent a page payload. A sequential three-image API sample also found larger 96 and 960 pixel lossless previews; this sample is not a production or network benchmark.

Public resized previews now use a process-local LRU cache bounded to 64 entries and 16 MiB. Every request still checks public media status before delivery and checks it again before returning; only validated public resized WebPs enter the cache. Private media and full-sized original reads bypass it, and HTTP responses remain private and no-store. The cache relies on the existing immutable registered-object policy. It is cleared on process restart and is not shared across instances. Simultaneous misses are not coalesced.

In a small sequential localhost test, two warm 960-pixel preview requests took 750 ms and 635 ms respectively, versus 1,214 ms and 1,183 ms on the corresponding earlier warm requests; another warm request took 2,564 ms. Cold requests included development-server compilation. These noisy examples do not establish page-load or production performance. The response bytes remained identical before and after caching.

A disposable authenticated test warmed a public preview, withdrew it, and observed anonymous 404 and authorized staff 200; after archive, anonymous access again returned 404. Unit tests cover cache bounds and lossless resized pixels. A DHT11 gallery was checked in the browser. Original PNGs and lossless source files were not changed.
