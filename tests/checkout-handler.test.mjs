// The checkout endpoint with Stripe replaced by a fake: what it accepts, refuses, and sends to Stripe.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { handleCheckout, newOrderNo } from '../supabase/functions/darta-checkout/handler.ts';
import { StripeError } from '../supabase/functions/darta-checkout/stripe-api.ts';

const catalog = JSON.parse(readFileSync(new URL('../data/catalog.json', import.meta.url), 'utf8'));
const SITE = 'https://shop.example';
const ENV = { STRIPE_SECRET_KEY: 'sk_test_123', STRIPE_WEBHOOK_SECRET: 'whsec_123', SITE_URL: SITE };

function deps(over = {}) {
  const calls = [];
  const hits = [];
  return {
    calls,
    hits,
    rateLimit: over.rateLimit ?? (async (bucket, windowS, max) => { hits.push({ bucket, windowS, max }); return true; }),
    env: (k) => (over.env ?? ENV)[k],
    loadCatalog: over.loadCatalog ?? (async () => catalog),
    stripe: over.stripe ?? (async (key, method, path, params) => {
      calls.push({ key, method, path, params });
      if (path === '/v1/coupons') return { id: 'cpn_1' };
      const lines = params.line_items.reduce((s, l) => s + l.price_data.unit_amount * l.quantity, 0);
      const ship = params.shipping_options?.[0].shipping_rate_data.fixed_amount.amount ?? 0;
      const off = params.discounts ? 400 : 0; // the only coupon in these tests is 10% of 4000
      return { id: 'cs_test_abcdef123', url: 'https://checkout.stripe.com/c/pay/cs_test_abcdef123', amount_total: lines - off + ship };
    }),
    nowSeconds: () => 1_800_000_000,
    random: () => new Uint8Array([1, 2, 3, 4, 5, 6, 7]),
  };
}
const post = (body, headers = {}) =>
  new Request('https://fn.example/darta-checkout', {
    method: 'POST',
    headers: { origin: SITE, 'content-type': 'application/json', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
const cart = (lines = [{ id: 'wax', v: '', q: 1 }], extra = {}) => ({ lines, coupon: '', mode: 'pickup', ...extra });

test('GET tells the shop whether real payments are switched on', async () => {
  const on = await handleCheckout(new Request('https://fn.example/x', { headers: { origin: SITE } }), deps());
  assert.deepEqual(await on.json(), { live: true });
  assert.equal(on.headers.get('access-control-allow-origin'), '*');
  const off = await handleCheckout(new Request('https://fn.example/x', { headers: { origin: 'https://anywhere.example' } }), deps({ env: {} }));
  assert.deepEqual(await off.json(), { live: false });
  assert.equal(off.headers.get('access-control-allow-origin'), '*'); // readable before SITE_URL exists, so the shop stays in demo mode
  const noSite = await handleCheckout(new Request('https://fn.example/x'), deps({ env: { STRIPE_SECRET_KEY: 'sk_test_1', STRIPE_WEBHOOK_SECRET: 'whsec_1' } }));
  assert.deepEqual(await noSite.json(), { live: false });
  // no webhook secret = orders would never be recorded, so payments must not be offered
  const noHook = await handleCheckout(new Request('https://fn.example/x'), deps({ env: { STRIPE_SECRET_KEY: 'sk_test_1', SITE_URL: SITE } }));
  assert.deepEqual(await noHook.json(), { live: false });
});

test('a valid cart gets a hosted Stripe checkout url and an order number', async () => {
  const d = deps();
  const res = await handleCheckout(post(cart([{ id: 'wax', v: '', q: 2 }, { id: 'olio', v: '', q: 1 }])), d);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.match(body.url, /^https:\/\/checkout\.stripe\.com\//);
  assert.match(body.orderNo, /^DA-[A-HJKMNP-Z2-9]{7}$/);
  assert.equal(d.calls.at(-1).path, '/v1/checkout/sessions');
  assert.equal(d.calls.at(-1).key, 'sk_test_123');
  assert.equal(res.headers.get('cache-control'), 'no-store');
});

test('prices sent by the browser are ignored', async () => {
  const d = deps();
  const sneaky = cart([{ id: 'wax', v: '', q: 1, price: 1, unit_amount: 1 }]);
  sneaky.total = 1;
  const res = await handleCheckout(post(sneaky), d);
  assert.equal(res.status, 200);
  assert.equal(d.calls.at(-1).params.line_items[0].price_data.unit_amount, 2000);
});

test('a coupon creates a Stripe coupon first and attaches it to the session', async () => {
  const d = deps();
  const res = await handleCheckout(post(cart([{ id: 'wax', v: '', q: 2 }], { coupon: 'benvenuto10' })), d);
  assert.equal(res.status, 200);
  assert.equal(d.calls[0].path, '/v1/coupons');
  assert.equal(d.calls[0].params.amount_off, 400);
  assert.deepEqual(d.calls[1].params.discounts, [{ coupon: 'cpn_1' }]);
});

test('other websites cannot create checkouts', async () => {
  for (const origin of ['https://evil.example', undefined]) {
    const headers = origin ? { origin } : {};
    const req = new Request('https://fn.example/x', { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(cart()) });
    const res = await handleCheckout(req, deps());
    assert.equal(res.status, 403);
    assert.equal(res.headers.get('access-control-allow-origin'), null);
  }
});

test('preflight answers only for the shop origin', async () => {
  const ok = await handleCheckout(new Request('https://fn.example/x', { method: 'OPTIONS', headers: { origin: SITE } }), deps());
  assert.equal(ok.status, 204);
  assert.match(ok.headers.get('access-control-allow-methods'), /POST/);
  const bad = await handleCheckout(new Request('https://fn.example/x', { method: 'OPTIONS', headers: { origin: 'https://evil.example' } }), deps());
  assert.equal(bad.headers.get('access-control-allow-origin'), null);
});

test('without Stripe keys the answer is 503 not_configured so the shop falls back to demo mode', async () => {
  const res = await handleCheckout(post(cart()), deps({ env: { SITE_URL: SITE, STRIPE_SECRET_KEY: 'sk_test_1' } }));
  assert.equal(res.status, 503);
  assert.deepEqual(await res.json(), { error: 'not_configured' });
});

test('bad input is refused before Stripe is called', async () => {
  const cases = [
    [post('{not json'), 400, 'bad_cart'],
    [post(cart([{ id: 'wax', v: '', q: 99 }])), 400, 'bad_cart'],
    [post('x'.repeat(9000)), 413, 'too_large'],
    [post(cart(), { 'content-type': 'text/plain' }), 415, 'bad_content_type'],
    [post(cart([{ id: 'gift', v: '50', q: 1 }])), 422, 'digital_unsupported'],
    [post(cart([{ id: 'ghost', v: '', q: 1 }])), 422, 'unknown_product'],
    [post(cart([{ id: 'wax', v: '', q: 1 }], { coupon: 'NOPE' })), 422, 'bad_coupon'],
  ];
  for (const [req, status, error] of cases) {
    const d = deps();
    const res = await handleCheckout(req, d);
    assert.equal(res.status, status, error);
    assert.equal((await res.json()).error, error);
    assert.equal(d.calls.length, 0);
  }
  const put = await handleCheckout(new Request('https://fn.example/x', { method: 'PUT', headers: { origin: SITE } }), deps());
  assert.equal(put.status, 405);
});

test('if Stripe would charge a different amount the customer is not sent to pay', async () => {
  const expired = [];
  const d = deps({
    stripe: async (key, method, path) => {
      if (path.endsWith('/expire')) { expired.push(path); return {}; }
      return { id: 'cs_test_abcdef123', url: 'https://checkout.stripe.com/c/x', amount_total: 1 };
    },
  });
  const res = await handleCheckout(post(cart()), d);
  assert.equal(res.status, 500);
  assert.equal((await res.json()).error, 'price_mismatch');
  assert.deepEqual(expired, ['/v1/checkout/sessions/cs_test_abcdef123/expire']);
});

test('a url that is not Stripe is never handed to the browser', async () => {
  const d = deps({ stripe: async () => ({ id: 'cs_test_abcdef123', url: 'https://evil.example/pay', amount_total: 2000 }) });
  const res = await handleCheckout(post(cart()), d);
  assert.equal(res.status, 502);
  assert.equal((await res.json()).error, 'payment_unavailable');
});

test('if Stripe rejects the product photos the session is retried without them', async () => {
  let n = 0;
  const seen = [];
  const d = deps({
    stripe: async (key, method, path, params) => {
      seen.push(params.line_items[0].price_data.product_data.images);
      if (n++ === 0) throw new StripeError(400, 'Invalid image');
      return { id: 'cs_test_abcdef123', url: 'https://checkout.stripe.com/c/x', amount_total: 2000 };
    },
  });
  const res = await handleCheckout(post(cart()), d);
  assert.equal(res.status, 200);
  assert.ok(seen[0]);
  assert.equal(seen[1], undefined);
});

test('a Stripe outage becomes a generic error with no secrets in it', async () => {
  const d = deps({ stripe: async () => { throw new StripeError(500, 'boom sk_test_123'); } });
  const res = await handleCheckout(post(cart()), d);
  assert.equal(res.status, 502);
  const text = JSON.stringify(await res.json());
  assert.ok(!text.includes('sk_test') && !text.includes('boom'));
});

test('a catalog outage is a 502, not a crash', async () => {
  const res = await handleCheckout(post(cart()), deps({ loadCatalog: async () => { throw new Error('down'); } }));
  assert.equal(res.status, 502);
  assert.equal((await res.json()).error, 'catalog_unavailable');
});

test('order numbers are DA- plus 7 unambiguous characters', () => {
  assert.equal(newOrderNo(new Uint8Array(7)), 'DA-AAAAAAA');
  assert.match(newOrderNo(new Uint8Array(7).fill(255)), /^DA-[A-HJKMNP-Z2-9]{7}$/);
  for (let i = 0; i < 500; i++) {
    const bytes = crypto.getRandomValues(new Uint8Array(7));
    assert.doesNotMatch(newOrderNo(bytes), /[01OIL]/);
  }
  const seen = new Set(Array.from({ length: 2000 }, () => newOrderNo(crypto.getRandomValues(new Uint8Array(7)))));
  assert.equal(seen.size, 2000);
});

test('a visitor is limited per IP and the whole shop is limited per hour; refused carts never reach Stripe', async () => {
  const d = deps();
  const res = await handleCheckout(post(cart(), { 'x-forwarded-for': '203.0.113.9, 10.0.0.1' }), d);
  assert.equal(res.status, 200);
  assert.equal(d.hits.length, 2);
  assert.match(d.hits[0].bucket, /^checkout:[0-9a-f]{16}$/); // a hash, never the address
  assert.ok(!JSON.stringify(d.hits).includes('203.0.113.9'));
  assert.deepEqual([d.hits[0].windowS, d.hits[0].max], [600, 10]);
  assert.deepEqual([d.hits[1].bucket, d.hits[1].windowS, d.hits[1].max], ['checkout:all', 3600, 200]);
});

test('refused visitors get 429 and Stripe is never called', async () => {
  const perVisitor = (bucket) => bucket === 'checkout:all'; // refuse every per-visitor bucket, allow the global one
  const wholeShop = (bucket) => bucket !== 'checkout:all';  // allow visitors, refuse the global cap
  for (const allow of [perVisitor, wholeShop]) {
    const d = deps({ rateLimit: async (bucket) => allow(bucket) });
    const res = await handleCheckout(post(cart()), d);
    assert.equal(res.status, 429);
    assert.equal((await res.json()).error, 'too_many_requests');
    assert.equal(d.calls.length, 0);
  }
});

test('different visitors get different buckets', async () => {
  const a = deps(); const b = deps();
  await handleCheckout(post(cart(), { 'x-forwarded-for': '198.51.100.1' }), a);
  await handleCheckout(post(cart(), { 'x-forwarded-for': '198.51.100.2' }), b);
  assert.notEqual(a.hits[0].bucket, b.hits[0].bucket);
});

test('malformed carts do not use up the visitor allowance', async () => {
  const d = deps();
  await handleCheckout(post({ lines: [] }), d);
  assert.equal(d.hits.length, 0);
});

test('oversized bodies are refused from the header alone', async () => {
  const req = new Request('https://fn.example/x', { method: 'POST', headers: { origin: SITE, 'content-type': 'application/json', 'content-length': '999999' }, body: '{}' });
  const res = await handleCheckout(req, deps());
  assert.equal(res.status, 413);
});

test('a catalog with a broken price is never sold', async () => {
  const broken = structuredClone(catalog);
  broken.coupons.BENVENUTO10.pct = '10%';
  const d = deps({ loadCatalog: async () => broken });
  const res = await handleCheckout(post(cart([{ id: 'wax', v: '', q: 1 }], { coupon: 'BENVENUTO10' })), d);
  assert.equal(res.status, 500);
  assert.equal(d.calls.length, 0);
});
