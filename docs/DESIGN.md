# Design notes

## Direction

Keep the Darta identity (near-black, cream, the teal of the Via Gobetti wall sign, Barlow Condensed in capitals) and push it toward an editorial sports-brand feel: hairline grids, mono micro-labels, large condensed type, products lit like a studio shoot.

Dials used with the `ui-ux-pro-max` generator: variance 8, motion 8, density 5. Its raw output (light brutalist page, Playfair) did not fit a dark barber brand, so only the rules were applied: contrast 4.5:1, 44px targets, visible focus, reduced motion, canvas `role="img"` with a label, one WebGL renderer for the shop, DPR capped at 2, touch handled with `touch-action: pan-y`, WebP data URLs, SVG icons only.

## Tokens

| Token | Value | Use |
|---|---|---|
| `--bg` | `#0b0b0a` | page |
| `--surface` | `#171715` | cards, dialogs |
| `--text` | `#efe9df` | primary text |
| `--muted` / `--dim` | `#aaa498` / `#8a857c` | secondary text |
| `--accent` | `#6cc0b8` | the only accent, also the 3D rim light |
| `--err` | `#ff9d8a` | form errors |
| Display | Barlow Condensed 800, uppercase | headings, prices |
| Body | Barlow 400 to 600 | copy |
| Mono | system mono stack | indices, labels, specs (same device as puntoduestudio.it) |

## Phones

Anything heavy scales down on phone-class devices (`D.lite()`: touch screen or a window under 700 px; `?lite` forces it for testing):

- Images: `srcset` serves 900 to 1000 px WebP files (about a third of the bytes) and only larger ones to big screens.
- Hero 3D: texture capped at 1024 px, canvas at 1.5x pixel ratio, and if the 3D hero is not up within 7 seconds the plain photo takes over instead of leaving a dark screen.
- Shop intro: its own WebGL context is created only when the visitor starts scrolling (or after a few idle seconds), the canvas renders at 1.5x, and when you stop scrolling it redraws only a few frames per second (just the gentle float). The powder cloud on the Wax Powder page uses 45 percent of the grains.
- Layout: shorter scroll tracks on phones; the bottle is fitted into the free space above the price block (measured, so a 320 x 568 screen does not overlap); landscape phones switch to words left, price right.
- Cache: scripts and styles revalidate on every load, so a new page can never meet an old script.

## Pages

Products and services are real pages (`/prodotti/<name>`, `/servizi/<name>`) so they can be linked, shared and bookmarked, and so the shop and the price list are not crammed into the home page. They are generated into static HTML (tools/build-pages.py) from the data files: text, price, schema.org data and a picture are in the markup before any script runs, and the script only adds the live 3D viewer, options and the cart. Catalog pictures are rendered once from the real 3D models (tools/render-images.html), so the shop page needs no WebGL and loads about 25 KB per product.

## Team cards

Three equal cards (same size, type, button and baselines): nobody is featured, the founder included. Each has its own finish and a barbering texture on the big initial: teal with an outlined letter (the blade edge), amber with a letter that fades out (the skin fade), steel with diagonal stripes (the barber pole). The amber and steel are used on these cards only; the teal stays the site accent.

## Inspiration (patterns, not copies)

| Source | Taken |
|---|---|
| Apocalypse Coffee Roasters (Awwwards, e-commerce) | Product-first hero energy, tactile cart affordance, discount offered in context |
| Club Athletic (Awwwards, e-commerce, GSAP) | Scroll-scrubbed statement text, mono labels, "drop" framing for the kit |
| Godly feed (wallet credentials, micro-interactions) | Holographic gift card, receipt-like order confirmation |
| puntoduestudio.it | Mono `/section` labels, dot-and-hairline grid language, two-circle mark in the footer credit |

Pinterest was not usable (login and CAPTCHA wall), and the studio's Instagram only exposes public metadata without signing in, so no further references were pulled from them.

## 3D

- Raw WebGL1, no library (keeps the CSP, bundle and GPU context count minimal). A page type uses at most two contexts.
- Models are surfaces of revolution (jar, dropper bottle, spray) plus a rounded slab (cards). Hard creases come from repeated profile points.
- Lighting is procedural: key softbox, strip light, teal rim from `--accent`, ACES tone map. Amber glass is a shaded translucent shell with a liquid line.
- Labels are drawn to a canvas from the catalog (`label` fields) in the site fonts, wrapped as decals on front-facing surfaces only.
- The home shop intro draws five products in one frame (`scene()`), with a spotlight that dims the others, a light pool under each and a lift as it comes into focus. Product pages use the same renderer for the single-product viewer.
- The Wax Powder bottle follows the product film: slim gloss-black body, ribbed neck, silver screw cap, the Darta script printed on the glass. Its animation is a pure function of a 0..1 progress value (`powderPose`), and the powder is a stateless particle field (position = f(age)), so scrolling can scrub both forwards and backwards. The shop's viewer plays the same timeline on a button.
- `createGL()` builds independent renderers. The home page uses two WebGL contexts (hero sign and shop intro); a product page uses one (its viewer); the shop and service pages use none.
- Catalog pictures are rendered offline from these models by tools/render-images.html and committed as WebP (img/p/), so catalog pages never need WebGL.

## Motion spec

| Piece | Trigger | Timing |
|---|---|---|
| Hero dive | scroll | camera dolly with chromatic split; from 55 percent of the dive the sign canvas fades while the shop scene fades in underneath (one continuous move, no flash) |
| Shop intro | scroll, one pinned stage with the hero (960 svh, 780 on phones) | arrival (products rise, camera dollies in), then a spotlight tour: each product lifts and turns as the camera glides to it and its name, price and one-liner assemble letter by letter; closing view pulls back to the whole counter with a link to the shop |
| Lavori deck | scroll, pinned 520 svh | smootherstep between photos so each one lingers; card slides out with rotation while the next arrives; giant word behind each photo |
| Curtain | first visit per session | about 2.1 s, skipped for reduced motion, deep links and hidden tabs |
| Hero text | load | CSS reveal, delayed under the curtain |
| Count-ups | in view | 1.7 s, `outExpo` |
| Manifesto | scroll progress | words 0.16 to 1 opacity, `onScroll` synced |
| Cards | in view / filter | 520 ms, 55 ms stagger |
| Sheet / drawer | open | 500 to 550 ms in, 170 ms out (exit faster than enter) |
| Fly-to-cart | add | 760 ms arc, badge spring |
| Order confirmation | submit | stroke draw, 18-dot burst, number elastic |

Everything checks `prefers-reduced-motion` and falls back to the static state.
