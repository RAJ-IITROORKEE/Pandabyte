# Homepage hero asset provenance

The interactive circuit illustration uses the six reviewed assets from
`.superdesign/hero-reference-2026-10-24/PandaByte-Hero-HTML/assets/`. Five
transparent, AI-enhanced product cutouts were converted from PNG to WebP for the
homepage; the Grove shield SVG is copied unchanged. The five source photographs
were supplied by the owner and used as image-enhancement references. These
cutouts are presentation art: details can differ from the physical products,
so they are not pinout, compatibility, or engineering evidence.

| Reviewed source | Source SHA-256 | App copy | App SHA-256 | Dimensions | App bytes |
| --- | --- | --- | --- | ---: | ---: |
| `assets/air.png` | `a11a4a17ae289d0c34debc13676587bf6d887c0fedd57811a2e55d25fd9669bb` | `/hero/air.webp` | `0ed11cf7fedd236dd5e2f421b1e85d68e5d78edf1737640c4dd8650406eab5d1` | 997 × 1578 | 175,614 |
| `assets/dht.png` | `8f4a194885da9f93d74f419f0996b03ead0ce8e79ac84fb6b94b43d3bf2a556a` | `/hero/dht.webp` | `cecec0e6073fe6624b8f5133a51fb2676a6baced39fe7d2c7e445087e6bd03c7` | 1983 × 793 | 110,262 |
| `assets/light.png` | `bee0d0554d0843eae1c99c3ae88b4ec135d32b0f6973cf3bfc6e710e0f070a6f` | `/hero/light.webp` | `2cc826f5e09a6b1ca5a1688221a3def2fd4331c9ae31828c9d2b93be3d827978` | 1934 × 813 | 94,712 |
| `assets/oled.png` | `06b3389f47c3b5bc8f348041e18c3b5e65c71c89edc10f712d1e4f46cd8150d0` | `/hero/oled.webp` | `40b602a5f66651ade97e6afcf845f3f7b9cf080a643ab7870ae55873497d7a1e` | 1385 × 1136 | 113,072 |
| `assets/xc6.png` | `76f5446911eca3f8730df9ecd9c70087377baa9b6c26320ae1e233e25f9794f9` | `/hero/xc6.webp` | `24679ec87a5aee6c8e891764b44e78111303196cbf74b2b033d2cdcd23dd2d1f` | 1064 × 1478 | 301,876 |
| `assets/grove-shield.svg` | `7e1da3185a193113b6993cd5288d02b1815ecc458902c5e1f80f16eb35bc5353` | `/hero/grove-shield.svg` | `7e1da3185a193113b6993cd5288d02b1815ecc458902c5e1f80f16eb35bc5353` | SVG | 4,149 |

The PNG-to-WebP conversion used the installed `sharp` library at quality 88,
alpha quality 100, and effort 6. Pixel dimensions were retained. The five
converted cutouts total 795,536 bytes, compared with 7,803,068 bytes for the
source PNGs. The Grove shield remains code-native presentation artwork.

The original monochrome PandaByte logo is not duplicated or altered here; the
shared site header continues to use the existing logo asset. Visible hero
captioning identifies the enhanced cutouts and states that the proposed shield
and wiring are unverified concepts, not a wiring guide. The interactive OLED
and readouts show labeled samples, never live sensor data. The reference notes
also state that BMV080 firmware compatibility with the xC6 is unestablished.
