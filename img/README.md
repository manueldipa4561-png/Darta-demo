# Image slots

These files feed the hero and the scroll corridor. Swap a picture by replacing the file (same name) or by changing
its `src` in `index.html`. No code change is needed.

| Slot | Where | Recommended source |
|---|---|---|
| Entrance / sign (hero) | `img/sign-hd.webp`, `<img class="hero-img">` | Portrait or square, **at least 2400 px on the long side**. For wide screens add a landscape file and set `data-wide="img/sign-wide.webp"` on the same tag (**at least 2560 x 1440**) |
| The four cuts | `<ol class="cuts">` in `index.html` (`fade`, `curly`, `platinum`, `sidepart`) | Any aspect, **at least 1600 px wide**, keep the subject centred |
| Logo | `img/logo-darta.svg` | Vector master (SVG/PDF/AI) or a transparent PNG of at least 2400 px. The current SVG is traced from a 790 px PNG |

Notes
- The corridor resamples every photo to a power of two (max 2048 px) and builds mipmaps, so big files stay crisp when shrunk. Files above 2048 px are downscaled on the GPU, there is no benefit in going past ~3000 px.
- Export WebP at quality 82-88. A 2400 px photo is typically 150-300 KB.
- Current photos are only 463 px wide, which is why the entrance looks soft when it fills the screen.
