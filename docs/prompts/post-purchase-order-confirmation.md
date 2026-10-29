Refactor PandaByte’s frontend post-purchase order-confirmation page using
Shadcnblocks Order Summary 1 as the layout reference. Add a tasteful Lottie
success animation after the backend confirms the payment and order.

PandaByte sells IoT kits, development boards, sensors, and electronics accessories.

LAYOUT REFERENCE:
https://www.shadcnblocks.com/block/order-summary1

PREFERRED ANIMATION:
https://lottiefiles.com/free-animation/check-rebound-eBChusCwqB

ALTERNATIVE ANIMATION:
https://lottiefiles.com/free-animation/success-checkmark-celebration-confetti-confirmation-OaZF9h03PS

LOTTIE DOCUMENTATION:
https://docs.lottiefiles.com/en

## 1. Scope and initial inspection

This task concerns the page customers see after a successful purchase.
Apply the shared order-summary layout to that page.

Inspect:
- Existing checkout and Razorpay completion flow.
- Payment-verification and order-status endpoints.
- Current confirmation route.
- Customer order-detail routes and ownership checks.
- Shared product-image, currency, address, and order components.
- Existing animation dependencies and available frontend/browser skills.

Preserve the existing product-detail page, checkout design, and admin Mono
theme. This page belongs to PandaByte’s storefront and must use the storefront’s
typography, palette, buttons, and light/dark theme.

Briefly explain the implementation plan, then proceed.

## 2. Match the reference composition

Inspect the actual Order Summary 1 preview and available source.

Reproduce its:
- Centered confirmation header.
- Compact order-information strip.
- Two-column order-summary area.
- Product rows with images, variant details, quantities, and prices.
- Itemized totals.
- Separate shipping-address and payment-method cards.
- Compact action area.

Use the reference’s structure and information hierarchy while applying
PandaByte’s existing frontend styling.

Keep the layout comfortably centered and readable. Avoid oversized success
banners, excessive decoration, or a full-screen animation.

Use the block’s source only in accordance with its applicable license.

## 3. Success header and order information

At the top:
- A small Lottie animation in place of the reference’s static success icon.
- Heading: “Thank you for your order!”
- Supporting text: “Your PandaByte order is confirmed.”

Show an email-sent message only if the backend confirms that the confirmation
email was actually sent. Otherwise use neutral wording without claiming email
delivery.

Below, show:
- Actual customer-facing order number.
- Order date.
- Actual order-status badge.

Do not invent order IDs, timestamps, email statuses, or delivery information.

## 4. Left column: purchased items and totals

Items card:
- Purchased product image.
- Product name.
- Selected variant or relevant SKU details.
- Quantity.
- Unit price where helpful.
- Line total aligned to the right.
- Subtle separators between products.

Use stored order-item snapshots so later catalog edits do not change the
historical purchase details.

Totals card:
- Subtotal.
- Shipping.
- Discount when applicable.
- Tax, following the order’s actual tax representation.
- Final total.

Use “Total paid” only when the backend confirms the paid amount.
Do not add tax twice if prices already include it.

Format currency as INR using existing shared utilities. Handle missing images,
long names, multiple quantities, and larger orders gracefully.

## 5. Right column: shipping, payment, and actions

Shipping card:
- Recipient name.
- Shipping-address snapshot from the order.
- Delivery method when available.
- Estimated delivery only if provided by the backend.

Payment card:
- Actual payment method/provider.
- Readable payment status.
- Masked payment details only if legitimately available.
- Do not fabricate a card number or show sensitive payment data.

Actions:
- “View order” or “Track order” linked to the real customer order-detail route.
- External shipment tracking only when an actual tracking link exists.
- “Download receipt” only when a real receipt endpoint/file is available.
- “Print order” using a print-friendly layout.
- “Continue shopping” linking to the existing shop.

Keep unavailable actions hidden or clearly explained. Avoid nonfunctional
buttons and placeholder downloads.

## 6. Lottie implementation

Use the preferred green checkmark animation unless the alternative fits the
existing storefront better.

- Download an authorized JSON or .lottie asset and store it with the project.
- Record its source and retain any required license information.
- Reuse an existing compatible player where possible.
- If a new player is required, choose one maintained runtime and follow its
  current official documentation.
- Avoid installing multiple animation libraries for one effect.
- Do not use an iframe or depend on the animation’s public preview page.
- Choose the asset format based on the installed player and total runtime cost.

Behavior:
- Start only when the verified success state is available.
- Play once, then hold the final success frame.
- Do not loop continuously.
- Keep it approximately 80–120px, adjusted to the reference proportions.
- Use a transparent background with no surrounding white rectangle.
- Keep the success message visible immediately; do not delay content until
  playback finishes.
- Respect reduced-motion preferences with a static checkmark.
- Provide the same static fallback if the asset or player fails.
- Reserve dimensions to prevent layout shifts.
- Clean up player instances and event listeners.
- Treat the animation as decorative because the text communicates success.

If downloading requires account access that is unavailable, report it and
provide the exact asset destination/setup instructions. Use the static fallback
temporarily without claiming the Lottie integration is complete.

## 7. Verified payment and order state

Connect this page to the existing backend flow.

The success state must require the backend’s verified payment and confirmed
order result. Do not trust:
- A query string such as ?success=true.
- Browser storage.
- A Razorpay frontend callback alone.
- A customer-supplied amount or status.

Razorpay references must be verified server-side, with the payment state checked
according to the application’s capture policy.

Support:
- Verifying: “We’re confirming your payment…”
- Pending: a neutral status with a safe way to check again.
- Confirmed: show the success animation and full confirmation.
- Failed/cancelled: explain the actual state without success animation.
- Fetch error: provide Retry without creating another payment.

Use bounded polling/refetch if the backend is still processing. Preserve the
existing order reference so a delayed response does not encourage duplicate
payment.

Refreshing or reopening the page must retrieve the same order without creating
another order, sending another payment, or repeating stock mutations.

Do not clear unrelated cart items. Reuse the existing verified purchased-item
cleanup behavior.

## 8. Authorization and dashboard consistency

- Protect order data using existing server-side ownership checks.
- Support guest access only through the project’s existing secure mechanism.
- Do not expose an order merely because someone knows its ID.
- Show the same order number, totals, payment status, and fulfillment state
  as the customer dashboard and admin panel.
- On later revisits, show current order information without falsely announcing
  a new purchase or replaying celebration after cancellation/refund.

Reuse existing APIs and data contracts. If an integration gap exists, report
it and make only the smallest necessary compatible change.

## 9. Responsive and accessible design

Desktop:
- Items and totals in the wider left column.
- Shipping, payment, and actions in the narrower right column.

Mobile:
- Single-column layout in a logical reading order.
- Comfortable product rows and full-width actions where appropriate.
- No horizontal overflow.

Support both storefront themes, keyboard navigation, readable contrast, and
proper heading hierarchy. Announce verification-status changes accessibly.

Print styles should exclude navigation, animation, and action controls while
retaining the order number, products, totals, addresses, and payment summary.

## 10. Browser validation and delivery

Use relevant frontend implementation skills and the Browser plugin/control-browser
skill to verify the running app.

Use test mode and development data only. Do not perform a real charge to test
this design.

Verify:
- Successful purchase → verification → confirmation.
- Correct real order data in every section.
- Lottie plays once and leaves a static success state.
- Reduced-motion and animation-load failure.
- Pending, failed, and cancelled payment states.
- Refresh and direct revisit.
- Unauthorized order access.
- View/track, receipt, print, and continue-shopping actions.
- Mobile and desktop layouts in both themes.
- No duplicate order or payment side effects.

Run relevant existing lint, type-check, build, and tests.

Deliver the implementation and report:
- Routes and components changed.
- Animation asset source and player used.
- How verified backend state controls the success display.
- Checks completed.
- Browser screenshots using development data.
- Any remaining integration or asset-access blockers.

Do not claim browser testing, email delivery, payment confirmation, or receipt
generation succeeded unless actually verified.