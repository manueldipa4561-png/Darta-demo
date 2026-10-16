# Image slots

These files feed the hero and the scroll corridor. Swap a picture by replacing the file (same name) or by changing
its `src` in `index.html`. No code change is needed.

| Slot | Where | Recommended source |
|---|---|---|
| Entrance / sign (hero) | `img/sign-hd.webp` (portrait screens) and `img/sign-wide.webp` + `sign-wide-m.webp` (landscape screens, the `<picture>` around `<img class="hero-img">`) | Portrait **at least 2400 px on the long side**; landscape **at least 2560 x 1440**. The wide file is the real sign photo extended sideways with Higgsfield (outpaint), so the sign itself is untouched |
| Thomas's counter (home shop scene) | `img/counter.webp` (2400 px) and `img/counter-m.webp` (phones), placed by `js/shopintro.js` behind the product photos | Made with Higgsfield from the studio's own shelf photos (the black wood-grain niche with the LED strips), lightly blurred for depth of field. A real photo of the empty shelf, straight on, would be even better |
| Real product clips (product pages, "Il prodotto vero") | `img/spot/<slug>.mp4` + `img/spot/<slug>.webp` (poster) | 5 s Higgsfield (Kling 3.0) clips made from the studio's product photos, played forward then backward so they loop; 720 x 960, about 800 KB. A product with no clip simply has no section |
| Product photos (shop cards, product pages, cart, og) | `img/p/<slug>-a.webp` (640), `-a-sm` (480), `-a-xs` (240) | Higgsfield (Nano Banana Pro, 2K) packshots made from the studio's own product photos: one unit on the black wood niche with the LED strip. Pomade, beard oil, eco spray and curl man follow real photos; powder clay and curl control were rebuilt from the earlier 3D renders and should be replaced by real photos when available |
| Card loops (shop) | `img/v/<slug>.mp4` | 5 s Higgsfield (Kling 3.0 pro) clips that start and end on the packshot, so they loop seamlessly; 640 x 640, H.264 CRF 19 |
| Home shop scene products | `img/cut/<slug>.webp` (1000 px tall) and `-m` (560) | The packshots with the background removed (Higgsfield) and trimmed to the product, placed by `js/shopintro.js` on the counter; each cutout's width/height is in `LOOK` there |
| Usage films (product pages, "Guarda come si usa") | `img/use/<slug>.mp4` | 4-7 s Higgsfield (Kling 3.0 pro, no audio) clips that start and end on the packshot: the product goes through the same routine as the old 3D animation by itself, no hands (unscrews, shakes, sprays, pumps). 960 x 960, H.264 CRF 21. A product with no file simply has no button; the step timings are in `STEPS` in `js/product.js` |
| Shop film | `img/spot/banco.mp4` + `banco.webp` (poster) | 10 s Higgsfield (Kling 3.0 pro) dolly along the whole line on the shelf, from a lineup still made from the packshots; 1280 x 720, plus `banco-m.mp4` (854 x 480) that phones load instead |
| The four cuts | `<ol class="cuts">` in `index.html` (`fade`, `curly`, `platinum`, `sidepart`) | Any aspect, **at least 1600 px wide**, keep the subject centred |
| Logo | `img/logo-darta.webp` (header, footer, loader, loyalty card) and `img/logo.png` (favicon, bottle label) | Cut out of the client's 1206 px logo image (white on transparent, 950 px wide). For an even sharper one send a vector (SVG/PDF/AI) or a transparent PNG of at least 2400 px |

Notes
- The corridor resamples every photo to a power of two (max 2048 px) and builds mipmaps, so big files stay crisp when shrunk. Files above 2048 px are downscaled on the GPU, there is no benefit in going past ~3000 px.
- Export WebP at quality 82-88. A 2400 px photo is typically 150-300 KB.
- Current photos are only 463 px wide, which is why the entrance looks soft when it fills the screen.
