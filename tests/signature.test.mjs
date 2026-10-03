// Webhook authenticity: only Stripe can make us mark an order as paid.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { verifyStripeSignature } from '../supabase/functions/darta-stripe-webhook/signature.ts';

const secret = 'whsec_test_secret';
const body = JSON.stringify({ id: 'evt_1', type: 'checkout.session.completed' });
const now = 1_800_000_000;
const sign = (t, b = body, s = secret) => createHmac('sha256', s).update(`${t}.${b}`).digest('hex');
const header = (t, ...sigs) => `t=${t},${sigs.map((x) => `v1=${x}`).join(',')}`;

test('accepts a correct signature', async () => {
  assert.equal(await verifyStripeSignature(body, header(now, sign(now)), secret, now), true);
});

test('accepts when any of several v1 signatures matches (secret rotation)', async () => {
  assert.equal(await verifyStripeSignature(body, header(now, 'a'.repeat(64), sign(now)), secret, now), true);
});

test('rejects a wrong secret, a tampered body and a different timestamp', async () => {
  assert.equal(await verifyStripeSignature(body, header(now, sign(now, body, 'whsec_other')), secret, now), false);
  assert.equal(await verifyStripeSignature(body + ' ', header(now, sign(now)), secret, now), false);
  assert.equal(await verifyStripeSignature(body, header(now + 1, sign(now)), secret, now), false);
});

test('rejects replays outside the 5 minute window, in both directions', async () => {
  assert.equal(await verifyStripeSignature(body, header(now - 301, sign(now - 301)), secret, now), false);
  assert.equal(await verifyStripeSignature(body, header(now + 301, sign(now + 301)), secret, now), false);
  assert.equal(await verifyStripeSignature(body, header(now - 299, sign(now - 299)), secret, now), true);
});

test('rejects missing, empty and malformed headers and empty secrets', async () => {
  for (const h of [null, undefined, '', 'garbage', 't=abc,v1=' + sign(now), `t=${now}`, `v1=${sign(now)}`, `t=${now},v1=zz`]) {
    assert.equal(await verifyStripeSignature(body, h, secret, now), false, String(h));
  }
  assert.equal(await verifyStripeSignature(body, header(now, sign(now)), '', now), false);
});

test('ignores v0 test signatures', async () => {
  assert.equal(await verifyStripeSignature(body, `t=${now},v0=${sign(now)}`, secret, now), false);
});
