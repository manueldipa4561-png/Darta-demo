# Payments: Stripe Checkout on Supabase

Real payments are built but switched off until the server has the Stripe keys. Until then the shop stays in demo mode (nothing is charged), so the live site never breaks.

## How it works

```
shop (Netlify, static)  --cart ids only-->  Supabase Edge Function darta-checkout  --> Stripe: creates a Checkout Session
customer is sent to Stripe's page (cards, Apple Pay, Google Pay, Link ...)  and pays there
Stripe  --signed webhook-->  Edge Function darta-stripe-webhook  -->  table darta_orders  (+ optional email to the salon)
Stripe  --redirect-->  /ordine?s=cs_...  -->  Edge Function darta-order  -->  thank-you page (clears the cart once paid)
```

- The browser sends only product ids, variants, quantities, coupon and pickup/shipping. **Prices are recomputed on the server** from `data/catalog.json`, and the session is refused if Stripe's total differs from ours.
- Card data never touches this site or our functions. Apple Pay and Google Pay appear on Stripe's page by themselves when the customer's device supports them.
- Gift card and Abbonamento Fade are **not payable online yet** (they need a code and a recurring subscription). The checkout tells the customer to buy them in the salon.
- Source: `supabase/functions/*` (Deno/TypeScript), table `public.darta_orders` in `supabase/migrations/`. Tests: `node --test tests/*.test.mjs` (Node 24).

## Turning it on (about 15 minutes, once the Stripe account exists)

1. **Stripe account.** Create it for the client (business details, ID check and bank account can take hours to days). Work in **test mode** first: Dashboard > Developers > API keys > Secret key (`sk_test_...`).
2. **Supabase secrets.** Dashboard > Project `kemfyrbrlsbuberjqzje` > Edge Functions > Secrets. Add:

   | Name | Value |
   |---|---|
   | `STRIPE_SECRET_KEY` | `sk_test_...` (later `sk_live_...`). Better a **restricted key** (Stripe > Developers > API keys > Create restricted key) with *write* on Checkout Sessions and Coupons only |
   | `SITE_URL` | `https://darta-demo.netlify.app` (no trailing slash; later the client's own domain) |
   | `STRIPE_WEBHOOK_SECRET` | `whsec_...` from step 3. **Payments only switch on when this exists**, so a customer can never pay while the order goes unrecorded |
   | `STRIPE_READ_KEY` | optional second restricted key with *read* on Checkout Sessions only, used by the webhook and the thank-you page |

   Never paste keys in chat, in the repo or in Netlify: only here. Secrets are shared by every function of the Supabase project, including other apps living there: for the live shop use a **dedicated Supabase project owned by the client** (the SQL in `supabase/migrations/` recreates everything, then redeploy the three functions).
3. **Webhook.** Stripe Dashboard > Developers > Webhooks > Add endpoint:
   URL `https://kemfyrbrlsbuberjqzje.supabase.co/functions/v1/darta-stripe-webhook`
   Events: `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`.
   Stripe then shows a signing secret (`whsec_...`): add it as the Supabase secret `STRIPE_WEBHOOK_SECRET`. Leave Stripe's email alerts for failing webhook endpoints switched on (Webhooks > the endpoint > Alerts): a broken webhook means paid orders that the salon never hears about.
4. **Salon email (optional).** Create a Resend account, verify the sending domain, then add `RESEND_API_KEY`, `ORDER_NOTIFY_TO` (comma separated) and `ORDER_NOTIFY_FROM` (for example `Darta Shop <shop@client-domain.it>`). Without them orders are still stored and visible in the Stripe Dashboard.
5. **Try it.** On the shop add a product, go to checkout: the button now says "Paga". Use Stripe's test card `4242 4242 4242 4242`, any future date, any CVC. You land on `/ordine`, the order appears in Stripe > Payments and in the table `darta_orders`.
6. **Go live.**
   - Swap to the live key and create a live-mode webhook (its own `whsec_`); set `SITE_URL` to the real domain.
   - **Remove demo mode:** delete `<meta name="darta-demo" content="1">` from `index.html` and from the page shell in `tools/build-pages.py`, run `python3 tools/build-pages.py`, and push. From then on a server that says "payments are off" shows a disabled button and an apology, never a pretend order.
   - Remove `noindex` (`X-Robots-Tag` in `netlify.toml` and the robots meta in the page shell).
   - In Stripe, switch on customer receipt emails (Settings > Customer emails > Successful payments): the thank-you page tells customers to expect one.
   - Read the checklist in [`SECURITY.md`](SECURITY.md).
7. **Check by hand once in test mode** (mocks cannot prove these): a pickup order and a shipping order with the coupon `BENVENUTO10`; the shipping address shows in the Stripe payment and in `darta_orders`; the product photos appear on Stripe's page (`netlify.toml` sends `Cross-Origin-Resource-Policy: same-origin` on images; if the photos are missing, serve `/img/p/*` as `cross-origin`).

## Things to decide with the client

- **Tax and invoices.** Prices are shown VAT included. Stripe is not configured for automatic tax or invoices; the accountant decides how receipts and e-invoices are issued.
- **Refunds and fulfilment.** Refunds are done in the Stripe Dashboard. The `fulfilment` column of `darta_orders` (new, ready, shipped, picked_up, cancelled) is ready for an admin screen but nothing updates it yet.
- **Stock.** Not tracked: every product can always be bought.
- **Shipping.** One flat rate (4,90 EUR, free from 40 EUR) and Italy only, taken from `data/catalog.json`.
- **Minimum order online:** 5 EUR (the cheapest product is 13 EUR). Tiny amounts are what card-testing bots probe with.

## Operations

- Function logs: Supabase Dashboard > Edge Functions > each function > Logs. Look for `checkout failed`, `price mismatch`, `webhook failed`, `rate limiter unavailable`.
- A failing webhook is retried by Stripe for days; the salon email is sent once per order even if the webhook is delivered twice (and the mail provider is given an idempotency key per order).
- **Abuse limits** (table `darta_rate_hits`, function `darta_rate_limit`): 10 checkouts per visitor per 10 minutes, 200 per hour for the whole shop, 60 order lookups per visitor per minute. Visitors are stored only as a short hash of their IP. If the limiter itself fails, sales go through and the error is logged. Before real traffic add **Cloudflare Turnstile** in front of the checkout button for proper bot protection.
- **Reconciliation.** Once a week compare Stripe > Payments (succeeded) with `select order_no, amount_total, paid_at from darta_orders order by created_at desc`. A payment with no row means the webhook was failing.
- Orders are visible only to the service role (RLS on, no policies). Read them in the Supabase table editor, or build a small admin page later.
