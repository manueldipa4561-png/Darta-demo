# Darta Barber Studio, demo

Demo website concept for **Darta Barber Studio** (Via Gobetti 184, Pescara), designed and developed by [Punto Due Studio](https://puntoduestudio.it).

The site is a booking landing page that now doubles as a small **e-commerce**: a shelf of products rendered live in 3D, a cart, a demo checkout, gift cards and a monthly membership. No framework, no build step, no backend: static files on Netlify.

## What is in it

| Area | What it does |
|---|---|
| Hero corridor | Raw WebGL scroll journey through the salon sign and four recent cuts (swipe rail fallback without WebGL) |
| Shop (`#shop`) | Product shelf with 3D renders, category filters, free-shipping rules, deep links (`#prodotto/matte-clay`) |
| Product sheet | Live WebGL viewer (drag, arrow keys or buttons to rotate), gift card amounts that re-render on the card |
| Cart (`#carrello`) | Drawer with quantity steppers, pickup or shipping, coupon `BENVENUTO10`, free-shipping progress bar |
| Checkout (`#checkout`) | Validated form, order confirmation, optional WhatsApp hand-off. **Demo only: no payment, nothing is sent** |
| Club | Customisable loyalty card with tilt and stamps |
| Motion | anime.js: first-visit curtain, count-ups, scroll-scrubbed manifesto, magnetic buttons, fly-to-cart, order burst |

## Run it

```bash
python3 -m http.server 4173      # then open http://localhost:4173
```

Any static server works. There is nothing to install.

## Edit the shop

Everything sold lives in [`data/catalog.json`](data/catalog.json): names, prices (in cents), categories, variants, coupons and shipping rules. Product looks (colours, label text) sit in each product's `look` and `label` fields and feed the 3D renderer directly. Add a product with kind `jar`, `dropper`, `spray`, `kit` or `card` and it appears on the shelf with its own 3D model, no image needed.

## Structure

```
index.html            markup, dialogs, one tiny inline pre-paint script
css/styles.css        base system (tokens, type, hero, sections, loyalty card)
css/shop.css          shop layer (shelf, product sheet, cart, checkout, motion pieces)
data/catalog.json     products, coupons, shipping
js/core.js            helpers, reveal observer, history-aware router
js/store.js           catalog loading, cart state, totals
js/product-gl.js      raw WebGL renderer (lathe models, studio lighting, label textures, viewer)
js/shop.js            shelf, filters, product sheet
js/cart.js            drawer, checkout, fly-to-cart
js/motion.js          anime.js choreography (progressive enhancement)
js/journey.js         hero WebGL corridor
js/club.js            loyalty card
js/main.js            wiring
js/vendor/            anime.js 4.5.0 (MIT), vendored because the CSP only allows same-origin scripts
docs/                 design and strategy notes
tools/csp.py          regenerates the CSP script hash in netlify.toml
```

## Security and deploy notes

- `netlify.toml` ships a strict CSP (`script-src 'self'` plus one hash). If you edit the inline script in `index.html`, run `python3 tools/csp.py`.
- `form-action 'none'`: the checkout never submits anywhere. The WhatsApp button is a plain link carrying the order summary, without personal data.
- Browser storage, all functional and free of personal data apart from an optional typed card name: `localStorage` `darta-cart-v1` (product ids, variants, quantities), `localStorage` `darta-card` (loyalty card look, stamps and the name the visitor types on it), `sessionStorage` `darta-seen` (first-visit intro already played). Checkout fields are cleared from the form after the demo order and never stored or sent.
- Full audit, tooling results and the go-live checklist: [`docs/SECURITY.md`](docs/SECURITY.md). Third-party code: [`docs/THIRD-PARTY.md`](docs/THIRD-PARTY.md).
- The page keeps `noindex`: it is a demo. Remove it when going live.

## Going live with real payments

The demo deliberately stops at the order screen. The usual next step is Stripe Checkout (or Satispay) behind a Netlify Function that re-prices the cart from `catalog.json` server side, plus an order email. See [`docs/CEO-REVIEW.md`](docs/CEO-REVIEW.md) for what was kept in scope and what was deferred.

## Accessibility

Native `<dialog>` modals with focus management, visible focus rings, 44px touch targets, labelled form errors, `aria-live` counters, keyboard rotation for the 3D viewer, and `prefers-reduced-motion` support (no curtain, no auto-rotate, no fly animation).
