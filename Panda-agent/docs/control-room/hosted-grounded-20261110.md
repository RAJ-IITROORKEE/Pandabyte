# Hosted Control Room grounded answers — 10 November 2026

The owner authorized deploying the updated Admin RAG Playground and repeatedly testing real model answers without an application spending cap.

The Production environment was missing the OpenRouter key and the isolated RAG runtime settings. The previous UI exposed an unconfigured GPT-4o-mini gateway. The release connects the tested direct GPT-6 Luna/Azure completion, displays the actual model and distinguishes document retrieval from model generation.

The owner-bound Production profile is persistent. The signed `panda_agent_grounded_request_claim` RPC permits each new request once and never debits the prototype ledger. It has no cumulative spending or request-count cap. Current Admin/session and source checks bracket model dispatch and result release. Endpoint identity, current strict ZDR/safety-retention policy, bounded prices, token accounting and literal evidence remain checked. Provider cache-read/write receipts are accepted only within their verified bounds. Local prototype receipt rules and other interfaces' budgets remain separate.

## Release and source

- RAG implementation commit: `ab763c9`, included in `main`.
- Initial RAG Production deployment: `dpl_vZKe4gwtVcgMUvRWWc996HrYS1pn`, first staged and browser-tested, then promoted to the primary domain.
- Initial clean source: 698 files, manifest SHA-256 `471175f3dfae8e6beba2e491962e6ecf259120d1cf9ffde66575c99f59a3b699`, prepared from the retained 672-file live baseline. Original native/chat routes and retrieval modules remained byte-identical. Dependency installation, TypeScript and Production build passed. All 145 build traces passed the private-file check; the server key was absent from browser assets.
- The subsequent primary deployment `dpl_QyaEmLUPfCsHe2s4LCC9HsTHKcNb` retains the RAG implementation. A fresh browser reload and real grounded answer passed on that deployment. No older release was promoted over it.
- Live entry: https://pandabyte-iot.vercel.app/admin/rag-control-room#playground.

## Actual browser checks

| Check | Result |
| --- | --- |
| Staged real model calls | 3 passed |
| Primary-domain real model calls | 5 passed, including repeats and reloads |
| Grounding | Every selected quote was a literal substring of its selected passage |
| Factual examples | x8266 MCU → ESP8266; USB connector → USB Type-C |
| Unsupported electrical question with generation selected | Insufficient evidence, no model call |
| Primary document-only HTTP times | 799, 731, 973, 635, 568 ms |
| Primary model HTTP times | 3,136, 3,401, 3,363, 3,151, 3,627 ms |
| Anonymous capability GET | 401, `Cache-Control: private, no-store` |
| Scoped regression | 319 passed, zero skips |
| Fresh independent release checks | 13 passed, zero skips |

The eight model calls reported 6,580 input tokens, 370 output tokens and USD 0.000927300 guard-accounted cost. This is receipt accounting, not a provider invoice. Retrieval timings exclude model generation; the HTTP samples include response transfer. These sequential samples do not establish a hard cold-start or load-test guarantee.

The numeric [verification receipt](../verification/hosted-grounded-20261110.json) contains no credentials, private source passages, original evaluation-pack answers or customer data. Full browser evidence and screenshots remain outside the public repository.

## Testing manually

Sign in with the authorized Admin account, open Playground, select **Also generate a grounded answer with GPT-6 Luna**, enter a supported product question, and choose **Retrieve and generate answer**. Successful submissions release the input for another run. A page reload starts with document-only mode, so select generation again when requesting a model answer.

Production variables are already configured as encrypted server values. They include `OPENROUTER_API_KEY`, the Agent backend/JWT/signing configuration, `PANDA_AGENT_HOSTED_GROUNDED_ENABLED`, `PANDA_AGENT_HOSTED_GROUNDED_PROFILE` and metadata-only OpenRouter observability. Account privacy remains an operator assertion; the application independently checks provider-specific strict ZDR on each outbound call.
