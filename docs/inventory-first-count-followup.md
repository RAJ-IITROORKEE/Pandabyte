# Inventory first-count follow-up

Development migrations `20261028163000` and `20261028163100` require an initial physical count before an ordinary version-zero balance can be adjusted and update recent ordering after a successful adjustment. Previously recorded request replays still return before either change. No existing inventory balances were modified by the migrations.

The development integration suite passed with disposable products and users, including rejection of a direct uninitialized adjustment, explicit initialization including zero, adjustment ordering and replay, permissions, and cleanup. The normal Inventory browser showed 42 variants and 42 counts not set after cleanup. Four inventory contract tests and targeted ESLint also passed. No real stock quantities were supplied or changed; storefront orderability remains a separate gate.
