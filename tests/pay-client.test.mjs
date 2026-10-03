// js/pay.js in Node, with the network replaced: what the shop asks the server and what it refuses to follow.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../js/pay.js', import.meta.url), 'utf8');
async function load({ fetchImpl, cart, demo = true }) {
  globalThis.document = { querySelector: (sel) => (sel === 'meta[name="darta-demo"]' && demo ? {} : null) };
  globalThis.window = { DARTA: { store: {
    lines: cart?.lines ?? [{ k: 'wax', id: 'wax', v: '', q: 2, extra: 'ignored' }],
    coupon: cart?.coupon ?? '',
    totals: () => ({ ship: cart?.ship ?? false }),
  } } };
  globalThis.fetch = fetchImpl;
  new Function(source)();   // a fresh copy of the script per test: it is a plain browser script, not a module
  return globalThis.window.DARTA.pay;
}
const ok = (body, status = 200) => ({ ok: status < 400, status, json: async () => body });

test('mode: live, demo, and unknown when the server does not answer', async () => {
  assert.equal(await (await load({ fetchImpl: async () => ok({ live: true }) })).mode(), 'live');
  assert.equal(await (await load({ fetchImpl: async () => ok({ live: false }) })).mode(), 'demo');
  assert.equal(await (await load({ fetchImpl: async () => { throw new Error('offline'); } })).mode(), 'unknown');
  assert.equal(await (await load({ fetchImpl: async () => ok({}, 500) })).mode(), 'unknown');
});

test('without the demo marker a server that says "payments off" is a fault, not a pretend shop', async () => {
  const pay = await load({ demo: false, fetchImpl: async () => ok({ live: false }) });
  assert.equal(await pay.mode(), 'unknown');
  const live = await load({ demo: false, fetchImpl: async () => ok({ live: true }) });
  assert.equal(await live.mode(), 'live');
});

test('a server answer is remembered, a failure is not (so a hiccup never locks the shop into demo mode)', async () => {
  let calls = 0;
  const pay = await load({ fetchImpl: async () => { calls++; return calls === 1 ? Promise.reject(new Error('x')) : ok({ live: true }); } });
  assert.equal(await pay.mode(), 'unknown');
  assert.equal(await pay.mode(), 'live');
  assert.equal(await pay.mode(), 'live');
  assert.equal(calls, 2);
});

test('start sends only ids, variants and quantities plus coupon and mode, and returns the Stripe url', async () => {
  let sent;
  const pay = await load({
    cart: { lines: [{ k: 'wax', id: 'wax', v: '', q: 2, price: 1 }, { k: 'gift:50', id: 'gift', v: '50', q: 1 }], coupon: 'BENVENUTO10', ship: true },
    fetchImpl: async (url, init) => { sent = { url, init }; return ok({ url: 'https://checkout.stripe.com/c/pay/cs_test_1' }); },
  });
  assert.equal(await pay.start(), 'https://checkout.stripe.com/c/pay/cs_test_1');
  assert.match(sent.url, /\/functions\/v1\/darta-checkout$/);
  assert.equal(sent.init.method, 'POST');
  assert.deepEqual(JSON.parse(sent.init.body), {
    lines: [{ id: 'wax', v: '', q: 2 }, { id: 'gift', v: '50', q: 1 }], coupon: 'BENVENUTO10', mode: 'ship',
  });
});

test('a url that is not Stripe checkout is never followed', async () => {
  for (const url of ['https://evil.example/pay', 'http://checkout.stripe.com/x', 'https://checkout.stripe.com.evil.example/x', 'javascript:alert(1)', undefined]) {
    const pay = await load({ fetchImpl: async () => ok({ url }) });
    await assert.rejects(pay.start(), (e) => e.code === 'payment_unavailable');
  }
});

test('server errors become friendly Italian messages, and unknown ones a generic one', async () => {
  const pay = await load({ fetchImpl: async () => ok({ error: 'digital_unsupported' }, 422) });
  await assert.rejects(pay.start(), (e) => { assert.match(pay.message(e), /Gift card/); return true; });
  const busy = await load({ fetchImpl: async () => ok({ error: 'too_many_requests' }, 429) });
  await assert.rejects(busy.start(), (e) => { assert.match(busy.message(e), /Troppi tentativi/); return true; });
  const down = await load({ fetchImpl: async () => { throw new Error('offline'); } });
  await assert.rejects(down.start(), (e) => { assert.match(down.message(e), /WhatsApp/); return true; });
  assert.match(down.message({ code: 'weird' }), /WhatsApp/);
});

test('order lookups only go out for well-formed session ids', async () => {
  let calls = 0;
  const pay = await load({ fetchImpl: async (url) => { calls++; return ok({ paid: true, url }); } });
  assert.deepEqual(await pay.order('../../x'), { error: 'bad_session' });
  assert.deepEqual(await pay.order(''), { error: 'bad_session' });
  assert.equal(calls, 0);
  const res = await pay.order('cs_test_abcdef123');
  assert.equal(res.paid, true);
  assert.match(res.url, /darta-order\?s=cs_test_abcdef123$/);
  const off = await load({ fetchImpl: async () => { throw new Error('x'); } });
  assert.deepEqual(await off.order('cs_test_abcdef123'), { error: 'network' });
});
