# Panda Agent frontend preview

The authenticated `/panda-agent` route presents an Assistant UI external-store workspace. The backend transport is not connected: chat, conversation history, new chats and attachments are unavailable. No conversations, model output or citations are simulated.

The Solutions menu links to the route. Clerk requires an active session, and the sign-in return path preserves `/panda-agent`.

Local verification covers the signed-in design preview, desktop light and dark themes, responsive layout at an effective 500px viewport, the signed-out redirect, type checking and production build. This is a presentation checkpoint, not an end-to-end assistant or retrieval test. File uploads, streaming, cancellation, reconnect, citations and access-controlled conversations require the backend contract and separate integration tests.
