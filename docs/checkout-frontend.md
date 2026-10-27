# Checkout frontend review

The authenticated `/checkout` route presents Information, Shipping, Payment and Review in four steps. It quotes either the saved cart or the isolated Buy Now selection and keeps the current server quote visible in the summary. Product images are selected from the published product record using the reviewed cart image mapping. Shipping, GST and the final payable amount remain unknown; the displayed subtotal is an estimate, not a final charge. Stock may remain unverified.

Contact and manual shipping/billing fields are review-only. A saved address can fill the shipping fields. The draft stays in memory, scoped to the signed-in user and selection, so it survives an Edit cart return during the current app session; it is not saved to browser storage or the account. The news checkbox is only a local review preference. GSTIN validation checks format only, and address format validation does not establish deliverability.

Razorpay is displayed as the selected future payment method. Continuing to review is available, but the final payment action is disabled and no order or reservation is created. A future authorized checkout adapter must validate all input on the server, re-quote prices and availability, calculate approved shipping and tax, and obtain explicit confirmation of the final amount. Order creation, reservation, provider integration and reconciliation require their own approved contracts and server-side authorization.

The Information step follows the visible Checkout Form 3 preview; layouts for later steps are original interpretations of its visual language. No licensed source or additional dependency was used.

The summary renders once across breakpoints and expands on mobile. Thumbnail identities include the quoted product revision; stale responses cannot replace current images. Existing discounts use integer paise and appear as savings already included in the server subtotal. The unknown shipping/GST amounts are never treated as zero.

Before payment can be enabled, an authorized server adapter must create provider orders with authoritative integer amounts, protect keys, verify signatures/provider state, handle dismissal and failure, process duplicate or late callbacks/webhooks idempotently, and reconcile outcomes. Browser redirects must never mark an order paid. The current final action performs none of these operations.

Browser verification on localhost:3001 covered all four steps, invalid input and focus, backward navigation, review-only shipping/billing, the disabled payment action, and an Edit cart return retaining entered information. Cart checkout used the existing seven units (₹1,860). Buy Now selected two LCD modules (₹560) without including or changing unrelated cart lines. A missing Buy Now selection shows a return-to-cart state. No real account address or profile edits were saved.

Layout checks covered 320/768/1024/1440 CSS-pixel widths with no page overflow and visual light/dark checks. The desktop composition was compared with the visible reference. Keyboard checks covered gallery arrows/Escape/focus restoration, product tabs, quick view and 3D controls. Actual screen-reader speech, browser zoom, runtime reduced-motion switching, and a live missing-image fixture remain untested.
