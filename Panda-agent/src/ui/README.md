# Panda Agent workspace

The authenticated `/panda-agent` route uses assistant-ui's external-store runtime with account-backed text chats, archive/restore/delete and validated source citations. The local backend is opt-in; production/default native execution remains disabled. OpenCode owns inference, not a second AI SDK model loop.

The composer uses assistant-ui dictation and pinned AI Elements Shimmer. Dictation depends on browser support and permission and may use an online browser service. Saved assistant messages can be read aloud using the browser's speech synthesis when available. Files are staged locally with limits and removal controls; sending them is explicitly blocked because media input is not implemented. Text answers use safe Markdown/GFM and expandable source disclosures.

The hosted production-mode preview exposes saved chats and browser-dependent read aloud, while disabling new messages and web search until a hosted runtime is connected. Customer token streaming and the isolated native 2.2.5 cutover remain open; activity shimmer is not a token-streaming claim. Preserve Clerk authentication, account isolation, unknown-outcome handling and the existing source validation.
