# Admin order customer column — 29 October 2026

The order list now labels its customer column Name, immediately after Order. It shows the stored purchase name/email with the linked Clerk profile image when available; deleted users, missing photos and failed images use initials. Items shows the total quantity only, preserving an unavailable state rather than inventing zero.

The staff-only `admin_order_customer_identities` RPC maps at most 50 displayed references to their recorded subjects. The server batches the corresponding Clerk lookup, permits only Clerk-hosted HTTPS images, and exposes no subjects in the list response. Historical contact details remain unchanged; directory failures retain the order list and initials. The additive development migration `20261029140000_admin-order-customer-identities.sql` was applied alone.

Thirteen focused API/contract tests, targeted ESLint and TypeScript passed. Codex browser verification on localhost:3000 showed the Name column, initials/name/email layout, and numeric quantities for the four retained test histories. These histories have removed customer profiles, so a real photo in a populated order row was not observed; mock coverage verifies linked images and missing/untrusted-image fallback. No orders, payment states or customer records were changed.
