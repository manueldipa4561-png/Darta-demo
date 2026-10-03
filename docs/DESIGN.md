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
- Wax Powder film: its own WebGL context is created only when the section is within one and a half screens, the canvas renders at 1.5x, the powder cloud uses 45 percent of the grains, and when you stop scrolling it redraws only a few frames per second (just the gentle float).
- Layout: shorter scroll tracks on phones; the bottle is fitted into the free space above the price block (measured, so a 320 x 568 screen does not overlap); landscape phones switch to words left, price right.
- Cache: scripts and styles revalidate on every load, so a new page can never meet an old script.

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

- Raw WebGL1, no library (keeps the CSP, bundle and GPU context count minimal). One context serves shelf snapshots and the live viewer.
- Models are surfaces of revolution (jar, dropper bottle, spray) plus a rounded slab (cards). Hard creases come from repeated profile points.
- Lighting is procedural: key softbox, strip light, teal rim from `--accent`, ACES tone map. Amber glass is a shaded translucent shell with a liquid line.
- Labels are drawn to a canvas from the catalog (`label` fields) in the site fonts, wrapped as decals on front-facing surfaces only.
- The Wax Powder bottle follows the product film: slim gloss-black body, ribbed neck, silver screw cap, the Darta script printed on the glass. Its animation is a pure function of a 0..1 progress value (`powderPose`), and the powder is a stateless particle field (position = f(age)), so scrolling can scrub both forwards and backwards. The shop's viewer plays the same timeline on a button.
- `createGL()` builds independent renderers: one for shelf snapshots and the viewer, one for the home film. Three WebGL contexts in total (hero, shop, film), well under mobile limits.
- Shelf images are rendered once in idle time (about 20 ms each) and stored as WebP data URLs, so the grid never holds more than one GL context.

## Motion spec

| Piece | Trigger | Timing |
|---|---|---|
| Hero dive | scroll | camera dolly with chromatic split, then a white-out (scroll 70 to 96 percent) that hands over to the film |
| Wax Powder film | scroll, pinned 640 svh | cap unscrews 6 to 30 percent, tilt 34 to 52, pour 50 to 80, bottle returns 80 to 92, cap screws back 82 to 97; words SVITA / SCUOTI / DAI VOLUME assemble letter by letter; price counts 4 to 20 |
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
