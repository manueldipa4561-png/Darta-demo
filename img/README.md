# Image slots

These files feed the hero and the scroll corridor. Swap a picture by replacing the file (same name) or by changing
its `src` in `index.html`. No code change is needed.

| Slot | Where | Recommended source |
|---|---|---|
| Entrance / sign (hero) | `img/sign-hd.webp` (portrait screens) and `img/sign-wide.webp` + `sign-wide-m.webp` (landscape screens, the `<picture>` around `<img class="hero-img">`) | Portrait **at least 2400 px on the long side**; landscape **at least 2560 x 1440**. The wide file is the real sign photo extended sideways with Higgsfield (outpaint), so the sign itself is untouched |
| Thomas's counter (home shop scene) | `img/counter.webp` (2400 px) and `img/counter-m.webp` (phones), placed by `js/shopintro.js` behind the 3D row | Made with Higgsfield from the studio's own shelf photos (the black wood-grain niche with the LED strips), lightly blurred for depth of field. A real photo of the empty shelf, straight on, would be even better |
| Real product clips (product pages, "Il prodotto vero") | `img/spot/<slug>.mp4` + `img/spot/<slug>.webp` (poster) | 5 s Higgsfield (Kling 3.0) clips made from the studio's product photos, played forward then backward so they loop; 720 x 960, about 800 KB. A product with no clip simply has no section |
| The four cuts | `<ol class="cuts">` in `index.html` (`fade`, `curly`, `platinum`, `sidepart`) | Any aspect, **at least 1600 px wide**, keep the subject centred |
| Logo | `img/logo-darta.webp` (header, footer, loader, loyalty card) and `img/logo.png` (favicon, bottle label) | Cut out of the client's 1206 px logo image (white on transparent, 950 px wide). For an even sharper one send a vector (SVG/PDF/AI) or a transparent PNG of at least 2400 px |

Notes
- The corridor resamples every photo to a power of two (max 2048 px) and builds mipmaps, so big files stay crisp when shrunk. Files above 2048 px are downscaled on the GPU, there is no benefit in going past ~3000 px.
- Export WebP at quality 82-88. A 2400 px photo is typically 150-300 KB.
- Current photos are only 463 px wide, which is why the entrance looks soft when it fills the screen.
