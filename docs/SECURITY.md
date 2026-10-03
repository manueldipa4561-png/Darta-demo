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
| Exposure | `publish = "."` serves the whole repo | `/docs`, `/tools`, `/.git`, `README.md`, `netlify.toml`, `.gitignore` answer 404 |
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

The checkout is a demo. Prices, coupons and shipping are computed in the browser from `data/catalog.json`. That is fine for a showcase because nothing is charged and nothing is sent, and the cart stores only product ids, variants and quantities (never prices or personal data). It would **not** be safe for a live shop.

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
