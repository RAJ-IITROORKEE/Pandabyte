# Phase 4 guide dependency inspection

This is an artifact and advisory review, not approval to install or ship these packages. On 5 November 2026, `scripts/review-guide-dependencies.py --run` inspected all 44 wheels in the ignored Phase 4 resolution, including 27 packages absent from the existing 17-pin runtime. The resolver report SHA-256 was `0a1d1aafb69e73417e66abf8b2165592d9279f959abc658cc4e6d1f4d1b13783`. All 44 public `files.pythonhosted.org` downloads matched the exact recorded SHA-256; no package was installed. The ignored machine-readable review retains per-wheel hashes, notice paths and hashes, and embedded SBOM components. It does not contain source-corpus or credential material.

The table is wheel-declared license metadata, not a legal conclusion. Each of the 44 artifacts includes at least one license/notice text. Orjson 3.13.0 explicitly declares **`MPL-2.0 AND (Apache-2.0 OR MIT)`** and contains all three named texts; it must not be described as MIT-only. The base runtime already includes certifi with an MPL-2.0 declaration. Four wheels contain CycloneDX manifests: pydantic-core (101 component records), orjson (20), ormsgpack (29), and uuid-utils (35). Their 185 records all carry license expressions, including Unicode-3.0, BSL-1.0 and alternatives; SBOM scope distinguishes some build-only entries. An embedded manifest does not establish that all native binary components or obligations are fully enumerated.

The exact package versions were queried against [OSV's batch API](https://google.github.io/osv.dev/post-v1-querybatch/), [PyPI's release JSON](https://docs.pypi.org/api/json/), and [GitHub's global advisory API](https://docs.github.com/en/rest/security-advisories/global-advisories) for reviewed, unreviewed and malware advisories. The recorded scan returned zero matches and zero query errors. This is a point-in-time lookup, not a security certification, a transitive native-component vulnerability scan, or proof that a reported issue is reachable. New advisories can appear, and provider data can lag.

Before distributing a derived image, independently review component-specific license obligations, source availability and notices for the selected artifacts; preserve the required full license and notice texts with the image. No notice files have yet been added to the shipping image. Tracing/network behavior, dependency necessity, container size, startup, memory and runtime tests also remain separate gates.

| Package | Version | Runtime baseline | Declared license metadata | Bundled notice files |
| --- | --- | --- | --- | ---: |
| langgraph | 1.2.20 | new | MIT | 1 |
| annotated-doc | 0.0.5 | existing | MIT | 1 |
| annotated-types | 0.8.0 | existing | MIT | 1 |
| anyio | 4.16.0 | existing | MIT | 1 |
| certifi | 2026.10.23 | existing | MPL-2.0 | 1 |
| click | 8.5.0 | existing | BSD-3-Clause | 1 |
| fastapi | 0.162.0 | existing | MIT | 1 |
| h11 | 0.16.0 | existing | MIT | 1 |
| httpcore | 1.0.9 | existing | BSD-3-Clause | 1 |
| httpx | 0.28.1 | existing | BSD-3-Clause | 1 |
| idna | 3.20 | existing | BSD-3-Clause | 1 |
| opentelemetry-api | 1.45.2 | existing | Apache-2.0 | 1 |
| pydantic | 2.14.2 | existing | MIT | 1 |
| pydantic_core | 2.50.2 | existing | MIT | 1 |
| starlette | 1.10.0 | existing | BSD-3-Clause | 1 |
| typing-inspection | 0.4.5 | existing | MIT | 1 |
| typing_extensions | 4.16.0 | existing | PSF-2.0 | 1 |
| uvicorn | 0.54.0 | existing | BSD-3-Clause | 1 |
| langchain-core | 1.7.6 | new | MIT | 1 |
| langgraph-checkpoint | 4.3.1 | new | MIT | 1 |
| langgraph-prebuilt | 1.1.1 | new | MIT | 1 |
| langgraph-sdk | 0.4.13 | new | MIT | 1 |
| xxhash | 4.0.2 | new | BSD-2-Clause | 1 |
| jsonpatch | 1.42 | new | BSD-3-Clause | 2 |
| langchain-protocol | 0.0.20 | new | MIT | 1 |
| langsmith | 0.14.17 | new | MIT | 1 |
| orjson | 3.13.0 | new | MPL-2.0 AND (Apache-2.0 OR MIT) | 3 |
| ormsgpack | 1.13.0 | new | Apache-2.0 OR MIT | 2 |
| packaging | 26.3 | new | Apache-2.0 OR BSD-2-Clause | 3 |
| PyYAML | 6.0.3 | new | MIT | 1 |
| tenacity | 9.2.1 | new | Apache-2.0 | 1 |
| uuid_utils | 0.19.0 | new | BSD-3-Clause | 1 |
| websockets | 17.4 | new | BSD-3-Clause | 1 |
| distro | 1.9.0 | new | Apache License, Version 2.0 | 1 |
| httpx2 | 2.16.0 | new | BSD-3-Clause | 1 |
| httpcore2 | 2.16.0 | new | BSD-3-Clause | 1 |
| jsonpointer | 3.8 | new | Modified BSD License | 2 |
| requests | 2.34.2 | new | Apache-2.0 | 2 |
| requests-toolbelt | 1.0.0 | new | Apache 2.0 | 1 |
| zstandard | 0.25.0 | new | BSD-3-Clause | 1 |
| sniffio | 1.3.1 | new | MIT OR Apache-2.0 | 3 |
| charset-normalizer | 3.5.2 | new | MIT | 1 |
| truststore | 0.10.5 | new | MIT | 1 |
| urllib3 | 2.8.0 | new | MIT | 1 |
