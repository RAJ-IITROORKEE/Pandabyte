# Test-bill PDF dependencies

- PDFKit 0.20.2: MIT, https://github.com/foliojs/pdfkit. License retained in `pdfkit-MIT.txt` and the installed package.
- Noto Sans Regular/Bold and Noto Sans Devanagari Regular: SIL OFL 1.1. Pinned source, copyright and license accompany assets in `public/fonts/noto-sans/`. Fonts are used only by the server PDF renderer, not requested by storefront CSS.
- PDF.js (`pdfjs-dist` 6.4.299): Apache-2.0, https://github.com/mozilla/pdf.js. Development-only dependency for semantic/visual PDF verification; its license is retained in `pdfjs-Apache-2.0.txt` and the installed package. No PDF.js browser viewer is shipped.

Third-party dependency licenses do not grant rights to PandaByte's branding or product/source archives. These libraries generate test statements; they do not certify legal invoice compliance.
