# Phase 6 — browsing capacity profile

The owner selected **100 simultaneous visitors, mostly browsing**, on 25 October 2026. This is a target, not a measured result. The repository remains on the existing Free development backend. Recovery objectives are still undecided; asking for their meaning did not approve the earlier proposed values.

## Proposed bounded exercise

Use an isolated staging dataset of approved representative products/images and a recorded application commit. Confirm provider request/storage/compute quotas and test budget first. Never load production, identity endpoints, private accounts, CAPTCHA, contact POST, email dispatch, checkout or payments. Public contact **GET** is safe for a separate smoke check; it is unnecessary in the browsing workload.

- Public browsing mix: 50% catalog/search, 20% product detail, 20% home, 10% company/editorial reads. Use a frozen finite route/query set; no crawler, arbitrary filters or unbounded pagination.
- Ramp virtual visitors through 1, 10, 25, 50 and 100, with a 30-second observation at each level after warmup. Model 20–30 seconds between page actions. Cap the first exercise at 5 first-party page requests/second, 10 in-flight requests and 300 total page requests. Record actual offered/completed rate and any limiter saturation; never claim the cap proves a higher throughput.
- Stop on a provider quota/rate-limit response, repeated timeouts, or sustained unexpected 5xx. Preserve the failed measurements; do not retry bursts or increase caps to obtain a pass. Error thresholds and proposed search p95 <=500 ms in the roadmap require an agreed dataset/request mix before evaluation.
- Measure first-party page/API timing, errors and bytes separately. Plain HTTP virtual visitors do not execute client JavaScript or constitute 100 concurrent real browsers. Use the built-in browser for representative populated-page rendering/interaction checks; those single-browser checks do not establish concurrent browser capacity or field Web Vitals.
- Keep all test records explicitly synthetic/disposable or approved isolated copies. Check ownership before cleanup, verify protected Admin/customer records and storage isolation afterward, and retain no customer bodies/tokens in reports.

No load runner, package, remote test or capacity certificate is added by this profile. The profile is prepared for review/execution after representative data, an appropriate target and provider constraints are established. Existing sequential localhost checks and the local image CPU comparison are narrower measurements, not this workload.
