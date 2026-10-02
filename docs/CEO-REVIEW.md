# CEO plan review: Darta shop

Review mode: **SELECTIVE EXPANSION** (added capability on a working site). Run on 2026-10-02 with the `plan-ceo-review` approach; decisions were made autonomously against the brief ("make it better looking and adapt it to an e-commerce") and are logged here so the studio can overrule any of them.

## Premise

The salon site had one job: get a booking. Revenue per client stops at the chair. A barber with a good name (5,0 on 44 Google reviews, footballers in the chair) leaves three kinds of money on the table: retail (pomade, clay, beard oil), cash up front (gift cards) and recurring (a monthly cut plan).

**Do-nothing cost:** the site stays a brochure. For Punto Due Studio the demo also stays a brochure, instead of the proof that a small business can sell online without a platform fee or a developer retainer.

## 10-star version

A visitor finishes a fade, opens the site on the phone, spins the exact jar Thomas used, taps once, picks it up at the desk. A friend gets a gift card that looks like the wallet pass. Thomas edits one JSON file to add a product.

## Scope decisions

| # | Proposal | Effort | Decision | Why |
|---|---|---|---|---|
| 1 | Shop shelf with live-rendered 3D products | L | **Accepted** | The differentiator. No photography budget needed, matches Punto Due's `/motion` offer (3D product video) |
| 2 | Product sheet with drag-to-rotate viewer, deep links | M | **Accepted** | Turns the render into a buying moment; links are shareable on Instagram |
| 3 | Cart drawer, pickup vs shipping, coupon, free-shipping bar | M | **Accepted** | Raises basket size; pickup keeps logistics at zero for a salon |
| 4 | Demo checkout + WhatsApp hand-off | M | **Accepted** | Shows the full flow honestly without taking money |
| 5 | Gift card and monthly membership as products | S | **Accepted** | Cash up front and recurring revenue, both digital, no stock |
| 6 | Motion layer (curtain, scrub, counters, magnet, fly-to-cart) | M | **Accepted** | Brief asks for motion graphics; every piece is progressive enhancement |
| 7 | Real payments (Stripe, Satispay) | L | **Deferred** | Needs a server-side price check and a legal pass. Path described in README |
| 8 | Inventory, order admin, customer accounts | XL | **Deferred** | Not needed at this size; a Netlify Function plus email covers v1 |
| 9 | Gift card as real Apple/Google Wallet pass | M | **Deferred** | Natural sequel to the Club card, needs signing certificates |
| 10 | Loyalty stamps earned by online orders | S | **Deferred** | Needs identity to avoid abuse |
| 11 | Product reviews | M | **Skipped** | Fabricated reviews are off the table; real ones need a source |
| 12 | Entry popup with discount, scarcity timers | S | **Skipped** | Cheap trust-burners; the coupon is offered inside the cart instead |
| 13 | Instagram feed embed | M | **Deferred** | The studio and salon accounts are young; revisit with content |

## Error and rescue map

| Failure | User sees | Handling |
|---|---|---|
| `catalog.json` fails to load | Booking site, no shop | Shop section and cart controls are hidden; hero, listino, club unaffected |
| WebGL unavailable | Flat product silhouettes, product sheet without 3D | `GL.supported()` check; text content and cart work fully |
| WebGL context lost mid-view | Last snapshot image | `webglcontextlost` handler; viewer restarts on restore |
| `localStorage` blocked | Cart works for the session | All reads and writes are wrapped in try/catch |
| Stale cart (product removed, bad variant) | Silently dropped | Lines are re-validated against the catalog on restore |
| Invalid coupon | Inline message under the field | No state change |
| Checkout form invalid | Inline, labelled errors, focus on first field | `aria-invalid` plus `aria-describedby` |
| Unknown `#prodotto/...` slug | Lands on the shop | Router resets to `#shop` |
| anime.js missing or hidden tab | Page fully usable, no curtain | Every motion call is guarded; curtain skipped when the tab is hidden, with a timer failsafe |
| Double-tap on add / qty | Quantity capped at 9 | Clamped in the store |

## 12-month dream

```
TODAY (this PR)               NEXT                          12 MONTHS
Demo shop, no payment   -->   Stripe/Satispay + email  -->  Booking, shop and club on one
3D from code                  order function                account: points, reorder, wallet
Catalog = JSON file           Admin form writes JSON        pass, WhatsApp reminders
```

## Open points for the studio

- Prices, product names and copy are invented for the demo and flagged on the page. Confirm with the salon before showing it as theirs.
- WhatsApp number is the salon number already published on the site (+39 393 903 1656). The prefilled text starts with `[DEMO Punto Due Studio]`; swap it for a dedicated number before going live.
