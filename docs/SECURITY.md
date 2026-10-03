# Security and quality audit

Audit date: 2026-10-02. Scope: the static site in this repository (frontend, Netlify headers) and the go-live requirements for a real backend. Method: manual review plus tooling, using the ECC `security-reviewer` / `security-review` checklists as the methodology.

## Result in one table

| Area | Check | Result |
|---|---|---|
| Secrets | Grep for keys, tokens, private keys, credentials in all first-party files | None found |
| XSS | Every data source (hash, localStorage, catalog.json, form fields) traced to every sink | No `innerHTML`, `eval`, inline handlers or `javascript:` URLs in first-party code. All dynamic text goes through `textContent` / `createElement` |
| Static analysis | ESLint with `eslint-plugin-security` and `eslint-plugin-no-unsanitized` over `js/*.js` | 0 errors. 66 `detect-object-injection` warnings reviewed: keys come from fixed tables, null-prototype maps or numeric array indexes, not user input |
| Prototype keys | `#prodotto/constructor`, coupon `constructor`, poisoned localStorage | Catalog maps and coupons use null-prototype objects; restored carts are re-validated field by field |
| Supply chain | `anime.js` 4.5.0 vendored | Tarball integrity matches the npm registry; bundle SHA-256 identical to the published file; no network, `eval` or `Function` calls inside. ECC IOC scanner: no findings (no package manifests in the repo) |
| CSP | Enforced locally with the real `netlify.toml` headers across shelf, product sheet, cart, checkout, filters, 3D | 0 violations. `style-src 'self'` (no `'unsafe-inline'` for style elements), `script-src 'self'` plus one hash |
| Headers | CSP, COOP `same-origin`, CORP `same-origin`, `X-Frame-Options: DENY`, `frame-ancestors 'none'`, nosniff, strict Referrer-Policy, HSTS, wide Permissions-Policy | Set in `netlify.toml` |
| Exposure | `publish = "."` serves the whole repo | `/docs`, `/tools` (dev server, generator and the image-save endpoint live there), `/.git`, `README.md`, `netlify.toml`, `.gitignore` answer 404 |
| HTML | `html-validate` (recommended + WCAG rules) | 0 errors |
| Accessibility | axe-core (WCAG 2.0/2.1/2.2 A and AA, best practices) on the page and on product sheet, gift card variants, cart, checkout with errors, order confirmation | 0 violations in every modal state. Main page: contrast of the dimmed manifesto words and a missing landmark were found and fixed |
| Functional regression | Scripted checks: history and Back, scroll-lock, double-close, drag-release on the backdrop, promo states, shipping thresholds, stepper at 9, order then Back | All pass after the fixes listed below |

## Bugs found by the independent code review and fixed

Scroll lock drifting on dialog transitions; invisible toast button still clickable; promo field wiped on re-render; free shipping counted digital goods; no visual for the product sheet without WebGL; drag from an input onto the backdrop closed the dialog; switching product kept scroll and focus; prototype keys resolved as products; focus lost at quantity 9; drag hint stuck; Back after an order reopened an empty cart. All fixed and covered by the scripted regression above.

## Independent security review (second pass, ECC security-reviewer method)

No exploitable XSS, secret leak, open redirect, clickjacking or third-party request was found, and the checkout never reaches the DOM or the WhatsApp text. Findings and what was done:

| Severity | Finding | Action |
|---|---|---|
| Medium (critical if reused live) | Prices, coupon, shipping and order number are computed in the browser | Accepted for the demo (nothing is charged or sent); server re-pricing is item 1 of the go-live checklist |
| Medium | `publish = "."` ships docs, tools, README, config | Forced 404 redirects for each path. Moving to a `public/` folder is on the go-live list; after deploy confirm with `curl -I https://<site>/.git/HEAD` |
| Low | `'unsafe-inline'` for styles | Reduced to `style-src 'self'` + `style-src-attr 'unsafe-inline'`; dynamic styles now use the CSSOM |
| Low | Missing `X-Robots-Tag`, short Permissions-Policy, no COOP/CORP | Added |
| Low | localStorage cart: non-string ids, unbounded lines | Strict type checks, 20-line cap, 100-entry parse cap, id format `^[a-z0-9-]{1,32}$` enforced on the catalog |
| Low | Plain-object maps keyed by catalog id; kit recursion | Null-prototype maps everywhere; kits cannot contain kits |
| Low | Email regex on very long input, no length limits | `maxlength` on every field and a 254-character cap |
| Low | PII left in the form after the demo order | Form is reset on success |
| Low | Idle viewer redraw and unreleased probe context | Auto-rotate rests after 16 s; the capability probe context is released |
| Open | Real clients are named in the "Sulla sua poltrona" section; the salon's real phone and booking links are live in a public demo | Needs the salon's written consent, or a Netlify password until sign-off |
| Info | og:image is a relative URL | Make it absolute when the final domain is known |

## What the demo cannot protect (by design)

While the server has no Stripe keys the checkout is a demo. Prices, coupons and shipping are computed in the browser from `data/catalog.json`. That is fine for a showcase because nothing is charged and nothing is sent, and the cart stores only product ids, variants and quantities (never prices or personal data). It would **not** be safe for a live shop, which is why real payments run through the server-side flow described in [`PAYMENTS.md`](PAYMENTS.md) and reviewed below.

## Payments: independent review and what was done (3 Oct 2026)

A read-only security review of the Stripe integration (3 Supabase Edge Functions, orders table, `pay.js`, `order.js`, checkout parts of `cart.js`) found no critical issue. Findings and outcome:

| # | Finding | Outcome |
|---|---|---|
| 1 HIGH | Origin check is not authentication; no rate limit; 0.50 EUR minimum invites card testing | Per-visitor and global rate limits in Postgres (IP stored only as a hash), minimum order 5 EUR. **Still open:** Turnstile before real traffic |
| 2 HIGH | Customers could pay while the webhook secret was missing (order never recorded) | "Live" now requires `STRIPE_WEBHOOK_SECRET` as well; webhook alerts and a weekly reconciliation are in `PAYMENTS.md` |
| 3 MED | Demo fallback could pass for a real confirmation | Demo mode only with `<meta name="darta-demo">`; heading says "Ordine di prova"; without the meta, "payments off" is an error state |
| 4 MED | Webhook answered 500 for sessions that are not Darta's | Acknowledged with 200 and ignored |
| 5 MED | 6-character order numbers could collide | `DA-` + 7 unambiguous characters (27 billion values); database constraint updated |
| 6 MED | One powerful key shared by all functions and, in this project, with other apps | Optional restricted `STRIPE_READ_KEY`; dedicated client-owned Supabase project recommended for go-live |
| 7-13 LOW | Email idempotency, `paid_at` drift, `markFailed` downgrade, body size, NaN prices, more than 10 line items, coupons that never expire, newlines in plain-text email | All fixed and covered by tests |
| 14 LOW | Thank-you page promised a Stripe receipt | Reworded; receipts must be switched on in Stripe |

Verified OK: webhook HMAC (constant time, 5-minute window, several `v1` values, checked before parsing), event bodies never trusted (the session is re-read from Stripe), idempotent upserts and a single-winner email claim, server-side pricing with digital items refused, Stripe URL prefix check on the browser side, `success_url`/`cancel_url` built only from `SITE_URL`, JSON content type plus exact Origin match, escaped email HTML, no personal data in `darta-order` or logs, RLS with no policies on `darta_orders` and `darta_rate_hits`, no secrets in the repository.

To check by hand with a real test-mode order (mocks cannot prove them): the pinned Stripe API version `2024-06-20` (from 2025-03-31 the shipping address moves to `collected_information`), product photos on Stripe's page (the CORP header on `/img/*`), and an end-to-end shipping order with a coupon.

Tests: `node --test tests/*.test.mjs` (89 tests: pricing parity with the browser cart, Stripe request building, webhook signature, handlers with fake Stripe/database/mail, the pay client).

## Go-live checklist (real payments)

1. **Re-price on the server.** Accept only `{id, variant, qty}` from the browser, load prices from the server-side catalog, recompute discount, shipping and VAT, and create the payment session from that total.
2. **Payments.** Use a hosted flow (Stripe Checkout or Satispay). Never touch card data. Verify webhooks with the provider signature and make order creation idempotent.
3. **Coupons.** Validate codes server-side, with per-code limits, expiry and rate limiting. The code shown in the demo (`BENVENUTO10`) is public by design.
4. **Order API.** Netlify Function with schema validation (reject unknown fields), size limits, a per-IP rate limit, and no personal data in logs. Send the confirmation email from the server.
5. **Secrets.** Provider keys only in Netlify environment variables, scoped by context; rotate on any suspicion; add `.env*` to `.gitignore` before the first function lands.
6. **CSP.** When a payment provider script or frame is added, extend `script-src` / `frame-src` / `connect-src` for that exact origin only, add Subresource Integrity where the vendor supports it, and relax `Permissions-Policy: payment=()` for the checkout path only.
7. **Privacy.** Add a privacy notice and controller details. The site currently stores only functional data (cart, loyalty card preferences) in `localStorage`, which normally needs no consent banner; any analytics or marketing pixel would. Keep the WhatsApp hand-off free of personal data.
8. **Monitoring.** Alert on 4xx/5xx spikes of the order function and on payment webhook failures; keep an audit trail of orders by id.
9. **Indexing.** Remove `noindex` only when the content is confirmed with the salon.
10. **Repo layout.** Move the site into a `public/` folder and publish that instead of `.`; the 404 redirects are a stopgap.

## Reproduce the checks

```bash
# static analysis (needs Node 18+)
npm i -D eslint@9 @eslint/js globals eslint-plugin-security eslint-plugin-no-unsanitized html-validate
# CSP + headers: serve the site with the headers from netlify.toml and watch the console for violations
# supply chain: compare js/vendor/anime.umd.min.js with the file inside the npm tarball for animejs@4.5.0
```
