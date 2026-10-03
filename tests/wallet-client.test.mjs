// js/wallet.js in Node with the network replaced: which wallet the visitor gets, and which links the browser may follow.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../js/wallet.js', import.meta.url), 'utf8');
function load(fetchImpl) {
  globalThis.window = { DARTA: { lang: 'it', t: (s) => s } };
  Object.defineProperty(globalThis, 'navigator', { value: { userAgent: 'x', maxTouchPoints: 0 }, configurable: true, writable: true });   // Node has a read-only navigator
  globalThis.fetch = fetchImpl;
  new Function(source)();
  return globalThis.window.DARTA.wallet;
}
const ok = (body, status = 200) => ({ ok: status < 400, status, json: async () => body });
const UA = {
  iphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1',
  ipadDesktopMode: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/17.0 Safari/605.1.15',
  android: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/120.0 Mobile Safari/537.36',
  macSafari: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/17.0 Safari/605.1.15',
  macChrome: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120.0 Safari/537.36',
  windows: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0 Safari/537.36',
};

test('platform: Apple devices get Apple, Android gets Google, everything else is undecided', () => {
  const w = load(async () => ok({}));
  assert.equal(w.platform(UA.iphone, 5), 'apple');
  assert.equal(w.platform(UA.ipadDesktopMode, 5), 'apple');     // iPadOS pretends to be a Mac but has touch
  assert.equal(w.platform(UA.macSafari, 0), 'apple');
  assert.equal(w.platform(UA.android, 5), 'google');
  assert.equal(w.platform(UA.macChrome, 0), 'any');
  assert.equal(w.platform(UA.windows, 0), 'any');
});

test('choose: the only wallet that is on, else the phone\'s own, else ask', () => {
  const w = load(async () => ok({}));
  assert.equal(w.choose({ apple: true, google: false }, 'any'), 'apple');
  assert.equal(w.choose({ apple: false, google: true }, 'apple'), 'google');
  assert.equal(w.choose({ apple: true, google: true }, 'apple'), 'apple');
  assert.equal(w.choose({ apple: true, google: true }, 'google'), 'google');
  assert.equal(w.choose({ apple: true, google: true }, 'any'), null);
});

test('availability: the server answer is remembered, a fault is not', async () => {
  let n = 0;
  const w = load(async () => { n++; return n === 1 ? Promise.reject(new Error('offline')) : ok({ apple: true, google: false }); });
  assert.equal(await w.availability(), null);
  assert.deepEqual(await w.availability(), { apple: true, google: false });
  assert.deepEqual(await w.availability(), { apple: true, google: false });
  assert.equal(n, 2);
  const off = load(async () => ok({}, 500));
  assert.equal(await off.availability(), null);
});

test('create sends the card and returns the links; errors carry their code', async () => {
  let sent;
  const w = load(async (url, init) => { sent = { url, init }; return ok({ id: 'x', apple: 'a', google: 'g' }); });
  const card = { name: 'Lorenzo', finish: 'onyx', icon: 'fire', barber: 'Thomas', stamps: 3 };
  assert.deepEqual(await w.create(card), { id: 'x', apple: 'a', google: 'g' });
  assert.equal(sent.init.method, 'POST');
  assert.deepEqual(JSON.parse(sent.init.body), { ...card, lang: 'it' });
  const busy = load(async () => ok({ error: 'too_many_requests' }, 429));
  await assert.rejects(busy.create(card), (e) => { assert.match(busy.message(e), /Troppi tentativi/); return true; });
  const down = load(async () => { throw new Error('offline'); });
  await assert.rejects(down.create(card), (e) => e.code === 'network' && /Riprova/.test(down.message(e)));
});

test('only our own pass download and Google\'s save page may be opened', () => {
  const w = load(async () => ok({}));
  const id = '3f2b8c1e-9d4a-4b7e-8a61-0c5d2e7f9a10';
  assert.ok(w.links.apple.test(`https://kemfyrbrlsbuberjqzje.supabase.co/functions/v1/darta-wallet/apple/${id}`));
  assert.ok(w.links.google.test('https://pay.google.com/gp/v/save/eyJhbGciOiJSUzI1NiJ9.eyJpc3MiOiJ4In0.c2ln-_'));
  for (const bad of ['https://evil.example/functions/v1/darta-wallet/apple/' + id, 'http://kemfyrbrlsbuberjqzje.supabase.co/functions/v1/darta-wallet/apple/' + id,
    'https://kemfyrbrlsbuberjqzje.supabase.co.evil.example/functions/v1/darta-wallet/apple/' + id, 'https://pay.google.com.evil.example/gp/v/save/x', 'javascript:alert(1)', 'https://pay.google.com/gp/v/save/x?next=https://evil.example']) {
    assert.ok(!w.links.apple.test(bad) && !w.links.google.test(bad), bad);
  }
});
