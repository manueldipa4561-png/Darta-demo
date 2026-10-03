// Stripe's REST API takes form-encoded bodies with bracket notation.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { sessionParams, couponParams } from '../supabase/functions/darta-checkout/stripe.ts';
import { encodeForm } from '../supabase/functions/darta-checkout/stripe-api.ts';
import { parseCart, quote } from '../supabase/functions/darta-checkout/pricing.ts';

const catalog = JSON.parse(readFileSync(new URL('../data/catalog.json', import.meta.url), 'utf8'));
const pairs = (obj) => [...new URLSearchParams(encodeForm(obj)).entries()];
const get = (obj, k) => new URLSearchParams(encodeForm(obj)).get(k);
const build = (cartIn) => {
  const p = parseCart(cartIn);
  const q = quote(catalog, p.value);
  assert.ok(q.ok, q.error);
  return q.value;
};
const ctx = { siteUrl: 'https://shop.example', orderNo: 'DA-1234AB', now: 1_800_000_000 };

test('encodeForm nests objects with brackets and arrays with indexes', () => {
  assert.deepEqual(pairs({ a: { b: [{ c: 1 }, { c: 2 }] }, d: 'x y&z' }), [
    ['a[b][0][c]', '1'], ['a[b][1][c]', '2'], ['d', 'x y&z'],
  ]);
});

test('encodeForm skips null and undefined and writes booleans as words', () => {
  assert.deepEqual(pairs({ a: null, b: undefined, c: true, d: false, e: 0 }), [['c', 'true'], ['d', 'false'], ['e', '0']]);
});

test('encodeForm escapes keys and values', () => {
  const body = encodeForm({ 'a&b': 'c=d' });
  assert.equal(body, 'a%26b=c%3Dd');
});

test('session lines carry the server price in cents, never anything from the browser', () => {
  const q = build({ lines: [{ id: 'wax', v: '', q: 2 }, { id: 'olio', v: '', q: 1 }], coupon: '', mode: 'pickup' });
  const params = sessionParams(q, ctx);
  assert.equal(get(params, 'line_items[0][price_data][unit_amount]'), '2000');
  assert.equal(get(params, 'line_items[0][quantity]'), '2');
  assert.equal(get(params, 'line_items[0][price_data][currency]'), 'eur');
  assert.equal(get(params, 'line_items[0][price_data][product_data][name]'), 'Wax Powder');
  assert.equal(get(params, 'line_items[1][price_data][unit_amount]'), '1400');
  assert.equal(get(params, 'mode'), 'payment');
  assert.equal(get(params, 'locale'), 'it');
});

test('urls come from the configured site, and the session id placeholder stays literal', () => {
  const q = build({ lines: [{ id: 'wax', v: '', q: 1 }], coupon: '', mode: 'pickup' });
  const params = sessionParams(q, ctx);
  assert.equal(params.success_url, 'https://shop.example/ordine?s={CHECKOUT_SESSION_ID}');
  assert.equal(params.cancel_url, 'https://shop.example/shop#carrello');
  assert.equal(params.client_reference_id, 'DA-1234AB');
  assert.equal(params.metadata.order_no, 'DA-1234AB');
  assert.equal(params.expires_at, ctx.now + 3600);
});

test('shipping orders collect an Italian address and add the shipping rate', () => {
  const q = build({ lines: [{ id: 'clay', v: '', q: 1 }], coupon: '', mode: 'ship' });
  const params = sessionParams(q, ctx);
  assert.equal(get(params, 'shipping_address_collection[allowed_countries][0]'), 'IT');
  assert.equal(get(params, 'shipping_options[0][shipping_rate_data][fixed_amount][amount]'), '490');
  assert.equal(get(params, 'shipping_options[0][shipping_rate_data][fixed_amount][currency]'), 'eur');
  assert.equal(get(params, 'phone_number_collection[enabled]'), 'true');
});

test('free shipping is still shown as a zero-priced option, pickup has no shipping at all', () => {
  const free = sessionParams(build({ lines: [{ id: 'wax', v: '', q: 2 }], coupon: '', mode: 'ship' }), ctx);
  assert.equal(get(free, 'shipping_options[0][shipping_rate_data][fixed_amount][amount]'), '0');
  const pick = sessionParams(build({ lines: [{ id: 'wax', v: '', q: 1 }], coupon: '', mode: 'pickup' }), ctx);
  assert.equal(get(pick, 'shipping_options[0][shipping_rate_data][type]'), null);
  assert.equal(get(pick, 'shipping_address_collection[allowed_countries][0]'), null);
});

test('a coupon becomes a one-off fixed-amount Stripe coupon with the exact discount', () => {
  const q = build({ lines: [{ id: 'wax', v: '', q: 2 }], coupon: 'BENVENUTO10', mode: 'pickup' });
  const c = couponParams(q, ctx.now);
  assert.equal(get(c, 'amount_off'), '400');
  assert.equal(get(c, 'redeem_by'), String(ctx.now + 4200)); // dies shortly after the session does
  assert.equal(get(c, 'currency'), 'eur');
  assert.equal(get(c, 'duration'), 'once');
  assert.equal(get(c, 'max_redemptions'), '1');
  assert.ok(c.name.length <= 40);
  assert.equal(couponParams(build({ lines: [{ id: 'wax', v: '', q: 1 }], coupon: '', mode: 'pickup' }), ctx.now), null);
  const withCoupon = sessionParams(q, { ...ctx, couponId: 'cpn_1' });
  assert.equal(get(withCoupon, 'discounts[0][coupon]'), 'cpn_1');
});

test('what Stripe will charge equals the quote: lines - discount + shipping', () => {
  const q = build({ lines: [{ id: 'kit', v: '', q: 1 }, { id: 'olio', v: '', q: 1 }], coupon: 'BENVENUTO10', mode: 'ship' });
  const params = sessionParams(q, ctx);
  const sum = params.line_items.reduce((s, l) => s + l.price_data.unit_amount * l.quantity, 0);
  const ship = params.shipping_options ? params.shipping_options[0].shipping_rate_data.fixed_amount.amount : 0;
  assert.equal(sum - couponParams(q, ctx.now).amount_off + ship, q.total);
});

test('English checkout: Stripe locale, English return links, English texts', () => {
  const en = (mode) => build({ lines: [{ id: 'wax', v: '', q: 2 }], coupon: '', mode, lang: 'en' });
  const pick = sessionParams(en('pickup'), ctx);
  assert.equal(pick.locale, 'en');
  assert.equal(pick.success_url, 'https://shop.example/en/order?s={CHECKOUT_SESSION_ID}');
  assert.equal(pick.cancel_url, 'https://shop.example/en/shop#cart');
  assert.match(pick.custom_text.submit.message, /Free pickup at the studio/);
  assert.equal(pick.metadata.lang, 'en');
  const ship = sessionParams(build({ lines: [{ id: 'clay', v: '', q: 1 }], coupon: '', mode: 'ship', lang: 'en' }), ctx);
  assert.equal(ship.shipping_options[0].shipping_rate_data.display_name, 'Standard shipping');
  assert.match(ship.custom_text.submit.message, /pack your order/);
  const free = sessionParams(en('ship'), ctx);
  assert.equal(free.shipping_options[0].shipping_rate_data.display_name, 'Free shipping');
  const it = sessionParams(build({ lines: [{ id: 'wax', v: '', q: 1 }], coupon: '', mode: 'pickup' }), ctx);
  assert.equal(it.locale, 'it');
  assert.equal(it.success_url, 'https://shop.example/ordine?s={CHECKOUT_SESSION_ID}');
  assert.equal(it.metadata.lang, 'it');
});
