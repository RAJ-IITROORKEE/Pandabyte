# Billing baseline

29 October 2026: the owner authorized a separate Billing baseline before the sample-download commit. The UI chat verified that authorization and handed the scoped baseline integration to this chat while continuing its independent About work.

This checkpoint tracks the existing owner-only Billing profile API/form/migration and fictional invoice preview, plus the minimal account route/shell closure. The index reuses the already tracked Profile and Orders implementations. Later Profile-card, overview-summary, Orders-search, About, Admin and payment work remains outside the commit and is preserved in the working tree. No service migration or data operation is executed here. The Billing migration was previously applied in development, as recorded in the UI delivery notes.

Real invoice issuance and payments remain deferred. The separate sample-download checkpoint is documented in [invoice-template review](invoice-template-review.md) after its subsequent commit.

Verification: 17 focused offline tests and targeted ESLint pass against the staged source snapshot. Existing private-file access is retained in this minimal baseline. Isolated TypeScript checking reports an existing undefined css reference at components/admin/orders-screen.tsx:97; that file matches the previous HEAD byte-for-byte and is outside this commit. The active working-tree TypeScript check passes because the UI/Admin work contains its own uncommitted changes. No remote integration or migration was rerun.
