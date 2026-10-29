Build and integrate PandaByte’s complete customer account dashboard, using the
current My Orders page and attached screenshot as the visual baseline.

PandaByte sells IoT kits, development boards, sensors, and electronics accessories.

The result must include professional page layouts, working forms, persistent
database integration, and consistent information across checkout, customer
dashboard, and admin panel.

## 1. Inspect, plan, and implement

Inspect the existing:
- Customer dashboard routes, layouts, and sidebar.
- My Orders page and order-detail components.
- Storefront design tokens and shared components.
- Authentication provider and customer identity mapping.
- Profile, address, wishlist, billing, invoice, and preference models.
- Checkout, payment, and order APIs.
- Admin customer/order interfaces.
- Database migrations, authorization, and tests.

Provide a concise gap analysis and implementation plan, then proceed with
reversible implementation work.

Reuse existing functionality and models. Do not rebuild working systems or
create duplicate sources of customer information.

## 2. Skills and design references

Discover and read relevant available skills for:
- Frontend implementation and UI design.
- Existing framework and shadcn components.
- Browser testing through Browser/control-browser.
- PDF generation/rendering if downloadable invoice PDFs are implemented.

Do not assume a skill exists or claim to have used unavailable tools.

References:

Profile layouts:
https://www.shadcnblocks.com/blocks/settings-profile

Address management:
https://www.shadcnblocks.com/block/address-book1
https://www.shadcnblocks.com/block/address-book2

Notification settings:
https://www.shadcnblocks.com/blocks/settings-notifications

Existing order-history design:
https://www.shadcnblocks.com/block/order-history1

Order summary and financial information:
https://www.shadcnblocks.com/block/order-summary1

Application/settings structures:
https://shadcnstore.com/blocks/application/apps

Tables:
https://shadcnstore.com/blocks/application/datatables

Use these for structure and interaction patterns. Apply PandaByte’s existing
CUSTOMER dashboard design, not the admin Mono theme.

Use licensed blocks where available. Otherwise compose original implementations
from the project’s existing shadcn components.

## 3. Shared dashboard shell and navigation

Retain the storefront header and customer account sidebar.

Sidebar:
- Overview.
- Profile.
- Addresses.
- Favorites.
- Orders.
- Billing & Invoices.
- Settings.
- Log out.

Use actual customer avatar/name/email. Provide initials for missing avatars.

Each link must render its own page. Do not highlight one item while displaying
another page’s content.

Preserve existing URLs where possible. Add missing routes using the current
routing conventions, with direct navigation and browser back/forward support.

Shared presentation:
- Consistent page heading and short description.
- Readable content width and aligned section boundaries.
- Restrained cards, subtle borders, and existing corner radii.
- Mint-accented active navigation and primary actions.
- Existing storefront fonts and typography.
- Light/dark/system theme support.

On mobile, provide accessible account navigation through the existing Sheet,
Drawer, or equivalent pattern.

## 4. Overview page

Design a useful account home:

- Personal greeting.
- Compact summary cards for active orders, saved products, and saved addresses.
- Recent orders with real statuses and links.
- Profile/contact summary with Edit profile.
- Default shipping and billing address summaries.
- Recent invoice link when an issued invoice exists.
- Shortcuts to continue shopping and manage the account.

Use real backend counts. Do not invent spending charts, activity, or orders.
Provide welcoming empty states for new accounts.

## 5. Profile page and editor

Use a polished profile form with:
- Avatar preview and upload/removal if supported.
- Display name and appropriate name fields.
- Email address.
- Phone number.
- Relevant optional organization information only where supported.

Requirements:
- Distinguish editable profile fields from identity-provider-managed fields.
- Email/phone changes must follow existing verification rules.
- Do not claim a phone or email is verified without provider evidence.
- Validate uploads server-side, including supported types and size limits.
- Preserve form values on failure.
- Show saving, success, error, and unsaved-change states.
- Update the sidebar and storefront account menu after successful changes.

Never allow profile updates to modify roles, admin access, ownership IDs, or
verification flags through customer-controlled fields.

## 6. Addresses page

Use a responsive saved-address card grid.

Each card:
- Label such as Home, Work, or Other.
- Recipient name.
- Complete readable address.
- Contact phone.
- Default shipping/billing indicators.
- Edit, Delete, and Set default actions.

Add/edit form:
- Recipient.
- Contact phone.
- Address lines.
- City.
- State/region.
- PIN/postal code.
- Country.
- Address label.
- Default shipping/billing choices where supported.

Use a Dialog or Sheet with a sensible mobile layout.

Persist changes in the database and enforce customer ownership.
Maintain consistent default-address rules, including deletion of a default.

Connect saved addresses to checkout. Deleting or editing an address must not
rewrite the address snapshot on an existing order or invoice.

## 7. Favorites page

Reuse PandaByte’s current product cards with:
- Image, name, price, availability when known.
- Remove favorite.
- View product.
- Add to cart where purchasable.

Synchronize favorites across storefront, product pages, and account pages.
Revalidate current prices and availability before cart operations.

Handle removed/unavailable products and an empty favorites list.

## 8. Orders

Preserve and complete the existing My Orders experience.

Keep:
- Status filtering and search.
- Current and previous orders.
- Order detail and tracking links.
- Accurate payment and fulfillment information.
- Real order-item/address snapshots.
- Relevant reorder and invoice actions.

Do not conflate fulfilled with delivered or paid with shipped. Map the actual
backend lifecycle to customer-friendly labels.

Reflect admin order updates using the established refetch, polling, or
real-time mechanism.

## 9. Billing & Invoices page

Use two clear sections or tabs:

A. Billing details
- Individual/business billing profile.
- Billing name and address.
- Contact email.
- Company and GSTIN fields only where supported.
- Default billing selection.
- Add/edit/save functionality connected to the database.

Explain that updated billing details apply to future checkout use, not already
issued documents.

B. Invoices and receipts
- Searchable, paginated list of documents belonging to the current customer.
- Document number and type.
- Related order number.
- Issue date.
- Amount and currency.
- Status and test/live context.
- View and Download actions when files exist.
- Link to the related order.

Use distinct labels for order summaries, payment receipts, and invoices.
Do not present every successful payment as an already-issued invoice.

Show an honest empty state when there are no issued documents. A fetch error
must not appear as “No invoices”.

Do not store raw card details, CVV, banking credentials, or UPI PINs. Show saved
payment methods only if the existing payment-provider integration supports
them properly.

## 10. Reusable PandaByte invoice template

Create a reusable branded invoice template and a SAMPLE preview—not a real
invoice for an actual customer.

The sample must be prominently labeled:
“SAMPLE — NOT A TAX INVOICE”.

Use fictional example data. Do not invent PandaByte’s GST registration,
invoice numbering sequence, bank details, tax rates, or official signatures.

Template layout:

HEADER
- PandaByte logo.
- Document title and sample indicator.
- Merchant legal/contact details from configuration.
- Document number, issue date, and related order reference.

CUSTOMER SECTION
- Bill to.
- Ship to, where applicable.
- Relevant business/tax identifiers only when present.

ITEMS TABLE
- Item number.
- Product and variant description.
- SKU.
- Quantity.
- Unit price.
- Discount where applicable.
- Tax information when supplied.
- Line total.

TOTALS
- Subtotal.
- Discounts.
- Shipping.
- Configured tax breakdown.
- Grand total.
- Paid/balance information only when supported by document data.

FOOTER
- Payment reference/method when appropriate.
- Support information.
- Approved merchant notes from configuration.

Presentation:
- Clean A4-friendly design.
- White print/PDF surface with a restrained PandaByte accent.
- Readable typography and tabular monetary alignment.
- Repeat table headers across pages.
- Prevent clipped rows, totals, or addresses.
- Support long descriptions and multi-page orders.
- Use the same template/data contract for preview and downloadable output.

This is a presentation template, not a claim of tax compliance. Missing merchant
or tax configuration must be flagged before real issuance is enabled.

Integrate existing issued invoices with the customer document list. If issuance
is missing, prepare the service/template integration using the existing approved
issuance rule; do not automatically generate real historical invoices.

Issuance must be idempotent. Refreshes, duplicate payment events, and repeated
downloads must not create new invoice numbers or duplicate documents.

Issued documents must retain their original customer, item, and financial
snapshots. Refund/correction handling must follow existing document rules rather
than silently rewriting an issued invoice.

## 11. Settings

Organize settings into clear sections:

ACCOUNT
- Account identity and provider information.
- Password change/reset through the existing authentication provider.
- Connected sign-in methods or sessions only where supported.
- Logout.

NOTIFICATIONS
- Order and shipping updates.
- Billing/document notifications.
- Optional marketing/product updates.
- Available communication channels only.

Persist preferences in the backend. Keep optional marketing consent separate
from operational notification settings. Do not render switches that have no
effect on notification delivery.

APPEARANCE
- Light/dark/system preference using the existing theme mechanism.

PRIVACY AND SECURITY
- Verification/security features supported by the identity provider.
- Existing data-request or deletion workflow, if available.
- Clear consequences and appropriate confirmation for destructive actions.

Do not create fake MFA, password, session-revocation, or account-deletion
controls. Never delete financial/order history as a side effect of a profile UI
action.

## 12. Database and backend design

Reuse the existing schema. Add fields/models only where genuinely missing.

Potential entities to reconcile:
- Customer profile linked to authenticated identity.
- Customer addresses and defaults.
- Favorites.
- Billing profile.
- Notification preferences.
- Orders and immutable item/address snapshots.
- Issued documents and private file references.
- Relevant audit events.

Before adding migrations, document existing equivalents and relationships.

Requirements:
- Validate all input server-side.
- Enforce customer ownership on every read, mutation, preview, and download.
- Protect admin operations with existing roles/permissions.
- Allowlist editable fields.
- Keep secrets and privileged database access on the server.
- Use private file storage and authorized downloads for customer documents.
- Apply suitable upload and mutation controls.
- Use transactions/constraints for defaults and unique records where needed.
- Preserve data; do not reset databases or run destructive production migrations.

Do not expose internal admin notes, fraud-review details, secrets, or other
customers’ data through shared response objects.

## 13. Customer/admin synchronization

Use shared records and controlled API projections.

Verify these flows:
- Customer profile edit → updated permitted admin customer information.
- Customer address/billing edit → future checkout selections.
- Admin fulfillment/tracking update → customer Orders page.
- Backend document issuance → Billing & Invoices list.
- Customer notification preference → actual notification-service behavior.
- Favorite changes → storefront and customer dashboard.

Historical order and invoice snapshots must remain unchanged when the customer
edits their current profile or addresses.

Define and implement cache invalidation/refetch behavior. Show updated data
after saves, window refocus, and the existing order-update mechanism.

Do not use localStorage as the authoritative account database or maintain
separate customer/admin mock records.

Preserve guest checkout behavior. Do not attach orders to an account based only
on an unverified matching email.

## 14. UX quality and reusable components

Create shared components where useful:
- AccountShell and AccountSidebar.
- PageHeader.
- ProfileForm.
- AddressCard and AddressForm.
- BillingProfileForm.
- InvoiceList and InvoicePreview.
- NotificationPreferences.
- Loading, Empty, and Error states.

Reuse existing components instead of forcing these names.

Provide:
- Accessible labels and keyboard navigation.
- Clear validation messages.
- Visible focus.
- Mobile-friendly forms.
- Working save/cancel/retry actions.
- Success feedback only after backend confirmation.
- Appropriate pagination and query-state persistence.
- No broken placeholder actions.

## 15. Browser testing and completion

Read the Browser/control-browser skill and test the actual running application.

Use development accounts and test orders/documents.

Verify:
- Every sidebar route, direct URL, refresh, and back/forward navigation.
- Profile edits update the account menu and authorized admin view.
- Address creation, edit, deletion, defaults, and checkout selection.
- Billing details persist.
- Favorites synchronize.
- Admin order updates appear for the customer.
- Issued documents appear once and download correctly.
- Sample invoice is visibly marked as a sample.
- One-page and multi-page invoice rendering.
- Notification preferences persist and are respected.
- Another customer cannot access someone else’s records or documents.
- Loading, empty, error, and unauthorized states.
- Mobile/desktop layouts and light/dark themes.

Run relevant existing lint, type-check, build, and integration tests. If creating
PDFs, render and visually inspect them before claiming completion.

Do not perform real payments or issue real invoices for testing.

Final report:
- Completed pages and routes.
- Components, endpoints, and migrations changed.
- Source-of-truth and synchronization decisions.
- Invoice-template location and sample-preview route.
- Checks completed and browser evidence using non-sensitive test data.
- Remaining provider/configuration blockers.

Complete the implementation rather than stopping at a design proposal.