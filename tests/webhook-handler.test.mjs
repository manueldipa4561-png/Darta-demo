// The webhook with Stripe, the database and the mail provider replaced by fakes.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { handleWebhook } from '../supabase/functions/darta-stripe-webhook/handler.ts';

const NOW = 1_800_000_000;
const WHSEC = 'whsec_test';
const ENV = { STRIPE_WEBHOOK_SECRET: WHSEC, STRIPE_SECRET_KEY: 'sk_test_1', ORDER_NOTIFY_TO: 'salon@example.com', ORDER_NOTIFY_FROM: 'Shop <shop@example.com>', RESEND_API_KEY: 're_1' };
const SESSION = {
  id: 'cs_test_abcdef123', payment_status: 'paid', client_reference_id: 'DA-K7M3QX9', currency: 'eur',
  amount_subtotal: 2000, amount_total: 2000, total_details: { amount_discount: 0, amount_shipping: 0 },
  metadata: { order_no: 'DA-K7M3QX9', mode: 'pickup' }, customer_details: { name: 'Mario', email: 'm@example.com' },
  line_items: { data: [{ description: 'Wax Powder', quantity: 1, amount_total: 2000 }] },
};
// Stripe is asked twice per order: the session, then its line items (a cart can have more than the 10 expand[] returns)
const stripeFor = (session) => async (key, method, path) => {
  const { line_items, ...rest } = structuredClone(session);
  return path.includes('/line_items') ? { data: line_items?.data ?? [] } : rest;
};

function setup(over = {}) {
  const log = { saved: [], mails: [], failed: [], released: [], claims: 0, keys: [], stripeCalls: [] };
  const deps = {
    env: (k) => (over.env ?? ENV)[k],
    nowSeconds: () => NOW,
    stripe: over.stripe ?? stripeFor(over.session ?? SESSION),
    stripeCalls: log.stripeCalls,
    saveOrder: async (o) => { if (over.saveFails) throw new Error('db down'); log.saved.push(o); },
    markFailed: async (id) => { log.failed.push(id); },
    claimNotification: async () => { log.claims++; return over.alreadyNotified ? false : true; },
    releaseNotification: async (n) => { log.released.push(n); },
    sendMail: async (m, key) => { if (over.mailFails) throw new Error('mail down'); log.mails.push(m); log.keys.push(key); },
  };
  return { deps, log };
}
function event(type = 'checkout.session.completed', id = 'cs_test_abcdef123', { secret = WHSEC, t = NOW, body, created = NOW - 20 } = {}) {
  const raw = body ?? JSON.stringify({ id: 'evt_1', type, created, data: { object: { id } } });
  const sig = createHmac('sha256', secret).update(`${t}.${raw}`).digest('hex');
  return new Request('https://fn.example/hook', { method: 'POST', headers: { 'stripe-signature': `t=${t},v1=${sig}` }, body: raw });
}

test('a paid session is saved and the salon is emailed once', async () => {
  const { deps, log } = setup();
  const res = await handleWebhook(event(), deps);
  assert.equal(res.status, 200);
  assert.equal(log.saved.length, 1);
  assert.equal(log.saved[0].order_no, 'DA-K7M3QX9');
  assert.equal(log.saved[0].status, 'paid');
  assert.equal(log.mails.length, 1);
  assert.deepEqual(log.mails[0].to, ['salon@example.com']);
  assert.match(log.mails[0].subject, /DA-K7M3QX9/);
});

test('a retried webhook does not email the salon twice', async () => {
  const { deps, log } = setup({ alreadyNotified: true });
  const res = await handleWebhook(event(), deps);
  assert.equal(res.status, 200);
  assert.equal(log.saved.length, 1);
  assert.equal(log.mails.length, 0);
});

test('requests without a valid Stripe signature are rejected and change nothing', async () => {
  const { deps, log } = setup();
  assert.equal((await handleWebhook(event('checkout.session.completed', 'cs_test_abcdef123', { secret: 'whsec_other' }), deps)).status, 400);
  assert.equal((await handleWebhook(event('checkout.session.completed', 'cs_test_abcdef123', { t: NOW - 1000 }), deps)).status, 400);
  const noHeader = new Request('https://fn.example/hook', { method: 'POST', body: '{}' });
  assert.equal((await handleWebhook(noHeader, deps)).status, 400);
  assert.equal((await handleWebhook(new Request('https://fn.example/hook'), deps)).status, 405);
  assert.equal(log.saved.length + log.mails.length, 0);
});

test('without secrets the endpoint says it is not configured', async () => {
  const { deps } = setup({ env: {} });
  assert.equal((await handleWebhook(event(), deps)).status, 503);
});

test('the amount comes from Stripe, not from the event body', async () => {
  const { deps, log } = setup({ session: { ...SESSION, amount_total: 777 } });
  const body = JSON.stringify({ type: 'checkout.session.completed', data: { object: { id: 'cs_test_abcdef123', amount_total: 1 } } });
  await handleWebhook(event('', '', { body }), deps);
  assert.equal(log.saved[0].amount_total, 777);
});

test('delayed payments are saved as pending and only emailed when they succeed', async () => {
  const pending = setup({ session: { ...SESSION, payment_status: 'unpaid' } });
  await handleWebhook(event(), pending.deps);
  assert.equal(pending.log.saved[0].status, 'pending');
  assert.equal(pending.log.mails.length, 0);
  const later = setup();
  await handleWebhook(event('checkout.session.async_payment_succeeded'), later.deps);
  assert.equal(later.log.saved[0].status, 'paid');
  assert.equal(later.log.mails.length, 1);
});

test('a failed delayed payment marks the order failed', async () => {
  const { deps, log } = setup();
  const res = await handleWebhook(event('checkout.session.async_payment_failed'), deps);
  assert.equal(res.status, 200);
  assert.deepEqual(log.failed, ['cs_test_abcdef123']);
  assert.equal(log.saved.length, 0);
});

test('if the database is down Stripe gets a 500 so it retries', async () => {
  const { deps, log } = setup({ saveFails: true });
  assert.equal((await handleWebhook(event(), deps)).status, 500);
  assert.equal(log.mails.length, 0);
});

test('if the email fails the claim is released and Stripe retries', async () => {
  const { deps, log } = setup({ mailFails: true });
  assert.equal((await handleWebhook(event(), deps)).status, 500);
  assert.deepEqual(log.released, ['DA-K7M3QX9']);
});

test('no email settings means the order is stored and nothing is sent', async () => {
  const { deps, log } = setup({ env: { STRIPE_WEBHOOK_SECRET: WHSEC, STRIPE_SECRET_KEY: 'sk_test_1' } });
  assert.equal((await handleWebhook(event(), deps)).status, 200);
  assert.equal(log.saved.length, 1);
  assert.equal(log.claims, 0);
});

test('unrelated events and odd session ids are acknowledged and ignored', async () => {
  const { deps, log } = setup();
  assert.equal((await handleWebhook(event('customer.created'), deps)).status, 200);
  assert.equal((await handleWebhook(event('checkout.session.completed', '../../v1/charges'), deps)).status, 200);
  assert.equal(log.saved.length, 0);
});

test('a retried delivery keeps the original paid_at (it comes from the event time, not from now)', async () => {
  const first = setup();
  await handleWebhook(event('checkout.session.completed', 'cs_test_abcdef123', { created: NOW - 600 }), first.deps);
  assert.equal(first.log.saved[0].paid_at, new Date((NOW - 600) * 1000).toISOString());
});

test('the salon email carries an idempotency key per order', async () => {
  const { deps, log } = setup();
  await handleWebhook(event(), deps);
  assert.deepEqual(log.keys, ['darta-DA-K7M3QX9']);
});

test('sessions that are not Darta orders are acknowledged, not retried', async () => {
  const other = { ...SESSION, client_reference_id: 'PL-77', metadata: {} };
  const { deps, log } = setup({ session: other });
  const res = await handleWebhook(event(), deps);
  assert.equal(res.status, 200);
  assert.equal((await res.json()).ignored, 'not_darta');
  assert.equal(log.saved.length + log.mails.length, 0);
});

test('every line item is read, not just the first ten', async () => {
  const many = { ...SESSION, line_items: { data: Array.from({ length: 15 }, (_, i) => ({ description: `P${i}`, quantity: 1, amount_total: 100 })) } };
  const { deps, log } = setup({ session: many });
  await handleWebhook(event(), deps);
  assert.equal(log.saved[0].items.length, 15);
});

test('a read-only Stripe key is preferred for reading sessions', async () => {
  const used = [];
  const { deps } = setup({ env: { ...ENV, STRIPE_READ_KEY: 'rk_test_ro' }, stripe: async (key, method, path) => { used.push(key); return stripeFor(SESSION)(key, method, path); } });
  await handleWebhook(event(), deps);
  assert.ok(used.length >= 2 && used.every((k) => k === 'rk_test_ro'));
});

test('oversized bodies are refused from the header alone', async () => {
  const { deps } = setup();
  const req = new Request('https://fn.example/hook', { method: 'POST', headers: { 'content-length': '9999999', 'stripe-signature': 't=1,v1=' + 'a'.repeat(64) }, body: '{}' });
  assert.equal((await handleWebhook(req, deps)).status, 413);
});
