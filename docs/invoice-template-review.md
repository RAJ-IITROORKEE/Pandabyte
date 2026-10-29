# Billing invoice-template review

29 October 2026: the owner requested Billing buttons to preview the existing fictional invoice template and download a sample PDF, then authorized a UI-owned Billing baseline commit followed by a separate commit for these actions.

The UI chat verified the authorization and handed the scoped baseline commit to this chat while working on a newer About request. Baseline `cd249af` tracks the minimal Billing and account-routing closure; it preserves the later UI work in the working tree. See [baseline checks and the existing Admin type-check limitation](billing-baseline.md).

`InvoiceTemplateActions` links to the existing authenticated `/account/invoice-sample` preview and downloads `/templates/pandabyte-invoice-sample.pdf`. The PDF is a static, public, one-page fictional sample with the existing logo; it contains no customer data. Both views identify the document as **SAMPLE — NOT A TAX INVOICE**. Merchant legal details, tax and the grand total remain unconfigured. This does not add invoice issuance, invoice storage, payment processing or a PDF-generation service. Update the static sample alongside future template revisions.

PDFs are explicitly marked binary in `.gitattributes`; the staged sample bytes match the browser-verified asset.

## Verification

- Targeted ESLint and TypeScript checks passed.
- All nine focused Billing/sample tests passed.
- Built-in browser verified signed-in Billing controls, keyboard navigation to the preview, visible keyboard focus, and an actual PDF download. Downloaded bytes matched the source asset (SHA-256 `be7af55ad35318e2416373140af7fd4c5e46f46ffd1ad5db53d29a38707602c1`).
- A 320 CSS-pixel viewport had no page overflow; the action links wrapped into full-width controls. Light/dark theme checks passed; the original dark theme and viewport were restored.
- The PDF was parsed as one page, checked for the fictional sample text and visually reviewed after rendering to PNG. No form fields are present.

Browser and PDF checks above were completed with the initial implementation; offline checks were repeated before coordinating the commits. Real customer document downloads, real issuance, tax-policy correctness, multipage rendering and payments remain deferred/unverified. No account details were saved and no invoice or payment was created.
