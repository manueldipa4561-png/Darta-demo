import test from 'node:test';
import assert from 'node:assert/strict';
import { handleOrderLookup } from '../supabase/functions/darta-order/handler.ts';
import { StripeError } from '../supabase/functions/darta-order/stripe-api.ts';

const SITE = 'https://shop.example';
const ENV = { STRIPE_SECRET_KEY: 'sk_test_1', SITE_URL: SITE };
const SESSION = {
  id: 'cs_test_abcdef123', payment_status: 'paid', status: 'complete', client_reference_id: 'DA-1234AB', amount_total: 2490,
  metadata: { mode: 'ship' }, customer_details: { name: 'Mario Rossi', email: 'm@example.com', phone: '+39333' },
  shipping_details: { address: { line1: 'Via Roma 1' } },
  line_items: { data: [{ description: 'Wax Powder', quantity: 1 }] },
};
const get = (qs, headers = { origin: SITE }) => new Request(`https://fn.example/darta-order${qs}`, { headers });
// the lookup asks for the session, then for its line items
const bySession = (s) => async (key, method, path) => {
  const { line_items, ...rest } = s;
  return path.includes('/line_items') ? { data: line_items.data } : rest;
};
const deps = (stripe = bySession(SESSION), env = ENV, rateLimit = async () => true) => ({ env: (k) => env[k], stripe, rateLimit });

test('returns the order summary and no personal data', async () => {
  const res = await handleOrderLookup(get('?s=cs_test_abcdef123'), deps());
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.deepEqual(body, { paid: true, pending: false, orderNo: 'DA-1234AB', mode: 'ship', total: 2490, items: [{ name: 'Wax Powder', q: 1 }] });
  const text = JSON.stringify(body);
  assert.ok(!/Mario|example\.com|Via Roma|\+39/.test(text));
});

test('an unpaid session is reported as not paid', async () => {
  const res = await handleOrderLookup(get('?s=cs_test_abcdef123'), deps(bySession({ ...SESSION, payment_status: 'unpaid', status: 'open' })));
  const body = await res.json();
  assert.equal(body.paid, false);
  assert.equal(body.pending, false);
});

test('session ids that are not Stripe checkout ids never reach Stripe', async () => {
  let calls = 0;
  const d = deps(async () => { calls++; return SESSION; });
  for (const qs of ['', '?s=', '?s=../../v1/charges', '?s=cs_test_a', '?s=pi_123456789012', '?s=cs_test_abc%20def123456']) {
    assert.equal((await handleOrderLookup(get(qs), d)).status, 400, qs);
  }
  assert.equal(calls, 0);
});

test('only the shop origin may ask', async () => {
  assert.equal((await handleOrderLookup(get('?s=cs_test_abcdef123', { origin: 'https://evil.example' }), deps())).status, 403);
  assert.equal((await handleOrderLookup(get('?s=cs_test_abcdef123', {}), deps())).status, 403);
});

test('unknown sessions are 404, outages are 502, missing keys are 503', async () => {
  assert.equal((await handleOrderLookup(get('?s=cs_test_abcdef123'), deps(async () => { throw new StripeError(404, 'No such session'); }))).status, 404);
  assert.equal((await handleOrderLookup(get('?s=cs_test_abcdef123'), deps(async () => { throw new Error('x'); }))).status, 502);
  assert.equal((await handleOrderLookup(get('?s=cs_test_abcdef123'), deps(undefined, { SITE_URL: SITE }))).status, 503);
});

test('a visitor who asks too often gets 429 and Stripe is not called', async () => {
  let calls = 0;
  const hits = [];
  const d = deps(async () => { calls++; return SESSION; }, ENV, async (b, w, m) => { hits.push({ b, w, m }); return false; });
  const res = await handleOrderLookup(get('?s=cs_test_abcdef123', { origin: SITE, 'x-forwarded-for': '203.0.113.5' }), d);
  assert.equal(res.status, 429);
  assert.equal(calls, 0);
  assert.match(hits[0].b, /^order:[0-9a-f]{16}$/);
  assert.ok(!JSON.stringify(hits).includes('203.0.113.5'));
});

test('a read-only key is used when present', async () => {
  const used = [];
  const d = deps(async (key, method, path) => { used.push(key); return bySession(SESSION)(key, method, path); }, { ...ENV, STRIPE_READ_KEY: 'rk_test_ro' });
  await handleOrderLookup(get('?s=cs_test_abcdef123'), d);
  assert.ok(used.length === 2 && used.every((k) => k === 'rk_test_ro'));
});

test('all line items are returned for big carts', async () => {
  const big = { ...SESSION, line_items: { data: Array.from({ length: 14 }, (_, i) => ({ description: `P${i}`, quantity: 1 })) } };
  const res = await handleOrderLookup(get('?s=cs_test_abcdef123'), deps(bySession(big)));
  assert.equal((await res.json()).items.length, 14);
});
