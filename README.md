# Darta Barber Studio, demo

Demo website concept for **Darta Barber Studio** (Via Gobetti 184, Pescara), designed and developed by [Punto Due Studio](https://puntoduestudio.it).

The site is a booking landing page that doubles as a small **e-commerce**: every product and every service has its own page, products are rendered in 3D, there is a cart, a demo checkout. The shop sells only the real Darta products (Hair Pomade, Hair Powder Clay, Beard Oil, Eco Spray, Curl Man, Curl Control); the gift card, kit and membership code paths are still in the cart, pricing and tests but no product uses them. No framework, no build step, no backend: static files on Netlify.

## What is in it

| Page / area | What it does |
|---|---|
| Home (`/`) | Raw WebGL dive into the salon sign that dissolves into the shop intro: a dark 3D lineup where a spotlight travels from product to product (scroll-driven), then a link into the shop. Then the Lavori deck, proof, services teaser, story, team (three equal cards), club, hours |
| Shop (`/shop`) | The whole catalog: category filters, quick add, a picture per product rendered from the real 3D models (static HTML, no 3D needed) |
| Product pages (`/prodotti/<name>`) | One page per product: the real packshot, "Guarda come si usa" plays the product's own routine as a film (`img/use/<slug>.mp4`, the product unscrews, sprays or pumps by itself, with the steps lighting up), quantity, add to cart, related products. Old `#prodotto/<name>` links redirect here |
| Services (`/servizi`, `/servizi/<name>`) | The price list as a page, plus one page per service with duration, price, how it goes, products to pair, and a booking button |
| Cart and checkout | Drawer (`#carrello`) and demo checkout (`#checkout`) work on every page and share the same saved cart. **Demo only: no payment, nothing is sent** |
| Opening status | The header chip is green when the salon is open and red when closed (Europe/Rome, Tuesday to Saturday 10:00 to 19:00); it updates by itself |
| Motion | anime.js: first-visit curtain, count-ups, scroll-scrubbed manifesto, magnetic buttons, fly-to-cart, order burst. Everything respects `prefers-reduced-motion` |

## Run it

```bash
python3 tools/serve.py      # then open http://127.0.0.1:4173
```

The dev server sends the same headers as Netlify (so CSP mistakes show up while you work) and understands the clean URLs (`/shop`, `/prodotti/...`). Nothing to install.

## English version

The whole site also exists in English under `/en/` (home, shop, product pages, services, order page), with a language link in the header and `hreflang` between each page and its twin. Italian stays the default and the source of truth.

- **One dictionary.** `data/en.json` maps every Italian phrase to its English version. The generator uses it for the pages and turns the phrases the scripts need into `js/en.js`; scripts ask for text with `D.t('Italian phrase', {placeholders})`.
- **Product and service copy** is in `data/catalog.en.json` and `data/services.en.json` (fields laid over the Italian ones; prices always come from the Italian file).
- **Never edit `en/` or `js/en.js` by hand.** Edit `index.html` (the home) or the data files, run `python3 tools/build-pages.py`, commit the result.
- **New text?** Write it in Italian, add `D.t('...')` in scripts, run `python3 tools/build-pages.py --check`: it lists every Italian phrase that has no English yet (it also runs in the tests) and fails until you add them to `data/en.json`.
- Checkout, the thank-you page and the wallet card are in the customer's language too: the cart sends `lang` to the payment functions (Stripe's page, return links, product names, the pass texts).

## Edit the shop and the services

Everything sold lives in [`data/catalog.json`](data/catalog.json): names, prices (in cents), categories, variants, coupons and shipping rules. Product looks (colours, label text) sit in each product's `look` and `label` fields and feed the 3D renderer directly. Kinds: `jar`, `dropper`, `spray`, `powder`, `kit`, `card`. Services live in [`data/services.json`](data/services.json).

After editing either file, regenerate the pages and commit the result:

```bash
python3 tools/build-pages.py       # shop.html, servizi.html, prodotti/*.html, servizi/*.html (+ the service teaser on the home page)
```

**After editing any script or stylesheet, run `python3 tools/build-pages.py`**: it stamps every `/js/...` and `/css/...` URL in the pages with `?v=<hash of the file>`, and `netlify.toml` caches those files for a year (`immutable`), so a changed file is only picked up through its new stamp (a test checks that no page lacks one). Above the fold the entrance animations are pure CSS (`.hero-copy .rv`, the first section of inner pages, the first shop row in `css/styles.css`), so the first paint never waits for the scripts; keep it that way when you add a hero. The shop posters come in three sizes (`-a`, `-a-sm` 480px for phones, `-a-xs` 240px thumbnails): `render-images.html` writes all three.

Product pictures, card loops, the home counter cutouts and the usage films are photographic, made with Higgsfield from the studio's own product photos (see `img/README.md` for every file, size and how it was made). The old 3D pipeline (`js/product-gl.js`, `js/product-fx.js`, `tools/render-images.*`, `tools/render-loops.*`, `encode-loops.py`) is kept in the repository but no page loads it any more.

## Structure

```
index.html            home page (Italian, hand written); also the source of the shared header, footer, cart and checkout
en/                   the English twin of every page, GENERATED (en/index.html, shop, services, order, products/, services/)
shop.html             /shop            generated by tools/build-pages.py
ordine.html          /ordine          generated, where Stripe sends the customer after paying
servizi.html          /servizi         generated
prodotti/<name>.html  /prodotti/<name> generated, one per product
servizi/<name>.html   /servizi/<name>  generated, one per service
css/styles.css        base system (tokens, type, hero, sections, loyalty card)
css/shop.css          shop layer (cards, product stage, cart, checkout, header chip, motion pieces)
css/scenes.css        home scenes: shop intro (inside the hero stage), Lavori deck, services teaser
css/pages.css         inner pages: shop, product, services
data/catalog.json     products, coupons, shipping
data/services.json    services (prices, durations, steps, products to pair)
data/en.json          Italian phrase -> English phrase (pages and scripts)
data/catalog.en.json  English copy of the products; data/services.en.json  English copy of the services
img/p/                product pictures rendered from the 3D models
img/v/                shop-card loops (mp4) of each product's animation, made by tools/encode-loops.py
js/core.js            helpers, language (D.lang, D.t), reveal observer, router (#carrello / #cart, #checkout), URL helpers
js/en.js              GENERATED English dictionary for the scripts, loaded only on /en/ pages
js/store.js           catalog loading, cart state, totals
js/product-fx.js      (no longer loaded) particle effects of the earlier 3D animations
js/product-gl.js      (no longer loaded) raw WebGL renderer of the earlier 3D product models, viewer and poses
js/shop.js            shop page: filters, quick add, hover picture
js/product.js         product page: photo, "Guarda come si usa" film with timed steps, options, quantity, add to cart
js/cart.js            drawer, checkout (demo or Stripe), fly-to-cart
js/pay.js             talks to the Supabase functions (is real payment on? create checkout, look up an order)
js/order.js           /ordine page: confirms the payment and empties the cart
js/motion.js          anime.js choreography (progressive enhancement)
js/journey.js         hero WebGL dive into the sign (dissolves into the shop scene)
js/shopintro.js       shop intro: the real products (photo cutouts placed with the scene camera) on the studio shelf, spotlight tour, captions, all driven by scroll
js/works.js           Lavori deck
js/club.js            loyalty card
js/wallet.js          talks to the darta-wallet function (which wallets are on, save the card, open the pass)
js/main.js            wiring shared by every page (reveals, booking sheet, opening status, bootstrap)
js/vendor/            anime.js 4.5.0 (MIT), vendored because the CSP only allows same-origin scripts
docs/                 design, security and payment notes
supabase/             Edge Functions (darta-checkout, darta-stripe-webhook, darta-order) and the orders migration
tests/                node --test unit tests for pricing, Stripe requests, webhook signature, handlers and the pay client
tools/                serve.py (dev server), build-pages.py (page generator, both languages) with i18n.py (translation engine), render-images.* (product pictures), render-loops.* and encode-loops.py (the card loops), pose-sheet.* (contact sheets of a pose), make-wallet-images.py (wallet icon and stamp strips), csp.py (CSP hash)
```

## Security and deploy notes

- `netlify.toml` ships a strict CSP (`script-src 'self'` plus one hash; `media-src 'self'` for the card loops). If you edit the inline script in `index.html`, run `python3 tools/csp.py`.
- `form-action 'none'`: no form ever submits. `connect-src` allows the one Supabase project that runs the payment functions; the customer reaches Stripe by a plain navigation, so the CSP needs no Stripe origin. The WhatsApp button is a plain link carrying the order summary, without personal data.
- Browser storage, all functional and free of personal data apart from an optional typed card name: `localStorage` `darta-cart-v1` (product ids, variants, quantities), `localStorage` `darta-card` (loyalty card look, stamps and the name the visitor types on it), `sessionStorage` `darta-seen` (first-visit intro already played). Checkout fields are cleared from the form after the demo order and never stored or sent.
- Full audit, tooling results and the go-live checklist: [`docs/SECURITY.md`](docs/SECURITY.md). Third-party code: [`docs/THIRD-PARTY.md`](docs/THIRD-PARTY.md).
- The page keeps `noindex`: it is a demo. Remove it when going live.

## Payments

Stripe Checkout is built and switched off until the server has the Stripe keys; until then the shop stays in demo mode and nothing is charged. The cart is priced again on the server (Supabase Edge Functions in `supabase/functions/`), the customer pays on Stripe's own page (cards, Apple Pay, Google Pay) and paid orders land in the `darta_orders` table. Setup, secrets, webhook and the go-live steps: [`docs/PAYMENTS.md`](docs/PAYMENTS.md). Unit tests: `node --test tests/*.test.mjs` (Node 24, no dependencies).

The loyalty card has an "Aggiungi al Wallet" button for Apple Wallet and Google Wallet (Edge Function `darta-wallet`, table `darta_cards`, pictures in `img/wallet/`). It stays a demo message until the wallet accounts exist: [`docs/WALLET.md`](docs/WALLET.md).

## Accessibility

Native `<dialog>` modals with focus management, visible focus rings, 44px touch targets, labelled form errors, `aria-live` counters, and `prefers-reduced-motion` support (no curtain, no auto-rotate, no fly animation).
