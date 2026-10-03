// Server-side cart pricing: the browser never decides what a customer pays.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseCart, quote, translateCatalog } from '../supabase/functions/darta-checkout/pricing.ts';

const catalog = JSON.parse(readFileSync(new URL('../data/catalog.json', import.meta.url), 'utf8'));
const cart = (lines, extra = {}) => ({ lines, coupon: '', mode: 'pickup', ...extra });
const price = (c) => {
  const parsed = parseCart(c);
  assert.ok(parsed.ok, `parse failed: ${parsed.error}`);
  return quote(catalog, parsed.value);
};

test('pickup total is the sum of unit prices and has no shipping', () => {
  const r = price(cart([{ id: 'wax', v: '', q: 2 }, { id: 'olio', v: '', q: 1 }]));
  assert.ok(r.ok);
  assert.equal(r.value.subtotal, 2 * 2000 + 1400);
  assert.equal(r.value.shipping, 0);
  assert.equal(r.value.total, 5400);
});

test('shipping adds the flat fee under the free-shipping threshold', () => {
  const r = price(cart([{ id: 'clay', v: '', q: 1 }], { mode: 'ship' }));
  assert.equal(r.value.shipping, 490);
  assert.equal(r.value.total, 1600 + 490);
});

test('shipping is free exactly at the threshold', () => {
  const r = price(cart([{ id: 'wax', v: '', q: 2 }], { mode: 'ship' }));
  assert.equal(r.value.subtotal, 4000);
  assert.equal(r.value.shipping, 0);
});

test('coupon takes a percentage off and free shipping is judged after the discount', () => {
  const r = price(cart([{ id: 'wax', v: '', q: 2 }, { id: 'olio', v: '', q: 1 }], { mode: 'ship', coupon: 'BENVENUTO10' }));
  assert.equal(r.value.discount, 540);
  assert.equal(r.value.shipping, 0);
  assert.equal(r.value.total, 5400 - 540);
  const small = price(cart([{ id: 'wax', v: '', q: 2 }], { mode: 'ship', coupon: 'BENVENUTO10' }));
  assert.equal(small.value.discount, 400);
  assert.equal(small.value.shipping, 490);
});

test('duplicate lines are merged and capped at 9 per line', () => {
  const parsed = parseCart(cart([{ id: 'wax', v: '', q: 6 }, { id: 'wax', v: '', q: 6 }]));
  assert.ok(parsed.ok);
  assert.deepEqual(parsed.value.lines, [{ id: 'wax', v: '', q: 9 }]);
});

test('gift cards and the subscription are not payable online yet', () => {
  for (const id of ['gift', 'club']) {
    const r = price(cart([{ id, v: id === 'gift' ? '50' : '', q: 1 }]));
    assert.equal(r.ok, false);
    assert.equal(r.error, 'digital_unsupported');
  }
});

test('unknown products, bad variants and unknown coupons are rejected', () => {
  assert.equal(price(cart([{ id: 'nope', v: '', q: 1 }])).error, 'unknown_product');
  assert.equal(price(cart([{ id: 'wax', v: 'xl', q: 1 }])).error, 'bad_variant');
  assert.equal(price(cart([{ id: 'wax', v: '', q: 1 }], { coupon: 'FREE100' })).error, 'bad_coupon');
});

test('coupon codes cannot reach prototype keys', () => {
  for (const code of ['CONSTRUCTOR', '__PROTO__', 'TOSTRING']) {
    assert.equal(price(cart([{ id: 'wax', v: '', q: 1 }], { coupon: code })).error, 'bad_coupon');
  }
});

test('malformed carts never parse', () => {
  const bad = [
    null, 'x', {}, { lines: [] }, { lines: 'x' },
    { lines: Array.from({ length: 21 }, (_, i) => ({ id: 'wax' + i, v: '', q: 1 })) },
    cart([{ id: 'wax', v: '', q: 0 }]),
    cart([{ id: 'wax', v: '', q: 10 }]),
    cart([{ id: 'wax', v: '', q: 1.5 }]),
    cart([{ id: 'wax', v: '', q: '2' }]),
    cart([{ id: 'WAX!', v: '', q: 1 }]),
    cart([{ id: 'wax', v: 5, q: 1 }]),
    cart([{ id: 'wax', v: '', q: 1 }], { mode: 'drone' }),
    cart([{ id: 'wax', v: '', q: 1 }], { coupon: 'x'.repeat(40) }),
  ];
  for (const b of bad) assert.equal(parseCart(b).ok, false, JSON.stringify(b)?.slice(0, 80));
});

test('the minimum charge is 5 EUR, so card-testing bots cannot probe with pennies', () => {
  const shop = (price) => ({ ...catalog, products: [{ id: 'tiny', slug: 'tiny', name: 'Tiny', price }] });
  const parsed = parseCart(cart([{ id: 'tiny', v: '', q: 1 }]));
  assert.equal(quote(shop(30), parsed.value).error, 'below_minimum');
  assert.equal(quote(shop(499), parsed.value).error, 'below_minimum');
  assert.equal(quote(shop(500), parsed.value).ok, true);
});

test('a broken catalog fails closed instead of producing a NaN price', () => {
  const parsed = parseCart(cart([{ id: 'wax', v: '', q: 1 }], { coupon: 'BENVENUTO10' }));
  const broken = (patch) => ({ ...structuredClone(catalog), ...patch });
  assert.equal(quote(broken({ coupons: { BENVENUTO10: { pct: '10%', label: 'x' } } }), parsed.value).error, 'bad_catalog');
  assert.equal(quote(broken({ coupons: { BENVENUTO10: { pct: 150, label: 'x' } } }), parsed.value).error, 'bad_catalog');
  assert.equal(quote(broken({ coupons: { BENVENUTO10: { pct: -5, label: 'x' } } }), parsed.value).error, 'bad_catalog');
  const noPrice = broken({}); noPrice.products[0].price = 'twenty';
  assert.equal(quote(noPrice, parseCart(cart([{ id: 'wax', v: '', q: 1 }])).value).error, 'bad_catalog');
  assert.equal(quote(broken({ shipping: { flat: 'x', freeFrom: 4000 } }), parseCart(cart([{ id: 'wax', v: '', q: 1 }], { mode: 'ship' })).value).error, 'bad_catalog');
});

test('server totals match the browser cart code for the same carts', async () => {
  const store = {};
  globalThis.window = { DARTA: {} };
  globalThis.localStorage = { getItem: (k) => store[k] ?? null, setItem: (k, v) => { store[k] = v; } };
  globalThis.fetch = async () => ({ ok: true, json: async () => structuredClone(catalog) });
  await import('../js/store.js');
  const S = globalThis.window.DARTA.store;
  await S.load();
  const carts = [
    cart([{ id: 'wax', v: '', q: 1 }]),
    cart([{ id: 'clay', v: '', q: 3 }, { id: 'sale', v: '', q: 2 }], { mode: 'ship' }),
    cart([{ id: 'kit', v: '', q: 1 }, { id: 'olio', v: '', q: 1 }], { mode: 'ship', coupon: 'BENVENUTO10' }),
    cart([{ id: 'pomata', v: '', q: 2 }, { id: 'wax', v: '', q: 1 }], { mode: 'ship', coupon: 'BENVENUTO10' }),
    cart([{ id: 'kit', v: '', q: 2 }], { coupon: 'BENVENUTO10' }),
  ];
  for (const c of carts) {
    S.clear();
    c.lines.forEach((l) => S.add(l.id, l.v, l.q));
    S.setMode(c.mode);
    S.applyCoupon(c.coupon);
    const t = S.totals();
    const r = price(c);
    assert.deepEqual(
      { subtotal: r.value.subtotal, discount: r.value.discount, shipping: r.value.shipping, total: r.value.total },
      { subtotal: t.subtotal, discount: t.discount, shipping: t.shipping, total: t.total },
      JSON.stringify(c),
    );
  }
});

test('language: Italian by default, English when asked, nothing else', () => {
  assert.equal(parseCart(cart([{ id: 'wax', v: '', q: 1 }])).value.lang, 'it');
  assert.equal(parseCart(cart([{ id: 'wax', v: '', q: 1 }], { lang: 'en' })).value.lang, 'en');
  assert.equal(parseCart(cart([{ id: 'wax', v: '', q: 1 }], { lang: 'de' })).ok, false);
  assert.equal(price(cart([{ id: 'wax', v: '', q: 1 }], { lang: 'en' })).value.lang, 'en');
});

test('English names and labels are taken from the translation file; prices never are', () => {
  const en = JSON.parse(readFileSync(new URL('../data/catalog.en.json', import.meta.url), 'utf8'));
  en.products.wax.price = 1;                                    // a price in the translation file must be ignored
  en.products.gift.variants = [{ id: '25', label: '€25', price: 1 }, { id: '50', label: '€50', price: 1 }, { id: '100', label: '€100', price: 1 }];
  const cat = translateCatalog(catalog, en);
  assert.equal(cat.products.find((p) => p.id === 'olio').name, 'Olio Barba');
  assert.equal(cat.products.find((p) => p.id === 'wax').price, 2000);
  assert.deepEqual(cat.products.find((p) => p.id === 'gift').variants.map((v) => [v.label, v.price]), [['€25', 2500], ['€50', 5000], ['€100', 10000]]);
  assert.equal(cat.coupons.BENVENUTO10.label, 'Welcome code (10% off products)');
  const q = quote(cat, parseCart(cart([{ id: 'olio', v: '', q: 2 }, { id: 'wax', v: '', q: 1 }], { lang: 'en' })).value);
  assert.deepEqual(q.value.items.map((i) => i.name), ['Olio Barba', 'Wax Powder']);
  assert.equal(q.value.total, 2 * 1400 + 2000);
  assert.equal(translateCatalog(catalog, {}).products[0].name, catalog.products[0].name);   // no translation: unchanged
});
