# Storefront frontend follow-up

This checkpoint updates `/shop` and homepage product cards, `/products/[slug]`, `/cart`, authenticated `/checkout` and `/account`. It preserves Admin UI and the homepage hero. No database schema, orders, reservations, payment processing or deployment is added.

- Product cards have linked titles, browser-local favorites, current quantity controls, Add to cart and isolated Buy now actions. Existing processed-image selection and 3D previews remain intact.
- Product details add conditional tabs and an enlarged photo dialog with keyboard navigation and focus restoration. Missing content does not create empty review/specification sections. The main photo uses the existing 960px rendition; enlargement retains original media delivery.
- Cart item cards use genuine photo thumbnails, automatic version-checked quantity updates and Remove. Shipping, GST and final total remain pending.
- Checkout implements the owner's Checkout Form 3 reference using original code and the application's tokens. See [checkout behavior and backend boundary](checkout-frontend.md).
- Account adds sidebar navigation and real profile/address/private-file components, browser-local favorites, and honest unavailable order/billing sections. User changes remount private child state.

Terra implementation workers and a Sol review worker handled bounded components and tests. Root integrated and tested browser journeys. Tests cover buy-now/cart isolation, guest storage guards, quantity/removal focus, browser favorites parsing, account identity isolation, conditional gallery/tabs and checkout step validation/drafts. No dependency was added.

Browser evidence: cart quantity 7→8 changed subtotal ₹1,860→₹2,160, then was restored. Adding the local test favorite to cart worked; removal restored the original four lines/seven units and ₹1,860. The test favorite was removed afterward. Quick view and its interactive 3D viewer opened at 320px; zoom/close controls and restored trigger focus worked. Populated cart/favorites and checkout fit 320px. Checkout also fit 768/1024/1440px and both themes were visually reviewed.

Repository lint completed with one existing unused-variable warning in the Admin orders integration test. Typecheck and isolated production build passed. The full unit/media suite passed; final focused checks were repeated after the last validation changes. This does not certify production commerce, manual assistive-technology coverage, actual browser zoom or runtime reduced-motion switching.
